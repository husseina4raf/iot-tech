-- ===== A. create_order: happy path, FIFO, atomicity, validation =====
DO $A1$
DECLARE o orders; i inventory;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":"3"}]', '{"salesRep":"Omar"}'));
  PERFORM t.check('A1 create: pending status', o.status = 'بانتظار الموافقة', o.status);
  PERFORM t.check('A1 create: flag TRUE', o.inventory_deducted);
  PERFORM t.check('A1 create: first id ORD-3005', o.id = 'ORD-3005', o.id);
  PERFORM t.check('A1 create: sales rep forced to caller (payload Omar ignored)', o.sales_rep = 'Ali', o.sales_rep);
  SELECT * INTO i FROM inventory WHERE sku='CAM-1';
  PERFORM t.check('A1 create: stock 10 -> 7', i.stock = 7, i.stock::text);
  PERFORM t.check('A1 create: FIFO lots l1=3,l2=4', i.lots = '[{"id":"l1","qty":3,"costPrice":100},{"id":"l2","qty":4,"costPrice":120}]'::jsonb, i.lots::text);
  PERFORM t.check('A1 create: cost stays first lot (100)', i.cost_price = 100, i.cost_price::text);
END $A1$;

DO $A2$
DECLARE o orders; i inventory;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":8}]'));
  SELECT * INTO i FROM inventory WHERE sku='CAM-1';
  PERFORM t.check('A2 FIFO across lots: stock 2', i.stock = 2, i.stock::text);
  PERFORM t.check('A2 FIFO across lots: only l2 (qty 2) remains', i.lots = '[{"id":"l2","qty":2,"costPrice":120}]'::jsonb, i.lots::text);
  PERFORM t.check('A2 FIFO: cost moves to next lot (120)', i.cost_price = 120, i.cost_price::text);
END $A2$;

DO $A3$
DECLARE n_before int; n_after int;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  SELECT count(*) INTO n_before FROM orders;
  PERFORM t.expect_err('A3 insufficient stock (2nd line) fails whole order',
    $q$SELECT create_order(t.payload('[{"sku":"DVR-1","name":"DVR","quantity":2},{"sku":"CAM-1","name":"Camera","quantity":99}]'))$q$,
    'الكمية المطلوبة غير متاحة في المخزون للصنف: Camera — المتاح: 10 — المطلوب: 99');
  SELECT count(*) INTO n_after FROM orders;
  PERFORM t.check('A3 rollback: no order row created', n_before = n_after);
  PERFORM t.check('A3 rollback: EARLIER line (DVR) NOT deducted', t.stock('DVR-1') = 5, t.stock('DVR-1')::text);
  PERFORM t.check('A3 rollback: Camera untouched', t.stock('CAM-1') = 10 AND t.lotsum('CAM-1') = 10);
END $A3$;

DO $A4$
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  -- every invalid quantity form must be rejected, and stock must never move
  PERFORM t.expect_err('A4 qty 0',        $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":0}]'))$q$,        'الكمية غير صحيحة');
  PERFORM t.expect_err('A4 qty -5 (must not INCREASE stock)', $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":-5}]'))$q$, 'الكمية غير صحيحة');
  PERFORM t.expect_err('A4 qty "" (empty string)', $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":""}]'))$q$, 'الكمية غير صحيحة');
  PERFORM t.expect_err('A4 qty missing',  $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera"}]'))$q$,                     'الكمية غير صحيحة');
  PERFORM t.expect_err('A4 qty null',     $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":null}]'))$q$,     'الكمية غير صحيحة');
  PERFORM t.expect_err('A4 qty "abc"',    $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":"abc"}]'))$q$,    'الكمية غير صحيحة');
  PERFORM t.expect_err('A4 qty "NaN"',    $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":"NaN"}]'))$q$,    'الكمية غير صحيحة');
  PERFORM t.expect_err('A4 qty "1e3"',    $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":"1e3"}]'))$q$,    'الكمية غير صحيحة');
  PERFORM t.expect_err('A4 qty 2.5',      $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":2.5}]'))$q$,      'الكمية غير صحيحة');
  PERFORM t.expect_err('A4 qty true',     $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":true}]'))$q$,     'الكمية غير صحيحة');
  PERFORM t.expect_err('A4 qty 8 digits', $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":99999999}]'))$q$, 'الكمية غير صحيحة');
  PERFORM t.expect_err('A4 qty " -3 " string', $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":" -3 "}]'))$q$, 'الكمية غير صحيحة');
  PERFORM t.check('A4 stock never moved by invalid input', t.stock('CAM-1') = 10 AND t.lotsum('CAM-1') = 10);
  PERFORM t.check('A4 no order rows created', (SELECT count(*) FROM orders) = 0);
END $A4$;

DO $A5$
DECLARE o orders;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":"3.0"}]'));
  PERFORM t.check('A5 qty "3.0" accepted as 3', t.stock('CAM-1') = 7);
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":" 2 "}]'));
  PERFORM t.check('A5 qty " 2 " (padded string) accepted', t.stock('CAM-1') = 5);
  PERFORM t.expect_err('A5 missing name',    $q$SELECT create_order(t.payload('[{"sku":"CAM-1","quantity":1}]'))$q$,               'اسم الصنف مطلوب');
  PERFORM t.expect_err('A5 blank name',      $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"   ","quantity":1}]'))$q$,  'اسم الصنف مطلوب');
  PERFORM t.expect_err('A5 empty items',     $q$SELECT create_order(t.payload('[]'))$q$,                                             'يجب أن يحتوي الطلب على صنف واحد على الأقل');
  PERFORM t.expect_err('A5 items not array', $q$SELECT create_order(t.payload('{"a":1}'))$q$,                                        'يجب أن يحتوي الطلب على صنف واحد على الأقل');
  PERFORM t.expect_err('A5 item not object', $q$SELECT create_order(t.payload('[5]'))$q$,                                            'بيانات الصنف رقم 1 غير صحيحة');
  PERFORM t.expect_err('A5 payload not object', $q$SELECT create_order('[1]'::jsonb)$q$,                                             'بيانات الطلب غير صحيحة');
  PERFORM t.expect_err('A5 NULL payload',    $q$SELECT create_order(NULL)$q$,                                                        'بيانات الطلب غير صحيحة');
END $A5$;

DO $A6$
DECLARE o orders;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  -- duplicate lines for one product are aggregated: 6 + 5 = 11 > 10 must fail even though each line alone fits
  PERFORM t.expect_err('A6 duplicate SKU lines aggregate (6+5>10)',
    $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":6},{"sku":"cam-1 ","name":"Camera","quantity":5}]'))$q$,
    'المتاح: 10 — المطلوب: 11');
  PERFORM t.check('A6 nothing deducted after failed duplicate order', t.stock('CAM-1') = 10);
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":6},{"sku":" Cam-1","name":"Camera","quantity":4}]'));
  PERFORM t.check('A6 duplicate lines 6+4=10 succeed (SKU trimmed + case-insensitive)', t.stock('CAM-1') = 0, t.stock('CAM-1')::text);
  PERFORM t.check('A6 all lots consumed', t.lotsum('CAM-1') = 0);
  PERFORM t.expect_err('A6 exhausted stock rejected (never clamped/negative)',
    $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]'))$q$, 'المتاح: 0 — المطلوب: 1');
  PERFORM t.check('A6 stock still exactly 0', t.stock('CAM-1') = 0);
END $A6$;

-- ===== B. inventory matching =====
DO $B1$
DECLARE o orders;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  PERFORM t.expect_err('B1 unknown SKU is unmatched — NO fallback to name',
    $q$SELECT create_order(t.payload('[{"sku":"NOPE","name":"Camera","quantity":1}]'))$q$, 'Camera (SKU: NOPE)');
  o := create_order(t.payload('[{"name":"Cable","quantity":2}]'));
  PERFORM t.check('B1 no SKU: exact name match deducts (Cable 20->18)', (SELECT stock FROM inventory WHERE id='inv-3') = 18);
  o := create_order(t.payload('[{"name":"able","quantity":1}]'));
  PERFORM t.check('B1 no SKU: single fuzzy substring match (18->17)', (SELECT stock FROM inventory WHERE id='inv-3') = 17);
  PERFORM t.expect_err('B1 duplicate product NAME with no SKU is ambiguous, not guessed',
    $q$SELECT create_order(t.payload('[{"name":"Twin","quantity":1}]'))$q$, 'يوجد أكثر من صنف مطابق للاسم');
  o := create_order(t.payload('[{"sku":"X-2","name":"Twin","quantity":2}]'));
  PERFORM t.check('B1 same name + SKU selects the RIGHT product (X-2 5->3, X-1 untouched)',
    (SELECT stock FROM inventory WHERE sku='X-2') = 3 AND (SELECT stock FROM inventory WHERE sku='X-1') = 5);
  PERFORM t.expect_err('B1 "_" is NOT a wildcard (old LIKE matched everything)',
    $q$SELECT create_order(t.payload('[{"name":"_","quantity":1}]'))$q$, 'لم يتم العثور على تطابق');
  PERFORM t.expect_err('B1 "%" alone is not a wildcard either',
    $q$SELECT create_order(t.payload('[{"name":"%%","quantity":1}]'))$q$, 'لم يتم العثور على تطابق');
END $B1$;

DO $B2$
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  PERFORM t.expect_err('B2 NULL stock treated as 0 (rejected, not NULL arithmetic)',
    $q$SELECT create_order(t.payload('[{"sku":"NULLS","name":"NullStock","quantity":1}]'))$q$, 'المتاح: 0 — المطلوب: 1');
  PERFORM t.check('B2 NULL stock untouched', (SELECT stock FROM inventory WHERE sku='NULLS') IS NULL);
  -- duplicate SKU rows in inventory => ambiguous, rejected
  INSERT INTO inventory(id,name,sku,stock,lots,cost_price) VALUES ('inv-9','CamDup','cam-1',3,'[]',0);
  PERFORM t.expect_err('B2 duplicate inventory SKU rejected as ambiguous',
    $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]'))$q$, 'مسجّل لأكثر من صنف');
  PERFORM t.expect_err('B2 unmatched list names every unmatched line',
    $q$SELECT create_order(t.payload('[{"sku":"AAA","name":"A1","quantity":1},{"sku":"BBB","name":"B1","quantity":1}]'))$q$, 'A1 (SKU: AAA)، B1 (SKU: BBB)');
END $B2$;

-- ===== C. authorization, rep attribution, amounts =====
DO $C1$
DECLARE o orders;
BEGIN
  PERFORM t.reset();
  PERFORM t.as_user('');
  PERFORM t.expect_err('C1 unauthenticated', $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]'))$q$, 'يجب تسجيل الدخول');
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000099');
  PERFORM t.expect_err('C1 authenticated but no profile/role', $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]'))$q$, 'الحساب غير مرتبط بأي صلاحية');
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000006');
  PERFORM t.expect_err('C1 sales without rep_name', $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]'))$q$, 'غير مرتبط باسم مندوب');
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000003');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]', '{"salesRep":"Omar"}'));
  PERFORM t.check('C1 team_leader may create on behalf of a rep', o.sales_rep = 'Omar', o.sales_rep);
  PERFORM t.expect_err('C1 team_leader must choose a rep', $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]', '{"salesRep":""}'))$q$, 'يرجى اختيار مندوب المبيعات');
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000004');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]', '{"salesRep":"Ali"}'));
  PERFORM t.check('C1 admin may create', o.sales_rep = 'Ali');
END $C1$;

DO $C2$
DECLARE o orders;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  PERFORM t.expect_err('C2 garbage total', $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]', '{"total":"12abc"}'))$q$, 'قيمة غير صحيحة في الحقل: الإجمالي');
  PERFORM t.expect_err('C2 negative subtotal', $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]', '{"subtotal":-5}'))$q$, 'قيمة غير صحيحة في الحقل: المجموع الفرعي');
  PERFORM t.expect_err('C2 object as amount', $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]', '{"vatAmount":{"a":1}}'))$q$, 'قيمة غير صحيحة في الحقل: قيمة الضريبة');
  PERFORM t.check('C2 amount failures did not touch stock', t.stock('CAM-1') = 10);
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]', '{"total":"100.50","vatPercent":null,"vatAmount":""}'));
  PERFORM t.check('C2 numeric-string / null / blank amounts accepted', o.total = 100.50 AND o.vat_percent = 0 AND o.vat_amount = 0);
END $C2$;
