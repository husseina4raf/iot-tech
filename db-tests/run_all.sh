#!/bin/bash
# End-to-end verification of the order / inventory migrations against a DISPOSABLE local
# PostgreSQL (docker image postgres:16-alpine). It never touches Supabase or any real database:
# it starts a throwaway container, builds a production-like schema (roles, the repo's tables and
# RLS policies, the FIRST-version create_order from git history as "current production"),
# applies every migration twice, runs all suites and the concurrency tests, then removes the
# container. Usage:   ./db-tests/run_all.sh
SP="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SP/.." && pwd)"
OUT="$(mktemp -d)"
[ -f "$SP/v1_order_creation.sql" ] || git -C "$REPO" show a6fa873:src/lib/order_creation.sql > "$SP/v1_order_creation.sql"
P="docker exec -i scratch-pg psql -U postgres"
FAILS=0; CHECKS=0
chk(){ CHECKS=$((CHECKS+1)); if [ "$2" = "$3" ]; then echo "  PASS  $1"; else FAILS=$((FAILS+1)); echo "  FAIL  $1  (expected: $2 | got: $3)"; fi; }
q(){ $P -At -q -c "$1"; }
sess(){ local uid=$1; shift; $P -At -q <<EOS 2>&1
SELECT set_config('request.jwt.claim.sub','$uid',false) \gset
SET ROLE authenticated;
$*
EOS
}
S1=a0000000-0000-0000-0000-000000000001; S2=a0000000-0000-0000-0000-000000000002; TL=a0000000-0000-0000-0000-000000000003; AD=a0000000-0000-0000-0000-000000000004; SA=a0000000-0000-0000-0000-000000000005

echo "########## 0. fresh database, production-like (roles, repo schema, repo RLS, first-version create_order)"
docker rm -f scratch-pg >/dev/null 2>&1
docker run -d --rm --name scratch-pg -e POSTGRES_PASSWORD=x -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for i in $(seq 1 40); do docker exec scratch-pg pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
$P -v ON_ERROR_STOP=1 -q < "$SP/00_bootstrap.sql" >/dev/null 2>&1; chk "bootstrap" 0 $?
$P -v ON_ERROR_STOP=1 -q < "$SP/v1_order_creation.sql" >/dev/null 2>&1; chk "first-version create_order installed (current production state)" 0 $?
$P -q <<'EOS' >/dev/null 2>&1
INSERT INTO inventory(id,name,sku,stock,lots,cost_price) VALUES
 ('h1','Camera','CAM-1',10,'[{"id":"l1","qty":6,"costPrice":100},{"id":"l2","qty":4,"costPrice":120}]',100),
 ('h2','DVR','DVR-1',5,'[{"id":"l3","qty":5,"costPrice":200}]',200);
INSERT INTO orders(id,serial_number,status,sales_rep,items,edit_history,created_at) VALUES
 ('ORD-2990','2990','بانتظار الموافقة','Ali','[{"sku":"CAM-1","name":"Camera","quantity":2}]','[{"editedAt":"2026-01-01T00:00:00Z","editedBy":"X","note":"تم التعديل"}]', now()-interval '30 days'),
 ('ORD-2991','2991','موافق عليه','Ali','[{"sku":"CAM-1","name":"Camera","quantity":1}]','[{"type":"status_change","previousStatus":"بانتظار الموافقة","newStatus":"موافق عليه"}]', now()-interval '20 days'),
 ('ORD-2992','2992','تم الصرف','Omar','[{"sku":"DVR-1","name":"DVR","quantity":1}]','[]', now()-interval '10 days');
EOS
SNAP="select md5(string_agg(row_to_json(o)::text, '|' order by id)) from (select id,serial_number,status,sales_rep,items,edit_history,created_at,updated_at from orders) o"
SNAPI="select md5(string_agg(row_to_json(i)::text, '|' order by id)) from inventory i"
B1=$(q "$SNAP"); B2=$(q "$SNAPI"); B3=$(q "select last_value||'/'||is_called from orders_serial_seq")
echo "  preflight on this baseline — FAIL lines (expect none):"; $P -At -F' | ' < "$REPO/src/lib/order_preflight.sql" 2>&1 | grep '^FAIL' | sed 's/^/     /'; echo "  (end of FAIL list)"

echo "########## 1. migrations A, B, B2 — each applied twice over legacy data"
for round in 1 2; do for f in order_creation order_lifecycle inventory_management; do
  $P -v ON_ERROR_STOP=1 -q < "$REPO/src/lib/$f.sql" >/dev/null 2>&1; chk "apply $f.sql (round $round)" 0 $?
done; done
chk "historical ORDERS byte-identical after migrations" "$B1" "$(q "$SNAP")"
chk "historical INVENTORY byte-identical after migrations" "$B2" "$(q "$SNAPI")"
chk "serial sequence untouched" "$B3" "$(q "select last_value||'/'||is_called from orders_serial_seq")"
chk "all historical flags FALSE (never guessed)" "false" "$(q "select string_agg(distinct inventory_deducted::text, ',') from orders")"
echo "  preflight after migrations — FAIL lines (expect none):"; $P -At -F' | ' < "$REPO/src/lib/order_preflight.sql" 2>&1 | grep '^FAIL' | sed 's/^/     /'; echo "  (end of FAIL list)"

echo "########## 2. functional suites (superuser + real-role calls)"
$P -v ON_ERROR_STOP=1 -q < "$SP/10_harness.sql" >/dev/null 2>&1; $P -v ON_ERROR_STOP=1 -q < "$SP/11_harness2.sql" >/dev/null 2>&1
for f in 20_tests_create 30_tests_lifecycle 50_tests_new_rpcs 60_tests_inventory_rpcs; do $P -q < "$SP/$f.sql" 2>&1 | grep -c "^ERROR" | sed "s/^/  $f unexpected ERROR lines: /"; done

echo "########## 3. exposure baseline (BEFORE any guard)"
$P -q < "$SP/70a_baseline_exposure.sql" >/dev/null 2>&1
echo "  unsafe writes that succeeded pre-guard: $(q "select count(*) filter (where ok) from t.results where label ~ '^L0'") of $(q "select count(*) from t.results where label ~ '^L0'")"

echo "########## 4. guards 1 & 2 (twice), guard suites; guard 3 (twice), dispatch suite"
for round in 1 2; do for f in guard_order_client_writes guard_inventory_client_writes; do $P -v ON_ERROR_STOP=1 -q < "$REPO/src/lib/$f.sql" >/dev/null 2>&1; chk "apply $f.sql (round $round)" 0 $?; done; done
$P -q < "$SP/70b_tests_guards.sql" 2>&1 | grep -c "^ERROR" | sed 's/^/  70b unexpected ERROR lines: /'
for round in 1 2; do $P -v ON_ERROR_STOP=1 -q < "$REPO/src/lib/guard_order_dispatch.sql" >/dev/null 2>&1; chk "apply guard_order_dispatch.sql (round $round)" 0 $?; done
$P -q < "$SP/80_tests_dispatch_guard.sql" 2>&1 | grep -c "^ERROR" | sed 's/^/  80 unexpected ERROR lines: /'

echo "########## 5. diagnostics file: syntax + read-only"
BEFORE=$(q "select (select count(*) from orders)||'/'||(select count(*) from inventory)||'/'||(select coalesce(sum(stock),0) from inventory)||'/'||(select last_value from orders_serial_seq)")
$P -At < "$REPO/src/lib/order_inventory_diagnostics.sql" > "$OUT/diag.out" 2>&1; chk "diagnostics run without errors" 0 "$(grep -c '^ERROR' $OUT/diag.out)"
chk "diagnostics changed no data / sequence" "$BEFORE" "$(q "select (select count(*) from orders)||'/'||(select count(*) from inventory)||'/'||(select coalesce(sum(stock),0) from inventory)||'/'||(select last_value from orders_serial_seq)")"

echo "########## 6. concurrency (real authenticated role, parallel sessions)"
reset(){ $P -q -c "select t.reset()" >/dev/null 2>&1; }
IID=inv-1
reset; rm -f $OUT/c_*.out
( sess $S1 "BEGIN; SELECT (create_order(t.payload('[{\"sku\":\"CAM-1\",\"name\":\"Camera\",\"quantity\":7}]'))).id; SELECT pg_sleep(4); COMMIT;" > $OUT/c_a.out ) &
sleep 1; sess $S2 "SELECT (create_order(t.payload('[{\"sku\":\"CAM-1\",\"name\":\"Camera\",\"quantity\":5}]'))).id;" > $OUT/c_b.out; wait
chk "race: stock 10, orders for 7 and 5 → second fails 'available 3, requested 5'" "1" "$(grep -c 'المتاح: 3 — المطلوب: 5' $OUT/c_b.out)"
chk "race: final stock 3 and exactly one reserved order" "3/1" "$(q "select stock from inventory where id='$IID'")/$(q "select count(*) from orders where inventory_deducted")"

reset; rm -f $OUT/c_*.out
for i in $(seq 1 8); do sess $S1 "SELECT (create_order(t.payload('[{\"sku\":\"CAM-1\",\"name\":\"Camera\",\"quantity\":3}]','{\"clientRequestId\":\"storm-1\"}'))).id;" > $OUT/c_i$i.out & done; wait
chk "idempotency storm: 8 parallel same-request-id calls → one order" "1" "$(q "select count(*) from orders")"
chk "idempotency storm: stock deducted once (7)" "7" "$(q "select stock from inventory where id='$IID'")"
chk "idempotency storm: every caller got the SAME order id, no errors" "1/0" "$(cat $OUT/c_i*.out | grep ORD- | sort -u | wc -l | tr -d ' ')/$(cat $OUT/c_i*.out | grep -ci error)"

reset
( sess $S1 "BEGIN; SELECT (create_order(t.payload('[{\"sku\":\"CAM-1\",\"name\":\"Camera\",\"quantity\":3}]'))).id; SELECT pg_sleep(2); COMMIT;" > $OUT/c_a.out ) &
sleep 0.6; sess $AD "SELECT (update_inventory_item('$IID','{\"price\":777}')).price;" > $OUT/c_b.out; wait
chk "admin price edit racing a deduction: reservation survives (stock 7, price 777)" "7/777" "$(q "select stock from inventory where id='$IID'")/$(q "select price from inventory where id='$IID'")"
reset
( sess $S1 "BEGIN; SELECT (create_order(t.payload('[{\"sku\":\"CAM-1\",\"name\":\"Camera\",\"quantity\":3}]'))).id; SELECT pg_sleep(2); COMMIT;" > $OUT/c_a.out ) &
sleep 0.6; sess $AD "SELECT (adjust_inventory_stock('$IID', 10, 12, 'stale')).stock;" > $OUT/c_b.out; wait
chk "admin STALE stock edit racing a deduction is refused with the real stock (7)" "1/7" "$(grep -c 'الكمية الحالية: 7' $OUT/c_b.out)/$(q "select stock from inventory where id='$IID'")"

reset
sess $S1 "SELECT (create_order(t.payload('[{\"sku\":\"CAM-1\",\"name\":\"Camera\",\"quantity\":4}]'))).id;" > $OUT/c_o.out; OID=$(grep ORD- $OUT/c_o.out | head -1); q "update orders set status='موافق عليه' where id='$OID'" >/dev/null
for i in 1 2; do sess $TL "SELECT (return_order_to_sales('$OID', NULL, 'موافق عليه')).status;" > $OUT/c_r$i.out & done; wait
chk "two simultaneous returns: exactly one succeeds, stock restored once (10)" "1/10" "$(cat $OUT/c_r1.out $OUT/c_r2.out | grep -c '^جديد')/$(q "select stock from inventory where id='$IID'")"

reset
sess $S1 "SELECT (create_order(t.payload('[{\"sku\":\"CAM-1\",\"name\":\"Camera\",\"quantity\":2}]'))).id;" > $OUT/c_o.out; OID=$(grep ORD- $OUT/c_o.out | head -1)
( sess $AD "BEGIN; SELECT (advance_order_status('$OID','بانتظار الموافقة','موافق عليه')).status; SELECT pg_sleep(2); COMMIT;" > $OUT/c_a.out ) &
sleep 0.6; sess $TL "SELECT (reject_order('$OID')).status;" > $OUT/c_b.out; wait
chk "approve racing reject: reject refused, order stays approved + reserved" "موافق عليه|true|8" "$(q "select status||'|'||inventory_deducted from orders where id='$OID'")|$(q "select stock from inventory where id='$IID'")"

reset
sess $S1 "SELECT (create_order(t.payload('[{\"sku\":\"CAM-1\",\"name\":\"Camera\",\"quantity\":2}]'))).id;" > $OUT/c_o.out; OID=$(grep ORD- $OUT/c_o.out | head -1); TOK=$(q "select updated_at::text from orders where id='$OID'")
( sess $AD "BEGIN; SELECT (advance_order_status('$OID','بانتظار الموافقة','موافق عليه')).status; SELECT pg_sleep(2); COMMIT;" > $OUT/c_a.out ) &
sleep 0.6; sess $TL "SELECT (update_order_details('$OID', '$TOK', t.payload('[{\"sku\":\"CAM-1\",\"name\":\"Camera\",\"quantity\":2}]','{\"notes\":\"stale form\"}'))).notes;" > $OUT/c_b.out; wait
chk "stale FORM racing another writer is refused; its notes never saved" "1/" "$(grep -c 'تم تعديل هذا الطلب من مستخدم آخر' $OUT/c_b.out)/$(q "select coalesce(notes,'') from orders where id='$OID'")"

echo "  16-way opposite-order create storm"
$P -q -c "select t.reset(); update inventory set stock=200, lots='[{\"id\":\"b1\",\"qty\":200,\"costPrice\":10}]' where sku in ('CAM-1','DVR-1')" >/dev/null 2>&1; rm -f $OUT/c_*.out
for i in $(seq 1 8); do
  sess $S1 "SELECT (create_order(t.payload('[{\"sku\":\"CAM-1\",\"name\":\"Camera\",\"quantity\":1},{\"sku\":\"DVR-1\",\"name\":\"DVR\",\"quantity\":1}]'))).id;" > $OUT/c_sa$i.out &
  sess $S2 "SELECT (create_order(t.payload('[{\"sku\":\"DVR-1\",\"name\":\"DVR\",\"quantity\":1},{\"sku\":\"CAM-1\",\"name\":\"Camera\",\"quantity\":1}]'))).id;" > $OUT/c_sb$i.out &
done; wait
chk "storm: no deadlocks / errors" 0 "$(cat $OUT/c_s*.out | grep -ci 'error\|deadlock')"
chk "storm: exact totals (184/184, 16 orders)" "184/184/16" "$(q "select t.stock('CAM-1')")/$(q "select t.stock('DVR-1')")/$(q "select count(*) from orders")"

echo "  lock-order stress: returns + SKU rewrite + opposite-order creates (3 rounds)"
for round in 1 2 3; do
  $P -q -c "select t.reset(); update inventory set stock=100, lots='[{\"id\":\"b1\",\"qty\":100,\"costPrice\":10}]' where sku in ('CAM-1','DVR-1'); update inventory set sku='CAM-1' where id='inv-1';" >/dev/null 2>&1
  IDS=""; rm -f $OUT/c_*.res
  for i in 1 2 3; do O=$(sess $S1 "SELECT (create_order(t.payload('[{\"sku\":\"CAM-1\",\"name\":\"Camera\",\"quantity\":2},{\"sku\":\"DVR-1\",\"name\":\"DVR\",\"quantity\":1}]'))).id;" | grep ORD- | head -1); q "update orders set status='موافق عليه' where id='$O'" >/dev/null; IDS="$IDS $O"; done
  n=0; for O in $IDS; do n=$((n+1)); sess $TL "SELECT (return_order_to_sales('$O')).status;" > $OUT/c_ret$n.res & done
  sess $SA "SELECT (change_inventory_sku('inv-1','CAM-Z','stress $round')).sku;" > $OUT/c_sku.res &
  for i in 1 2; do
    sess $S1 "SELECT (create_order(t.payload('[{\"sku\":\"DVR-1\",\"name\":\"DVR\",\"quantity\":1},{\"sku\":\"CAM-1\",\"name\":\"Camera\",\"quantity\":1}]'))).id;" > $OUT/c_cA$i.res &
    sess $S2 "SELECT (create_order(t.payload('[{\"sku\":\"CAM-1\",\"name\":\"Camera\",\"quantity\":1},{\"sku\":\"DVR-1\",\"name\":\"DVR\",\"quantity\":1}]'))).id;" > $OUT/c_cB$i.res &
  done; wait
  RES=$(q "select coalesce(sum((l->>'quantity')::int),0) from orders o, jsonb_array_elements(o.items) l where o.inventory_deducted and lower(l->>'sku') in ('cam-1','cam-z')")
  RESD=$(q "select coalesce(sum((l->>'quantity')::int),0) from orders o, jsonb_array_elements(o.items) l where o.inventory_deducted and lower(l->>'sku')='dvr-1'")
  chk "stress round $round: no deadlocks" 0 "$(cat $OUT/c_*.res | grep -ci deadlock)"
  LOTSC=$(q "select (select coalesce(sum((l->>'qty')::numeric),0) from inventory i, jsonb_array_elements(i.lots) l where i.id='inv-1') = (select stock from inventory where id='inv-1')")
  LOTSD=$(q "select (select coalesce(sum((l->>'qty')::numeric),0) from inventory i, jsonb_array_elements(i.lots) l where i.id='inv-2') = (select stock from inventory where id='inv-2')")
  chk "stress round $round: stock + reserved == 100 for both products (nothing lost or invented)" "100/100" "$(( $(q "select stock from inventory where id='inv-1'") + RES ))/$(( $(q "select stock from inventory where id='inv-2'") + RESD ))"
  chk "stress round $round: lots sum == stock for both products" "t/t" "$LOTSC/$LOTSD"
done

echo "########## FINAL TALLY"
echo "  SQL suites   : $(q "select 'TOTAL '||count(*)||'  PASS '||count(*) filter (where ok)||'  FAIL '||count(*) filter (where not ok) from t.results where label !~ '^L0'")  (+ $(q "select count(*) from t.results where label ~ '^L0'") exposure-baseline records)"
q "select '  FAIL | '||label||' | '||coalesce(detail,'') from t.results where not ok and label !~ '^L0' order by n"
echo "  Script checks: TOTAL $CHECKS  FAIL $FAILS"
docker rm -f scratch-pg >/dev/null 2>&1; echo "  scratch container removed"
