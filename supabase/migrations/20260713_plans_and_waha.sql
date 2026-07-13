create table if not exists public.waha_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  session_name text not null unique,
  status text not null default 'STOPPED'
    check (status in ('STOPPED', 'STARTING', 'SCAN_QR_CODE', 'WORKING', 'FAILED')),
  phone_number text,
  connected_name text,
  me_id text,
  qr_code text,
  qr_code_mimetype text,
  last_connection_at timestamptz,
  last_seen_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id)
);

create index if not exists idx_waha_sessions_company_id
  on public.waha_sessions(company_id);

alter table public.waha_sessions enable row level security;

drop policy if exists waha_sessions_all_own on public.waha_sessions;
create policy waha_sessions_all_own
  on public.waha_sessions
  for all
  using (company_id::text = public.auth_company_id())
  with check (company_id::text = public.auth_company_id());
