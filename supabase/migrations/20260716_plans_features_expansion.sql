-- Expande os toggles de funcionalidades por plano.
-- Antes so existiam 4 (report_builder, campaigns, excel_export,
-- campaign_client_preview). As novas colunas nascem com default true
-- porque essas telas nunca foram controladas por plano antes -- se
-- nascessem false, todo cliente existente perderia acesso a algo que
-- ja usa hoje assim que a coluna fosse criada.
alter table public.plans add column if not exists schedules boolean not null default true;
alter table public.plans add column if not exists operational_summary boolean not null default true;
alter table public.plans add column if not exists logs boolean not null default true;
