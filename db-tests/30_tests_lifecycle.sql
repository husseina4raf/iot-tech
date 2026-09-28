-- ===== D. return to Sales -> edit -> resubmit =====
DO $D1$
DECLARE o orders; r orders; s orders; hist jsonb; last_note text;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]'));                    -- step 1-2
  PERFORM t.check('D1 step2: stock deducted immediately 10->5', t.stock('CAM-1') = 5);
  UPDATE orders SET status = 'موافق عليه' WHERE id = o.id;                                            -- admin approves (direct status update)
  PERFORM t.check('D1 approve does not touch stock', t.stock('CAM-1') = 5);

  PERFORM t.as_user('a0000000-0000-0000-0000-000000000003');                                          -- Team Leader returns it
  r := return_order_to_sales(o.id, 'ignored-hint');
  PERFORM t.check('D1 return: status جديد', r.status = 'جديد', r.status);
  PERFORM t.check('D1 return: flag FALSE', NOT r.inventory_deducted);
  PERFORM t.check('D1 return: stock restored by EXACTLY 5 (5->10) even for a Team Leader', t.stock('CAM-1') = 10, t.stock('CAM-1')::text);
  PERFORM t.check('D1 return: lots sum matches stock', t.lotsum('CAM-1') = 10, t.lotsum('CAM-1')::text);
  SELECT lots->-1->>'note' INTO last_note FROM inventory WHERE sku='CAM-1';
  PERFORM t.check('D1 return: return-lot note references serial', last_note = 'مُرجَع من طلب #' || o.serial_number, last_note);
  hist := r.edit_history;
  PERFORM t.check('D1 return: history entry recorded (server name, not client hint)',
    hist->-1->>'type' = 'returned_to_sales' AND hist->-1->>'previousStatus' = 'موافق عليه' AND hist->-1->>'returnedBy' = 'Team Lead', (hist->-1)::text);
  PERFORM t.expect_err('D1 return twice: second call refused', format($q$SELECT return_order_to_sales(%L)$q$, o.id), 'لا يمكن إعادة هذا الطلب للسيلز من حالته الحالية');
  PERFORM t.check('D1 no duplicate restore (still 10)', t.stock('CAM-1') = 10);

  PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');                                          -- Sales edits 5 -> 7 and resubmits
  s := resubmit_order(o.id, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":7}]', '{"changedByName":"spoof"}'));
  PERFORM t.check('D1 resubmit 5->7: final impact exactly 7 (10->3), NOT 12', t.stock('CAM-1') = 3, t.stock('CAM-1')::text);
  PERFORM t.check('D1 resubmit: flag TRUE', s.inventory_deducted);
  PERFORM t.check('D1 resubmit: back to بانتظار الموافقة', s.status = 'بانتظار الموافقة', s.status);
  PERFORM t.check('D1 resubmit: id + serial preserved', s.id = o.id AND s.serial_number = o.serial_number);
  PERFORM t.check('D1 resubmit: created_at preserved', s.created_at = o.created_at);
  PERFORM t.check('D1 resubmit: history preserved + appended (2 entries)', jsonb_array_length(s.edit_history) = 2, jsonb_array_length(s.edit_history)::text);
  PERFORM t.check('D1 resubmit: history actor is server-derived (profile name), not the payload', s.edit_history->-1->>'changedBy' = 'Sales One', s.edit_history->-1->>'changedBy');
  PERFORM t.check('D1 resubmit: items carry edited quantity 7', s.items->0->>'quantity' = '7');
  PERFORM t.expect_err('D1 double-click / repeat resubmit refused', format($q$SELECT resubmit_order(%L, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":7}]'))$q$, o.id), 'لا يمكن إعادة إرسال هذا الطلب من حالته الحالية');
  PERFORM t.check('D1 repeat resubmit did not deduct again (still 3)', t.stock('CAM-1') = 3);
END $D1$;

DO $D2$
DECLARE o orders;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]'));
  UPDATE orders SET status = 'تم الصرف' WHERE id = o.id;
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000004');
  PERFORM return_order_to_sales(o.id);
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  PERFORM resubmit_order(o.id, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":3}]'));
  PERFORM t.check('D2 resubmit 5->3: final impact exactly 3 (10->7)', t.stock('CAM-1') = 7, t.stock('CAM-1')::text);
  PERFORM t.check('D2 lots consistent', t.lotsum('CAM-1') = 7);
END $D2$;

DO $D3$
DECLARE o orders; r orders; st text; fl boolean;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]'));
  UPDATE orders SET status = 'موافق عليه' WHERE id = o.id;
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000003');
  PERFORM return_order_to_sales(o.id);                                    -- stock back to 10
  UPDATE inventory SET stock = 2, lots = '[{"id":"l1","qty":2,"costPrice":100}]' WHERE sku='CAM-1';  -- others consumed it meanwhile
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  PERFORM t.expect_err('D3 resubmit needing more than available: fails clearly',
    format($q$SELECT resubmit_order(%L, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]'))$q$, o.id),
    'الكمية المطلوبة غير متاحة في المخزون للصنف: Camera — المتاح: 2 — المطلوب: 5');
  SELECT status, inventory_deducted INTO st, fl FROM orders WHERE id = o.id;
  PERFORM t.check('D3 failed resubmit: order stays جديد', st = 'جديد', st);
  PERFORM t.check('D3 failed resubmit: flag stays FALSE', fl = false);
  PERFORM t.check('D3 failed resubmit: inventory exactly as before', t.stock('CAM-1') = 2 AND t.lotsum('CAM-1') = 2);
  PERFORM t.check('D3 failed resubmit: history not appended', jsonb_array_length((SELECT edit_history FROM orders WHERE id=o.id)) = 1);
  PERFORM t.expect_err('D3 resubmit with invalid quantity rejected',
    format($q$SELECT resubmit_order(%L, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":-1}]'))$q$, o.id), 'الكمية غير صحيحة');
END $D3$;

DO $D4$
DECLARE o orders;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":2}]'));
  UPDATE orders SET status = 'موافق عليه' WHERE id = o.id;
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000003');
  PERFORM return_order_to_sales(o.id);
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000002');   -- a DIFFERENT sales rep
  PERFORM t.expect_err('D4 sales cannot resubmit ANOTHER rep''s order',
    format($q$SELECT resubmit_order(%L, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]'))$q$, o.id), 'ليس لديك صلاحية تعديل هذا الطلب');
  PERFORM t.check('D4 not hijacked: sales_rep still Ali', (SELECT sales_rep FROM orders WHERE id=o.id) = 'Ali');
  PERFORM t.check('D4 no stock movement', t.stock('CAM-1') = 10);
  -- team leader may resubmit on behalf (existing role behaviour), keeping the current rep when none given
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000003');
  PERFORM resubmit_order(o.id, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]', '{"salesRep":""}'));
  PERFORM t.check('D4 team_leader resubmit keeps existing rep when blank', (SELECT sales_rep FROM orders WHERE id=o.id) = 'Ali');
  PERFORM t.expect_err('D4 resubmit of unknown order', $q$SELECT resubmit_order('ORD-NOPE', t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]'))$q$, 'الطلب غير موجود');
END $D4$;

DO $D5$
DECLARE o orders;
BEGIN
  -- legacy order: dispatched under the OLD model (stock deducted then), flag defaults FALSE
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000004');
  INSERT INTO orders(id, serial_number, status, sales_rep, items, inventory_deducted, edit_history)
    VALUES ('ORD-L1','1','تم الصرف','Ali','[{"sku":"CAM-1","name":"Camera","quantity":4}]',false,'[]');
  UPDATE inventory SET stock = 6, lots = '[{"id":"l1","qty":2,"costPrice":100},{"id":"l2","qty":4,"costPrice":120}]' WHERE sku='CAM-1';
  o := return_order_to_sales('ORD-L1');
  PERFORM t.check('D5 legacy flag-FALSE order returns to جديد', o.status = 'جديد');
  PERFORM t.check('D5 legacy flag-FALSE order: NO stock restore, flag untouched (no guessing)', t.stock('CAM-1') = 6 AND NOT o.inventory_deducted);
END $D5$;

-- ===== E. reject / cancel / un-cancel / revert =====
DO $E1$
DECLARE o orders; r orders;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":4}]'));
  PERFORM t.expect_err('E1 sales cannot reject', format($q$SELECT reject_order(%L)$q$, o.id), 'ليس لديك صلاحية رفض الطلب');
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000003');
  r := reject_order(o.id);
  PERFORM t.check('E1 reject: status مرفوض, flag FALSE', r.status = 'مرفوض' AND NOT r.inventory_deducted);
  PERFORM t.check('E1 reject: stock restored exactly (6->10)', t.stock('CAM-1') = 10 AND t.lotsum('CAM-1') = 10);
  PERFORM t.check('E1 reject: history status_change recorded', r.edit_history->-1->>'newStatus' = 'مرفوض' AND r.edit_history->-1->>'previousStatus' = 'بانتظار الموافقة');
  PERFORM t.expect_err('E1 reject twice refused (no double restore)', format($q$SELECT reject_order(%L)$q$, o.id), 'لا يمكن رفض هذا الطلب من حالته الحالية');
  PERFORM t.check('E1 still 10', t.stock('CAM-1') = 10);
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  PERFORM resubmit_order(o.id, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":2}]'));
  PERFORM t.check('E1 rejected -> edit -> resubmit deducts final qty only (10->8)', t.stock('CAM-1') = 8);
END $E1$;

DO $E2$
DECLARE o orders; c orders; u orders; hist jsonb;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":4}]'));
  UPDATE orders SET status = 'موافق عليه' WHERE id = o.id;
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000003');
  PERFORM t.expect_err('E2 team_leader cannot cancel', format($q$SELECT cancel_order(%L)$q$, o.id), 'ليس لديك صلاحية إلغاء الطلب');
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000004');
  c := cancel_order(o.id);
  PERFORM t.check('E2 cancel: status ملغي + flag FALSE + stock restored', c.status = 'ملغي' AND NOT c.inventory_deducted AND t.stock('CAM-1') = 10);
  PERFORM t.check('E2 cancel: entry records inventoryWasDeducted=true', c.edit_history->-1->'inventoryWasDeducted' = 'true'::jsonb, (c.edit_history->-1)::text);
  PERFORM t.expect_err('E2 cancel twice refused', format($q$SELECT cancel_order(%L)$q$, o.id), 'هذا الطلب ملغي بالفعل');
  PERFORM t.check('E2 no double restore', t.stock('CAM-1') = 10);
  -- un-cancel: order held stock before -> must reserve again
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000003');
  PERFORM t.expect_err('E2 team_leader cannot un-cancel', format($q$SELECT restore_cancelled_order(%L)$q$, o.id), 'ليس لديك صلاحية استعادة الطلب');
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000004');
  u := restore_cancelled_order(o.id);
  PERFORM t.check('E2 un-cancel (held stock): back to previous status', u.status = 'موافق عليه', u.status);
  PERFORM t.check('E2 un-cancel: RE-RESERVED — flag TRUE, stock deducted again (10->6)', u.inventory_deducted AND t.stock('CAM-1') = 6, t.stock('CAM-1')::text);
  PERFORM t.check('E2 un-cancel: consumed cancellation entry removed', NOT (u.edit_history @> '[{"type":"cancellation"}]'::jsonb));
  PERFORM t.expect_err('E2 un-cancel a non-cancelled order refused', format($q$SELECT restore_cancelled_order(%L)$q$, o.id), 'هذا الطلب غير ملغي');
END $E2$;

DO $E3$
DECLARE o orders; st text; fl boolean;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":4}]'));
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000004');
  PERFORM cancel_order(o.id);                                              -- stock 10
  UPDATE inventory SET stock = 1, lots = '[{"id":"l1","qty":1,"costPrice":100}]' WHERE sku='CAM-1';
  PERFORM t.expect_err('E3 un-cancel when stock is no longer sufficient fails clearly',
    format($q$SELECT restore_cancelled_order(%L)$q$, o.id), 'المتاح: 1 — المطلوب: 4');
  SELECT status, inventory_deducted INTO st, fl FROM orders WHERE id = o.id;
  PERFORM t.check('E3 failed un-cancel leaves order cancelled, flag FALSE, stock untouched', st = 'ملغي' AND fl = false AND t.stock('CAM-1') = 1);
END $E3$;

DO $E4$
DECLARE u orders;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000004');
  -- legacy cancellation (no inventoryWasDeducted recorded): state unknowable -> جديد, no stock movement
  INSERT INTO orders(id, serial_number, status, sales_rep, items, inventory_deducted, edit_history)
    VALUES ('ORD-L2','2','ملغي','Ali','[{"sku":"CAM-1","name":"Camera","quantity":4}]',false,
            '[{"type":"cancellation","previousStatus":"تم الصرف"}]');
  u := restore_cancelled_order('ORD-L2');
  PERFORM t.check('E4 legacy cancellation (unknown): goes to جديد, flag FALSE, no stock movement', u.status = 'جديد' AND NOT u.inventory_deducted AND t.stock('CAM-1') = 10, u.status);
  INSERT INTO orders(id, serial_number, status, sales_rep, items, inventory_deducted, edit_history)
    VALUES ('ORD-L3','3','ملغي','Ali','[{"sku":"CAM-1","name":"Camera","quantity":4}]',false,
            '[{"type":"cancellation","previousStatus":"جديد","inventoryWasDeducted":false}]');
  u := restore_cancelled_order('ORD-L3');
  PERFORM t.check('E4 explicit "held nothing": returns to previous status, no stock movement', u.status = 'جديد' AND NOT u.inventory_deducted AND t.stock('CAM-1') = 10);
  INSERT INTO orders(id, serial_number, status, sales_rep, items, inventory_deducted, edit_history)
    VALUES ('ORD-L4','4','ملغي','Ali','[{"sku":"CAM-1","name":"Camera","quantity":4}]',false,'[]');
  u := restore_cancelled_order('ORD-L4');
  PERFORM t.check('E4 no cancellation entry at all: جديد', u.status = 'جديد');
END $E4$;

DO $E5$
DECLARE o orders; v orders;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":4}]'));     -- stock 6
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000003');
  PERFORM reject_order(o.id);                                                          -- stock 10, مرفوض, flag F
  PERFORM t.expect_err('E5 team_leader cannot revert', format($q$SELECT revert_order_status(%L)$q$, o.id), 'ليس لديك صلاحية التراجع عن الحالة');
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000004');
  v := revert_order_status(o.id);                                                      -- مرفوض -> بانتظار الموافقة : unreserved -> reserved
  PERFORM t.check('E5 revert reject: status بانتظار الموافقة', v.status = 'بانتظار الموافقة');
  PERFORM t.check('E5 revert reject: RE-RESERVES stock (10->6) and flag TRUE', v.inventory_deducted AND t.stock('CAM-1') = 6, t.stock('CAM-1')::text);
  PERFORM t.check('E5 revert: popped the last status_change entry', jsonb_array_length(v.edit_history) = 0);
  PERFORM t.expect_err('E5 revert with no status_change history', format($q$SELECT revert_order_status(%L)$q$, o.id), 'لا يوجد تغيير حالة سابق');
END $E5$;

DO $E6$
DECLARE o orders; v orders;
BEGIN
  -- revert right after a resubmit would otherwise strand the order in جديد with flag TRUE
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]'));      -- 5
  UPDATE orders SET status = 'موافق عليه' WHERE id = o.id;
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000003');
  PERFORM return_order_to_sales(o.id);                                                  -- 10
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  PERFORM resubmit_order(o.id, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]'));   -- 5, flag T
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000004');
  v := revert_order_status(o.id);                                                       -- بانتظار الموافقة -> جديد : reserved -> unreserved
  PERFORM t.check('E6 revert a resubmit: status جديد AND flag FALSE (never the dead end جديد+TRUE)', v.status = 'جديد' AND NOT v.inventory_deducted, v.status || '/' || v.inventory_deducted::text);
  PERFORM t.check('E6 revert a resubmit: stock released (5->10)', t.stock('CAM-1') = 10);
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  PERFORM resubmit_order(o.id, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]'));
  PERFORM t.check('E6 ...and Sales can resubmit again (5)', t.stock('CAM-1') = 5);
END $E6$;

DO $E7$
DECLARE o orders; v orders;
BEGIN
  -- same-class revert moves no stock
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000001');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]'));
  UPDATE orders SET status = 'موافق عليه',
     edit_history = '[{"type":"status_change","previousStatus":"بانتظار الموافقة","newStatus":"موافق عليه"}]' WHERE id = o.id;
  PERFORM t.as_user('a0000000-0000-0000-0000-000000000004');
  v := revert_order_status(o.id);
  PERFORM t.check('E7 reserved->reserved revert: no stock movement, flag stays TRUE', v.status = 'بانتظار الموافقة' AND v.inventory_deducted AND t.stock('CAM-1') = 5);
END $E7$;

DO $E8$
DECLARE o orders;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user('a0000000-0000-0000-0000-000000000004');
  INSERT INTO orders(id, serial_number, status, sales_rep, items, inventory_deducted, edit_history)
    VALUES ('ORD-L5','5','ملغي','Ali','[{"sku":"CAM-1","name":"Camera","quantity":1}]',false,
            '[{"type":"status_change","previousStatus":"موافق عليه","newStatus":"تم الصرف"}]');
  PERFORM t.expect_err('E8 revert of a cancelled order points to un-cancel', $q$SELECT revert_order_status('ORD-L5')$q$, 'الطلب ملغي');
  -- corrupt previousStatus is refused, not applied
  INSERT INTO orders(id, serial_number, status, sales_rep, items, inventory_deducted, edit_history)
    VALUES ('ORD-L6','6','مكتمل','Ali','[{"sku":"CAM-1","name":"Camera","quantity":1}]',false,
            '[{"type":"status_change","previousStatus":"ملغي","newStatus":"مكتمل"}]');
  PERFORM t.expect_err('E8 revert to an invalid previousStatus refused', $q$SELECT revert_order_status('ORD-L6')$q$, 'تعذر تحديد الحالة السابقة');
  -- legacy flag-FALSE dispatched order: revert within the reserved family moves NO stock
  INSERT INTO orders(id, serial_number, status, sales_rep, items, inventory_deducted, edit_history)
    VALUES ('ORD-L7','7','تم الصرف','Ali','[{"sku":"CAM-1","name":"Camera","quantity":3}]',false,
            '[{"type":"status_change","previousStatus":"موافق عليه","newStatus":"تم الصرف"}]');
  o := revert_order_status('ORD-L7');
  PERFORM t.check('E8 legacy dispatched order revert: status موافق عليه, no invented deduction', o.status = 'موافق عليه' AND NOT o.inventory_deducted AND t.stock('CAM-1') = 10);
END $E8$;
