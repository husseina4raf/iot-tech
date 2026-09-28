DROP SCHEMA IF EXISTS t CASCADE;
CREATE SCHEMA t;
CREATE TABLE t.results(n serial PRIMARY KEY, label text, ok boolean, detail text);

CREATE FUNCTION t.as_user(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false); $$;
CREATE FUNCTION t.check(lbl text, cond boolean, detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS
$$ INSERT INTO t.results(label, ok, detail) VALUES (lbl, COALESCE(cond, false), detail); $$;
CREATE FUNCTION t.expect_err(lbl text, stmt text, frag text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE m text;
BEGIN
  BEGIN
    EXECUTE stmt;
    INSERT INTO t.results(label, ok, detail) VALUES (lbl, false, 'NO ERROR RAISED');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT;
    INSERT INTO t.results(label, ok, detail) VALUES (lbl, position(frag in m) > 0, m);
  END;
END $$;

CREATE FUNCTION t.payload(items text, extra text DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('clientName','C','company','Co','mobile','01000000000','whatsapp','01000000000',
    'address','A','locationLink','L','salesRep','Ali','items',items::jsonb,'subtotal',100,'vatPercent',0,
    'vatAmount',0,'total',100,'invoiceType','x','invoiceName','n','taxNumber','','notes','',
    'paymentMethod','cash','date','21-09-2026','time','10:00') || extra::jsonb $$;

CREATE FUNCTION t.stock(p_sku text) RETURNS numeric LANGUAGE sql AS $$ SELECT stock FROM inventory WHERE sku = p_sku $$;
CREATE FUNCTION t.lotsum(p_sku text) RETURNS numeric LANGUAGE sql AS
$$ SELECT COALESCE(sum((x->>'qty')::numeric),0) FROM inventory i, jsonb_array_elements(i.lots) x WHERE i.sku = p_sku $$;

CREATE FUNCTION t.reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM orders; DELETE FROM inventory;
  INSERT INTO inventory(id,name,sku,stock,lots,cost_price) VALUES
   ('inv-1','Camera','CAM-1',10,'[{"id":"l1","qty":6,"costPrice":100},{"id":"l2","qty":4,"costPrice":120}]',100),
   ('inv-2','DVR','DVR-1',5,'[{"id":"l3","qty":5,"costPrice":200}]',200),
   ('inv-3','Cable',NULL,20,'[{"id":"l4","qty":20,"costPrice":5}]',5),
   ('inv-4','Twin','X-1',5,'[{"id":"l5","qty":5,"costPrice":1}]',1),
   ('inv-5','Twin','X-2',5,'[{"id":"l6","qty":5,"costPrice":1}]',1),
   ('inv-6','NullStock','NULLS',NULL,'[]',0);
END $$;

DELETE FROM profiles;
INSERT INTO profiles(id,name,username,role,rep_name) VALUES
 ('a0000000-0000-0000-0000-000000000001','Sales One','s1','sales','Ali'),
 ('a0000000-0000-0000-0000-000000000002','Sales Two','s2','sales','Omar'),
 ('a0000000-0000-0000-0000-000000000003','Team Lead','tl','team_leader',NULL),
 ('a0000000-0000-0000-0000-000000000004','Admin','ad','admin',NULL),
 ('a0000000-0000-0000-0000-000000000005','Super','sa','super_admin',NULL),
 ('a0000000-0000-0000-0000-000000000006','Sales NoRep','s3','sales',NULL);
