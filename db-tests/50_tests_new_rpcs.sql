-- ===== F. create_order idempotency (M1) =====
DO $F1$
DECLARE o1 orders; o2 orders; o3 orders; o4 orders;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user(t.S1());
  o1 := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":3}]', '{"clientRequestId":"req-A"}'));
  o2 := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":3}]', '{"clientRequestId":"req-A"}'));
  PERFORM t.check('F1 replay of the same request returns the ORIGINAL order', o1.id = o2.id AND o1.serial_number = o2.serial_number);
  PERFORM t.check('F1 replay created no second order', (SELECT count(*) FROM orders) = 1);
  PERFORM t.check('F1 replay deducted stock only ONCE (10->7)', t.stock('CAM-1') = 7, t.stock('CAM-1')::text);
  PERFORM t.expect_err('F1 same request id + DIFFERENT payload is refused, never merged',
    $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":4}]', '{"clientRequestId":"req-A"}'))$q$, 'لطلب مختلف');
  PERFORM t.check('F1 refused mismatch changed nothing', t.stock('CAM-1') = 7 AND (SELECT count(*) FROM orders) = 1);
  o3 := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":3}]', '{"clientRequestId":"req-B"}'));
  PERFORM t.check('F1 a NEW request id with the identical payload is a separate intentional order', o3.id <> o1.id AND t.stock('CAM-1') = 4);
  PERFORM t.as_user(t.S2());
  PERFORM t.expect_err('F1 another rep cannot replay/steal a request id',
    $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":3}]', '{"clientRequestId":"req-A"}'))$q$, 'مستخدم بالفعل');
  PERFORM t.as_user(t.S1());
  o4 := create_order(t.payload('[{"sku":"DVR-1","name":"DVR","quantity":1}]'));
  o4 := create_order(t.payload('[{"sku":"DVR-1","name":"DVR","quantity":1}]'));
  PERFORM t.check('F1 legacy clients (no request id) behave as before: two calls = two orders', (SELECT count(*) FROM orders WHERE client_request_id IS NULL) = 2 AND t.stock('DVR-1') = 3);
  PERFORM t.expect_err('F1 over-long request id refused', format($q$SELECT create_order(t.payload('[{"sku":"DVR-1","name":"DVR","quantity":1}]', '{"clientRequestId":"%s"}'))$q$, repeat('x', 101)), 'معرّف الطلب غير صحيح');
  o4 := create_order(t.payload('[{"sku":"DVR-1","name":"DVR","quantity":1}]', '{"clientRequestId":"   "}'));
  PERFORM t.check('F1 blank request id is treated as none', o4.client_request_id IS NULL);
END $F1$;

-- ===== G. update_order_details — reserved item protection (B1) =====
DO $G1$
DECLARE o orders; r orders; upd text; hist int; before_items jsonb; total_before numeric;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user(t.S1());
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5,"price":100}]'));
  PERFORM t.check('G1 setup: reserved (flag TRUE), stock 5', o.inventory_deducted AND t.stock('CAM-1') = 5);
  before_items := o.items;

  PERFORM t.as_user(t.TL());
  upd := (SELECT updated_at::text FROM orders WHERE id = o.id);
  r := update_order_details(o.id, upd, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5,"price":150}]', '{"notes":"new note","clientName":"New Client","address":"New Addr","total":750,"subtotal":750}'));
  PERFORM t.check('G1 allowed: price, notes, customer, address changes on a RESERVED order',
    r.notes = 'new note' AND r.client_name = 'New Client' AND r.address = 'New Addr' AND (r.items->0->>'price') = '150' AND r.total = 750);
  PERFORM t.check('G1 allowed edit moved no stock and kept the flag', t.stock('CAM-1') = 5 AND r.inventory_deducted AND r.status = 'بانتظار الموافقة');
  PERFORM t.check('G1 history got a server-written entry (server name)', r.edit_history->-1->>'editedBy' = 'Team Lead' AND r.edit_history->-1->>'note' = 'تم التعديل' AND jsonb_array_length(r.edit_history) = 1);
  PERFORM t.check('G1 id / serial / created_at preserved', r.id = o.id AND r.serial_number = o.serial_number AND r.created_at = o.created_at);

  PERFORM t.expect_err('G1 STALE form (old updated_at) refused', format($q$SELECT update_order_details(%L, %L, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]'))$q$, o.id, upd), 'تم تعديل هذا الطلب من مستخدم آخر');

  upd := (SELECT updated_at::text FROM orders WHERE id = o.id);
  PERFORM t.expect_err('G1 reserved: quantity change refused', format($q$SELECT update_order_details(%L, %L, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":8}]'))$q$, o.id, upd), 'لا يمكن تعديل الأصناف أو الكميات');
  PERFORM t.expect_err('G1 reserved: removing the line refused', format($q$SELECT update_order_details(%L, %L, t.payload('[{"sku":"DVR-1","name":"DVR","quantity":5}]'))$q$, o.id, upd), 'لا يمكن تعديل الأصناف أو الكميات');
  PERFORM t.expect_err('G1 reserved: adding a line refused', format($q$SELECT update_order_details(%L, %L, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5},{"sku":"DVR-1","name":"DVR","quantity":1}]'))$q$, o.id, upd), 'لا يمكن تعديل الأصناف أو الكميات');
  PERFORM t.expect_err('G1 reserved: SKU swap at the same quantity refused', format($q$SELECT update_order_details(%L, %L, t.payload('[{"sku":"DVR-1","name":"DVR","quantity":5}]'))$q$, o.id, upd), 'لا يمكن تعديل الأصناف أو الكميات');
  PERFORM t.expect_err('G1 reserved: decreasing quantity refused too', format($q$SELECT update_order_details(%L, %L, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]'))$q$, o.id, upd), 'لا يمكن تعديل الأصناف أو الكميات');
  PERFORM t.check('G1 refused edits changed nothing (stock, items, history)', t.stock('CAM-1') = 5 AND (SELECT jsonb_array_length(edit_history) FROM orders WHERE id = o.id) = 1
    AND (SELECT (items->0->>'quantity') FROM orders WHERE id = o.id) = '5');

  r := update_order_details(o.id, upd, t.payload('[{"sku":"cam-1","name":"Camera","quantity":3},{"sku":"CAM-1 ","name":"Camera","quantity":2}]'));
  PERFORM t.check('G1 allowed: splitting the same product across lines (same total) is stock-neutral', jsonb_array_length(r.items) = 2 AND t.stock('CAM-1') = 5);
  upd := (SELECT updated_at::text FROM orders WHERE id = o.id);
  PERFORM t.expect_err('G1 invalid quantity refused before anything else', format($q$SELECT update_order_details(%L, %L, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":"2.5"}]'))$q$, o.id, upd), 'الكمية غير صحيحة');
  PERFORM t.expect_err('G1 missing version token refused', format($q$SELECT update_order_details(%L, NULL, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]'))$q$, o.id), 'بيانات التحقق من إصدار الطلب مفقودة');
  PERFORM t.expect_err('G1 malformed version token refused', format($q$SELECT update_order_details(%L, 'not-a-date', t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]'))$q$, o.id), 'غير صحيحة');

  total_before := (SELECT total FROM orders WHERE id = o.id);
  PERFORM t.as_user(t.S2());
  PERFORM t.expect_err('G1 another sales rep cannot edit this order', format($q$SELECT update_order_details(%L, %L, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]'))$q$, o.id, upd), 'ليس لديك صلاحية تعديل هذا الطلب');
  PERFORM t.as_user(t.S1());
  PERFORM t.expect_err('G1 the owning sales rep cannot edit a pending order even for a notes-only change',
    format($q$SELECT update_order_details(%L, %L, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]', '{"notes":"by owner"}'))$q$, o.id, upd), 'لا يمكنك تعديل الطلب بعد إرساله');
  PERFORM t.check('G1 …and the refused notes edit was not saved', (SELECT notes IS DISTINCT FROM 'by owner' FROM orders WHERE id = o.id));
  PERFORM t.expect_err('G1 the owning sales rep can NOT edit an order once submitted (pending) — server-side',
    format($q$SELECT update_order_details(%L, %L, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]', '{"notes":"by owner","total":1}'))$q$, o.id, upd), 'لا يمكنك تعديل الطلب بعد إرساله');
  PERFORM t.check('G1 …and its money fields are unchanged', (SELECT total FROM orders WHERE id = o.id) = total_before);
END $G1$;

DO $G2$
DECLARE o orders; r orders; upd text;
BEGIN
  -- an order that holds NO stock (returned to Sales) may change items freely — nothing to protect
  PERFORM t.reset(); PERFORM t.as_user(t.S1());
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]'));
  UPDATE orders SET status = 'موافق عليه' WHERE id = o.id;
  PERFORM t.as_user(t.TL()); PERFORM return_order_to_sales(o.id);
  PERFORM t.as_user(t.S1());
  upd := (SELECT updated_at::text FROM orders WHERE id = o.id);
  r := update_order_details(o.id, upd, t.payload('[{"sku":"DVR-1","name":"DVR","quantity":2}]'));
  PERFORM t.check('G2 unreserved (returned) order: items editable via plain edit, no stock movement', (r.items->0->>'sku') = 'DVR-1' AND NOT r.inventory_deducted AND t.stock('CAM-1') = 10 AND t.stock('DVR-1') = 5);
  PERFORM t.as_user(t.AD());
  PERFORM cancel_order(o.id);
  upd := (SELECT updated_at::text FROM orders WHERE id = o.id);
  PERFORM t.expect_err('G2 cancelled order cannot be edited', format($q$SELECT update_order_details(%L, %L, t.payload('[{"sku":"DVR-1","name":"DVR","quantity":2}]'))$q$, o.id, upd), 'لا يمكن تعديل طلب ملغي');
END $G2$;

-- ===== H. advance_order_status — stale-safe transitions (H3) =====
DO $H1$
DECLARE o orders; o2 orders; r orders;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user(t.S1());
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":2}]'));
  PERFORM t.expect_err('H1 sales cannot advance status', format($q$SELECT advance_order_status(%L, 'بانتظار الموافقة', 'موافق عليه')$q$, o.id), 'ليس لديك صلاحية تحديث حالة الطلب');
  PERFORM t.as_user(t.TL());
  PERFORM t.expect_err('H1 missing expected status refused', format($q$SELECT advance_order_status(%L, NULL, 'موافق عليه')$q$, o.id), 'بيانات تحديث الحالة غير مكتملة');
  r := advance_order_status(o.id, 'بانتظار الموافقة', 'موافق عليه', 'hint');
  PERFORM t.check('H1 team_leader approves (expected status matches)', r.status = 'موافق عليه' AND r.edit_history->-1->>'type' = 'status_change'
     AND r.edit_history->-1->>'previousStatus' = 'بانتظار الموافقة' AND r.edit_history->-1->>'changedBy' = 'Team Lead');
  PERFORM t.check('H1 approval moved no stock and kept the reservation', r.inventory_deducted AND t.stock('CAM-1') = 8);
  PERFORM t.expect_err('H1 team_leader cannot dispatch', format($q$SELECT advance_order_status(%L, 'موافق عليه', 'تم الصرف')$q$, o.id), 'ليس لديك صلاحية تحديث الطلب إلى هذه الحالة');
  PERFORM t.as_user(t.AD());
  PERFORM t.expect_err('H1 STALE approve (screen still shows pending) refused', format($q$SELECT advance_order_status(%L, 'بانتظار الموافقة', 'موافق عليه')$q$, o.id), 'تغيّرت حالة الطلب');
  PERFORM t.expect_err('H1 skipping a step refused', format($q$SELECT advance_order_status(%L, 'موافق عليه', 'مكتمل')$q$, o.id), 'انتقال الحالة غير مسموح');
  PERFORM t.expect_err('H1 going backwards via advance refused', format($q$SELECT advance_order_status(%L, 'موافق عليه', 'بانتظار الموافقة')$q$, o.id), 'انتقال الحالة غير مسموح');
  r := advance_order_status(o.id, 'موافق عليه', 'تم الصرف');
  r := advance_order_status(o.id, 'تم الصرف', 'مكتمل');
  r := advance_order_status(o.id, 'مكتمل', 'تم التحصيل');
  PERFORM t.check('H1 admin walks dispatch → complete → collect; history has every step', r.status = 'تم التحصيل' AND jsonb_array_length(r.edit_history) = 4);

  -- the classic race: TL rejects while an admin's stale screen still shows "pending"
  PERFORM t.as_user(t.S1());
  o2 := create_order(t.payload('[{"sku":"DVR-1","name":"DVR","quantity":2}]'));
  PERFORM t.as_user(t.TL()); PERFORM reject_order(o2.id);
  PERFORM t.as_user(t.AD());
  PERFORM t.expect_err('H1 stale APPROVE after a concurrent REJECT is refused', format($q$SELECT advance_order_status(%L, 'بانتظار الموافقة', 'موافق عليه')$q$, o2.id), 'تغيّرت حالة الطلب');
  PERFORM t.check('H1 order stays rejected, released, NOT re-reserved; rejection history intact',
    (SELECT status FROM orders WHERE id = o2.id) = 'مرفوض' AND NOT (SELECT inventory_deducted FROM orders WHERE id = o2.id)
    AND t.stock('DVR-1') = 5 AND (SELECT edit_history->-1->>'newStatus' FROM orders WHERE id = o2.id) = 'مرفوض');
  PERFORM t.as_user(t.TL());
  PERFORM t.expect_err('H1 stale REJECT of an already-approved order refused', format($q$SELECT reject_order(%L)$q$, o.id), 'لا يمكن رفض هذا الطلب من حالته الحالية');
  PERFORM t.expect_err('H1 return with a stale expected status refused', format($q$SELECT return_order_to_sales(%L, NULL, 'موافق عليه')$q$, o.id), 'تغيّرت حالة الطلب');
  PERFORM t.as_user(t.AD());
  PERFORM t.expect_err('H1 cancel with a stale expected status refused', format($q$SELECT cancel_order(%L, NULL, 'بانتظار الموافقة')$q$, o.id), 'تغيّرت حالة الطلب');
END $H1$;

-- ===== I. stale revert (M4) =====
DO $I1$
DECLARE o orders; v orders; upd text;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user(t.S1());
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":4}]'));                 -- stock 6
  PERFORM t.as_user(t.AD()); PERFORM advance_order_status(o.id, 'بانتظار الموافقة', 'موافق عليه');
  PERFORM t.as_user(t.TL()); PERFORM return_order_to_sales(o.id);                                    -- stock 10, جديد
  PERFORM t.as_user(t.AD());
  PERFORM t.expect_err('I1 an OLD approval cannot be reverted after Return to Sales',
    format($q$SELECT revert_order_status(%L)$q$, o.id), 'آخر إجراء على الطلب لم يكن تغيير حالة قابلاً للتراجع');
  PERFORM t.check('I1 refused revert changed nothing (still جديد, released, flag FALSE)',
    (SELECT status FROM orders WHERE id = o.id) = 'جديد' AND NOT (SELECT inventory_deducted FROM orders WHERE id = o.id) AND t.stock('CAM-1') = 10);
  -- after a resubmit the newest entry IS a matching status_change → revert allowed (and releases stock)
  PERFORM t.as_user(t.S1());
  PERFORM resubmit_order(o.id, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":4}]'));
  PERFORM t.as_user(t.AD());
  PERFORM t.expect_err('I1 revert with stale expected status refused', format($q$SELECT revert_order_status(%L, NULL, 'موافق عليه')$q$, o.id), 'تغيّرت حالة الطلب');
  v := revert_order_status(o.id, NULL, 'بانتظار الموافقة');
  PERFORM t.check('I1 newest matching status_change (the resubmit) reverts cleanly: جديد, released', v.status = 'جديد' AND NOT v.inventory_deducted AND t.stock('CAM-1') = 10);
  -- history mismatch
  INSERT INTO orders(id, serial_number, status, sales_rep, items, inventory_deducted, edit_history)
    VALUES ('ORD-M1','9001','مكتمل','Ali','[{"sku":"CAM-1","name":"Camera","quantity":1}]',false,
            '[{"type":"status_change","previousStatus":"موافق عليه","newStatus":"تم الصرف"}]');
  PERFORM t.expect_err('I1 revert when the newest entry no longer explains the current status', $q$SELECT revert_order_status('ORD-M1')$q$, 'لا تطابق آخر تغيير مسجل');
  -- plain edit notes between do not block a genuine revert
  PERFORM t.as_user(t.S2());
  o := create_order(t.payload('[{"sku":"DVR-1","name":"DVR","quantity":1}]'));
  PERFORM t.as_user(t.AD()); PERFORM advance_order_status(o.id, 'بانتظار الموافقة', 'موافق عليه');
  PERFORM t.as_user(t.TL());
  upd := (SELECT updated_at::text FROM orders WHERE id = o.id);
  PERFORM update_order_details(o.id, upd, t.payload('[{"sku":"DVR-1","name":"DVR","quantity":1}]', '{"notes":"edited after approval"}'));
  PERFORM t.as_user(t.AD());
  v := revert_order_status(o.id);
  PERFORM t.check('I1 an edit note after the approval does not prevent reverting that approval', v.status = 'بانتظار الموافقة' AND v.inventory_deducted);
END $I1$;

-- ===== J. stock vs lots (M6) =====
DO $J1$
DECLARE o orders; iid text; r inventory;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user(t.S1());
  iid := (SELECT id FROM inventory WHERE sku = 'CAM-1');
  UPDATE inventory SET stock = 10, lots = '[{"id":"a","qty":7,"costPrice":100}]' WHERE id = iid;    -- stock 10, lots 7
  PERFORM t.expect_err('J1 stock says 10 but lots only cover 7 → order for 9 refused (was: silently passed)',
    $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":9}]'))$q$, 'دفعات المخزون المسجلة للصنف "Camera" لا تغطي الكمية المطلوبة (المتاح في الدفعات: 7 — المطلوب: 9)');
  PERFORM t.check('J1 nothing changed by the refusal', t.stock('CAM-1') = 10 AND t.lotsum('CAM-1') = 7);
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":7}]'));
  PERFORM t.check('J1 an order the lots CAN cover succeeds; historical mismatch is neither hidden nor rewritten', t.stock('CAM-1') = 3 AND t.lotsum('CAM-1') = 0);
  PERFORM t.expect_err('J1 then stock 3 / lots 0 → refused by the lots check', $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]'))$q$, 'لا تغطي الكمية المطلوبة');

  UPDATE inventory SET stock = 5, lots = '[{"id":"a","qty":10,"costPrice":100}]' WHERE id = iid;     -- lots MORE than stock
  PERFORM t.expect_err('J1 lots 10 but stock 5 → the stock figure still limits (order for 6)', $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":6}]'))$q$, 'المتاح: 5 — المطلوب: 6');

  -- explicit reconciliation (audited)
  UPDATE inventory SET stock = 10, lots = '[{"id":"a","qty":7,"costPrice":100}]' WHERE id = iid;
  PERFORM t.as_user(t.AD());
  PERFORM t.expect_err('J1 reconcile needs a reason', format($q$SELECT reconcile_inventory_lots(%L, 'add_lot_for_shortfall', '  ')$q$, iid), 'سبب التسوية مطلوب');
  PERFORM t.expect_err('J1 reconcile rejects an unknown mode', format($q$SELECT reconcile_inventory_lots(%L, 'whatever', 'r')$q$, iid), 'نوع التسوية غير صحيح');
  r := reconcile_inventory_lots(iid, 'add_lot_for_shortfall', 'جرد يونيو');
  PERFORM t.check('J1 shortfall lot appended (lots now cover stock), stock unchanged, old lots untouched',
    r.stock = 10 AND t.lotsum('CAM-1') = 10 AND r.lots->0->>'id' = 'a' AND (r.lots->0->>'qty') = '7' AND jsonb_array_length(r.lots) = 2);
  PERFORM t.check('J1 reconciliation wrote a server-side audit row with the reason',
    EXISTS (SELECT 1 FROM audit_log WHERE type = 'inventory_reconcile' AND note LIKE '%جرد يونيو%' AND changed_by = 'Admin'));
  PERFORM t.expect_err('J1 second reconcile: nothing to fix', format($q$SELECT reconcile_inventory_lots(%L, 'add_lot_for_shortfall', 'r')$q$, iid), 'لا يوجد نقص');
  UPDATE inventory SET stock = 5, lots = '[{"id":"a","qty":10,"costPrice":100}]' WHERE id = iid;
  r := reconcile_inventory_lots(iid, 'set_stock_to_lots', 'تصحيح');
  PERFORM t.check('J1 set_stock_to_lots aligns stock to the lots sum', r.stock = 10);
  PERFORM t.as_user(t.S1());
  PERFORM t.expect_err('J1 sales cannot reconcile', format($q$SELECT reconcile_inventory_lots(%L, 'set_stock_to_lots', 'x')$q$, iid), 'ليس لديك صلاحية تسوية المخزون');
END $J1$;
