-- ===== L0. BEFORE any guard: prove the holes are real (ok = the unsafe write SUCCEEDED) =====
DO $L0$
DECLARE o orders; iid text;
BEGIN
  PERFORM t.reset(); PERFORM t.as_user(t.S1());
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":5}]'));
  iid := (SELECT id FROM inventory WHERE sku = 'CAM-1');

  PERFORM t.exec_as(t.TL(), format($q$UPDATE orders SET items = '[{"sku":"CAM-1","name":"Camera","quantity":8}]'::jsonb WHERE id = %L$q$, o.id));
  PERFORM t.check('L0 (exposure) team_leader could change a RESERVED order''s quantity 5→8 with a raw UPDATE', (SELECT items->0->>'quantity' FROM orders WHERE id = o.id) = '8');

  PERFORM t.exec_as(t.TL(), format($q$UPDATE orders SET status = 'جديد', edit_history = '[]'::jsonb WHERE id = %L$q$, o.id));
  PERFORM t.check('L0 (exposure) an old client could flip status + wipe history directly, leaving جديد with the flag still TRUE',
    (SELECT status = 'جديد' AND inventory_deducted AND edit_history = '[]'::jsonb FROM orders WHERE id = o.id));

  PERFORM t.exec_as(t.AD(), format($q$UPDATE inventory SET stock = 99 WHERE id = %L$q$, iid));
  PERFORM t.check('L0 (exposure) an admin form could overwrite stock 5→99 with a raw UPDATE (reservation lost)', t.stock('CAM-1') = 99);

  PERFORM t.exec_as(t.SA(), format($q$DELETE FROM orders WHERE id = %L$q$, o.id));
  PERFORM t.check('L0 (exposure) super_admin could hard-delete an order that still holds stock', NOT EXISTS (SELECT 1 FROM orders WHERE id = o.id));
END $L0$;
