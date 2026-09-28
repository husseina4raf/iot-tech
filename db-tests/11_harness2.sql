GRANT USAGE ON SCHEMA t TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA t TO authenticated;

-- run a statement as the REAL authenticated API role (RLS + guard triggers apply)
CREATE FUNCTION t.exec_as(u text, stmt text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', u, false);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE stmt;
  EXECUTE 'RESET ROLE';
END $$;

CREATE FUNCTION t.expect_err_as(u text, lbl text, stmt text, frag text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE m text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', u, false);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE stmt;
    EXECUTE 'RESET ROLE';
    INSERT INTO t.results(label, ok, detail) VALUES (lbl, false, 'NO ERROR RAISED');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT;
    INSERT INTO t.results(label, ok, detail) VALUES (lbl, position(frag in m) > 0, m);
  END;
  RESET ROLE;
END $$;

-- user ids
CREATE FUNCTION t.S1() RETURNS text LANGUAGE sql AS $$ SELECT 'a0000000-0000-0000-0000-000000000001' $$;  -- sales Ali
CREATE FUNCTION t.S2() RETURNS text LANGUAGE sql AS $$ SELECT 'a0000000-0000-0000-0000-000000000002' $$;  -- sales Omar
CREATE FUNCTION t.TL() RETURNS text LANGUAGE sql AS $$ SELECT 'a0000000-0000-0000-0000-000000000003' $$;  -- team leader
CREATE FUNCTION t.AD() RETURNS text LANGUAGE sql AS $$ SELECT 'a0000000-0000-0000-0000-000000000004' $$;  -- admin
CREATE FUNCTION t.SA() RETURNS text LANGUAGE sql AS $$ SELECT 'a0000000-0000-0000-0000-000000000005' $$;  -- super admin
