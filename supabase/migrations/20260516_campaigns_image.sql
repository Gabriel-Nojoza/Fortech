-- Adiciona suporte a imagem nas campanhas
alter table public.campaigns add column if not exists image_url text;
