create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key, email text not null unique, name text not null, password_hash text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists organisations (
  id uuid primary key, name text not null, timezone text not null default 'Europe/Amsterdam',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists memberships (
  id uuid primary key, user_id uuid not null references users(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  role text not null check(role in ('owner','area_manager','location_manager','planner','team_lead','hr','finance','employee')),
  status text not null default 'active', created_at timestamptz not null default now(),
  unique(user_id,organisation_id)
);
create table if not exists locations (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null, timezone text not null default 'Europe/Amsterdam', created_at timestamptz not null default now(),
  unique(organisation_id,name)
);
create table if not exists departments (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade, name text not null, created_at timestamptz not null default now()
);
create table if not exists teams (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  department_id uuid references departments(id) on delete cascade, name text not null, created_at timestamptz not null default now()
);
create table if not exists roles (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null, created_at timestamptz not null default now(), unique(organisation_id,name)
);
create table if not exists skills (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null, created_at timestamptz not null default now(), unique(organisation_id,name)
);
create table if not exists employee_profiles (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  user_id uuid references users(id) on delete set null, name text not null, email text,
  primary_role_id uuid references roles(id) on delete set null,
  location_ids uuid[] not null default '{}', desired_hours numeric(6,2), experience_level int not null default 1,
  status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_employee_org on employee_profiles(organisation_id,status);
create table if not exists employee_roles (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  employee_id uuid not null references employee_profiles(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade, unique(employee_id,role_id)
);
create table if not exists employee_skills (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  employee_id uuid not null references employee_profiles(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade, level text not null default 'independent', unique(employee_id,skill_id)
);
create table if not exists contracts (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  employee_id uuid not null references employee_profiles(id) on delete cascade,
  contract_type text not null, contract_hours numeric(6,2) not null default 0, hourly_wage numeric(9,2) not null default 0,
  employer_factor numeric(6,3) not null default 1.28, start_date date default current_date, end_date date,
  active boolean not null default true, version int not null default 1, created_at timestamptz not null default now()
);
create index if not exists idx_contract_org_employee on contracts(organisation_id,employee_id,active);
create table if not exists availability (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  employee_id uuid not null references employee_profiles(id) on delete cascade,
  start_at timestamptz not null, end_at timestamptz not null, status text not null default 'available',
  preference text, created_at timestamptz not null default now(), check(end_at>start_at)
);
create index if not exists idx_availability_employee_time on availability(organisation_id,employee_id,start_at,end_at);
create table if not exists leave_requests (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  employee_id uuid not null references employee_profiles(id) on delete cascade,
  start_date date not null, end_date date not null, leave_type text not null, status text not null default 'pending',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(end_date>=start_date)
);
create table if not exists revenue_forecasts (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  forecast_date date not null, forecast_amount numeric(14,2) not null, low_amount numeric(14,2) not null,
  high_amount numeric(14,2) not null, confidence int not null check(confidence between 0 and 100),
  factors jsonb not null default '[]', source text not null default 'system', manual_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organisation_id,forecast_date,source)
);
create index if not exists idx_forecast_org_date on revenue_forecasts(organisation_id,forecast_date);
create table if not exists revenues (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  location_id uuid references locations(id) on delete set null, revenue_date date not null,
  interval_start timestamptz, interval_minutes int, amount numeric(14,2) not null check(amount>=0),
  source text not null default 'manual', created_at timestamptz not null default now()
);
create index if not exists idx_revenue_org_date on revenues(organisation_id,revenue_date);
create table if not exists schedules (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade, week_start date not null,
  status text not null default 'draft', version int not null default 1, strategy text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists shifts (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  schedule_id uuid references schedules(id) on delete set null, location_id uuid references locations(id) on delete set null,
  role_id uuid references roles(id) on delete set null, start_at timestamptz not null, end_at timestamptz not null,
  break_minutes int not null default 0, status text not null default 'draft', source text not null default 'manual',
  explanation jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(end_at>start_at)
);
create index if not exists idx_shift_org_time on shifts(organisation_id,start_at,end_at);
create table if not exists shift_assignments (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  shift_id uuid not null references shifts(id) on delete cascade,
  employee_id uuid not null references employee_profiles(id) on delete cascade,
  status text not null default 'assigned', created_at timestamptz not null default now(),
  unique(shift_id,employee_id)
);
create index if not exists idx_assignment_employee on shift_assignments(organisation_id,employee_id);
create table if not exists open_shift_requests (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  shift_id uuid not null references shifts(id) on delete cascade, employee_id uuid not null references employee_profiles(id) on delete cascade,
  status text not null default 'interested', created_at timestamptz not null default now()
);
create table if not exists time_entries (
  id uuid primary key, organisation_id uuid not null references organisations(id) on delete cascade,
  employee_id uuid not null references employee_profiles(id) on delete cascade,
  shift_id uuid references shifts(id) on delete set null, started_at timestamptz not null, ended_at timestamptz,
  source text not null default 'manual', status text not null default 'open',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(ended_at is null or ended_at>started_at)
);
create index if not exists idx_time_org_employee on time_entries(organisation_id,employee_id,started_at desc);
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null, action text not null, object_type text not null,
  object_id text, before_value jsonb, after_value jsonb, metadata jsonb, created_at timestamptz not null default now()
);
create index if not exists idx_audit_org_created on audit_logs(organisation_id,created_at desc);
