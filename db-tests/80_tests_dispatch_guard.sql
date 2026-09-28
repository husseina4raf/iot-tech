-- ===== M. dispatch guard (never approve / dispatch an order that holds no stock) =====
DO $M1$
DECLARE o orders; r orders; serial_p1 text;
BEGIN
  PERFORM t.reset();
  INSERT INTO orders(id, serial_number, status, sales_rep, items, inventory_deducted, edit_history) VALUES
   ('ORD-P1','8001','بانتظار الموافقة','Ali','[{"sku":"CAM-1","name":"Camera","quantity":2}]',false,'[]'),
   ('ORD-A1','8002','موافق عليه','Ali','[{"sku":"CAM-1","name":"Camera","quantity":1}]',false,'[]'),
   ('ORD-D1','8003','تم الصرف','Ali','[{"sku":"CAM-1","name":"Camera","quantity":1}]',false,'[]'),
   ('ORD-K1','8004','مكتمل','Ali','[{"sku":"CAM-1","name":"Camera","quantity":1}]',false,'[]'),
   ('ORD-C1','8005','ملغي','Ali','[{"sku":"CAM-1","name":"Camera","quantity":1}]',false,'[{"type":"cancellation","previousStatus":"موافق عليه","inventoryWasDeducted":false}]'),
   ('ORD-C2','8006','ملغي','Ali','[{"sku":"CAM-1","name":"Camera","quantity":1}]',false,'[{"type":"cancellation","previousStatus":"تم الصرف","inventoryWasDeducted":false}]'),
   ('ORD-V1','8007','تم الصرف','Ali','[{"sku":"CAM-1","name":"Camera","quantity":1}]',false,'[{"type":"status_change","previousStatus":"موافق عليه","newStatus":"تم الصرف"}]');
  PERFORM t.as_user(t.AD());

  PERFORM t.expect_err('M1 never-reserved PENDING order cannot be approved', $q$SELECT advance_order_status('ORD-P1', 'بانتظار الموافقة', 'موافق عليه')$q$, 'لم يتم حجز مخزونه');
  PERFORM t.expect_err('M1 never-reserved APPROVED order cannot be dispatched', $q$SELECT advance_order_status('ORD-A1', 'موافق عليه', 'تم الصرف')$q$, 'لم يتم حجز مخزونه');
  PERFORM t.check('M1 refusals left both orders exactly as they were', (SELECT status FROM orders WHERE id='ORD-P1') = 'بانتظار الموافقة' AND (SELECT status FROM orders WHERE id='ORD-A1') = 'موافق عليه');
  r := advance_order_status('ORD-D1', 'تم الصرف', 'مكتمل');
  PERFORM t.check('M1 legacy dispatched order (flag FALSE) still completes — the dispatched family is not blocked', r.status = 'مكتمل');
  r := advance_order_status('ORD-K1', 'مكتمل', 'تم التحصيل');
  PERFORM t.check('M1 legacy completed order still collects', r.status = 'تم التحصيل');

  -- an order that DOES hold stock walks the whole chain
  PERFORM t.as_user(t.S1());
  o := create_order(t.payload('[{"sku":"CAM-1","name":"Camera","quantity":2}]'));
  PERFORM t.as_user(t.AD());
  r := advance_order_status(o.id, 'بانتظار الموافقة', 'موافق عليه');
  r := advance_order_status(o.id, 'موافق عليه', 'تم الصرف');
  PERFORM t.check('M1 a reserved order approves and dispatches normally', r.status = 'تم الصرف' AND r.inventory_deducted);

  -- the intended reconciliation path for the blocked cohort
  PERFORM t.as_user(t.TL());
  r := reject_order('ORD-P1');
  PERFORM t.check('M1 blocked pending order: Reject works (flag FALSE → no stock moved)', r.status = 'مرفوض' AND t.stock('CAM-1') = 8);
  PERFORM t.as_user(t.S1());
  r := resubmit_order('ORD-P1', t.payload('[{"sku":"CAM-1","name":"Camera","quantity":2}]'));
  PERFORM t.check('M1 …Sales resubmits: stock reserved (8→6), flag set', r.inventory_deducted AND t.stock('CAM-1') = 6);
  PERFORM t.as_user(t.AD());
  r := advance_order_status('ORD-P1', 'بانتظار الموافقة', 'موافق عليه');
  PERFORM t.check('M1 …and NOW it can be approved', r.status = 'موافق عليه');
  PERFORM t.as_user(t.TL());
  r := return_order_to_sales('ORD-A1');
  PERFORM t.check('M1 blocked approved order: Return to Sales works (no restore for a flag-FALSE order)', r.status = 'جديد' AND t.stock('CAM-1') = 6);
  PERFORM t.as_user(t.S1());
  r := resubmit_order('ORD-A1', t.payload('[{"sku":"CAM-1","name":"Camera","quantity":1}]'));
  PERFORM t.as_user(t.AD());
  r := advance_order_status('ORD-A1', 'بانتظار الموافقة', 'موافق عليه');
  r := advance_order_status('ORD-A1', 'موافق عليه', 'تم الصرف');
  PERFORM t.check('M1 …after resubmit it walks to dispatch', r.status = 'تم الصرف' AND t.stock('CAM-1') = 5);

  -- exemptions
  r := restore_cancelled_order('ORD-C1');
  PERFORM t.check('M1 un-cancel to موافق عليه with flag FALSE is exempt (transition out of ملغي)', r.status = 'موافق عليه' AND NOT r.inventory_deducted);
  r := restore_cancelled_order('ORD-C2');
  PERFORM t.check('M1 un-cancel of a legacy dispatched order restores its exact prior status', r.status = 'تم الصرف' AND NOT r.inventory_deducted);
  r := revert_order_status('ORD-V1');
  PERFORM t.check('M1 revert of a legacy dispatched order to موافق عليه is not blocked (leaving the dispatched family)', r.status = 'موافق عليه');
  PERFORM t.expect_err('M1 …but re-dispatching that never-reserved order is (needs reconciliation first)', $q$SELECT advance_order_status('ORD-V1', 'موافق عليه', 'تم الصرف')$q$, 'لم يتم حجز مخزونه');
  PERFORM t.expect_err('M1 the guard also binds SQL-editor operators (drop the trigger to override deliberately)', $q$UPDATE orders SET status = 'تم الصرف' WHERE id = 'ORD-V1'$q$, 'لم يتم حجز مخزونه');
END $M1$;
