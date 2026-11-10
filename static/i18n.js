/* Highway 67: bilingual public menu + staff workspace, no server-side changes. */
(function () {
  'use strict';
  var page = document.body.getAttribute('data-language-page') || 'customer';
  // Use one consistent language preference across customer, staff, and owner screens.
  var storageKey = 'highway67_lang';
  var language;
  try {
    language = localStorage.getItem(storageKey);
    if (language !== 'ar' && language !== 'en') {
      language = localStorage.getItem('highway67_lang_' + page);
    }
  } catch (e) { language = null; }
  if (language !== 'ar' && language !== 'en') language = 'ar';
  try { localStorage.setItem(storageKey,language); } catch (e) {}

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
    ['إسبريسو','Espresso'],['بيكولو','Piccolo'],['كورتادو','Cortado'],['فلات وايت','Flat white'],['لاتيه','Latte'],
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
    ['محاولات كثيرة، حاول لاحقاً','Too many attempts. Try again later.'],
    ['كرواسون سادة','Plain croissant'],['كرواسون جبس جبن','Cheese and chips croissant'],
    ['نحن كوفي جديد ونسعد بزيارتكم! تحتاج مساعدة في اختيار طلبك؟ كلم النادلة، وبتساعدك بكل سرور.','We are a new coffee shop! Need help choosing? Ask our waitress — she will be happy to help.'],
    ['خصص مشروبك','Customize your drink'],['اختر نكهة السيرب — الخيارات غير المتاحة تظهر لك بوضوح.','Choose a syrup flavor. Unavailable options are shown below.'],
    ['إضافات السيرب','Syrup options'],['بدون سيرب إضافي','No extra syrup'],['متوفر','Available'],
    ['كراميل ','Caramel '],['كراميل','Caramel'],['+ كراميل','+ Caramel'],['فانيلا','Vanilla'],
    ['بندق (هازلنت)','Hazelnut'],['شوكولاتة','Chocolate'],['غير متوفر','Unavailable'],
    ['السيرب المتاح بدون رسوم إضافية حالياً','The available syrup is included at no extra charge for now'],
    ['أضف للسلة','Add to cart'],
    ['رأيك يصنع فرقاً ','Your feedback matters '],['كيف كانت تجربتك؟','How was your experience?'],
    ['التقييم اختياري تماماً؛ تقدر ترجع له بعد ما تجرّب طلبك.','Feedback is completely optional. You can rate after trying your order.'],
    ['هل أعجبك الطلب؟','Did you enjoy your order?'],[' عجبني!',' Loved it!'],
    [' ممكن يتحسن',' Could be better'],['وش اللي ما عجبك؟ اختار اللي ينطبق عليك:','What could be better? Pick what fits:'],
    [' حالي زيادة',' Too sweet'],[' الحرارة مب مضبوطة',' Wrong temperature'],
    [' الطعم مب مثل المتوقع',' Taste was not as expected'],[' ناقص إضافة أو طلب',' Missing an item or an extra'],
    [' الشكل يقدر يتحسن',' Presentation could improve'],[' شي ثاني',' Something else'],
    ['وش تقييمك للخدمة؟','How was the service?'],['تقييم الخدمة من خمسة','Rate service out of five'],
    ['رسالة لنا (اختياري)','Leave a note (optional)'],['وش تحب نطور في كوفينا الجديد؟','What should we improve at our new coffee shop?'],
    ['إرسال التقييم ','Send feedback '],['يمكن مرة ثانية','Maybe later'],
    ['اختر تقييم واحد على الأقل أو اضغط يمكن مرة ثانية','Choose a rating, or tap Maybe later'],
    ['تعذر التحقق من رقم الطلب','Could not verify your order'],['تعذر حفظ التقييم','Could not save your feedback'],
    [' شكراً من القلب! تقييمك وصلنا',' Thank you! Your feedback has been saved'],
    ['تقييمات الزبائن','Guest feedback'],['آخر التقييمات','Recent feedback'],
    ['لا توجد تقييمات حتى الآن.','No feedback yet.'],['الخدمة','Service'],
    ['أعجبهم','Liked it'],['يحتاج تحسين','Needs improvement'],['بدون تقييم للطعم','No product rating'],
    ['حالي زيادة','Too sweet'],['الحرارة مب مضبوطة','Temperature was not right'],
    ['الطعم مب مثل المتوقع','Taste was not as expected'],['ناقص إضافة أو طلب','Missing item or extra'],
    ['الشكل يقدر يتحسن','Presentation needs improvement'],['شي ثاني','Something else'],
    ['الزبون ما أضاف ملاحظة','No additional comment'],
    ['كم جرعة كراميل تبا؟','How many caramel shots?'],
    ['تقدر تختار من 1 إلى 5 جرعات','Choose from 1 to 5 shots'],
    ['عدد جرعات الكراميل','Caramel shots'],
    ['تقليل الكراميل','Less caramel'],
    ['زيادة الكراميل','More caramel'],
    ['كمل اختيارك من المنيو بكل راحة','Keep browsing the menu — your item is in the cart'],
    ['عرض السلة','View cart'],
    ['إخفاء','Hide'],
    ['✓ تمت الإضافة','✓ Added to cart'],
    ['الكراميل: جرعة واحدة، برسوم إضافية 1 درهم لكل مشروب.','Caramel: one shot, AED 1 extra per drink.'],
    ['كراميل  — جرعة واحدة','Caramel  — 1 shot'],['+ كراميل · 1 درهم','+ Caramel · AED 1'],
    ['+ كراميل (1 درهم)','+ Caramel (AED 1)'],
    ['ملاحظة خاصة لهذا المنتج (اختياري)','Special notes for this item (optional)'],
    ['ملاحظة لهذا المنتج (اختياري)','Note for this item (optional)'],
    ['ملاحظة المنتج:','Item note:'],
    ['ملاحظات لكل منتج (اختياري)','Notes for each item (optional)'],
    ['لو تبا مشروب بدون سكر أو عندك طلب خاص، اكتب الملاحظة تحت المنتج.','Need less sugar or another change? Add a note under each item.'],
    ['مثلاً: بدون سكر، حليب أقل...','For example: no sugar, less milk...'],
    ['ملاحظات عامة على الطلب (اختياري)','General order notes (optional)'],
    ['غير متوفر حالياً، احذف هذا المنتج قبل تأكيد الطلب','Unavailable right now. Remove this item before checkout.'],
    ['في منتج غير متوفر بالسلة، احذفه أولاً','An item in your cart is sold out. Remove it first.'],
    ['هذا المنتج غير متوفر حالياً','This item is currently unavailable'],
    ['توفر المنتجات','Product availability'],
    ['حدّد المنتجات غير المتوفرة، وسيظهر للزبون «غير متوفر» ولن يستطيع طلبها. ويمكنك إرجاع المنتج متى توفر.','Mark items sold out to disable ordering. You can make them available again anytime.'],
    ['تحديث القائمة','Refresh list'],['جاري تحميل المنتجات...','Loading products...'],
    ['لا توجد منتجات حالياً.','No products right now.'],
    ['تعيين غير متوفر','Mark unavailable'],['إعادة التوفر','Make available'],
    ['تم إرجاع المنتج للمنيو','Product available again on the menu'],
    ['تم وضع علامة غير متوفر للزبائن','Marked unavailable for customers'],
    ['إلغاء الطلب','Cancel order'],['سبب الإلغاء:','Cancellation reason:'],
    ['المنتج غير متوفر','Product unavailable'],
    ['يمكن إلغاء الطلب الجديد أو الجاهز فقط؛ الطلبات المسلّمة محفوظة','Only new or ready orders can be cancelled. Delivered orders are protected.'],
    ['حالة المنتج غير صحيحة','Invalid availability selection'],
    ['المنتج غير موجود','Product not found'],['الكراميل جرعة واحدة فقط','Caramel is limited to one shot'],
    ['ملاحظة المنتج طويلة أو غير صحيحة','Item note is too long or invalid'],
    ['هذا المنتج محذوف من القائمة','This product was removed from the menu'],
    ['لوحة المدير · Highway 67','Manager dashboard · Highway 67'],
    ['لوحة المالك','Owner dashboard'],
    ['بيانات الإيرادات والطلبات وإعدادات الموقع خاصة بالمالك فقط.','Revenue, orders and site settings are for the owner only.'],
    ['بعد كلمة المرور أدخل رمز تطبيق المصادقة من هاتفك. رمز المصادقة موجود في إعدادات Render.','After your password, enter the code from your authenticator app. You can find the setup key in Render settings.'],
    ['رمز تطبيق المصادقة (6 أرقام)','Authenticator code (6 digits)'],
    ['لوحة إدارة Highway 67','Highway 67 management'],
    ['إحصائيات الطلبات · تعديل المنتجات والأسعار · العروض المحددة بوقت · أرشيف الأيام','Orders · products · timed offers · history'],
    ['نظرة عامة','Overview'],
    ['المنتجات والأسعار','Products & prices'],
    ['العروض المؤقتة','Scheduled offers'],
    ['سجل الأيام','Shift history'],
    ['حسابات الموظفين','Staff accounts'],
    ['ملخص المشروع','Business overview'],
    ['المبيعات الفعلية للطلبات المسلّمة فقط، بدون خصم أي مصاريف أو عمولات','Delivered-order sales only; no expenses or commissions deducted'],
    ['تحديث البيانات','Refresh data'],
    ['مبيعات اليوم','Today’s sales'],
    ['مبيعات الشهر','Monthly sales'],
    ['إجمالي المبيعات','All-time sales'],
    ['من أول الشهر حتى اليوم','From start of this month'],
    ['جميع الأيام المسجّلة','Across recorded shifts'],
    ['المبيعات المسلّمة اليوم','Orders delivered today'],
    ['جميع الطلبات بما فيها غير المسلّمة','Includes all orders, regardless of status'],
    ['المبيعات حسب اليوم','Sales by day'],
    ['آخر 14 يوم مسجّل','Last 14 recorded days'],
    ['الوردية المفتوحة','Current open shift'],
    ['طلبات الوردية الحالية','Current-shift orders'],
    ['الأكثر مبيعاً','Best sellers'],
    ['ملخص الحساب','Shift summary'],
    ['إجمالي الطلبات المسلّمة في يوم العمل الحالي.','Delivered orders in current shift'],
    ['إدارة المنتجات','Manage products'],
    ['إضافة منتج جديد','Add product'],
    ['أي تعديل للسعر أو الخصم يظهر للزبون فوراً. الفواتير السابقة تحتفظ بقيمتها وقت الطلب.','Price and discount changes appear on the customer menu. Past receipts keep their original amounts.'],
    ['ابحث عن منتج...','Search products...'],
    ['إعادة التوفر','Make available'],
    ['تعيين غير متوفر','Mark sold out'],
    ['السعر الأساسي','Base price'],
    ['تعديل','Edit'],
    ['العروض المؤقتة','Scheduled offers'],
    ['إنشاء عرض','Create offer'],
    ['كل الأيام المسجلة','All recorded shifts'],
    ['بما فيها الأيام التي أخفاها الموظف','Including shifts hidden by staff'],
    ['آراء الزبائن','Customer reviews'],
    ['تقييمات الطلب والخدمة والملاحظات الاختيارية','Order and service ratings, plus optional comments'],
    ['تحديث التقييمات','Refresh reviews'],
    ['جاري تحميل التقييمات...','Loading reviews...'],
    ['لا توجد طلبات في الوردية الحالية.','No orders in the current shift'],
    ['لا توجد أيام مسجلة.','No recorded shifts'],
    ['الوردية','Shift'],
    ['طلبات جديدة','New orders'],
    ['جاهزة','Ready'],
    ['مُسلّمة','Delivered'],
    ['المبيعات','Sales'],
    ['لا توجد وردية مفتوحة','No open shift'],
    ['طلب','Order'],
    ['تعديل المنتج','Edit product'],
    ['إضافة منتج','Add product'],
    ['اسم المنتج','Product name'],
    ['القسم','Category'],
    ['السعر الأصلي (درهم)','Base price (AED)'],
    ['الخصم %','Discount %'],
    ['متوفر للزبائن','Available to customers'],
    ['يظهر فقط أثناء عرض نشط مرتبط به','Show only during an active promotion'],
    ['حفظ المنتج','Save product'],
    ['كلمة المرور (10 أحرف أو أكثر)','Password (10+ characters)'],
    ['إنشاء حساب الموظف','Create staff account'],
    ['الحسابات الموجودة','Existing accounts'],
    ['إضافة موظف','Add staff member'],
    ['آخر دخول:','Last sign-in:'],
    ['لم يدخل بعد','Never signed in'],
    ['مفعّل','Active'],
    ['موقوف','Suspended'],
    ['تغيير كلمة المرور','Change password'],
    ['إيقاف الحساب','Disable account'],
    ['تفعيل الحساب','Enable account'],
    ['كلمة مرور جديدة','New password'],
    ['تنزيل نسخة الطلبات','Download orders backup'],
    ['الخدمة:','Service:'],
    ['الزبون ما أضاف ملاحظة','No additional comment']



  ].concat([["بحث عن منتج","Search for a product"],["سموذي أساي","Acai smoothie"],["سموذي أساي من Highway 67","Highway 67 acai smoothie"],["إكسترا بينات","Extra peanuts"],["زيادة فول سوداني","Extra peanuts"],["خصم مميز - آخر ساعة","Last-hour special"],["عرض مميز - آخر ساعة","Last-hour special"],["ينتهي العرض الساعة 11:00 مساءً","Offer ends at 11:00 PM"],["اختر إضافات مشروبك","Choose your drink extras"],["اختر الإضافات التي تريدها مع المشروب","Choose any extras for this drink"],["إضافات المشروب","Drink extras"],["سعر كل إضافة يحتسب على كل كوب.","Each extra is charged per cup."],["مرة واحدة","One time"],["حد أقصى","Maximum"],["تأكد من عدد الإضافات المسموح","Please check the allowed number of extras"],["عدد","Quantity"],["إضافة لم تعد متاحة","Extra no longer available"],["إضافة منتج للفاتورة","Add item to invoice"],["اختر منتجاً متوفراً وحدد الكمية. يتحدث إجمالي الفاتورة تلقائياً بعد الإضافة.","Choose an available product and quantity. The invoice total updates after adding."],["اسم المنتج...","Product name..."],["المنتجات المتوفرة","Available items"],["جاري تحميل المنتجات...","Loading products..."],["اختر المنتج من القائمة","Select an item from the list"],["الكمية","Quantity"],["إضافة إلى الفاتورة","Add to invoice"],["إلغاء","Cancel"],["ما لقينا منتج متوفر بهذا الاسم.","No available item matches your search."],["ما في منتجات متوفرة حالياً.","No items are currently available."],["اختر كمية من 1 إلى 30","Choose a quantity from 1 to 30"],["عدد الإضافات غير صحيح","Invalid extra quantity"],["إضافات المنتج","Item extras"],["حذف هذا المنتج من الفاتورة؟","Remove this item from the invoice?"],["لحذف المنتج بالكامل استخدم زر حذف المنتج","Use Remove item to delete the whole line"],["إلغاء الفاتورة","Cancel invoice"],["إلغاء الفاتورة #","Cancel invoice #"],["الإضافة:","Addition:"],["إضافة جديدة","New extra"],["إضافات:","Extras:"],["الإضافات","Extras"],["أقصى عدد لكل كوب","Maximum per cup"],["إظهار الإضافة للزبائن","Show extra to customers"],["اختر 1 إذا تبا الإضافة مرة واحدة فقط لكل مشروب.","Choose 1 to allow an extra only once per drink."],["حفظ الإضافة","Save extra"],["إضافة أخرى","Add another extra"],["إضافات: ","Extras: "],["تعديل الإضافة","Edit extra"],["حذف هذه الإضافة من المنتج؟","Remove this extra from the item?"],["تم حفظ الإضافة","Extra saved"],["لا توجد إضافات لهذا المنتج بعد.","No extras have been added to this product."],["الإضافات تظهر للزبون عند اختيار المنتج، ويضاف سعرها إلى الفاتورة. يمكن تعديلها أو حذفها دون تغيير الفواتير السابقة.","Customers can select these extras. Their prices are added to receipts. Past receipts keep their original charges."],["اسم الإضافة","Extra name"],["سعر الإضافة (درهم)","Extra price (AED)"],["مثلاً: إكسترا بينات","Example: Extra peanuts"],["متوفرة","Available"],["مخفية","Hidden"],["إضافة / استبدال مشروب","Add / replace a drink"],["تعديل الاسم والمنتج","Edit name and item"],["تعديل الأسماء","Edit names"],["إضافة منتج جديد","Add new product"],["هذه لوحة خاصة بالمدير. الدخول محمي باسم المستخدم وكلمة المرور.","Manager only. Sign in with your username and password."],["هذا المتصفح لا يدعم تجهيز الصور","Your browser cannot process this image"],["اختر صورة PNG أو JPG أو WebP","Choose a PNG, JPG, or WebP image"],["تعذر فتح الصورة","Unable to open the image"],["تعذر تصغير الصورة. اختر صورة بدقة أقل","Unable to compress the image. Choose a smaller photo."],["لوجبة يوم الاثنين فقط: فعّل الخيار الثاني واربط المنتج بعرض أسبوعي يوم الاثنين.","For a Monday-only item, select this option and create a Monday promotion."],["تغيير صورة المنتج","Change item photo"],["معاينة صورة المنتج","Preview item photo"],["PNG / JPG / WebP، أقل من 850KB بعد تجهيز الملف.","PNG, JPG, or WebP, under 850 KB after processing."],["خصم العرض %","Promotion discount %"],["مثلاً: عرض الاثنين — برغر خاص","Example: Monday burger offer"],["متوفر لوقت محدود","Available for a limited time"],["نوع الجدولة","Schedule type"],["أسبوعي — أيام محددة","Weekly — selected days"],["يبدأ الساعة","Start time"],["ينتهي الساعة","End time"],["الاثنين","Monday"],["الثلاثاء","Tuesday"],["الأربعاء","Wednesday"],["الخميس","Thursday"],["الجمعة","Friday"],["السبت","Saturday"],["الأحد","Sunday"],["مخفي عن الموظفين","Hidden from staff"],["مفتوح","Open"],["متوقف","Paused"],["الوردية","Shift"],["جاري تحميل التقييمات...","Loading feedback..."],["الطعم أقل من المتوقع","Taste was below expectations"],["ناقص منتج أو إضافة","Missing item or extra"],["الشكل يحتاج تحسين","Presentation needs improvement"],["سبب آخر","Another reason"],["تأكيد الحذف النهائي","Confirm permanent deletion"],["حذف هذا العرض؟","Delete this promotion?"],["استرجاع","Restore"],["استرجاع الفاتورة","Restore invoice"],["الفعاليات","Activities"],["سجل التعديلات","Change log"],["تم تغيير كلمة المرور","Password changed"],["تم إنشاء حساب الموظف","Staff account created"],["اكتب كلمة مرور جديدة من 10 أحرف على الأقل","Enter a new password of at least 10 characters"],["تغيير الصورة","Change photo"],["ما حصلنا منتجات بهالبحث.","No matching products found."],["يوم العمل مفتوح","Shift is open"],["أدخل رمز التحقق المرسل إلى هاتف المالك","Enter the verification code sent to the owner"],["ملاحظات","Notes"],["لمدخلات السلة","Cart items"],["كل الأيام","All days"],["سجل الورديات للمدير","Manager shift history"],["سجلات الوردية للمدير","Shift history for the manager"],["كوب","Cup"],["إضافة","Extra"],["تأكيد","Confirm"],["إغلاق","Close"],["الإضافة غير متوفرة أو عددها أكبر من المسموح","Extra unavailable or quantity exceeds the allowed limit"],["بيانات الإضافات غير صحيحة","Invalid extra details"],["الإضافة مكررة أو غير صحيحة","Extra duplicated or invalid"],["الاسم","Name"],["السعر","Price"],["إعادة التوفر","Mark available"],["إلغاء طلب","Cancel order"],["إجمالي الفاتورة","Invoice total"]]).forEach(function (x) { pair(x[0], x[1]); });

  [["إدارة الموظفين","Staff operations"],["لوحة المدير","Manager dashboard"],["عروض مميزة","Special offers"],["اسم المنتج","Product name"],["المنتج","Item"],["اختيار منتج","Select an item"],["سعر الإضافة","Extra price"],["تعديل الاسم والمنتج","Edit name and item"],["الكمية","Quantity"],["الإضافة غير متوفرة أو عددها أكبر من المسموح","Extra unavailable or quantity exceeds limit"],["الإضافة غير متوفرة","Extra unavailable"],["بيانات الإضافة غير صحيحة","Invalid extra details"],["بيانات الإضافات غير صحيحة","Invalid extras data"],["الإضافة مكررة أو غير صحيحة","Extra duplicated or invalid"],["بيانات المنتج غير صحيحة","Invalid item details"],["المنتج غير متاح للطلب الآن","This item is currently unavailable"],["الإضافة غير متاحة لهذا المشروب","This extra is not available for this drink"],["بيانات العرض غير صحيحة","Invalid promotion details"],["اختر يوم أو أكثر للعرض","Select at least one promotion day"],["وقت نهاية العرض لازم يكون بعد بدايته في نفس اليوم","The promotion must end after it starts"],["هذا المنتج غير متوفر حالياً","This item is currently unavailable"],["الإضافة غير موجودة","Extra not found"],["تأكد من السعر وعدد مرات الإضافة","Check the extra price and allowed quantity"],["المنتج غير صحيح","Invalid item"],["معرف الإضافة غير صحيح","Invalid extra ID"],["لا توجد إضافات لهذا المنتج بعد.","This item does not have any extras yet."],["إضافة إلى الفاتورة","Add to invoice"],["أضف إلى الفاتورة","Add to invoice"],["الإجمالي كبير جداً","The total exceeds the allowed limit"],["قيمة الطلب مرتفعة جداً","The order total exceeds the allowed limit"],["المنتج أو الكمية غير صحيحة","Invalid item or quantity"],["لا يمكن تعديل الفاتورة بعد التسليم أو إغلاق الوردية","This invoice cannot be changed after delivery or shift closure"],["لا يمكن تعديل الفاتورة بعد التسليم أو إغلاق الوردية","This invoice cannot be edited after delivery or shift closure"],["سجل الأنشطة","Activity log"],["سجل العمليات","Activity log"],["الدخول بدون رمز تحقق إضافي","Sign in without a separate verification code"],["الحالة","Status"],["الفواتير","Invoices"],["السعر الأصلي (درهم)","Original price (AED)"],["السعر الإجمالي","Total price"],["خصم مميز","Special offer"],["إكسترا بينات","Extra peanuts"],["تم حفظ الإضافة","Extra saved"],["إضافة أخرى","Add another extra"],["المبلغ","Amount"],["الصورة","Image"],["الصنف","Category"],["تم تعديل المنتج","Item updated"],["بحث عن منتج","Search products"],["كلمات بسيطة","Simple wording"],["إضافة المنتج","Add item"],["الرجوع","Back"],["لا يوجد","None"],["إضافات:","Extras:"],["إضافات المنتج","Item extras"]].forEach(function (x) { pair(x[0],x[1]); });
  [
    ['تذكرني على هذا الجهاز لمدة 30 يوم','Remember me on this device for 30 days'],
    ['تذكرني على هذا الجهاز لمدة 7 أيام','Remember me on this device for 7 days'],
    ['فعّل هذا الخيار فقط على جهازك الشخصي. تقدر تسجل خروج في أي وقت.','Select this only on your personal device. You can sign out at any time.'],
    ['إظهار كلمة المرور','Show password'],['إخفاء كلمة المرور','Hide password'],
    ['إظهار','Show'],['إخفاء','Hide'],
    ['إعداد تذكر الدخول غير صحيح','Invalid remember-me setting']
  ].forEach(function(x){pair(x[0],x[1]);});
  function convertName(value, dest) {
    var s = String(value || '');
    return (dest === 'en' ? arToEn : enToAr).get(s) || s;
  }
  function dynamic(value, dest) {
    var m;
    if (dest === 'en') {
      if ((m = /^خصم (\d+)%$/.exec(value))) return m[1] + '% off';
      if ((m = /^الإضافة: ([\d,.]+ AED)$/.exec(value))) return 'Addition: ' + m[1];
      if ((m = /^إضافة منتج للفاتورة\s*#(\d+)$/.exec(value))) return 'Add item to invoice #' + m[1];
      if ((m = /^إضافات: (.+)$/.exec(value))) return 'Extras: ' + convertName(m[1],'en');
      if ((m = /^أقصى عدد لكل كوب:\s*(\d+)$/.exec(value))) return 'Maximum per cup: ' + m[1];
      if ((m = /^(.+) · حد أقصى (\d+)$/.exec(value))) return convertName(m[1],'en') + ' · maximum ' + m[2];
      if ((m = /^(.+) · مرة واحدة$/.exec(value))) return convertName(m[1],'en') + ' · one time only';
      if ((m = /^(.+) · أقصى عدد لكل كوب: (\d+)(.*)$/.exec(value)))
        return convertName(m[1],'en') + ' · maximum per cup: ' + m[2]
          + m[3].replace(' · متوفرة',' · available').replace(' · مخفية',' · hidden');
      if ((m = /^تأكيد حذف الفاتورة #(\d+)/.exec(value))) return 'Confirm deleting invoice #' + m[1];
      if ((m = /^استرجاع الفاتورة #(\d+)/.exec(value))) return 'Restore invoice #' + m[1];
      if ((m = /^إلغاء الفاتورة #(\d+)/.exec(value))) return 'Cancel invoice #' + m[1];
      if ((m = /^الفاتورة #(\d+)$/.exec(value))) return 'Invoice #' + m[1];
      if ((m = /^انتهى (\d{4}-\d\d-\d\d)$/.exec(value))) return 'Ended ' + m[1];
      if ((m = /^بدأ (\d{4}-\d\d-\d\d)$/.exec(value))) return 'Started ' + m[1];
      if ((m = /^(.+) × (\d+)$/.exec(value))) return convertName(m[1],'en') + ' × ' + m[2];
      if ((m = /^(.+) · \+ كراميل$/.exec(value))) return convertName(m[1],'en') + ' · + Caramel';

      if ((m = /^✓ (.+?)(?: \+ كراميل × ([1-5]))? تمت إضافته للسلة$/.exec(value)))
        return '✓ ' + convertName(m[1],'en') + (m[2]?' + Caramel × '+m[2]:'') + ' added to cart';
      if ((m = /^\+ كراميل × ([1-5])$/.exec(value))) return '+ Caramel × ' + m[1];
      if ((m = /^تمت إضافة (.+) · كراميل إلى السلة$/.exec(value))) return 'Added ' + convertName(m[1], 'en') + ' + Caramel to cart';
      if ((m = /^(.+) · (\d+(?:\.\d+)? AED)$/.exec(value))) return convertName(m[1], 'en') + ' · ' + m[2];
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
      : page === 'owner'
        ? (language === 'en' ? 'HIGHWAY 67 | Manager' : 'HIGHWAY 67 | المدير')
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