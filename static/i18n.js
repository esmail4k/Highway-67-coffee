/* Highway 67: bilingual public menu + staff workspace, no server-side changes. */
(function () {
  'use strict';
  var page = document.body.getAttribute('data-language-page') || 'customer';
  var storageKey = 'highway67_lang_' + page;
  var language;
  try { language = localStorage.getItem(storageKey); } catch (e) { language = null; }
  if (language !== 'ar' && language !== 'en') language = page === 'staff' ? 'en' : 'ar';

  var arToEn = new Map();
  var enToAr = new Map();
  function pair(ar, en) { arToEn.set(ar, en); enToAr.set(en, ar); }
  [
    ['الطلب','Order'],['القائمة','Menu'],['حولنا','About us'],['بحث','Search'],
    ['بحث عن منتج','Search for an item'],['ابحث عن منتج...','Search the menu...'],
    ['سلة الطلبات','Your cart'],['الصورة السابقة','Previous slide'],['الصورة التالية','Next slide'],
    ['العروض الحالية','Current offers'],['عرض القائمة · يتم التأكد من حالة استقبال الطلبات','Loading menu and ordering status...'],
    ['المقهى يستقبل الطلبات الآن — الدفع عند الاستلام','Now accepting orders — pay on pickup'],
    ['استقبال الطلبات متوقف حالياً؛ تقدر تتصفح القائمة','Ordering is currently paused — feel free to browse the menu'],
    ['تعذر التحقق من حالة استقبال الطلبات','Unable to check ordering status'],
    ['الكل','All'],['المشروبات الساخنة','Hot drinks'],['المشروبات الباردة','Cold drinks'],
    ['الكرواسون','Croissants'],['الحلويات','Desserts'],['أخرى','Other'],
    ['سلتك فاضية؛ أضف منتجات من القائمة.','Your cart is empty. Add something from the menu.'],
    ['ما حصلنا منتجات بهالبحث','No matching products found'],
    ['+ إضافة','+ Add'],['حذف المنتج','Remove item'],['تقليل','Decrease'],['زيادة','Increase'],
    ['تفريغ السلة','Clear cart'],['المجموع','Subtotal'],['الإجمالي','Total'],
    ['إتمام الطلب','Checkout'],['تأكيد وإرسال الطلب','Confirm and send order'],
    ['الدفع عند الاستلام. لا يُخصم أي مبلغ من بطاقتك عبر الموقع.','Pay on pickup. No card payment is charged through this website.'],
    ['اسم الزبون','Customer name'],['اسمك','Your name'],['رقم الهاتف','Phone number'],
    ['رقم السيارة','Car plate number'],['رقم اللوحة / رمز اللوحة','Plate number / code'],
    ['ملاحظات على الطلب (اختياري)','Order notes (optional)'],
    ['مثلاً: بدون سكر، ثلج أقل...','For example: no sugar, less ice...'],
    ['بعد التأكيد، توصّل الطلبية مباشرة إلى شاشة الموظفين.','Your order will appear on the staff screen after confirmation.'],
    ['الرجوع إلى السلة','Back to cart'],['استلمنا طلبك بنجاح','Order received successfully'],
    ['الرجوع للقائمة','Back to menu'],['الطلب تم استلامه','Order received'],
    ['تم تفريغ السلة','Cart cleared'],['تم حذف المنتج من السلة','Item removed from cart'],
    ['استقبال الطلبات مغلق حالياً','Ordering is currently closed'],
    ['اختار منتجات أولاً','Choose at least one item first'],
    ['جاري إرسال الطلب...','Sending your order...'],
    ['تعذر تسجيل الطلب','Could not submit the order'],
    ['تعذر تحميل المنتجات. حدّث الصفحة وحاول مرة ثانية.','Unable to load products. Refresh and try again.'],
    ['انتهى العرض','Offer ended'],['عرض خاص لمدة محدودة','Limited-time offer'],
    ['شاهد المنتج','View item'],['الوقت المتبقي','Time remaining'],
    ['كرواسون جبن','Cheese croissant'],['كرواسون نوتيلا','Nutella croissant'],['كرواسون شيبس','Chips croissant'],
    ['بيكولو','Piccolo'],['كورتادو','Cortado'],['فلات وايت','Flat white'],['لاتيه','Latte'],
    ['كابتشينو','Cappuccino'],['أمريكانو','Americano'],['إسبانيش لاتيه','Spanish latte'],
    ['موهيتو','Mojito'],['كولورادو','Colorado'],['لاتيه مثلج','Iced latte'],
    ['سبانيش مثلج','Iced Spanish latte'],['كولد برو','Cold brew'],
    ['أمريكانو مثلج','Iced Americano'],['لاتيه مثلج بالفانيلا','Iced vanilla latte'],
    ['دخول الموظفين','Staff login'],
    ['الدخول لإدارة الطلبات مخصص للموظفين المصرّح لهم فقط.','Order management is only for authorized staff.'],
    ['اسم المستخدم','Username'],['كلمة المرور','Password'],['تسجيل الدخول','Sign in'],
    ['هذه لوحة خاصة بالمصرّح لهم فقط. الوصول إلى البيانات محمي بتسجيل دخول ورمز تحقق.','Authorized personnel only. Order information is password-protected, with verification when enabled.'],
    ['رمز التحقق المرسل إلى رقم المالك','Verification code sent to the owner'],
    ['رمز SMS','SMS code'],['تأكيد الرمز والدخول','Verify and sign in'],
    ['الرجوع إلى تسجيل الدخول','Back to login'],['تسجيل خروج','Sign out'],
    ['تنزيل نسخة الطلبات','Download orders backup'],
    ['استقبال طلبات الزبائن متوقف مؤقتاً','Customer ordering is temporarily paused'],
    ['المنيو متاح للعرض، لكن الطلبات الجديدة لن تظهر إلى أن يتم تفعيل استقبال الطلبات وحفظ الفواتير.','The menu is available to browse, but new orders will not arrive until ordering is enabled.'],
    ['إدارة الطلبات','Order management'],['طلبات اليوم وإيراداته منفصلة عن الأيام السابقة.','Today’s orders and sales are separate from previous shifts.'],
    ['اليوم مغلق','Shift closed'],['بدء يوم جديد','Start new shift'],['إنهاء اليوم','End shift'],
    ['الوردية الحالية','Current shift'],['الأيام السابقة','Past shifts'],
    ['الطلبات الواردة','Incoming orders'],['تحديث تلقائي كل 5 ثوانٍ','Auto-refresh every 5 seconds'],
    ['جديد','New'],['جاهز','Ready'],['تم التسليم','Delivered'],
    ['الأكثر طلباً اليوم','Top items today'],['حساب الوردية','Shift summary'],
    ['إجمالي الطلبات التي تم تسليمها خلال هذا اليوم.','Sales include orders delivered during this shift.'],
    ['أرشيف الأيام','Shift archive'],['لا يُحذف سجل المالك عند إخفاء اليوم من الموظفين','Hiding a shift from staff does not delete the owner’s record.'],
    ['تفاصيل يوم العمل','Shift details'],['الطلبات','Orders'],['تعديل اليوم','Edit shift'],
    ['عنوان اليوم','Shift title'],['ملاحظات إدارية','Internal notes'],
    ['حفظ التعديل','Save changes'],['إخفاء اليوم من الموظفين','Hide shift from staff'],
    ['الإخفاء لا يمسح البيانات؛ المالك يستطيع رؤية اليوم واسترجاعه.','Hiding does not delete records. The owner can restore them.'],
    ['لا توجد طلبات في هذه الوردية بعد.','No orders in this shift yet.'],
    ['لا توجد أيام سابقة ظاهرة لك.','No past shifts to display.'],
    ['لا توجد طلبات.','No orders.'],['لا يوجد طلبات.','No orders.'],
    ['رقم الوردية','Shift number'],['طلبات جاهزة','Ready orders'],
    ['طلبات مُسلّمة','Delivered orders'],['صافي مبيعات الوردية','Shift net sales'],
    ['عرض وتعديل','View / edit'],['إخفاء','Hide'],['تأكيد الإخفاء','Confirm hide'],
    ['جاهز للاستلام','Ready for pickup'],['مكتمل','Completed'],['ملغي','Cancelled'],
    ['الاسم','Name'],['الهاتف','Phone'],['ملاحظات:','Notes:'],
    ['مبيعات اليوم / الوردية','Shift sales'],['الطلبات المُسلّمة فقط','Delivered orders only'],
    ['عدد الطلبات','Total orders'],['جميع الطلبات','All orders'],
    ['جديد وقيد التحضير','New / preparing'],['بانتظار التجهيز','Awaiting preparation'],
    ['طلبات مكتملة','Completed orders'],['ما في منتجات مكتملة بعد.','No delivered items yet.'],
    ['وردية','Shift'],['يوم عمل جديد','New workday'],['أول يوم عمل','First workday'],
    ['سجل الدخول من جديد','Please sign in again'],
    ['تعذر الاتصال بالخادم','Unable to connect to the server'],
    ['تسجيل دخول مطلوب','Sign-in required'],
    ['تعذر إرسال رمز التحقق، حاول لاحقاً','Could not send verification code. Try again.'],
    ['اسم المستخدم أو كلمة المرور غير صحيحة','Incorrect username or password'],
    ['رمز التحقق غير صحيح','Incorrect verification code'],
    ['محاولات كثيرة، حاول لاحقاً','Too many attempts. Try again later.']
  ].forEach(function (x) { pair(x[0], x[1]); });

  function convertName(value, dest) {
    var s = String(value || '');
    return (dest === 'en' ? arToEn : enToAr).get(s) || s;
  }
  function dynamic(value, dest) {
    var m;
    if (dest === 'en') {
      if ((m = /^خصم (\d+)%$/.exec(value))) return m[1] + '% off';
      if ((m = /^تمت إضافة (.+) إلى السلة$/.exec(value))) return 'Added ' + convertName(m[1], 'en') + ' to cart';
      if ((m = /^حذف (.+) من السلة$/.exec(value))) return 'Remove ' + convertName(m[1], 'en') + ' from cart';
      if ((m = /^رقم طلبك #(\d+) — الإجمالي (.+)\. وصل الطلب إلى شاشة الموظفين\.$/.exec(value)))
        return 'Order #' + m[1] + ' · Total: ' + m[2] + '. Sent to the staff screen.';
      if ((m = /^وصل (\d+) طلب جديد$/.exec(value))) return m[1] + ' new order(s) received';
      if ((m = /^الوردية #(\d+) مفتوحة$/.exec(value))) return 'Shift #' + m[1] + ' is open';
      if (value === 'اليوم مغلق — ابدأ يوماً جديداً') return 'Shift closed — start a new shift';
      if ((m = /^تأكيد الإنهاء وإلغاء (\d+) طلب$/.exec(value))) return 'Confirm end and cancel ' + m[1] + ' order(s)';
      if ((m = /^منذ أقل من دقيقة/.exec(value))) return value.replace('منذ أقل من دقيقة','Less than a minute ago');
      if ((m = /^منذ (\d+) دقيقة/.exec(value))) return value.replace(/^منذ (\d+) دقيقة/, m[1] + ' minutes ago');
      if ((m = /^منذ (\d+) ساعة و (\d+) دقيقة/.exec(value))) return value.replace(/^منذ (\d+) ساعة و (\d+) دقيقة/, m[1]+'h '+m[2]+'m ago');
      if ((m = /^باقي (.+)$/.exec(value))) {
        return 'Time left: ' + m[1].replace(/(\d+) ساعة و /g,'$1h ').replace(/(\d+) دقيقة و /g,'$1m ').replace(/(\d+) ثانية/g,'$1s');
      }
      if ((m = /^(\d+) قطعة$/.exec(value))) return m[1] + ' sold';
      if ((m = /^انتهى: (.+) \| (\d+) طلب \| (.+)$/.exec(value))) return 'Ended: ' + m[1] + ' | ' + m[2] + ' orders | ' + m[3];
      if ((m = /^(.+) — (\d{4}-\d\d-\d\d) \(#(\d+)\)$/.exec(value))) return convertName(m[1],'en') + ' — ' + m[2] + ' (#' + m[3] + ')';
      if (/[ء-ي]/.test(value) && /^(تعذر|لا يمكن|يرجى|الطلب|هذا الحساب|يوجد \d+ طلب|المقهى مغلق)/.test(value))
        return 'Unable to complete the action. Please review your details and try again.';
    }
    return null;
  }
  function translate(source) {
    var leading = source.match(/^\s*/)[0], trailing = source.match(/\s*$/)[0];
    var core = source.trim();
    if (!core) return source;
    var dict = language === 'en' ? arToEn : enToAr;
    var translated = dict.get(core);
    if (!translated && language === 'en') translated = dynamic(core, 'en');
    if (!translated) return source;
    return leading + translated + trailing;
  }
  var texts = new WeakMap(), attrs = new WeakMap();
  function visitText(node) {
    if (!node || !node.parentElement) return;
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CODE)$/i.test(node.parentElement.tagName)) return;
    var raw = node.nodeValue, saved = texts.get(node);
    if (!saved || saved.output !== raw) saved = { source:raw, output:raw };
    var out = translate(saved.source);
    if (raw !== out) node.nodeValue = out;
    saved.output = out;
    texts.set(node,saved);
  }
  function visitElement(el) {
    if (!el || !el.getAttribute) return;
    var a = attrs.get(el) || {};
    ['placeholder','aria-label','title'].forEach(function(key) {
      if (!el.hasAttribute(key)) return;
      var v = el.getAttribute(key), previous = a[key];
      if (!previous || previous.output !== v) previous = {source:v,output:v};
      var result = translate(previous.source);
      if (result !== v) el.setAttribute(key,result);
      previous.output = result;
      a[key] = previous;
    });
    attrs.set(el,a);
  }
  function update() {
    document.documentElement.setAttribute('lang',language);
    document.documentElement.setAttribute('dir',language === 'en' ? 'ltr':'rtl');
    document.title = page === 'staff'
      ? (language === 'en' ? 'HIGHWAY 67 | Staff' : 'HIGHWAY 67 | الموظفون')
      : (language === 'en' ? 'Highway 67 Coffee | Order' : 'Highway 67 Coffee | الطلب');
    var toggle = document.getElementById('langToggle');
    if (toggle) {
      var switchLabel = language === 'en' ? 'العربية' : 'English';
      if (toggle.textContent !== switchLabel) toggle.textContent = switchLabel;
      toggle.setAttribute('aria-label',language === 'en' ? 'Switch to Arabic' : 'Switch to English');
      toggle.setAttribute('title',language === 'en' ? 'Switch to Arabic' : 'Switch to English');
    }
    visitElement(document.body);
    document.querySelectorAll('*').forEach(visitElement);
    var walker = document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT), node;
    while ((node=walker.nextNode())) visitText(node);
  }
  var scheduled = false;
  var observer = new MutationObserver(function () {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function(){ scheduled=false; update(); });
  });
  var button = document.getElementById('langToggle');
  if (button) button.addEventListener('click',function () {
    language = language === 'ar' ? 'en' : 'ar';
    try {localStorage.setItem(storageKey,language);} catch(e) {}
    update();
  });
  window.highway67Language = {get:function(){return language;}, productName:function(s){return convertName(s,'en');},translate:translate,refresh:update};
  update();
  observer.observe(document.body,{subtree:true,childList:true,characterData:true});
})();