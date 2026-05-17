-- Campos para construir automaticamente a consulta de clientes inativos
alter table public.campaigns
  add column if not exists customer_table text,
  add column if not exists date_column text,
  add column if not exists days_inactive integer;
