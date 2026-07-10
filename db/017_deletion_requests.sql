-- =====================================================================
-- 017: Student deletion requests (approval workflow)
-- =====================================================================

create table if not exists deletion_requests (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid references student_packages(id) on delete cascade not null,
  student_name  text not null,
  requested_by  uuid references users(id),
  requested_by_name text,
  reason        text,
  status        text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  reviewed_by   uuid references users(id),
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz default now()
);

create index if not exists ix_delreq_status on deletion_requests (status);
create index if not exists ix_delreq_student on deletion_requests (student_id);

-- RLS
alter table deletion_requests enable row level security;

-- Everyone authenticated can read
drop policy if exists p_delreq_read on deletion_requests;
create policy p_delreq_read on deletion_requests for select using (auth.uid() is not null);

-- co_admin and admin can create requests
drop policy if exists p_delreq_insert on deletion_requests;
create policy p_delreq_insert on deletion_requests for insert
  with check (my_role() in ('admin','co_admin'));

-- Only admin can update (approve/reject)
drop policy if exists p_delreq_update on deletion_requests;
create policy p_delreq_update on deletion_requests for update
  using (my_role() = 'admin');

grant select on deletion_requests to authenticated;
