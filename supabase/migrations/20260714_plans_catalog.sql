-- Plans catalog: makes subscription plans admin-manageable instead of hardcoded in app code.
create extension if not exists pgcrypto;

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  monthly_price numeric(10,2) not null default 0,
  resources jsonb not null default '[]'::jsonb,
  report_builder boolean not null default false,
  campaigns boolean not null default false,
  excel_export boolean not null default false,
  campaign_client_preview boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_plans_sort_order on public.plans(sort_order);

insert into public.plans (
  code, name, monthly_price, resources,
  report_builder, campaigns, excel_export, campaign_client_preview,
  is_active, sort_order
)
values
  (
    'START', 'START', 149,
    '["1 conexão de WhatsApp","Atendimento com IA","Cardápio em PDF","Horário de funcionamento","Promoções","Encaminhamento para atendente","Suporte básico"]'::jsonb,
    false, true, false, false, true, 1
  ),
  (
    'PRO', 'PRO', 249,
    '["1 conexão de WhatsApp","Atendimento com IA","Cardápio em PDF","Horário de funcionamento","Promoções","Encaminhamento para atendente","Suporte básico","Fluxos personalizados","Dashboard","Relatórios","Catálogo com imagens","Agendamentos","Suporte prioritário"]'::jsonb,
    true, true, true, true, true, 2
  ),
  (
    'PREMIUM', 'PREMIUM', 399,
    '["1 conexão de WhatsApp","Atendimento com IA","Cardápio em PDF","Horário de funcionamento","Promoções","Encaminhamento para atendente","Suporte básico","Fluxos personalizados","Dashboard","Relatórios","Catálogo com imagens","Agendamentos","Suporte prioritário","Integrações via API","CRM","ERP","Recursos personalizados","Prioridade máxima no suporte"]'::jsonb,
    true, true, true, true, true, 3
  )
on conflict (code) do nothing;

alter table public.plans enable row level security;

drop policy if exists plans_read_all_authenticated on public.plans;
create policy plans_read_all_authenticated on public.plans
for select
to authenticated
using (true);
