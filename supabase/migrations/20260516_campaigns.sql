-- Campanhas: disparo de mensagens individuais para clientes do Power BI

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  dataset_id text not null,
  workspace_id text,
  dax_query text,
  selected_columns jsonb not null default '[]'::jsonb,
  selected_measures jsonb not null default '[]'::jsonb,
  filters jsonb not null default '[]'::jsonb,
  phone_column text,
  name_column text,
  message_template text not null,
  bot_instance_id uuid references public.whatsapp_bot_instances(id) on delete set null,
  cron_expression text,
  is_active boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_executions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null,
  status text not null default 'running',
  total_clients integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  execution_id uuid references public.campaign_executions(id) on delete cascade,
  company_id uuid not null,
  client_name text,
  client_phone text,
  client_data jsonb,
  message text not null,
  status text not null default 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaigns_company_id on public.campaigns(company_id);
create index if not exists idx_campaign_executions_campaign_id on public.campaign_executions(campaign_id);
create index if not exists idx_campaign_sends_execution_id on public.campaign_sends(execution_id);
create index if not exists idx_campaign_sends_campaign_id on public.campaign_sends(campaign_id);

alter table public.campaigns enable row level security;
alter table public.campaign_executions enable row level security;
alter table public.campaign_sends enable row level security;

drop policy if exists campaigns_isolation on public.campaigns;
create policy campaigns_isolation on public.campaigns
for all
using (
  company_id::text = coalesce(
    auth.jwt() -> 'app_metadata' ->> 'company_id',
    auth.jwt() -> 'user_metadata' ->> 'company_id'
  )
)
with check (
  company_id::text = coalesce(
    auth.jwt() -> 'app_metadata' ->> 'company_id',
    auth.jwt() -> 'user_metadata' ->> 'company_id'
  )
);

drop policy if exists campaign_executions_isolation on public.campaign_executions;
create policy campaign_executions_isolation on public.campaign_executions
for all
using (
  company_id::text = coalesce(
    auth.jwt() -> 'app_metadata' ->> 'company_id',
    auth.jwt() -> 'user_metadata' ->> 'company_id'
  )
)
with check (
  company_id::text = coalesce(
    auth.jwt() -> 'app_metadata' ->> 'company_id',
    auth.jwt() -> 'user_metadata' ->> 'company_id'
  )
);

drop policy if exists campaign_sends_isolation on public.campaign_sends;
create policy campaign_sends_isolation on public.campaign_sends
for all
using (
  company_id::text = coalesce(
    auth.jwt() -> 'app_metadata' ->> 'company_id',
    auth.jwt() -> 'user_metadata' ->> 'company_id'
  )
)
with check (
  company_id::text = coalesce(
    auth.jwt() -> 'app_metadata' ->> 'company_id',
    auth.jwt() -> 'user_metadata' ->> 'company_id'
  )
);
