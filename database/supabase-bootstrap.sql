-- Bootstrap completo para um projeto Supabase novo deste app.
-- Rode este arquivo no SQL Editor do Supabase.
--
-- Observacao:
-- As "medidas" usadas no sistema nao sao criadas no Supabase.
-- Elas vem do Power BI e aparecem depois que as credenciais do Power BI
-- sao configuradas e o catalogo e sincronizado.

create extension if not exists pgcrypto;

create or replace function public.auth_company_id()
returns text
language sql
stable
as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'company_id',
    auth.jwt() -> 'user_metadata' ->> 'company_id'
  )
$$;

create or replace function public.auth_role()
returns text
language sql
stable
as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    'client'
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.auth_role() = 'admin'
$$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (company_id, key)
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pbi_workspace_id text not null,
  name text not null,
  is_active boolean not null default true,
  synced_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_workspaces_company_pbi
  on public.workspaces(company_id, pbi_workspace_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  pbi_report_id text not null,
  name text not null,
  web_url text,
  embed_url text,
  dataset_id text,
  is_active boolean not null default true,
  synced_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_reports_company_pbi
  on public.reports(company_id, pbi_report_id);

create table if not exists public.whatsapp_bot_instances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  manual_qr_code_url text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_whatsapp_bot_instances_default
  on public.whatsapp_bot_instances(company_id)
  where is_default = true;

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

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bot_instance_id uuid references public.whatsapp_bot_instances(id) on delete set null,
  name text not null,
  phone text,
  type text not null default 'individual'
    check (type in ('individual', 'group')),
  whatsapp_group_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bot_instance_id uuid references public.whatsapp_bot_instances(id) on delete set null,
  report_id uuid,
  name text not null,
  cron_expression text not null,
  export_format text not null default 'PDF'
    check (export_format in ('PDF', 'PNG', 'HTML', 'PPTX', 'table', 'csv', 'pdf', 'xlsx')),
  message_template text,
  is_active boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  pbi_page_name text,
  pbi_page_names text[],
  report_configs jsonb,
  image_url text,
  image_urls jsonb,
  disable_after_send boolean not null default false,
  send_mode text not null default 'none'
    check (send_mode in ('none', 'audio', 'text')),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.schedule_contacts (
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  primary key (schedule_id, contact_id)
);

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bot_instance_id uuid references public.whatsapp_bot_instances(id) on delete set null,
  name text not null,
  dataset_id text not null,
  workspace_id text,
  selected_columns jsonb not null default '[]'::jsonb,
  selected_measures jsonb not null default '[]'::jsonb,
  filters jsonb not null default '[]'::jsonb,
  dax_query text,
  cron_expression text,
  export_format text not null default 'csv'
    check (export_format in ('table', 'csv', 'pdf', 'xlsx')),
  message_template text,
  is_active boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_contacts (
  automation_id uuid not null references public.automations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  primary key (automation_id, contact_id)
);

create table if not exists public.dispatch_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  schedule_id uuid references public.schedules(id) on delete set null,
  report_name text not null,
  contact_name text not null,
  contact_phone text,
  status text not null default 'pending'
    check (status in ('pending', 'exporting', 'sending', 'delivered', 'failed')),
  export_format text,
  error_message text,
  n8n_execution_id text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.user_workspace_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, workspace_id)
);

create table if not exists public.user_dataset_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  dataset_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, dataset_id)
);

create table if not exists public.chat_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  intencao text,
  mes text,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bot_instance_id uuid references public.whatsapp_bot_instances(id) on delete set null,
  name text not null,
  description text,
  dataset_id text not null,
  workspace_id text,
  dax_query text,
  selected_columns jsonb not null default '[]'::jsonb,
  selected_measures jsonb not null default '[]'::jsonb,
  filters jsonb not null default '[]'::jsonb,
  customer_table text,
  date_column text,
  days_inactive integer,
  phone_column text,
  name_column text,
  message_template text not null,
  image_url text,
  cron_expression text,
  is_active boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_executions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
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
  company_id uuid not null references public.companies(id) on delete cascade,
  client_name text,
  client_phone text,
  client_data jsonb,
  message text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Prospeccao de leads via Google Places API (New). Ferramenta interna do
-- admin da plataforma, sem company_id (nao e um recurso por empresa cliente).
create table if not exists public.leads (
  id text primary key, -- place_id do Google Places
  nome text not null,
  classificacao text not null
    check (classificacao in ('SEM SITE', 'SO REDE SOCIAL', 'TEM SITE')),
  site text,
  telefone text,
  endereco text,
  avaliacao numeric,
  num_avaliacoes integer,
  link_maps text,
  status text not null default 'Novo',
  nicho text not null,
  cidade text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Data da ultima busca real na Google Places API por nicho+cidade, para
-- reaproveitar o resultado do banco por 7 dias e economizar cota da API.
create table if not exists public.lead_searches (
  nicho text not null,
  cidade text not null,
  searched_at timestamptz not null default now(),
  primary key (nicho, cidade)
);

-- Log de cada mensagem de prospeccao enviada a um lead via WAHA. Usado para
-- aplicar limite diario e espacamento minimo entre envios, evitando que o
-- numero conectado seja marcado como spam/restrito pelo WhatsApp.
create table if not exists public.lead_message_log (
  id uuid primary key default gen_random_uuid(),
  lead_id text references public.leads(id) on delete set null,
  sent_at timestamptz not null default now()
);

create index if not exists idx_lead_message_log_sent_at on public.lead_message_log(sent_at);

-- Modelos de mensagem de abordagem para Leads, criados manualmente pelo
-- administrador da plataforma (nao pertencem a nenhuma empresa cliente).
create table if not exists public.lead_message_templates (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_company_settings_company_id on public.company_settings(company_id);
create index if not exists idx_workspaces_company_id on public.workspaces(company_id);
create index if not exists idx_reports_company_id on public.reports(company_id);
create index if not exists idx_reports_workspace_id on public.reports(workspace_id);
create index if not exists idx_reports_dataset_id on public.reports(dataset_id);
create index if not exists idx_whatsapp_bot_instances_company_id on public.whatsapp_bot_instances(company_id);
create index if not exists idx_waha_sessions_company_id on public.waha_sessions(company_id);
create index if not exists idx_contacts_company_id on public.contacts(company_id);
create index if not exists idx_contacts_bot_instance_id on public.contacts(bot_instance_id);
create index if not exists idx_schedules_company_id on public.schedules(company_id);
create index if not exists idx_schedule_contacts_schedule_id on public.schedule_contacts(schedule_id);
create index if not exists idx_schedule_contacts_contact_id on public.schedule_contacts(contact_id);
create index if not exists idx_automations_company_id on public.automations(company_id);
create index if not exists idx_automation_contacts_automation_id on public.automation_contacts(automation_id);
create index if not exists idx_automation_contacts_contact_id on public.automation_contacts(contact_id);
create index if not exists idx_dispatch_logs_company_id on public.dispatch_logs(company_id);
create index if not exists idx_dispatch_logs_schedule_id on public.dispatch_logs(schedule_id);
create index if not exists idx_dispatch_logs_status on public.dispatch_logs(status);
create index if not exists idx_dispatch_logs_created_at on public.dispatch_logs(created_at);
create index if not exists idx_user_workspace_access_user_id on public.user_workspace_access(user_id);
create index if not exists idx_user_workspace_access_company_id on public.user_workspace_access(company_id);
create index if not exists idx_user_workspace_access_workspace_id on public.user_workspace_access(workspace_id);
create index if not exists idx_user_dataset_access_user_id on public.user_dataset_access(user_id);
create index if not exists idx_user_dataset_access_company_id on public.user_dataset_access(company_id);
create index if not exists idx_user_dataset_access_workspace_id on public.user_dataset_access(workspace_id);
create index if not exists idx_user_dataset_access_dataset_id on public.user_dataset_access(dataset_id);
create index if not exists idx_chat_logs_company_id on public.chat_logs(company_id);
create index if not exists idx_chat_logs_created_at on public.chat_logs(created_at);
create index if not exists idx_chat_logs_mes on public.chat_logs(mes);
create index if not exists idx_chat_logs_company_mes on public.chat_logs(company_id, mes);
create index if not exists idx_campaigns_company_id on public.campaigns(company_id);
create index if not exists idx_campaign_executions_campaign_id on public.campaign_executions(campaign_id);
create index if not exists idx_campaign_executions_company_id on public.campaign_executions(company_id);
create index if not exists idx_campaign_sends_execution_id on public.campaign_sends(execution_id);
create index if not exists idx_campaign_sends_campaign_id on public.campaign_sends(campaign_id);
create index if not exists idx_campaign_sends_company_id on public.campaign_sends(company_id);

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function public.auth_company_id() to authenticated, service_role;
grant execute on function public.auth_role() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;

alter table public.companies enable row level security;
alter table public.company_settings enable row level security;
alter table public.workspaces enable row level security;
alter table public.reports enable row level security;
alter table public.whatsapp_bot_instances enable row level security;
alter table public.waha_sessions enable row level security;
alter table public.contacts enable row level security;
alter table public.schedules enable row level security;
alter table public.schedule_contacts enable row level security;
alter table public.automations enable row level security;
alter table public.automation_contacts enable row level security;
alter table public.dispatch_logs enable row level security;
alter table public.user_workspace_access enable row level security;
alter table public.user_dataset_access enable row level security;
alter table public.chat_logs enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_executions enable row level security;
alter table public.campaign_sends enable row level security;
-- Sem policy: apenas o service_role (usado pela rota /api/leads no servidor)
-- acessa estas tabelas; anon/authenticated ficam bloqueados por padrao.
alter table public.leads enable row level security;
alter table public.lead_searches enable row level security;
alter table public.lead_message_log enable row level security;
alter table public.lead_message_templates enable row level security;

drop policy if exists companies_select_own on public.companies;
create policy companies_select_own on public.companies
for select
using (id::text = public.auth_company_id());

drop policy if exists company_settings_isolation on public.company_settings;
create policy company_settings_isolation on public.company_settings
for all
using (company_id::text = public.auth_company_id())
with check (company_id::text = public.auth_company_id());

drop policy if exists workspaces_isolation on public.workspaces;
create policy workspaces_isolation on public.workspaces
for all
using (company_id::text = public.auth_company_id())
with check (company_id::text = public.auth_company_id());

drop policy if exists reports_isolation on public.reports;
create policy reports_isolation on public.reports
for all
using (company_id::text = public.auth_company_id())
with check (company_id::text = public.auth_company_id());

drop policy if exists whatsapp_bot_instances_isolation on public.whatsapp_bot_instances;
create policy whatsapp_bot_instances_isolation on public.whatsapp_bot_instances
for all
using (company_id::text = public.auth_company_id())
with check (company_id::text = public.auth_company_id());

drop policy if exists waha_sessions_all_own on public.waha_sessions;
create policy waha_sessions_all_own on public.waha_sessions
for all
using (company_id::text = public.auth_company_id())
with check (company_id::text = public.auth_company_id());

drop policy if exists contacts_all_own on public.contacts;
create policy contacts_all_own on public.contacts
for all
using (company_id::text = public.auth_company_id())
with check (company_id::text = public.auth_company_id());

drop policy if exists schedules_isolation on public.schedules;
create policy schedules_isolation on public.schedules
for all
using (company_id::text = public.auth_company_id())
with check (company_id::text = public.auth_company_id());

drop policy if exists schedule_contacts_isolation on public.schedule_contacts;
create policy schedule_contacts_isolation on public.schedule_contacts
for all
using (
  exists (
    select 1
    from public.schedules s
    join public.contacts c on c.id = public.schedule_contacts.contact_id
    where s.id = public.schedule_contacts.schedule_id
      and s.company_id = c.company_id
      and s.company_id::text = public.auth_company_id()
  )
)
with check (
  exists (
    select 1
    from public.schedules s
    join public.contacts c on c.id = public.schedule_contacts.contact_id
    where s.id = public.schedule_contacts.schedule_id
      and s.company_id = c.company_id
      and s.company_id::text = public.auth_company_id()
  )
);

drop policy if exists automations_isolation on public.automations;
create policy automations_isolation on public.automations
for all
using (company_id::text = public.auth_company_id())
with check (company_id::text = public.auth_company_id());

drop policy if exists automation_contacts_isolation on public.automation_contacts;
create policy automation_contacts_isolation on public.automation_contacts
for all
using (
  exists (
    select 1
    from public.automations a
    join public.contacts c on c.id = public.automation_contacts.contact_id
    where a.id = public.automation_contacts.automation_id
      and a.company_id = c.company_id
      and a.company_id::text = public.auth_company_id()
  )
)
with check (
  exists (
    select 1
    from public.automations a
    join public.contacts c on c.id = public.automation_contacts.contact_id
    where a.id = public.automation_contacts.automation_id
      and a.company_id = c.company_id
      and a.company_id::text = public.auth_company_id()
  )
);

drop policy if exists dispatch_logs_isolation on public.dispatch_logs;
create policy dispatch_logs_isolation on public.dispatch_logs
for all
using (company_id::text = public.auth_company_id())
with check (company_id::text = public.auth_company_id());

drop policy if exists user_workspace_access_isolation on public.user_workspace_access;
create policy user_workspace_access_isolation on public.user_workspace_access
for all
using (
  company_id::text = public.auth_company_id()
  and (
    user_id = auth.uid()
    or public.is_admin()
  )
)
with check (
  company_id::text = public.auth_company_id()
  and public.is_admin()
);

drop policy if exists user_dataset_access_isolation on public.user_dataset_access;
create policy user_dataset_access_isolation on public.user_dataset_access
for all
using (
  company_id::text = public.auth_company_id()
  and (
    user_id = auth.uid()
    or public.is_admin()
  )
)
with check (
  company_id::text = public.auth_company_id()
  and public.is_admin()
);

drop policy if exists chat_logs_isolation on public.chat_logs;
create policy chat_logs_isolation on public.chat_logs
for all
using (company_id::text = public.auth_company_id())
with check (company_id::text = public.auth_company_id());

drop policy if exists campaigns_isolation on public.campaigns;
create policy campaigns_isolation on public.campaigns
for all
using (company_id::text = public.auth_company_id())
with check (company_id::text = public.auth_company_id());

drop policy if exists campaign_executions_isolation on public.campaign_executions;
create policy campaign_executions_isolation on public.campaign_executions
for all
using (company_id::text = public.auth_company_id())
with check (company_id::text = public.auth_company_id());

drop policy if exists campaign_sends_isolation on public.campaign_sends;
create policy campaign_sends_isolation on public.campaign_sends
for all
using (company_id::text = public.auth_company_id())
with check (company_id::text = public.auth_company_id());

insert into public.companies (id, name, slug, is_active)
values ('a68674c4-b1ce-455c-947b-1bda65784673', 'FORTECH', 'fortech', true)
on conflict (id) do update
set
  name = excluded.name,
  slug = excluded.slug,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.company_settings (company_id, key, value, updated_at)
values
  ('a68674c4-b1ce-455c-947b-1bda65784673', 'general', '{"app_name":"FORTECH","timezone":"America/Fortaleza"}'::jsonb, now()),
  ('a68674c4-b1ce-455c-947b-1bda65784673', 'powerbi', '{}'::jsonb, now()),
  ('a68674c4-b1ce-455c-947b-1bda65784673', 'n8n', '{"webhook_url":"","callback_secret":"","chat_webhook_url":""}'::jsonb, now()),
  ('a68674c4-b1ce-455c-947b-1bda65784673', 'chat_ia', '{"enabled":false,"workspace_id":"","dataset_id":"","dataset_name":"","webhook_url":"","trial_days":null,"trial_started_at":"","trial_ends_at":""}'::jsonb, now()),
  ('a68674c4-b1ce-455c-947b-1bda65784673', 'dispatch_settings', '{"enabled":false,"trial_days":null,"trial_started_at":"","trial_ends_at":""}'::jsonb, now()),
  ('a68674c4-b1ce-455c-947b-1bda65784673', 'narration_mode', '{"send_mode":"none"}'::jsonb, now()),
  ('a68674c4-b1ce-455c-947b-1bda65784673', 'whatsapp_provider', '{"provider":"bot"}'::jsonb, now()),
  ('a68674c4-b1ce-455c-947b-1bda65784673', 'usage_limits', '{}'::jsonb, now())
on conflict (company_id, key) do update
set
  value = excluded.value,
  updated_at = now();

insert into public.whatsapp_bot_instances (company_id, name, is_default)
values ('a68674c4-b1ce-455c-947b-1bda65784673', 'WhatsApp principal', true)
on conflict do nothing;
