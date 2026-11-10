-- 0005 guardian links + 0006 interaction. Run after all proposed migrations.
\set QUIET on
-- ids: G1 ...e1, G2 ...e2, manager A ...a1 (branch A), manager B ...b1 (branch B), CEO ...c0
-- TST-001 = branch A child, TST-002 = branch B child (FICTIONAL)

begin;
-- manager A links G1 to the branch-A child
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_guardian_link('00000000-0000-0000-0000-0000000000e1', 'TST-001', 'mother') is not null as linked \gset
select t.ok(:'linked'::boolean, '0005 branch-A manager can create a link for a branch-A child');

do $$ declare code text; begin
  begin perform public.cr360_guardian_link('00000000-0000-0000-0000-0000000000e1', 'TST-002'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0005 branch-A manager cannot link a branch-B child');
end $$;
do $$ declare code text; begin
  begin perform public.cr360_guardian_link('00000000-0000-0000-0000-0000000000e2', 'NO-SUCH-CODE'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0005 linking an unknown student code is refused');
end $$;

-- unverified link grants nothing
select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_guardian_children()) = 0, '0005 unverified link grants no access');
select t.ok((select count(*) from public.cr360_guardian_links) = 1, '0005 guardian can see own pending link');

-- guardian cannot verify own link; manager B cannot verify branch-A link
do $$ declare code text; begin
  begin perform public.cr360_guardian_verify((select id from public.cr360_guardian_links limit 1), 'v1'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0005 guardian cannot verify their own link');
end $$;
reset role;
select id as link_id from public.cr360_guardian_links where student_code = 'TST-001' \gset
select set_config('t.link', :'link_id', true);
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000b1');
do $$ declare code text; begin
  begin perform public.cr360_guardian_verify(current_setting('t.link')::uuid, 'v1'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0005 manager of another branch cannot verify');
end $$;

-- manager A verifies with consent version
select t.claims('00000000-0000-0000-0000-0000000000a1');
select public.cr360_guardian_verify(:'link_id', 'consent-v1-test');
select t.claims('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.cr360_guardian_children()) = 1, '0005 verified guardian sees exactly their linked child');
select t.ok((select student_code from public.cr360_guardian_children() limit 1) = 'TST-001', '0005 ... and it is the right child');
select t.ok((select program_name || ' / ' || branch_name from public.cr360_guardian_children() limit 1) = 'TEST Program / TEST Branch A', '0005 program and branch names come from the function (no table access needed)');
select t.ok((select count(*) from public.cr360_guardian_children() where student_code = 'TST-002') = 0, '0005 guardian cannot see another family''s child');
-- 0006: even verified guardians get nothing from the raw legacy tables (no IDOR by guessed id)
select t.ok((select count(*) from public.student_packages where id = '30000000-0000-0000-0000-000000000002') = 0, '0006 guardian cannot read a guessed package id directly');
select t.ok((select count(*) from public.student_packages) = 0, '0006 guardian has no direct table access at all');

-- other guardian sees nothing, including link rows
select t.claims('00000000-0000-0000-0000-0000000000e2');
select t.ok((select count(*) from public.cr360_guardian_children()) = 0, '0005 unrelated guardian sees no children');
select t.ok((select count(*) from public.cr360_guardian_links) = 0, '0005 unrelated guardian sees no link rows');

-- guardian withdraws consent → access ends immediately
select t.claims('00000000-0000-0000-0000-0000000000e1');
select public.cr360_guardian_revoke(:'link_id', 'withdraw consent');
select t.ok((select count(*) from public.cr360_guardian_children()) = 0, '0005 revoked link stops access immediately');
select t.claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare code text; begin
  begin perform public.cr360_guardian_verify(current_setting('t.link')::uuid, 'v2'); code := 'none';
  exception when others then code := sqlstate; end;
  perform t.ok(code = '40001', '0005 a revoked link cannot be re-verified (even by its manager)');
end $$;

reset role;
select t.ok((select count(*) from cr360_vault.audit_events where entity = 'cr360_guardian_links') = 3, '0005 create, verify and revoke are each audited');
rollback;

begin;
-- direct writes to the link table are impossible for any API role
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000c0');
do $$ declare blocked boolean; begin
  begin insert into public.cr360_guardian_links (guardian_user_id, student_code, created_by)
        values ('00000000-0000-0000-0000-0000000000e1', 'TST-001', auth.uid()); blocked := false;
  exception when insufficient_privilege then blocked := true; end;
  perform t.ok(blocked, '0005 no direct INSERT on links, even for CEO (RPC only)');
end $$;
-- CEO can link across branches
select t.ok(public.cr360_guardian_link('00000000-0000-0000-0000-0000000000e2', 'TST-002') is not null, '0005 CEO can link in any branch');
rollback;

begin;
set local role anon; select t.claims(null);
do $$ declare denied boolean; begin
  begin perform * from public.cr360_guardian_children(); denied := false; exception when insufficient_privilege then denied := true; end;
  perform t.ok(denied, '0005 anon cannot call guardian read function');
end $$;
rollback;

-- ---------------------------------------------------------------- manager UI helpers
begin;
set local role authenticated; select t.claims('00000000-0000-0000-0000-0000000000a1');
select t.ok(public.cr360_guardian_link_by_email('Guardian-1@Test.Invalid', 'TST-001', 'father') is not null, '0005 link by e-mail (case-insensitive) for own-branch child');
do $$ declare code text; begin
  begin perform public.cr360_guardian_link_by_email('nobody@test.invalid', 'TST-001'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = 'P0002', '0005 unknown e-mail is refused (no account is created)');
  begin perform public.cr360_guardian_link_by_email('guardian-2@test.invalid', 'TST-002'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0005 e-mail link refused for another branch''s child (checked before lookup)');
  begin perform public.cr360_guardian_link_by_email('guardian-1@test.invalid', 'TST-001'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '23505', '0005 duplicate live link is rejected');
end $$;
select t.ok((select count(*) from public.cr360_guardian_links_for('TST-001')) = 1, '0005 manager lists links of own-branch child');
select t.ok((select guardian_email from public.cr360_guardian_links_for('TST-001') limit 1) = 'guardian-1@test.invalid', '0005 listing shows the guardian e-mail to the manager');
do $$ declare code text; begin
  begin perform * from public.cr360_guardian_links_for('TST-002'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0005 manager cannot list another branch''s links');
end $$;
select t.claims('00000000-0000-0000-0000-0000000000e1');
do $$ declare code text; begin
  begin perform * from public.cr360_guardian_links_for('TST-001'); code := 'none'; exception when others then code := sqlstate; end;
  perform t.ok(code = '42501', '0005 guardian cannot use the manager listing');
end $$;
rollback;
