-- Adiciona 'xlsx' como formato válido na tabela schedules
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_export_format_check;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_export_format_check
  CHECK (export_format IN ('PDF', 'PNG', 'PPTX', 'table', 'csv', 'pdf', 'xlsx'));
