-- Modelos de mensagem de abordagem para Leads, criados manualmente pelo
-- administrador da plataforma (nao pertencem a nenhuma empresa cliente).
create table if not exists public.lead_message_templates (
  id         uuid        primary key default gen_random_uuid(),
  label      text        not null,
  content    text        not null,
  created_at timestamptz not null default now()
);

-- Sem policy: apenas o service_role (usado pela rota /api/leads no servidor)
-- acessa esta tabela; anon/authenticated ficam bloqueados por padrao.
alter table public.lead_message_templates enable row level security;
