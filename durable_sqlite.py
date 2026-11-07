"""Keep the existing SQLite application durable by checkpointing it into Render Postgres.

The web server runs a single Python process, and every managed DB context uses
one shared RLock. Each successful SQLite write is backed up to Postgres *before*
the request returns. Restores happen before the app initializes its schema.

Note: Render's free Postgres expires 30 days after creation. Operators must
export/migrate records before that date; the app cannot extend its expiry.
"""
from __future__ import annotations
import os
import sqlite3
import tempfile
from pathlib import Path


class DurableSQLite:
    def __init__(self, path: Path, url: str, lock):
        self.path = Path(path)
        self.url = url.strip()
        self.lock = lock
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.url:
            self._restore()

    def _connect_pg(self):
        import psycopg
        return psycopg.connect(self.url, connect_timeout=10)

    def _restore(self):
        # This table is the only table we add to the existing free Postgres.
        with self._connect_pg() as pg:
            pg.execute('''CREATE TABLE IF NOT EXISTS highway67_sqlite_backup (
                id INTEGER PRIMARY KEY CHECK (id=1), snapshot BYTEA NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())''')
            row = pg.execute('SELECT snapshot FROM highway67_sqlite_backup WHERE id=1').fetchone()
        if row:
            data = bytes(row[0])
            if not data.startswith(b'SQLite format 3\x00'):
                raise RuntimeError('Saved orders snapshot in Postgres is invalid; refusing to overwrite it')
            with tempfile.NamedTemporaryFile(dir=self.path.parent, prefix='highway67-restore-', delete=False) as f:
                staged = Path(f.name)
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            for suffix in ('-wal', '-shm'):
                stale = Path(str(self.path)+suffix)
                if stale.exists():stale.unlink()
            os.replace(staged, self.path)

    def _backup(self, source):
        with tempfile.NamedTemporaryFile(dir=self.path.parent, prefix='highway67-backup-', delete=False) as f:
            staged = Path(f.name)
        try:
            with sqlite3.connect(staged) as snap:
                source.backup(snap)
            data = staged.read_bytes()
            if not data.startswith(b'SQLite format 3\x00'):
                raise RuntimeError('Unable to prepare a valid SQLite backup')
            with self._connect_pg() as pg:
                pg.execute('''INSERT INTO highway67_sqlite_backup(id,snapshot,updated_at)
                    VALUES(1,%s,NOW())
                    ON CONFLICT(id) DO UPDATE SET snapshot=EXCLUDED.snapshot,
                    updated_at=EXCLUDED.updated_at''',(data,))
        finally:
            staged.unlink(missing_ok=True)

    def connect(self):
        return _ManagedSQLite(self)


class _ManagedSQLite:
    def __init__(self, owner):
        self.owner = owner
        self.db = None

    def __enter__(self):
        self.owner.lock.acquire()
        try:
            self.db = sqlite3.connect(self.owner.path, timeout=20)
            self.db.row_factory = sqlite3.Row
            self.db.execute('PRAGMA busy_timeout=20000')
            self.db.execute('PRAGMA foreign_keys=ON')
            self.before = self.db.total_changes
            return self.db
        except BaseException:
            self.owner.lock.release()
            raise

    def __exit__(self, exc_type, exc, tb):
        try:
            self.db.__exit__(exc_type, exc, tb)
            if exc_type is None and self.owner.url and self.db.total_changes > self.before:
                # If PG is down, fail closed: don't acknowledge customer orders
                # until their durable backup has completed successfully.
                self.owner._backup(self.db)
        finally:
            if self.db is not None:
                self.db.close()
            self.owner.lock.release()
        return False