-- ===== K. inventory RPCs (H1 / H2 / M6) =====
DO $K1$
DECLARE o orders; iid text; r inventory; ser text;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user(t.S1());
  iid := (SELECT id FROM inventory WHERE sku = 'CAM-1');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":3}]'));  ser := o.serial_number;   -- stock 7
  PERFORM t.as_user(t.AD());
  r := update_inventory_item(iid, '{"price":999}');
  PERFORM t.check('K1 price-only edit: stock, lots and cost UNTOUCHED (reservation survives)',
    r.stock = 7 AND t.lotsum('CAM-1') = 7 AND r.cost_price = 100 AND r.price = 999, r.stock::text);
  PERFORM t.expect_err('K1 a stock key is refused here', format($q$SELECT update_inventory_item(%L, '{"stock":50}')$q$, iid), 'لا يمكن تعديل الكمية أو الدفعات من هنا');
  PERFORM t.expect_err('K1 a lots key is refused here', format($q$SELECT update_inventory_item(%L, '{"lots":[]}')$q$, iid), 'لا يمكن تعديل الكمية أو الدفعات من هنا');
  r := update_inventory_item(iid, '{"description":"d","brand":"B","name":"Camera Pro"}');
  PERFORM t.check('K1 renaming is allowed when only SKU-lines reference it (they resolve by SKU)', r.name = 'Camera Pro' AND r.brand = 'B' AND r.description = 'd' AND r.stock = 7);
  PERFORM t.expect_err('K1 SKU change refused while a reserved order carries that SKU, naming the order',
    format($q$SELECT update_inventory_item(%L, '{"sku":"CAM-2"}')$q$, iid), 'لا يمكن تغيير الـSKU لأن طلبات محجوزة المخزون تعتمد على هذا المنتج (#' || ser || ')');
  PERFORM t.expect_err('K1 duplicate SKU refused', format($q$SELECT update_inventory_item(%L, '{"sku":" dvr-1 "}')$q$, iid), 'هذا الـSKU مستخدم بالفعل');
  PERFORM t.expect_err('K1 blank name refused', format($q$SELECT update_inventory_item(%L, '{"name":"  "}')$q$, iid), 'اسم المنتج مطلوب');
  PERFORM t.expect_err('K1 negative price refused', format($q$SELECT update_inventory_item(%L, '{"price":-1}')$q$, iid), 'قيمة غير صحيحة في الحقل: سعر البيع');
  PERFORM t.expect_err('K1 unknown product', $q$SELECT update_inventory_item('nope', '{"price":1}')$q$, 'المنتج غير موجود');
  PERFORM t.as_user(t.S1());
  PERFORM t.expect_err('K1 sales cannot edit inventory', format($q$SELECT update_inventory_item(%L, '{"price":1}')$q$, iid), 'ليس لديك صلاحية تعديل المخزون');
  PERFORM t.as_user(t.AD());
  PERFORM cancel_order(o.id);    -- release the reservation
  r := update_inventory_item(iid, '{"sku":"CAM-2"}');
  PERFORM t.check('K1 once no reserved order depends on it, the SKU can change', r.sku = 'CAM-2');
END $K1$;

DO $K2$
DECLARE o orders; r inventory; ok boolean;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user(t.S1());
  o := create_order(t.payload('[{"name":"Cable","quantity":2}]'));              -- SKU-less line → resolves to 'Cable' by name
  PERFORM t.as_user(t.AD());
  PERFORM t.expect_err('K2 renaming a product a reserved SKU-less line depends on is refused', $q$SELECT update_inventory_item('inv-3', '{"name":"Wire"}')$q$, 'لا يمكن تغيير اسم المنتج');
  r := update_inventory_item('inv-3', '{"sku":"CBL-1"}');
  PERFORM t.check('K2 giving it a SKU is fine (SKU-less lines resolve by name)', r.sku = 'CBL-1');
  PERFORM t.expect_err('K2 delete refused while a reserved order depends on it', $q$SELECT delete_inventory_item('inv-3')$q$, 'لا يمكن حذف المنتج');
  ok := delete_inventory_item((SELECT id FROM inventory WHERE sku = 'CAM-1'));
  PERFORM t.check('K2 an UNREFERENCED product deletes fine', ok AND NOT EXISTS (SELECT 1 FROM inventory WHERE sku = 'CAM-1'));
  PERFORM t.as_user(t.S1());
  PERFORM t.expect_err('K2 sales cannot delete products', $q$SELECT delete_inventory_item('inv-2')$q$, 'ليس لديك صلاحية حذف المنتجات');
  PERFORM t.as_user(t.AD());
  PERFORM t.expect_err('K2 unknown product delete', $q$SELECT delete_inventory_item('nope')$q$, 'المنتج غير موجود');
  PERFORM cancel_order(o.id);
  PERFORM t.check('K2 the SKU-less reservation was restorable after all that (Cable back to 20)', (SELECT stock FROM inventory WHERE id = 'inv-3') = 20);
  r := update_inventory_item('inv-3', '{"name":"Wire"}');
  PERFORM t.check('K2 after release the rename is allowed', r.name = 'Wire');
  ok := delete_inventory_item('inv-3');
  PERFORM t.check('K2 and so is the delete', ok);
END $K2$;

DO $K3$
DECLARE o orders; iid text; r inventory; n_before int;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user(t.S1());
  iid := (SELECT id FROM inventory WHERE sku = 'CAM-1');
  -- the admin opened the form when stock was 10 …
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":3}]'));           -- … then a reservation made it 7
  PERFORM t.as_user(t.AD());
  PERFORM t.expect_err('K3 STALE stock edit (saw 10, is 7) refused instead of clobbering the reservation',
    format($q$SELECT adjust_inventory_stock(%L, 10, 12, 'x')$q$, iid), 'تغيّر مخزون هذا الصنف منذ فتح النموذج (الكمية الحالية: 7)');
  PERFORM t.check('K3 refusal left stock and lots exactly as the reservation left them', t.stock('CAM-1') = 7 AND t.lotsum('CAM-1') = 7);
  n_before := (SELECT jsonb_array_length(lots) FROM inventory WHERE id = iid);
  r := adjust_inventory_stock(iid, 7, 9, 'شحنة');
  PERFORM t.check('K3 increase: stock 9, lots 9, an adjustment lot at the current cost was appended',
    r.stock = 9 AND t.lotsum('CAM-1') = 9 AND jsonb_array_length(r.lots) = n_before + 1
    AND (r.lots->-1->>'costPrice') = '100' AND (r.lots->-1->>'note') = 'تعديل مخزون — شحنة');
  r := adjust_inventory_stock(iid, 9, 4);
  PERFORM t.check('K3 decrease consumes FIFO (lots 3@100,4@120,2@100 → 2@120,2@100), cost moves to the new first lot',
    r.stock = 4 AND t.lotsum('CAM-1') = 4 AND r.cost_price = 120 AND (r.lots->0->>'qty') = '2', r.lots::text);
  r := adjust_inventory_stock(iid, 4, 4);
  PERFORM t.check('K3 no-op adjust returns the row unchanged', r.stock = 4 AND t.lotsum('CAM-1') = 4);
  PERFORM t.expect_err('K3 negative target refused', format($q$SELECT adjust_inventory_stock(%L, 4, -1)$q$, iid), 'الكمية الجديدة غير صحيحة');
  UPDATE inventory SET stock = 10, lots = '[{"id":"z","qty":2,"costPrice":5}]' WHERE id = iid;    -- historical mismatch
  PERFORM t.expect_err('K3 a decrease the lots cannot cover is refused (reconcile first)', format($q$SELECT adjust_inventory_stock(%L, 10, 5)$q$, iid), 'لا تغطي النقص المطلوب');
  PERFORM t.check('K3 …and nothing changed', t.stock('CAM-1') = 10 AND t.lotsum('CAM-1') = 2);
  PERFORM t.as_user(t.S1());
  PERFORM t.expect_err('K3 sales cannot adjust stock', format($q$SELECT adjust_inventory_stock(%L, 10, 11)$q$, iid), 'ليس لديك صلاحية تعديل المخزون');
END $K3$;

DO $K4$
DECLARE iid text; r inventory;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user(t.AD());
  iid := (SELECT id FROM inventory WHERE sku = 'CAM-1');
  r := add_stock_lot(iid, 5, 130, 'دفعة جديدة');
  PERFORM t.check('K4 add lot: stock 15, lots 15, cost stays the FIFO-first lot (100), new lot recorded',
    r.stock = 15 AND t.lotsum('CAM-1') = 15 AND r.cost_price = 100 AND (r.lots->-1->>'costPrice') = '130' AND (r.lots->-1->>'note') = 'دفعة جديدة');
  PERFORM t.expect_err('K4 qty 0 refused',   format($q$SELECT add_stock_lot(%L, 0, 130)$q$, iid),   'الكمية غير صحيحة');
  PERFORM t.expect_err('K4 qty -1 refused',  format($q$SELECT add_stock_lot(%L, -1, 130)$q$, iid),  'الكمية غير صحيحة');
  PERFORM t.expect_err('K4 qty 2.5 refused', format($q$SELECT add_stock_lot(%L, 2.5, 130)$q$, iid), 'الكمية غير صحيحة');
  PERFORM t.expect_err('K4 cost 0 refused',  format($q$SELECT add_stock_lot(%L, 1, 0)$q$, iid),     'سعر التكلفة يجب أن يكون أكبر من صفر');
  PERFORM t.expect_err('K4 cost -1 refused', format($q$SELECT add_stock_lot(%L, 1, -1)$q$, iid),    'قيمة غير صحيحة في الحقل: سعر التكلفة');
  PERFORM t.check('K4 refusals changed nothing', t.stock('CAM-1') = 15);

  PERFORM t.expect_err('K4 STALE lot edit (saw qty 5, is 6) refused', format($q$SELECT update_stock_lot(%L, 'l1', 5, 8, 110)$q$, iid), 'تغيّرت كمية هذه الدفعة منذ فتحها (الكمية الحالية: 6)');
  r := update_stock_lot(iid, 'l1', 6, 8, 110);
  PERFORM t.check('K4 lot edit (6→8 @110): stock +2, lot updated in place, cost follows the first lot, note kept',
    r.stock = 17 AND (r.lots->0->>'qty') = '8' AND (r.lots->0->>'costPrice') = '110' AND r.cost_price = 110 AND (r.lots->0->>'id') = 'l1');
  PERFORM t.expect_err('K4 unknown lot', format($q$SELECT update_stock_lot(%L, 'nope', NULL, 1, 1)$q$, iid), 'الدفعة غير موجودة');
  UPDATE inventory SET stock = 1 WHERE id = iid;
  PERFORM t.expect_err('K4 a lot reduction that would drive stock negative is refused', format($q$SELECT update_stock_lot(%L, 'l1', 8, 1, 110)$q$, iid), 'سيصبح مخزون الصنف سالباً');
  PERFORM t.as_user(t.S1());
  PERFORM t.expect_err('K4 sales cannot add lots', format($q$SELECT add_stock_lot(%L, 1, 1)$q$, iid), 'ليس لديك صلاحية تعديل المخزون');
END $K4$;

DO $K5$
DECLARE o1 orders; o2 orders; o3 orders; iid text; r inventory; s_items text;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user(t.S1());
  iid := (SELECT id FROM inventory WHERE sku = 'CAM-1');
  o1 := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":2}]'));
  PERFORM t.as_user(t.S2());
  o2 := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]'));
  PERFORM t.as_user(t.S1());
  o3 := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]'));
  UPDATE orders SET status = 'موافق عليه' WHERE id = o3.id;
  PERFORM t.as_user(t.TL()); PERFORM return_order_to_sales(o3.id);                   -- o3 now holds NO stock
  PERFORM t.check('K5 setup: o1,o2 reserved; o3 released; stock 7', t.stock('CAM-1') = 7);

  PERFORM t.as_user(t.AD());
  PERFORM t.expect_err('K5 an ordinary admin cannot use the override', format($q$SELECT change_inventory_sku(%L, 'CAM-9', 'x')$q$, iid), 'مدير النظام الأعلى فقط');
  PERFORM t.as_user(t.SA());
  PERFORM t.expect_err('K5 reason is mandatory',      format($q$SELECT change_inventory_sku(%L, 'CAM-9', '  ')$q$, iid), 'سبب التغيير مطلوب');
  PERFORM t.expect_err('K5 new SKU is mandatory',     format($q$SELECT change_inventory_sku(%L, ' ', 'r')$q$, iid), 'الـSKU الجديد مطلوب');
  PERFORM t.expect_err('K5 duplicate SKU refused',    format($q$SELECT change_inventory_sku(%L, 'DVR-1', 'r')$q$, iid), 'مستخدم بالفعل');
  PERFORM t.expect_err('K5 same SKU refused',         format($q$SELECT change_inventory_sku(%L, ' cam-1 ', 'r')$q$, iid), 'مطابق للحالي');
  PERFORM t.expect_err('K5 unknown product refused',  $q$SELECT change_inventory_sku('nope', 'X', 'r')$q$, 'المنتج غير موجود');

  r := change_inventory_sku(iid, 'CAM-9', 'تصحيح خطأ إملائي');
  PERFORM t.check('K5 inventory SKU changed', r.sku = 'CAM-9');
  PERFORM t.check('K5 RESERVED orders o1 and o2 had the SKU rewritten in the same transaction',
    (SELECT items->0->>'sku' FROM orders WHERE id = o1.id) = 'CAM-9' AND (SELECT items->0->>'sku' FROM orders WHERE id = o2.id) = 'CAM-9');
  PERFORM t.check('K5 the released order o3 was left untouched (still the old SKU)', (SELECT items->0->>'sku' FROM orders WHERE id = o3.id) = 'CAM-1');
  PERFORM t.check('K5 quantities / flags / status of the rewritten orders unchanged',
    (SELECT (items->0->>'quantity') = '2' AND inventory_deducted AND status = 'بانتظار الموافقة' FROM orders WHERE id = o1.id));
  PERFORM t.check('K5 audit row written server-side with reason and both order serials',
    EXISTS (SELECT 1 FROM audit_log WHERE type = 'inventory_sku_change' AND old_value = 'CAM-1' AND new_value = 'CAM-9'
              AND note LIKE '%تصحيح خطأ إملائي%' AND note LIKE '%' || o1.serial_number || '%' AND note LIKE '%' || o2.serial_number || '%' AND changed_by = 'Super'));
  UPDATE orders SET status = 'موافق عليه' WHERE id = o1.id;      -- approved, so it can be returned
  PERFORM t.as_user(t.TL());
  PERFORM return_order_to_sales(o1.id);
  PERFORM t.check('K5 the rewritten reserved order still returns cleanly — its stock lands on the right product (7→9)', t.stock('CAM-9') = 9 OR (SELECT stock FROM inventory WHERE id = iid) = 9,
    (SELECT stock FROM inventory WHERE id = iid)::text);
  PERFORM t.as_user(t.S1());
  PERFORM t.expect_err('K5 the released order (old SKU) must re-pick the product to resubmit',
    format($q$SELECT resubmit_order(%L, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]'))$q$, o3.id), 'CAM-1');
  PERFORM resubmit_order(o3.id, t.payload('[{"sku":"CAM-9","name":"Camera","quantity":1}]'));
  PERFORM t.check('K5 …and with the new SKU it resubmits', (SELECT stock FROM inventory WHERE id = iid) = 8);
  PERFORM t.as_user(t.SA());
  r := change_inventory_sku('inv-3', 'CBL-1', 'إضافة SKU');
  PERFORM t.check('K5 a product with no SKU just gets one (nothing to rewrite)', r.sku = 'CBL-1');
END $K5$;

DO $K6$
DECLARE o orders; ok boolean;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user(t.S1());
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]'));
  PERFORM t.as_user(t.AD());
  PERFORM t.expect_err('K6 delete_inventory_item refuses a product a reserved order needs', $q$SELECT delete_inventory_item('inv-1')$q$, 'لا يمكن حذف المنتج');
  ok := delete_inventory_item('inv-2');
  PERFORM t.check('K6 unreferenced product deleted', ok AND NOT EXISTS (SELECT 1 FROM inventory WHERE id = 'inv-2'));
END $K6$;
