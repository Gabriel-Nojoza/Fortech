-- Bot WhatsApp: menus/submenus ilimitados + estado de conversa por contato.
-- Base do "motor de estados" — o cliente que interagir com um menu tem sua
-- posicao na arvore lembrada em bot_conversation_states ate a proxima mensagem.
create extension if not exists pgcrypto;

create table if not exists public.bot_menus (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  prompt_text text not null default '',
  is_root boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bot_menu_options (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  menu_id uuid not null references public.bot_menus(id) on delete cascade,
  position integer not null default 0,
  label text not null,
  action_type text not null default 'open_menu'
    check (action_type in ('open_menu', 'send_text', 'transfer_human', 'end_conversation')),
  child_menu_id uuid references public.bot_menus(id) on delete set null,
  response_text text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bot_conversation_states (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_phone text not null,
  current_menu_id uuid references public.bot_menus(id) on delete set null,
  context jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (company_id, contact_phone)
);

create unique index if not exists uq_bot_menus_one_root_per_company
  on public.bot_menus(company_id)
  where is_root = true;

create index if not exists idx_bot_menus_company_id on public.bot_menus(company_id);
create index if not exists idx_bot_menu_options_company_id on public.bot_menu_options(company_id);
create index if not exists idx_bot_menu_options_menu_id on public.bot_menu_options(menu_id);
create index if not exists idx_bot_conversation_states_company_id on public.bot_conversation_states(company_id);

alter table public.bot_menus enable row level security;
alter table public.bot_menu_options enable row level security;
alter table public.bot_conversation_states enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['bot_menus', 'bot_menu_options', 'bot_conversation_states']
  loop
    execute format('drop policy if exists %I_isolation on public.%I', t, t);
    execute format(
      'create policy %I_isolation on public.%I for all using (company_id::text = coalesce(auth.jwt() -> ''app_metadata'' ->> ''company_id'', auth.jwt() -> ''user_metadata'' ->> ''company_id'')) with check (company_id::text = coalesce(auth.jwt() -> ''app_metadata'' ->> ''company_id'', auth.jwt() -> ''user_metadata'' ->> ''company_id''))',
      t, t
    );
  end loop;
end $$;
