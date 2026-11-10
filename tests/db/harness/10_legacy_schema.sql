-- SCHEMA-ONLY snapshot of production public.* (legacy Records app), extracted read-only from
-- pg_catalog on 2026-11-10. Contains NO data. Used only by the local test harness.
-- Regenerate with the catalog query in tests/db/README.md if production schema changes.
create table public.attendance (id uuid default gen_random_uuid() not null, package_id uuid not null, date date default CURRENT_DATE not null, status text not null, notes text, recorded_by uuid, created_at timestamp with time zone default now(), class_id uuid, is_makeup boolean default false);
create table public.branches (id uuid default gen_random_uuid() not null, name text not null, address text, phone text, active boolean default true, created_at timestamp with time zone default now());
create table public.class_bookings (id uuid default gen_random_uuid() not null, class_id uuid not null, package_id uuid not null, kind text not null, makeup_date date, status text default 'Confirmed'::text not null, booked_by uuid, booked_at timestamp with time zone default now(), cancelled_at timestamp with time zone, notes text);
create table public.classes (id uuid default gen_random_uuid() not null, name text not null, program_id uuid, branch_id uuid not null, teacher_id uuid, assistant_id uuid, day_of_week integer, start_time time without time zone, end_time time without time zone, room text, capacity integer, age_min integer, age_max integer, level text, class_fee numeric, fee_currency text default 'LAK'::text, active boolean default true not null, notes text, created_at timestamp with time zone default now());
create table public.closed_months (month text not null, closed_at timestamp with time zone default now(), closed_by uuid, record_counts jsonb, created_at timestamp with time zone default now());
create table public.daily_reports (id uuid default gen_random_uuid() not null, date date not null, branch_id uuid not null, submitted_by uuid, opening_cash numeric default 0, total_income numeric default 0, total_expenses numeric default 0, net_cash numeric default 0, unpaid numeric default 0, notes text, attachment_url text, program_stats jsonb, status text default 'Draft'::text not null, review_note text, reviewed_by uuid, reviewed_at timestamp with time zone, created_at timestamp with time zone default now());
create table public.deletion_requests (id uuid default gen_random_uuid() not null, student_id uuid not null, student_name text not null, requested_by uuid, requested_by_name text, reason text, status text default 'Pending'::text not null, reviewed_by uuid, reviewed_at timestamp with time zone, review_note text, created_at timestamp with time zone default now());
create table public.exchange_rates (id uuid default gen_random_uuid() not null, currency text not null, rate_to_lak numeric not null, effective_date date default CURRENT_DATE not null, set_by uuid, created_at timestamp with time zone default now());
create table public.expense_records (id uuid default gen_random_uuid() not null, date date not null, voucher_no text, branch_id uuid not null, paid_by uuid, category text not null, description text, amount numeric not null, currency text not null, rate_to_lak numeric not null, amount_lak numeric not null, payment_method text, supplier text, notes text, attachment_url text, created_at timestamp with time zone default now(), created_by uuid);
create table public.income_records (id uuid default gen_random_uuid() not null, date date not null, receipt_no text, branch_id uuid not null, received_by uuid, student_name text, parent_name text, phone text, program_id uuid, payment_type text, package text, amount numeric not null, currency text not null, rate_to_lak numeric not null, amount_lak numeric not null, unpaid_lak numeric default 0, payment_method text, notes text, attachment_url text, created_at timestamp with time zone default now(), created_by uuid, invoice_id uuid);
create table public.invoices (id uuid default gen_random_uuid() not null, invoice_no text not null, date date default CURRENT_DATE not null, due_date date default CURRENT_DATE not null, branch_id uuid not null, created_by uuid, student_name text not null, parent_name text, phone text, program_id uuid, package text, sessions integer, payment_type text default 'New Registration'::text, amount numeric not null, currency text not null, rate_to_lak numeric not null, amount_lak numeric not null, notes text, status text default 'Draft'::text not null, paid_at timestamp with time zone, paid_by uuid, payment_method text, income_id uuid, share_token text default replace((gen_random_uuid())::text, '-'::text, ''::text), created_at timestamp with time zone default now(), discount_percent numeric default 0, bonus_sessions integer default 0, original_amount numeric, package_size text);
create table public.lead_activities (id uuid default gen_random_uuid() not null, lead_id uuid not null, action text not null, note text, by_user uuid, by_name text, at timestamp with time zone default now());
create table public.leads (id uuid default gen_random_uuid() not null, student_name text not null, parent_name text, phone text, age integer, program_id uuid, branch_id uuid, source text default 'Facebook'::text, status text default 'New'::text not null, lost_reason text, notes text, trial_class_id uuid, trial_date date, trial_result text, converted_package_id uuid, registered_at timestamp with time zone, last_contact_at timestamp with time zone default now(), created_by uuid, created_at timestamp with time zone default now());
create table public.leave_requests (id uuid default gen_random_uuid() not null, user_id uuid not null, user_name text, leave_type text default 'Annual'::text not null, start_date date not null, end_date date not null, days numeric default 1 not null, reason text, status text default 'Pending'::text not null, reviewed_by uuid, reviewed_by_name text, reviewed_at timestamp with time zone, review_note text, created_at timestamp with time zone default now());
create table public.notifications (id uuid default gen_random_uuid() not null, user_id uuid not null, message text not null, link text, read boolean default false, created_at timestamp with time zone default now());
create table public.package_sizes (code text not null, label text not null, sessions integer, sort_order integer default 0);
create table public.programs (id uuid default gen_random_uuid() not null, name text not null, active boolean default true, created_at timestamp with time zone default now());
create table public.reminder_logs (id uuid default gen_random_uuid() not null, kind text not null, target uuid, status text, sent_at timestamp with time zone default now(), created_at timestamp with time zone default now());
create table public.reminder_settings (id uuid default gen_random_uuid() not null, kind text not null, "time" text, day_of_month integer, channel text, active boolean default true);
create table public.salary_payroll (id uuid default gen_random_uuid() not null, month text not null, staff_id uuid, staff_name text not null, "position" text, base numeric default 0, bonus numeric default 0, benefits numeric default 0, overtime numeric default 0, deductions numeric default 0, net numeric not null, currency text not null, rate_to_lak numeric not null, net_lak numeric not null, pay_date date, status text default 'Pending'::text, slip_no text, notes text, created_at timestamp with time zone default now(), user_id uuid);
create table public.settings (key text not null, value jsonb);
create table public.student_packages (id uuid default gen_random_uuid() not null, invoice_id uuid, student_name text not null, parent_name text, phone text, branch_id uuid not null, program_id uuid not null, package text, sessions_total integer not null, sessions_used integer default 0 not null, start_date date default CURRENT_DATE not null, active boolean default true not null, created_by uuid, created_at timestamp with time zone default now(), photo_url text, date_of_birth date, public_token uuid default gen_random_uuid(), package_size text, student_status text default 'Active'::text, discount_percent numeric default 0, bonus_sessions integer default 0, base_sessions integer, gender text, admission_date date, student_id text);
create table public.student_records (id uuid default gen_random_uuid() not null, date date not null, branch_id uuid not null, student_name text not null, parent_name text, phone text, program_id uuid, student_type text not null, package text, quantity integer default 1, trial_status text, converted boolean default false, amount numeric default 0, currency text, rate_to_lak numeric default 1, amount_lak numeric default 0, unpaid_lak numeric default 0, notes text, created_at timestamp with time zone default now(), created_by uuid, invoice_id uuid);
create table public.users (id uuid not null, name text not null, phone text, email text, role text not null, branch_id uuid, active boolean default true, created_at timestamp with time zone default now(), "position" text, photo_url text, status text default 'Active'::text, start_date date, end_date date, base_salary numeric, salary_currency text default 'LAK'::text, bank_name text, bank_account_no text, emergency_contact text, id_card text, address text, notes text, date_of_birth date, nationality text, gender text, marital_status text, degree text, field_of_study text, university text, graduation_year integer, workplace text, employment_type text, work_schedule text, contract_start date, contract_end date, contract_type text, contract_url text, permanent_address text, city text, province text);
create table public.whatsapp_logs (id uuid default gen_random_uuid() not null, report_id uuid, recipient text not null, message text, status text, error text, sent_at timestamp with time zone default now(), created_at timestamp with time zone default now());
create table public.whatsapp_recipients (id uuid default gen_random_uuid() not null, phone text not null, label text, active boolean default true, created_at timestamp with time zone default now());
alter table public.branches add constraint branches_name_key UNIQUE (name);
alter table public.branches add constraint branches_pkey PRIMARY KEY (id);
alter table public.programs add constraint programs_name_key UNIQUE (name);
alter table public.programs add constraint programs_pkey PRIMARY KEY (id);
alter table public.exchange_rates add constraint exchange_rates_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'THB'::text])));
alter table public.exchange_rates add constraint exchange_rates_pkey PRIMARY KEY (id);
alter table public.exchange_rates add constraint exchange_rates_rate_to_lak_check CHECK ((rate_to_lak > (0)::numeric));
alter table public.expense_records add constraint expense_records_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'LAK'::text, 'THB'::text])));
alter table public.expense_records add constraint expense_records_pkey PRIMARY KEY (id);
alter table public.daily_reports add constraint daily_reports_date_branch_id_key UNIQUE (date, branch_id);
alter table public.daily_reports add constraint daily_reports_pkey PRIMARY KEY (id);
alter table public.daily_reports add constraint daily_reports_status_check CHECK ((status = ANY (ARRAY['Draft'::text, 'Submitted'::text, 'Approved'::text, 'Rejected'::text])));
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.whatsapp_recipients add constraint whatsapp_recipients_pkey PRIMARY KEY (id);
alter table public.reminder_settings add constraint reminder_settings_pkey PRIMARY KEY (id);
alter table public.settings add constraint settings_pkey PRIMARY KEY (key);
alter table public.income_records add constraint income_records_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'LAK'::text, 'THB'::text])));
alter table public.income_records add constraint income_records_payment_type_check CHECK ((payment_type = ANY (ARRAY['New Registration'::text, 'Extension'::text, 'Trial Fee'::text, 'Other'::text])));
alter table public.income_records add constraint income_records_pkey PRIMARY KEY (id);
alter table public.student_records add constraint student_records_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'LAK'::text, 'THB'::text])));
alter table public.student_records add constraint student_records_pkey PRIMARY KEY (id);
alter table public.student_records add constraint student_records_student_type_check CHECK ((student_type = ANY (ARRAY['New'::text, 'Extension'::text, 'Trial'::text, 'Trial Converted'::text])));
alter table public.whatsapp_logs add constraint whatsapp_logs_pkey PRIMARY KEY (id);
alter table public.whatsapp_logs add constraint whatsapp_logs_status_check CHECK ((status = ANY (ARRAY['Sent'::text, 'Failed'::text, 'Manual'::text])));
alter table public.reminder_logs add constraint reminder_logs_pkey PRIMARY KEY (id);
alter table public.reminder_logs add constraint reminder_logs_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'Paused'::text, 'Sent'::text, 'Failed'::text, 'Overdue'::text])));
alter table public.salary_payroll add constraint salary_payroll_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'LAK'::text, 'THB'::text])));
alter table public.salary_payroll add constraint salary_payroll_pkey PRIMARY KEY (id);
alter table public.salary_payroll add constraint salary_payroll_slip_no_key UNIQUE (slip_no);
alter table public.salary_payroll add constraint salary_payroll_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Paid'::text, 'Hold'::text])));
alter table public.closed_months add constraint closed_months_pkey PRIMARY KEY (month);
alter table public.invoices add constraint invoices_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'LAK'::text, 'THB'::text])));
alter table public.invoices add constraint invoices_invoice_no_key UNIQUE (invoice_no);
alter table public.invoices add constraint invoices_pkey PRIMARY KEY (id);
alter table public.invoices add constraint invoices_share_token_key UNIQUE (share_token);
alter table public.invoices add constraint invoices_status_check CHECK ((status = ANY (ARRAY['Draft'::text, 'Sent'::text, 'Paid'::text, 'Cancelled'::text])));
alter table public.users add constraint users_contracttype_check CHECK (((contract_type IS NULL) OR (contract_type = ANY (ARRAY['Permanent'::text, 'Fixed-term'::text, 'Renewable'::text]))));
alter table public.users add constraint users_email_key UNIQUE (email);
alter table public.users add constraint users_emptype_check CHECK (((employment_type IS NULL) OR (employment_type = ANY (ARRAY['Full-time'::text, 'Part-time'::text, 'Contract'::text, 'Intern'::text]))));
alter table public.users add constraint users_gender_check CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['Male'::text, 'Female'::text, 'Prefer not to say'::text]))));
alter table public.users add constraint users_marital_check CHECK (((marital_status IS NULL) OR (marital_status = ANY (ARRAY['Single'::text, 'Married'::text, 'Divorced'::text, 'Widowed'::text]))));
alter table public.users add constraint users_pkey PRIMARY KEY (id);
alter table public.users add constraint users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'co_admin'::text, 'manager'::text, 'finance'::text, 'staff'::text, 'viewer'::text, 'contractor'::text])));
alter table public.users add constraint users_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'On leave'::text, 'Terminated'::text])));
alter table public.student_packages add constraint student_packages_pkey PRIMARY KEY (id);
alter table public.student_packages add constraint student_packages_student_status_check CHECK ((student_status = ANY (ARRAY['Active'::text, 'Passive'::text, 'Inactive'::text])));
alter table public.attendance add constraint attendance_package_id_date_key UNIQUE (package_id, date);
alter table public.attendance add constraint attendance_pkey PRIMARY KEY (id);
alter table public.attendance add constraint attendance_status_check CHECK ((status = ANY (ARRAY['Present'::text, 'Absent'::text])));
alter table public.classes add constraint classes_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
alter table public.classes add constraint classes_pkey PRIMARY KEY (id);
alter table public.class_bookings add constraint class_bookings_kind_check CHECK ((kind = ANY (ARRAY['regular'::text, 'makeup'::text])));
alter table public.class_bookings add constraint class_bookings_pkey PRIMARY KEY (id);
alter table public.class_bookings add constraint class_bookings_status_check CHECK ((status = ANY (ARRAY['Confirmed'::text, 'Cancelled'::text, 'Attended'::text, 'No-show'::text])));
alter table public.deletion_requests add constraint deletion_requests_pkey PRIMARY KEY (id);
alter table public.deletion_requests add constraint deletion_requests_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Approved'::text, 'Rejected'::text])));
alter table public.package_sizes add constraint package_sizes_pkey PRIMARY KEY (code);
alter table public.leads add constraint leads_pkey PRIMARY KEY (id);
alter table public.leads add constraint leads_source_check CHECK ((source = ANY (ARRAY['Facebook'::text, 'Walk-in'::text, 'Referral'::text, 'Phone'::text, 'Other'::text])));
alter table public.leads add constraint leads_status_check CHECK ((status = ANY (ARRAY['New'::text, 'Contacted'::text, 'TrialBooked'::text, 'TrialAttended'::text, 'Registered'::text, 'Lost'::text])));
alter table public.leads add constraint leads_trial_result_check CHECK ((trial_result = ANY (ARRAY['Attended'::text, 'NoShow'::text])));
alter table public.lead_activities add constraint lead_activities_pkey PRIMARY KEY (id);
alter table public.leave_requests add constraint leave_requests_leave_type_check CHECK ((leave_type = ANY (ARRAY['Sick'::text, 'Annual'::text, 'Emergency'::text, 'Unpaid'::text, 'Other'::text])));
alter table public.leave_requests add constraint leave_requests_pkey PRIMARY KEY (id);
alter table public.leave_requests add constraint leave_requests_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Approved'::text, 'Rejected'::text, 'Cancelled'::text])));
alter table public.exchange_rates add constraint exchange_rates_set_by_fkey FOREIGN KEY (set_by) REFERENCES users(id);
alter table public.expense_records add constraint expense_records_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);
alter table public.expense_records add constraint expense_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
alter table public.expense_records add constraint expense_records_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES users(id);
alter table public.daily_reports add constraint daily_reports_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);
alter table public.daily_reports add constraint daily_reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id);
alter table public.daily_reports add constraint daily_reports_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES users(id);
alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
alter table public.income_records add constraint income_records_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);
alter table public.income_records add constraint income_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
alter table public.income_records add constraint income_records_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id);
alter table public.income_records add constraint income_records_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id);
alter table public.income_records add constraint income_records_received_by_fkey FOREIGN KEY (received_by) REFERENCES users(id);
alter table public.student_records add constraint student_records_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);
alter table public.student_records add constraint student_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
alter table public.student_records add constraint student_records_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id);
alter table public.student_records add constraint student_records_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id);
alter table public.whatsapp_logs add constraint whatsapp_logs_report_id_fkey FOREIGN KEY (report_id) REFERENCES daily_reports(id);
alter table public.salary_payroll add constraint salary_payroll_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES users(id);
alter table public.salary_payroll add constraint salary_payroll_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
alter table public.closed_months add constraint closed_months_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES users(id);
alter table public.invoices add constraint invoices_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);
alter table public.invoices add constraint invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
alter table public.invoices add constraint invoices_income_id_fkey FOREIGN KEY (income_id) REFERENCES income_records(id) ON DELETE SET NULL;
alter table public.invoices add constraint invoices_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES users(id);
alter table public.invoices add constraint invoices_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id);
alter table public.users add constraint users_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);
alter table public.student_packages add constraint student_packages_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);
alter table public.student_packages add constraint student_packages_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
alter table public.student_packages add constraint student_packages_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id);
alter table public.student_packages add constraint student_packages_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id);
alter table public.attendance add constraint attendance_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id);
alter table public.attendance add constraint attendance_package_id_fkey FOREIGN KEY (package_id) REFERENCES student_packages(id) ON DELETE CASCADE;
alter table public.attendance add constraint attendance_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES users(id);
alter table public.classes add constraint classes_assistant_id_fkey FOREIGN KEY (assistant_id) REFERENCES users(id);
alter table public.classes add constraint classes_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);
alter table public.classes add constraint classes_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id);
alter table public.classes add constraint classes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES users(id);
alter table public.class_bookings add constraint class_bookings_booked_by_fkey FOREIGN KEY (booked_by) REFERENCES users(id);
alter table public.class_bookings add constraint class_bookings_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
alter table public.class_bookings add constraint class_bookings_package_id_fkey FOREIGN KEY (package_id) REFERENCES student_packages(id) ON DELETE CASCADE;
alter table public.deletion_requests add constraint deletion_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES users(id);
alter table public.deletion_requests add constraint deletion_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id);
alter table public.deletion_requests add constraint deletion_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES student_packages(id) ON DELETE CASCADE;
alter table public.leads add constraint leads_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);
alter table public.leads add constraint leads_converted_package_id_fkey FOREIGN KEY (converted_package_id) REFERENCES student_packages(id);
alter table public.leads add constraint leads_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
alter table public.leads add constraint leads_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id);
alter table public.leads add constraint leads_trial_class_id_fkey FOREIGN KEY (trial_class_id) REFERENCES classes(id);
alter table public.lead_activities add constraint lead_activities_by_user_fkey FOREIGN KEY (by_user) REFERENCES users(id);
alter table public.lead_activities add constraint lead_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
alter table public.leave_requests add constraint leave_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id);
alter table public.leave_requests add constraint leave_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX ix_classes_teacher ON public.classes USING btree (teacher_id);
CREATE INDEX ix_payroll_user ON public.salary_payroll USING btree (user_id);
CREATE INDEX ix_invoices_no ON public.invoices USING btree (invoice_no);
CREATE INDEX ix_income_branch ON public.income_records USING btree (branch_id, date DESC);
CREATE INDEX ix_expense_branch ON public.expense_records USING btree (branch_id, date DESC);
CREATE INDEX ix_leave_user ON public.leave_requests USING btree (user_id);
CREATE INDEX ix_income_date ON public.income_records USING btree (date DESC);
CREATE INDEX ix_income_invoice ON public.income_records USING btree (invoice_id);
CREATE INDEX ix_reports_date ON public.daily_reports USING btree (date DESC);
CREATE INDEX ix_bk_date ON public.class_bookings USING btree (makeup_date);
CREATE INDEX ix_student_invoice ON public.student_records USING btree (invoice_id);
CREATE INDEX ix_pkg_active ON public.student_packages USING btree (active);
CREATE INDEX ix_payroll_month ON public.salary_payroll USING btree (month DESC);
CREATE INDEX ix_expense_date ON public.expense_records USING btree (date DESC);
CREATE INDEX ix_att_pkg ON public.attendance USING btree (package_id);
CREATE INDEX ix_notif_user ON public.notifications USING btree (user_id, read, created_at DESC);
CREATE INDEX ix_leave_dates ON public.leave_requests USING btree (start_date, end_date);
CREATE INDEX ix_leads_created ON public.leads USING btree (created_at);
CREATE INDEX ix_leads_trial ON public.leads USING btree (trial_date);
CREATE INDEX ix_students_date ON public.student_records USING btree (date DESC);
CREATE INDEX ix_att_date ON public.attendance USING btree (date DESC);
CREATE INDEX ix_leave_status ON public.leave_requests USING btree (status);
CREATE INDEX ix_invoices_date ON public.invoices USING btree (date DESC);
CREATE INDEX ix_classes_active_day ON public.classes USING btree (day_of_week) WHERE (active = true);
CREATE INDEX ix_classes_branch ON public.classes USING btree (branch_id);
CREATE INDEX ix_leadact_lead ON public.lead_activities USING btree (lead_id);
CREATE INDEX ix_leads_status ON public.leads USING btree (status);
CREATE INDEX ix_bk_class ON public.class_bookings USING btree (class_id);
CREATE INDEX ix_pkg_branch_program ON public.student_packages USING btree (branch_id, program_id) WHERE (active = true);
CREATE INDEX ix_rates_currency_date ON public.exchange_rates USING btree (currency, effective_date DESC);
CREATE INDEX ix_bk_pkg ON public.class_bookings USING btree (package_id);
CREATE INDEX ix_invoices_status ON public.invoices USING btree (status);
CREATE UNIQUE INDEX ix_student_id ON public.student_packages USING btree (student_id) WHERE ((student_id IS NOT NULL) AND (student_id <> ''::text));
CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$ select role from users where id = auth.uid() $function$
;
CREATE OR REPLACE FUNCTION public.next_invoice_no()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare y text; n int; result text;
begin
  y := to_char(current_date, 'YYYY');
  select coalesce(max((split_part(invoice_no, '-', 3))::int), 0) + 1
    into n from invoices where invoice_no like 'INV-' || y || '-%';
  result := 'INV-' || y || '-' || lpad(n::text, 4, '0');
  return result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.attendance_apply_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  used_delta int := 0;
begin
  if tg_op = 'INSERT' then
    used_delta := case when new.status = 'Present' then 1 else 0 end;
  elsif tg_op = 'UPDATE' then
    used_delta := (case when new.status = 'Present' then 1 else 0 end)
                - (case when old.status = 'Present' then 1 else 0 end);
  elsif tg_op = 'DELETE' then
    used_delta := -(case when old.status = 'Present' then 1 else 0 end);
    update student_packages
       set sessions_used = greatest(0, sessions_used + used_delta)
     where id = old.package_id;
    return old;
  end if;

  update student_packages
     set sessions_used = greatest(0, sessions_used + used_delta),
         active = case when sessions_used + used_delta >= sessions_total then false else active end
   where id = new.package_id;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.invoice_paid_create_package()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.status = 'Paid' and (old.status is distinct from 'Paid')
     and new.sessions is not null and new.sessions > 0 then
    -- avoid duplicates
    if not exists (select 1 from student_packages where invoice_id = new.id) then
      insert into student_packages (
        invoice_id, student_name, parent_name, phone,
        branch_id, program_id, package,
        sessions_total, start_date, created_by
      ) values (
        new.id, new.student_name, new.parent_name, new.phone,
        new.branch_id, new.program_id, new.package,
        new.sessions, current_date, new.paid_by
      );
    end if;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_month_closed(d date)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (select 1 from closed_months where month = to_char(d, 'YYYY-MM'))
$function$
;
CREATE OR REPLACE FUNCTION public.prevent_edit_closed_month()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  target_date date;
begin
  target_date := coalesce(new.date, old.date);
  if is_month_closed(target_date) and my_role() <> 'admin' then
    raise exception 'This month is closed. Records from % cannot be modified.', to_char(target_date, 'Mon YYYY');
  end if;
  -- Even admins can only edit closed months via a special reopen (not implemented yet).
  -- For now, admin CAN edit closed months — trusting the CEO's judgment.
  return coalesce(new, old);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.prevent_insert_closed_month()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if is_month_closed(new.date) and my_role() <> 'admin' then
    raise exception 'This month is closed. Records for % cannot be added.', to_char(new.date, 'Mon YYYY');
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.prevent_edit_approved()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.status = 'Approved' and my_role() <> 'admin' then
    raise exception 'This report is approved and locked. Contact admin to unlock.';
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_deep_reset()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if my_role() <> 'admin' then
    raise exception 'Only admin can perform a deep reset.';
  end if;

  -- financial first (respect FKs)
  delete from attendance where created_at is not null;
  delete from student_packages where created_at is not null;
  delete from student_records where created_at is not null;
  delete from income_records where created_at is not null;
  delete from invoices where created_at is not null;
  delete from expense_records where created_at is not null;
  delete from salary_payroll where created_at is not null;
  delete from daily_reports where created_at is not null;
  delete from whatsapp_logs where created_at is not null;
  delete from reminder_logs where created_at is not null;
  delete from closed_months where created_at is not null;

  -- lookup data
  delete from whatsapp_recipients where created_at is not null;
  delete from exchange_rates where created_at is not null;
  delete from programs where created_at is not null;
  delete from branches where created_at is not null;

  -- settings (company info, bank, terms)
  delete from settings;

  return 'Deep reset complete.';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_nuclear_reset()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  me uuid := auth.uid();
begin
  if my_role() <> 'admin' then
    raise exception 'Only admin can perform a nuclear reset.';
  end if;
  -- do everything deep reset does
  perform admin_deep_reset();
  -- then remove other users (keep me)
  delete from users where id <> me;
  return 'Nuclear reset complete. Only your account remains.';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.check_class_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  cap int;
  filled int;
  target_date date;
begin
  select capacity into cap from classes where id = new.class_id;
  if cap is null or cap = 0 then return new; end if;

  if new.kind = 'regular' then
    select count(*) into filled from class_bookings
      where class_id = new.class_id and kind = 'regular' and status = 'Confirmed'
      and id <> new.id;
    if filled >= cap then
      raise exception 'This class is at full capacity (% of %)', filled, cap;
    end if;
  else
    target_date := new.makeup_date;
    -- regular seats + already-booked makeups on that date
    select
      (select count(*) from class_bookings where class_id = new.class_id and kind = 'regular' and status = 'Confirmed')
      +
      (select count(*) from class_bookings where class_id = new.class_id and kind = 'makeup' and status = 'Confirmed' and makeup_date = target_date and id <> new.id)
    into filled;
    if filled >= cap then
      raise exception 'No space in this class on % (% of %)', target_date, filled, cap;
    end if;
  end if;
  return new;
end;
$function$
;
CREATE TRIGGER trg_closed_expense BEFORE DELETE OR UPDATE ON public.expense_records FOR EACH ROW EXECUTE FUNCTION prevent_edit_closed_month();
CREATE TRIGGER trg_closed_expense_ins BEFORE INSERT ON public.expense_records FOR EACH ROW EXECUTE FUNCTION prevent_insert_closed_month();
CREATE TRIGGER trg_closed_report BEFORE DELETE OR UPDATE ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION prevent_edit_closed_month();
CREATE TRIGGER trg_closed_report_ins BEFORE INSERT ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION prevent_insert_closed_month();
CREATE TRIGGER trg_lock_approved BEFORE UPDATE ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION prevent_edit_approved();
CREATE TRIGGER trg_closed_income BEFORE DELETE OR UPDATE ON public.income_records FOR EACH ROW EXECUTE FUNCTION prevent_edit_closed_month();
CREATE TRIGGER trg_closed_income_ins BEFORE INSERT ON public.income_records FOR EACH ROW EXECUTE FUNCTION prevent_insert_closed_month();
CREATE TRIGGER trg_invoice_paid_pkg AFTER UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION invoice_paid_create_package();
CREATE TRIGGER trg_attendance_apply AFTER INSERT OR DELETE OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION attendance_apply_change();
CREATE TRIGGER trg_class_capacity BEFORE INSERT OR UPDATE ON public.class_bookings FOR EACH ROW EXECUTE FUNCTION check_class_capacity();
alter table public.branches enable row level security;
alter table public.programs enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.expense_records enable row level security;
alter table public.daily_reports enable row level security;
alter table public.notifications enable row level security;
alter table public.whatsapp_recipients enable row level security;
alter table public.reminder_settings enable row level security;
alter table public.settings enable row level security;
alter table public.income_records enable row level security;
alter table public.student_records enable row level security;
alter table public.whatsapp_logs enable row level security;
alter table public.reminder_logs enable row level security;
alter table public.salary_payroll enable row level security;
alter table public.closed_months enable row level security;
alter table public.invoices enable row level security;
alter table public.users enable row level security;
alter table public.student_packages enable row level security;
alter table public.attendance enable row level security;
alter table public.classes enable row level security;
alter table public.class_bookings enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.package_sizes enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.leave_requests enable row level security;
create policy p_users_read on public.users as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_users_admin_write on public.users as PERMISSIVE for ALL to public using ((my_role() = 'admin'::text)) with check ((my_role() = 'admin'::text));
create policy p_branches_read on public.branches as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_branches_write on public.branches as PERMISSIVE for ALL to public using ((my_role() = 'admin'::text)) with check ((my_role() = 'admin'::text));
create policy p_programs_read on public.programs as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_programs_write on public.programs as PERMISSIVE for ALL to public using ((my_role() = 'admin'::text)) with check ((my_role() = 'admin'::text));
create policy p_rates_read on public.exchange_rates as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_rates_write on public.exchange_rates as PERMISSIVE for ALL to public using ((my_role() = 'admin'::text)) with check ((my_role() = 'admin'::text));
create policy p_income_read on public.income_records as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_income_add on public.income_records as PERMISSIVE for INSERT to public with check ((my_role() = ANY (ARRAY['staff'::text, 'finance'::text, 'admin'::text])));
create policy p_income_admin on public.income_records as PERMISSIVE for UPDATE to public using ((my_role() = 'admin'::text));
create policy p_expense_read on public.expense_records as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_wa_read on public.whatsapp_logs as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_expense_add on public.expense_records as PERMISSIVE for INSERT to public with check ((my_role() = ANY (ARRAY['staff'::text, 'finance'::text, 'admin'::text])));
create policy p_expense_admin on public.expense_records as PERMISSIVE for UPDATE to public using ((my_role() = 'admin'::text));
create policy p_students_read on public.student_records as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_students_add on public.student_records as PERMISSIVE for INSERT to public with check ((my_role() = ANY (ARRAY['staff'::text, 'finance'::text, 'admin'::text])));
create policy p_students_admin on public.student_records as PERMISSIVE for UPDATE to public using ((my_role() = 'admin'::text));
create policy p_reports_read on public.daily_reports as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_reports_add on public.daily_reports as PERMISSIVE for INSERT to public with check ((my_role() = ANY (ARRAY['staff'::text, 'admin'::text])));
create policy p_reports_review on public.daily_reports as PERMISSIVE for UPDATE to public using (((my_role() = ANY (ARRAY['manager'::text, 'admin'::text])) OR ((my_role() = 'staff'::text) AND (submitted_by = auth.uid()) AND (status = 'Rejected'::text))));
create policy p_payroll_read on public.salary_payroll as PERMISSIVE for SELECT to public using ((my_role() = ANY (ARRAY['finance'::text, 'admin'::text])));
create policy p_payroll_write on public.salary_payroll as PERMISSIVE for ALL to public using ((my_role() = ANY (ARRAY['finance'::text, 'admin'::text]))) with check ((my_role() = ANY (ARRAY['finance'::text, 'admin'::text])));
create policy p_wa_add on public.whatsapp_logs as PERMISSIVE for INSERT to public with check ((auth.uid() IS NOT NULL));
create policy p_rem_read on public.reminder_logs as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_notif_own on public.notifications as PERMISSIVE for ALL to public using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy p_invoices_read on public.invoices as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_invoices_add on public.invoices as PERMISSIVE for INSERT to public with check ((my_role() = ANY (ARRAY['staff'::text, 'finance'::text, 'admin'::text])));
create policy p_invoices_update on public.invoices as PERMISSIVE for UPDATE to public using ((my_role() = ANY (ARRAY['staff'::text, 'finance'::text, 'admin'::text])));
create policy p_invoices_public on public.invoices as PERMISSIVE for SELECT to public using ((share_token IS NOT NULL));
create policy p_settings_read on public.settings as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_settings_write on public.settings as PERMISSIVE for ALL to public using ((my_role() = 'admin'::text)) with check ((my_role() = 'admin'::text));
create policy p_pkg_read on public.student_packages as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_pkg_write on public.student_packages as PERMISSIVE for ALL to public using ((my_role() = ANY (ARRAY['staff'::text, 'finance'::text, 'admin'::text]))) with check ((my_role() = ANY (ARRAY['staff'::text, 'finance'::text, 'admin'::text])));
create policy p_att_read on public.attendance as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_att_write on public.attendance as PERMISSIVE for ALL to public using ((my_role() = ANY (ARRAY['staff'::text, 'finance'::text, 'admin'::text]))) with check ((my_role() = ANY (ARRAY['staff'::text, 'finance'::text, 'admin'::text])));
create policy p_closed_read on public.closed_months as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_closed_write on public.closed_months as PERMISSIVE for ALL to public using ((my_role() = 'admin'::text)) with check ((my_role() = 'admin'::text));
create policy p_income_delete_admin on public.income_records as PERMISSIVE for DELETE to public using ((my_role() = 'admin'::text));
create policy p_income_update_admin on public.income_records as PERMISSIVE for UPDATE to public using ((my_role() = 'admin'::text));
create policy p_expense_delete_admin on public.expense_records as PERMISSIVE for DELETE to public using ((my_role() = 'admin'::text));
create policy p_expense_update_admin on public.expense_records as PERMISSIVE for UPDATE to public using ((my_role() = 'admin'::text));
create policy p_students_delete_admin on public.student_records as PERMISSIVE for DELETE to public using ((my_role() = 'admin'::text));
create policy p_students_update_admin on public.student_records as PERMISSIVE for UPDATE to public using ((my_role() = 'admin'::text));
create policy p_reports_delete_admin on public.daily_reports as PERMISSIVE for DELETE to public using ((my_role() = 'admin'::text));
create policy p_invoices_delete_admin on public.invoices as PERMISSIVE for DELETE to public using ((my_role() = 'admin'::text));
create policy p_payroll_delete_admin on public.salary_payroll as PERMISSIVE for DELETE to public using ((my_role() = 'admin'::text));
create policy p_pkg_delete_admin on public.student_packages as PERMISSIVE for DELETE to public using ((my_role() = 'admin'::text));
create policy p_att_delete_admin on public.attendance as PERMISSIVE for DELETE to public using ((my_role() = 'admin'::text));
create policy p_users_self_update on public.users as PERMISSIVE for UPDATE to public using ((id = auth.uid())) with check ((id = auth.uid()));
create policy p_classes_read on public.classes as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_classes_write on public.classes as PERMISSIVE for ALL to public using ((my_role() = ANY (ARRAY['admin'::text, 'manager'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'manager'::text])));
create policy p_bookings_read on public.class_bookings as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_bookings_write on public.class_bookings as PERMISSIVE for ALL to public using ((my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'finance'::text, 'staff'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'finance'::text, 'staff'::text])));
create policy p_income_ins_coadmin on public.income_records as PERMISSIVE for INSERT to public with check ((my_role() = 'co_admin'::text));
create policy p_income_upd_coadmin on public.income_records as PERMISSIVE for UPDATE to public using ((my_role() = 'co_admin'::text));
create policy p_expense_ins_coadmin on public.expense_records as PERMISSIVE for INSERT to public with check ((my_role() = 'co_admin'::text));
create policy p_expense_upd_coadmin on public.expense_records as PERMISSIVE for UPDATE to public using ((my_role() = 'co_admin'::text));
create policy p_students_ins_coadmin on public.student_records as PERMISSIVE for INSERT to public with check ((my_role() = 'co_admin'::text));
create policy p_students_upd_coadmin on public.student_records as PERMISSIVE for UPDATE to public using ((my_role() = 'co_admin'::text));
create policy p_reports_all_coadmin on public.daily_reports as PERMISSIVE for ALL to public using ((my_role() = 'co_admin'::text)) with check ((my_role() = 'co_admin'::text));
create policy p_invoices_ins_coadmin on public.invoices as PERMISSIVE for INSERT to public with check ((my_role() = 'co_admin'::text));
create policy p_invoices_upd_coadmin on public.invoices as PERMISSIVE for UPDATE to public using ((my_role() = 'co_admin'::text));
create policy p_payroll_ins_coadmin on public.salary_payroll as PERMISSIVE for INSERT to public with check ((my_role() = 'co_admin'::text));
create policy p_payroll_upd_coadmin on public.salary_payroll as PERMISSIVE for UPDATE to public using ((my_role() = 'co_admin'::text));
create policy p_classes_all_coadmin on public.classes as PERMISSIVE for ALL to public using ((my_role() = 'co_admin'::text)) with check ((my_role() = 'co_admin'::text));
create policy p_bookings_all_coadmin on public.class_bookings as PERMISSIVE for ALL to public using ((my_role() = 'co_admin'::text)) with check ((my_role() = 'co_admin'::text));
create policy p_settings_all_coadmin on public.settings as PERMISSIVE for ALL to public using ((my_role() = 'co_admin'::text)) with check ((my_role() = 'co_admin'::text));
create policy p_rates_all_coadmin on public.exchange_rates as PERMISSIVE for ALL to public using ((my_role() = 'co_admin'::text)) with check ((my_role() = 'co_admin'::text));
create policy p_branches_all_coadmin on public.branches as PERMISSIVE for ALL to public using ((my_role() = 'co_admin'::text)) with check ((my_role() = 'co_admin'::text));
create policy p_programs_all_coadmin on public.programs as PERMISSIVE for ALL to public using ((my_role() = 'co_admin'::text)) with check ((my_role() = 'co_admin'::text));
create policy p_wa_all_coadmin on public.whatsapp_recipients as PERMISSIVE for ALL to public using ((my_role() = 'co_admin'::text)) with check ((my_role() = 'co_admin'::text));
create policy p_pkg_all_coadmin on public.student_packages as PERMISSIVE for ALL to public using ((my_role() = 'co_admin'::text)) with check ((my_role() = 'co_admin'::text));
create policy p_att_all_coadmin on public.attendance as PERMISSIVE for ALL to public using ((my_role() = 'co_admin'::text)) with check ((my_role() = 'co_admin'::text));
create policy p_users_ins_coadmin on public.users as PERMISSIVE for INSERT to public with check ((my_role() = 'co_admin'::text));
create policy p_users_upd_coadmin on public.users as PERMISSIVE for UPDATE to public using ((my_role() = 'co_admin'::text));
create policy p_pkgsizes_read on public.package_sizes as PERMISSIVE for SELECT to public using (true);
create policy p_pkgsizes_write on public.package_sizes as PERMISSIVE for ALL to public using ((my_role() = ANY (ARRAY['admin'::text, 'co_admin'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'co_admin'::text])));
create policy p_delreq_read on public.deletion_requests as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_delreq_insert on public.deletion_requests as PERMISSIVE for INSERT to public with check ((my_role() = ANY (ARRAY['admin'::text, 'co_admin'::text])));
create policy p_delreq_update on public.deletion_requests as PERMISSIVE for UPDATE to public using ((my_role() = 'admin'::text));
create policy p_leads_read on public.leads as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_leads_write on public.leads as PERMISSIVE for INSERT to public with check ((auth.uid() IS NOT NULL));
create policy p_leads_update on public.leads as PERMISSIVE for UPDATE to public using ((auth.uid() IS NOT NULL));
create policy p_leads_delete on public.leads as PERMISSIVE for DELETE to public using ((my_role() = ANY (ARRAY['admin'::text, 'co_admin'::text])));
create policy p_leadact_read on public.lead_activities as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_leadact_write on public.lead_activities as PERMISSIVE for INSERT to public with check ((auth.uid() IS NOT NULL));
create policy p_leave_read on public.leave_requests as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy p_leave_insert on public.leave_requests as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy p_leave_update on public.leave_requests as PERMISSIVE for UPDATE to public using (((auth.uid() = user_id) OR (my_role() = ANY (ARRAY['admin'::text, 'co_admin'::text, 'manager'::text]))));
create view public.v_teacher_month_classes as  SELECT c.teacher_id,
    to_char((a.date)::timestamp with time zone, 'YYYY-MM'::text) AS month,
    count(DISTINCT ROW(c.id, a.date)) AS sessions_taught
   FROM (attendance a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.status = 'Present'::text) AND (c.teacher_id IS NOT NULL))
  GROUP BY c.teacher_id, (to_char((a.date)::timestamp with time zone, 'YYYY-MM'::text));
create view public.v_packages_today as  SELECT sp.id,
    sp.student_name,
    sp.parent_name,
    sp.phone,
    sp.branch_id,
    sp.program_id,
    sp.package,
    sp.sessions_total,
    sp.sessions_used,
    GREATEST(0, (sp.sessions_total - sp.sessions_used)) AS sessions_left,
    a.id AS attendance_id,
    a.status AS attendance_status,
    a.date AS attendance_date
   FROM (student_packages sp
     LEFT JOIN attendance a ON (((a.package_id = sp.id) AND (a.date = CURRENT_DATE))))
  WHERE (sp.active = true);
create view public.v_contracts_expiring as  SELECT id,
    name,
    "position",
    contract_end,
    (contract_end - CURRENT_DATE) AS days_left
   FROM users
  WHERE ((contract_end IS NOT NULL) AND (contract_end >= CURRENT_DATE) AND (contract_end <= (CURRENT_DATE + '30 days'::interval)) AND (status <> 'Terminated'::text));
create view public.v_classes_today as  SELECT c.id,
    c.name,
    c.program_id,
    c.branch_id,
    c.teacher_id,
    c.assistant_id,
    c.day_of_week,
    c.start_time,
    c.end_time,
    c.room,
    c.capacity,
    c.age_min,
    c.age_max,
    c.level,
    c.class_fee,
    c.fee_currency,
    c.active,
    c.notes,
    c.created_at,
    b.name AS branch_name,
    p.name AS program_name,
    u.name AS teacher_name,
    ua.name AS assistant_name,
    ( SELECT count(*) AS count
           FROM class_bookings cb
          WHERE ((cb.class_id = c.id) AND (cb.kind = 'regular'::text) AND (cb.status = 'Confirmed'::text))) AS regular_count,
    ( SELECT count(*) AS count
           FROM class_bookings cb
          WHERE ((cb.class_id = c.id) AND (cb.kind = 'makeup'::text) AND (cb.status = 'Confirmed'::text) AND (cb.makeup_date = CURRENT_DATE))) AS makeup_count
   FROM ((((classes c
     LEFT JOIN branches b ON ((b.id = c.branch_id)))
     LEFT JOIN programs p ON ((p.id = c.program_id)))
     LEFT JOIN users u ON ((u.id = c.teacher_id)))
     LEFT JOIN users ua ON ((ua.id = c.assistant_id)))
  WHERE ((c.active = true) AND ((c.day_of_week)::numeric = EXTRACT(dow FROM CURRENT_DATE)));
create view public.v_class_today_roster as  SELECT cb.class_id,
    cb.id AS booking_id,
    cb.kind,
    cb.status AS booking_status,
    cb.makeup_date,
    sp.id AS package_id,
    sp.student_name,
    sp.parent_name,
    sp.phone,
    sp.photo_url,
    sp.sessions_total,
    sp.sessions_used,
    GREATEST(0, (sp.sessions_total - sp.sessions_used)) AS sessions_left,
    a.id AS attendance_id,
    a.status AS attendance_status
   FROM ((class_bookings cb
     JOIN student_packages sp ON ((sp.id = cb.package_id)))
     LEFT JOIN attendance a ON (((a.package_id = sp.id) AND (a.date = CURRENT_DATE))))
  WHERE ((cb.status = 'Confirmed'::text) AND ((cb.kind = 'regular'::text) OR ((cb.kind = 'makeup'::text) AND (cb.makeup_date = CURRENT_DATE))));
create view public.v_parent_portal as  SELECT sp.id AS package_id,
    sp.public_token,
    sp.student_name,
    sp.parent_name,
    sp.phone,
    sp.package,
    sp.package_size,
    sp.photo_url,
    sp.date_of_birth,
    sp.gender,
    sp.sessions_total,
    sp.sessions_used,
    sp.base_sessions,
    sp.bonus_sessions,
    sp.discount_percent,
    sp.student_status,
    GREATEST(0, (sp.sessions_total - sp.sessions_used)) AS sessions_left,
    sp.start_date,
    sp.admission_date,
    sp.active,
    sp.branch_id,
    sp.program_id,
    b.name AS branch_name,
    p.name AS program_name,
    rc.id AS class_id,
    rc.name AS class_name,
    rc.day_of_week AS class_day,
    rc.start_time AS class_start,
    rc.end_time AS class_end,
    rc.room AS class_room,
    rc_teacher.name AS class_teacher
   FROM (((((student_packages sp
     LEFT JOIN branches b ON ((b.id = sp.branch_id)))
     LEFT JOIN programs p ON ((p.id = sp.program_id)))
     LEFT JOIN class_bookings rcb ON (((rcb.package_id = sp.id) AND (rcb.kind = 'regular'::text) AND (rcb.status = 'Confirmed'::text))))
     LEFT JOIN classes rc ON ((rc.id = rcb.class_id)))
     LEFT JOIN users rc_teacher ON ((rc_teacher.id = rc.teacher_id)));
