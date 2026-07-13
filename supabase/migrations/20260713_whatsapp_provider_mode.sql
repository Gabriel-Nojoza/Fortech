insert into public.company_settings (company_id, key, value, updated_at)
select
  c.id,
  'whatsapp_provider',
  '{"provider":"bot"}'::jsonb,
  now()
from public.companies c
where not exists (
  select 1
  from public.company_settings s
  where s.company_id = c.id
    and s.key = 'whatsapp_provider'
)
on conflict (company_id, key) do nothing;
