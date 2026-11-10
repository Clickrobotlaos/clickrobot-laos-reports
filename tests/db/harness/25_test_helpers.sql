-- Test helpers (local harness only).
create schema if not exists t;
grant usage on schema t to anon, authenticated;

-- t.mode = 'baseline' (assert the known vulnerability is present) | 'fixed' (assert it is closed)
create or replace function t.mode() returns text language sql stable as $$
  select coalesce(nullif(current_setting('t.mode', true), ''), 'fixed')
$$;

-- Security check: passes when the "fixed" condition matches the expected state for the current mode.
create or replace function t.sec(fixed_cond boolean, label text) returns void language plpgsql as $$
begin
  if t.mode() = 'fixed' and fixed_cond is not true then
    raise exception 'FAIL [fixed] %', label;
  elsif t.mode() = 'baseline' and fixed_cond is not false then
    raise exception 'FAIL [baseline: vulnerability NOT reproduced] %', label;
  end if;
  raise notice 'PASS [%] %', t.mode(), label;
end $$;

-- Regression check: must hold in every mode.
create or replace function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL [regression] %', label; end if;
  raise notice 'PASS [all] %', label;
end $$;

create or replace function t.claims(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', case when p is null then '' else json_build_object('sub', p, 'role', 'authenticated')::text end, true)
$$;

grant execute on all functions in schema t to anon, authenticated;
