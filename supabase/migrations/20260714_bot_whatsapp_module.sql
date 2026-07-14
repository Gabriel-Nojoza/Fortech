-- Bot WhatsApp module (Fase 1): base tables for client-configurable automated attendance.
-- n8n executes flows via API; this module only stores configuration/data, isolated per company_id.
create extension if not exists pgcrypto;

create table if not exists public.bot_agents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  phone text not null,
  department text,
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bot_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null default 0,
  description text,
  category text,
  stock integer,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bot_keywords (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  trigger text not null,
  response text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bot_quick_replies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  message text,
  buttons jsonb not null default '[]'::jsonb,
  list_items jsonb not null default '[]'::jsonb,
  file_url text,
  image_url text,
  audio_url text,
  video_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bot_transfer_targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  type text not null check (type in ('human', 'department', 'whatsapp', 'group', 'webhook')),
  target_value text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Populated later (Fase 2) by n8n via webhook when flows actually run.
-- Created now so the Dashboard do Bot has a real (empty) source instead of fake numbers.
create table if not exists public.bot_message_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_phone text,
  direction text check (direction in ('inbound', 'outbound')),
  response_time_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_agents_company_id on public.bot_agents(company_id);
create index if not exists idx_bot_products_company_id on public.bot_products(company_id);
create index if not exists idx_bot_keywords_company_id on public.bot_keywords(company_id);
create index if not exists idx_bot_quick_replies_company_id on public.bot_quick_replies(company_id);
create index if not exists idx_bot_transfer_targets_company_id on public.bot_transfer_targets(company_id);
create index if not exists idx_bot_message_logs_company_id on public.bot_message_logs(company_id);
create index if not exists idx_bot_message_logs_created_at on public.bot_message_logs(company_id, created_at desc);

alter table public.bot_agents enable row level security;
alter table public.bot_products enable row level security;
alter table public.bot_keywords enable row level security;
alter table public.bot_quick_replies enable row level security;
alter table public.bot_transfer_targets enable row level security;
alter table public.bot_message_logs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['bot_agents', 'bot_products', 'bot_keywords', 'bot_quick_replies', 'bot_transfer_targets', 'bot_message_logs']
  loop
    execute format('drop policy if exists %I_isolation on public.%I', t, t);
    execute format(
      'create policy %I_isolation on public.%I for all using (company_id::text = coalesce(auth.jwt() -> ''app_metadata'' ->> ''company_id'', auth.jwt() -> ''user_metadata'' ->> ''company_id'')) with check (company_id::text = coalesce(auth.jwt() -> ''app_metadata'' ->> ''company_id'', auth.jwt() -> ''user_metadata'' ->> ''company_id''))',
      t, t
    );
  end loop;
end $$;
