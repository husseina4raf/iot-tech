-- ===== L1. orders guard: the SAME attacks, now with the guard installed =====
DO $L1$
DECLARE o orders; oid text; before_flag boolean; n_hist int;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user(t.S1());
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]'));  oid := o.id;     -- stock 5, reserved
  n_hist := jsonb_array_length((SELECT edit_history FROM orders WHERE id = oid));

  -- legacy operations an OLD cached bundle performs
  PERFORM t.expect_err_as(t.TL(), 'L1 old client: direct status flip (legacy Return to Sales) refused',
    format($q$UPDATE orders SET status = 'جديد', updated_at = now() WHERE id = %L$q$, oid), 'يرجى تحديث الصفحة');
  PERFORM t.expect_err_as(t.TL(), 'L1 old client: direct history overwrite refused',
    format($q$UPDATE orders SET edit_history = '[{"note":"forged"}]'::jsonb WHERE id = %L$q$, oid), 'يرجى تحديث الصفحة');
  PERFORM t.expect_err_as(t.TL(), 'L1 old client: full-row legacy update (status + history + items) refused',
    format($q$UPDATE orders SET status='جديد', edit_history='[]'::jsonb, items='[{"sku":"CAM-1","name":"Camera","quantity":9}]'::jsonb WHERE id = %L$q$, oid), 'يرجى تحديث الصفحة');
  PERFORM t.expect_err_as(t.TL(), 'L1 old client: flag flip by team_leader refused', format($q$UPDATE orders SET inventory_deducted = FALSE WHERE id = %L$q$, oid), 'يرجى تحديث الصفحة');
  PERFORM t.expect_err_as(t.S1(), 'L1 flag flip by the OWNING sales user refused', format($q$UPDATE orders SET inventory_deducted = FALSE WHERE id = %L$q$, oid), 'لا يمكن تعديل الطلب مباشرةً');
  PERFORM t.expect_err_as(t.AD(), 'L1 old client: direct approve (status) refused', format($q$UPDATE orders SET status='موافق عليه' WHERE id = %L$q$, oid), 'يرجى تحديث الصفحة');
  PERFORM t.expect_err_as(t.AD(), 'L1 old client: direct cancel refused',  format($q$UPDATE orders SET status='ملغي' WHERE id = %L$q$, oid), 'يرجى تحديث الصفحة');
  PERFORM t.expect_err_as(t.TL(), 'L1 old client: direct reject refused',  format($q$UPDATE orders SET status='مرفوض' WHERE id = %L$q$, oid), 'يرجى تحديث الصفحة');
  PERFORM t.expect_err_as(t.S1(), 'L1 sales cannot approve their own order with a raw status write', format($q$UPDATE orders SET status='موافق عليه' WHERE id = %L$q$, oid), 'لا يمكن تعديل الطلب مباشرةً');

  -- B1: reserved item protection on raw writes
  PERFORM t.expect_err_as(t.TL(), 'L1 (B1) raw quantity change on a reserved order refused (TL)',
    format($q$UPDATE orders SET items = '[{"sku":"CAM-1","name":"Camera","quantity":8}]'::jsonb WHERE id = %L$q$, oid), 'لا يمكن تعديل الأصناف أو الكميات');
  PERFORM t.expect_err_as(t.S1(), 'L1 (B1) …and by the owning sales user',
    format($q$UPDATE orders SET items = '[{"sku":"CAM-1","name":"Camera","quantity":1}]'::jsonb WHERE id = %L$q$, oid), 'لا يمكن تعديل الطلب مباشرةً');
  PERFORM t.expect_err_as(t.TL(), 'L1 (B1) raw line removal refused', format($q$UPDATE orders SET items = '[{"sku":"DVR-1","name":"DVR","quantity":5}]'::jsonb WHERE id = %L$q$, oid), 'لا يمكن تعديل الأصناف أو الكميات');
  PERFORM t.expect_err_as(t.TL(), 'L1 (B1) raw line addition refused', format($q$UPDATE orders SET items = '[{"sku":"CAM-1","name":"Camera","quantity":5},{"sku":"DVR-1","name":"DVR","quantity":1}]'::jsonb WHERE id = %L$q$, oid), 'لا يمكن تعديل الأصناف أو الكميات');
  PERFORM t.expect_err_as(t.TL(), 'L1 (B1) an emptied items array refused', format($q$UPDATE orders SET items = '[]'::jsonb WHERE id = %L$q$, oid), 'لا يمكن تعديل الأصناف أو الكميات');

  -- identity
  PERFORM t.expect_err_as(t.TL(), 'L1 serial_number is immutable', format($q$UPDATE orders SET serial_number = '1' WHERE id = %L$q$, oid), 'لا يمكن تعديل هوية الطلب');
  PERFORM t.expect_err_as(t.TL(), 'L1 created_at is immutable',    format($q$UPDATE orders SET created_at = now() - interval '1 day' WHERE id = %L$q$, oid), 'لا يمكن تعديل هوية الطلب');
  PERFORM t.expect_err_as(t.TL(), 'L1 client_request_id is immutable', format($q$UPDATE orders SET client_request_id = 'x' WHERE id = %L$q$, oid), 'لا يمكن تعديل هوية الطلب');

  -- none of the refused writes changed anything
  PERFORM t.check('L1 after all refused writes: order, flag, history, items, stock unchanged',
    (SELECT status = 'بانتظار الموافقة' AND inventory_deducted AND jsonb_array_length(edit_history) = n_hist AND (items->0->>'quantity') = '5' FROM orders WHERE id = oid)
    AND t.stock('CAM-1') = 5);

  -- non-protected fields remain editable under the existing RLS rules
  PERFORM t.exec_as(t.TL(), format($q$UPDATE orders SET notes = 'tl note', client_name = 'TL Client', address = 'X St', total = 777 WHERE id = %L$q$, oid));
  PERFORM t.check('L1 allowed: TL raw update of notes / customer / address / total on a reserved order', (SELECT notes = 'tl note' AND client_name = 'TL Client' AND total = 777 AND inventory_deducted FROM orders WHERE id = oid));
  PERFORM t.expect_err_as(t.S1(), 'L1 sales raw UPDATE of a non-protected field refused (RPC only)', format($q$UPDATE orders SET notes = 'owner note' WHERE id = %L$q$, oid), 'لا يمكن تعديل الطلب مباشرةً');
  PERFORM t.check('L1 refused sales raw update left the order unchanged', (SELECT notes FROM orders WHERE id = oid) = 'tl note');
  PERFORM t.expect_err_as(t.S1(), 'L1 sales raw UPDATE of price/total refused', format($q$UPDATE orders SET total = 1 WHERE id = %L$q$, oid), 'لا يمكن تعديل الطلب مباشرةً');
  PERFORM t.expect_err_as(t.S1(), 'L1 sales raw INSERT refused (orders are created only by create_order)',
    $q$INSERT INTO orders(id, status, sales_rep, items) VALUES ('raw-s1', 'جديد', 'x', '[]'::jsonb)$q$, 'لا يمكن إنشاء طلب مباشرةً');
  PERFORM t.check('L1 refused sales raw INSERT created no row', NOT EXISTS (SELECT 1 FROM orders WHERE id = 'raw-s1'));
  PERFORM t.exec_as(t.S2(), format($q$UPDATE orders SET notes = 'hijack' WHERE id = %L$q$, oid));
  PERFORM t.check('L1 another sales rep''s raw update is filtered by RLS (0 rows, unchanged)', (SELECT notes FROM orders WHERE id = oid) = 'tl note');
  PERFORM t.exec_as(t.TL(), format($q$UPDATE orders SET items = '[{"sku":"CAM-1","name":"Camera","quantity":5,"price":120,"total":600}]'::jsonb WHERE id = %L$q$, oid));
  PERFORM t.check('L1 allowed: raw price change inside items (same SKU/quantity fingerprint)', (SELECT items->0->>'price' FROM orders WHERE id = oid) = '120');

  -- delete guard (B2)
  PERFORM t.expect_err_as(t.SA(), 'L1 (B2) super_admin cannot hard-delete an order that holds stock', format($q$DELETE FROM orders WHERE id = %L$q$, oid), 'ألغِ الطلب أولاً');
  PERFORM t.expect_err_as(t.AD(), 'L1 (B2) …nor admin', format($q$DELETE FROM orders WHERE id = %L$q$, oid), 'ألغِ الطلب أولاً');
  PERFORM t.exec_as(t.S1(), format($q$DELETE FROM orders WHERE id = %L$q$, oid));
  PERFORM t.check('L1 (B2) sales delete is filtered by RLS (order still there)', EXISTS (SELECT 1 FROM orders WHERE id = oid));
  PERFORM t.check('L1 (B2) refused deletes left the order and its stock reservation intact', t.stock('CAM-1') = 5);
  PERFORM t.exec_as(t.AD(), format($q$SELECT cancel_order(%L)$q$, oid));
  PERFORM t.check('L1 (B2) CANCEL first: stock returned, flag cleared', t.stock('CAM-1') = 10 AND NOT (SELECT inventory_deducted FROM orders WHERE id = oid));
  PERFORM t.exec_as(t.AD(), format($q$DELETE FROM orders WHERE id = %L$q$, oid));
  PERFORM t.check('L1 (B2) …then the cancelled order CAN be deleted (existing permission preserved)', NOT EXISTS (SELECT 1 FROM orders WHERE id = oid));
  PERFORM t.check('L1 (B2) deleting a cancelled order moved no stock', t.stock('CAM-1') = 10);
END $L1$;

-- ===== L2. the sanctioned RPC paths keep working UNDER the guards, per role, as the real authenticated role =====
DO $L2$
DECLARE oid text; upd text;
BEGIN
  PERFORM t.reset();
  PERFORM t.exec_as(t.S1(), $q$SELECT create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":4}]', '{"clientRequestId":"l2-req"}'))$q$);
  oid := (SELECT id FROM orders WHERE client_request_id = 'l2-req');
  PERFORM t.check('L2 sales create_order as authenticated (guards active)', oid IS NOT NULL AND t.stock('CAM-1') = 6);
  PERFORM t.exec_as(t.TL(), format($q$SELECT advance_order_status(%L, 'بانتظار الموافقة', 'موافق عليه')$q$, oid));
  PERFORM t.check('L2 team_leader advance_order_status as authenticated', (SELECT status FROM orders WHERE id = oid) = 'موافق عليه');
  upd := (SELECT updated_at::text FROM orders WHERE id = oid);
  PERFORM t.exec_as(t.TL(), format($q$SELECT update_order_details(%L, %L, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":4}]', '{"notes":"rpc edit"}'))$q$, oid, upd));
  PERFORM t.check('L2 team_leader update_order_details as authenticated', (SELECT notes FROM orders WHERE id = oid) = 'rpc edit');
  PERFORM t.exec_as(t.AD(), format($q$SELECT advance_order_status(%L, 'موافق عليه', 'تم الصرف')$q$, oid));
  PERFORM t.exec_as(t.AD(), format($q$SELECT revert_order_status(%L, NULL, 'تم الصرف')$q$, oid));
  PERFORM t.check('L2 admin advance + revert as authenticated (same reserved class: no stock move)', (SELECT status FROM orders WHERE id = oid) = 'موافق عليه' AND t.stock('CAM-1') = 6);
  PERFORM t.exec_as(t.TL(), format($q$SELECT return_order_to_sales(%L, NULL, 'موافق عليه')$q$, oid));
  PERFORM t.check('L2 team_leader return_order_to_sales as authenticated restores stock (the case RLS used to filter silently)',
    (SELECT status = 'جديد' AND NOT inventory_deducted FROM orders WHERE id = oid) AND t.stock('CAM-1') = 10);
  upd := (SELECT updated_at::text FROM orders WHERE id = oid);
  PERFORM t.exec_as(t.S1(), format($q$SELECT resubmit_order(%L, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":6}]', '{"expectedUpdatedAt":"%s"}'))$q$, oid, upd));
  PERFORM t.check('L2 sales resubmit_order as authenticated with the version token: final qty 6 (10→4)', t.stock('CAM-1') = 4 AND (SELECT inventory_deducted FROM orders WHERE id = oid));
  PERFORM t.expect_err_as(t.S1(), 'L2 resubmit with a STALE token refused',
    format($q$SELECT resubmit_order(%L, t.payload('[{"sku":"CAM-1","name":"Camera","quantity":6}]', '{"expectedUpdatedAt":"%s"}'))$q$, oid, upd), 'لا يمكن إعادة إرسال هذا الطلب من حالته الحالية');
  PERFORM t.exec_as(t.TL(), format($q$SELECT reject_order(%L)$q$, oid));
  PERFORM t.check('L2 team_leader reject_order as authenticated restores stock', t.stock('CAM-1') = 10);
  PERFORM t.exec_as(t.AD(), format($q$SELECT cancel_order(%L)$q$, oid));
  PERFORM t.exec_as(t.AD(), format($q$SELECT restore_cancelled_order(%L)$q$, oid));
  PERFORM t.check('L2 admin cancel + restore_cancelled_order as authenticated (held no stock → back to previous status, no movement)',
    (SELECT status = 'مرفوض' AND NOT inventory_deducted FROM orders WHERE id = oid) AND t.stock('CAM-1') = 10);
END $L2$;

-- ===== L3. inventory guard =====
DO $L3$
DECLARE o orders; iid text;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user(t.S1());
  iid := (SELECT id FROM inventory WHERE sku = 'CAM-1');
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]'));               -- stock 5, referenced by SKU
  PERFORM t.check('L3 setup: stock 5', t.stock('CAM-1') = 5);

  PERFORM t.expect_err_as(t.AD(), 'L3 raw stock overwrite refused (stale form)', format($q$UPDATE inventory SET stock = 99 WHERE id = %L$q$, iid), 'يرجى تحديث الصفحة');
  PERFORM t.expect_err_as(t.AD(), 'L3 raw lots overwrite refused',  format($q$UPDATE inventory SET lots = '[]'::jsonb WHERE id = %L$q$, iid), 'يرجى تحديث الصفحة');
  PERFORM t.expect_err_as(t.AD(), 'L3 raw cost_price overwrite refused', format($q$UPDATE inventory SET cost_price = 1 WHERE id = %L$q$, iid), 'يرجى تحديث الصفحة');
  PERFORM t.expect_err_as(t.AD(), 'L3 legacy full-form update (name, sku, price, cost_price, stock…) refused',
    format($q$UPDATE inventory SET name='Camera', sku='CAM-1', price=1, cost_price=100, stock=10 WHERE id = %L$q$, iid), 'يرجى تحديث الصفحة');
  PERFORM t.check('L3 stock still exactly what the reservation left', t.stock('CAM-1') = 5 AND t.lotsum('CAM-1') = 5);

  PERFORM t.exec_as(t.AD(), format($q$UPDATE inventory SET price = 5, description = 'edited', brand = 'Z' WHERE id = %L$q$, iid));
  PERFORM t.check('L3 allowed: raw descriptive edit (price/description/brand) leaves stock alone', (SELECT price = 5 AND description = 'edited' FROM inventory WHERE id = iid) AND t.stock('CAM-1') = 5);

  PERFORM t.expect_err_as(t.AD(), 'L3 (H2) raw SKU change refused while a reserved order carries it', format($q$UPDATE inventory SET sku = 'NEW' WHERE id = %L$q$, iid), 'لا يمكن تغيير الـSKU');
  PERFORM t.expect_err_as(t.AD(), 'L3 (H2) raw delete refused while a reserved order depends on it', format($q$DELETE FROM inventory WHERE id = %L$q$, iid), 'لا يمكن حذف المنتج');
  PERFORM t.exec_as(t.AD(), format($q$UPDATE inventory SET name = 'Camera Renamed' WHERE id = %L$q$, iid));
  PERFORM t.check('L3 raw rename allowed when only SKU-lines reference it', (SELECT name FROM inventory WHERE id = iid) = 'Camera Renamed');
  PERFORM t.expect_err_as(t.AD(), 'L3 raw SKU-lines still block SKU change after the rename', format($q$UPDATE inventory SET sku = 'NEW2' WHERE id = %L$q$, iid), 'لا يمكن تغيير الـSKU');

  PERFORM t.exec_as(t.S1(), format($q$UPDATE inventory SET price = 1 WHERE id = %L$q$, iid));
  PERFORM t.check('L3 sales raw inventory update filtered by RLS (unchanged)', (SELECT price FROM inventory WHERE id = iid) = 5);

  PERFORM t.exec_as(t.AD(), $q$INSERT INTO inventory(id,name,sku,stock,lots,cost_price) VALUES ('new-1','Fresh','FR-1',3,'[{"id":"n","qty":3,"costPrice":1}]',1)$q$);
  PERFORM t.check('L3 INSERT of a new product is unaffected by the guard', EXISTS (SELECT 1 FROM inventory WHERE id = 'new-1'));
  PERFORM t.exec_as(t.AD(), $q$DELETE FROM inventory WHERE id = 'new-1'$q$);
  PERFORM t.check('L3 raw delete of an UNREFERENCED product is allowed', NOT EXISTS (SELECT 1 FROM inventory WHERE id = 'new-1'));

  -- the inventory RPCs keep working as authenticated
  PERFORM t.exec_as(t.AD(), format($q$SELECT adjust_inventory_stock(%L, 5, 8, 'rpc')$q$, iid));
  PERFORM t.exec_as(t.AD(), format($q$SELECT add_stock_lot(%L, 2, 140, 'rpc lot')$q$, iid));
  PERFORM t.exec_as(t.AD(), format($q$SELECT update_inventory_item(%L, '{"price":11}')$q$, iid));
  PERFORM t.check('L3 inventory RPCs work as authenticated under the guard (5→8→10; price via RPC)', t.stock('CAM-1') = 10 AND (SELECT price FROM inventory WHERE id = iid) = 11 AND t.lotsum('CAM-1') = 10);
  PERFORM t.exec_as(t.SA(), format($q$SELECT change_inventory_sku(%L, 'CAM-7', 'override under guard')$q$, iid));
  PERFORM t.check('L3 the sanctioned SKU override works under the guard and rewrote the reserved order', (SELECT sku FROM inventory WHERE id = iid) = 'CAM-7' AND (SELECT items->0->>'sku' FROM orders WHERE id = o.id) = 'CAM-7');
  PERFORM t.exec_as(t.TL(), format($q$SELECT return_order_to_sales(%L)$q$, o.id));
EXCEPTION WHEN OTHERS THEN
  -- return of a still-pending order is refused by design; only the checks above matter
  PERFORM t.check('L3 tail step (return of a pending order) refused as designed', SQLERRM LIKE '%لا يمكن إعادة هذا الطلب للسيلز%', SQLERRM);
END $L3$;

-- ===== L4. anon can do nothing =====
DO $L4$
BEGIN
  PERFORM t.reset();
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]'));
    RESET ROLE;
    INSERT INTO t.results(label, ok, detail) VALUES ('L4 anon create_order', false, 'NO ERROR');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO t.results(label, ok, detail) VALUES ('L4 anon cannot call create_order', SQLERRM LIKE '%permission denied%', SQLERRM);
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM advance_order_status('x', 'a', 'b');
    RESET ROLE;
    INSERT INTO t.results(label, ok, detail) VALUES ('L4 anon advance_order_status', false, 'NO ERROR');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO t.results(label, ok, detail) VALUES ('L4 anon cannot call advance_order_status', SQLERRM LIKE '%permission denied%', SQLERRM);
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM private.inventory_reserved_refs('inv-1');
    RESET ROLE;
    INSERT INTO t.results(label, ok, detail) VALUES ('L4 helper in private schema reachable only through triggers (SQL-level call by authenticated is possible but the schema is not API-exposed)', true, 'INFO: callable in SQL by authenticated; not exposed via PostgREST when `private` is not in Exposed schemas');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO t.results(label, ok, detail) VALUES ('L4 private helper call', true, SQLERRM);
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM _order_apply_inventory('[{"sku":"CAM-1","name":"Camera","quantity":1}]'::jsonb, 'deduct', 'x');
    RESET ROLE;
    INSERT INTO t.results(label, ok, detail) VALUES ('L4 authenticated _order_apply_inventory', false, 'NO ERROR');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO t.results(label, ok, detail) VALUES ('L4 authenticated cannot call the internal deduction helper', SQLERRM LIKE '%permission denied%', SQLERRM);
  END;
END $L4$;
