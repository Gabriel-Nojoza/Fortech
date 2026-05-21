-- Add 'xlsx' to automations.export_format CHECK constraint
ALTER TABLE public.automations
  DROP CONSTRAINT IF EXISTS automations_export_format_check;

ALTER TABLE public.automations
  ADD CONSTRAINT automations_export_format_check
  CHECK (export_format IN ('table', 'csv', 'pdf', 'xlsx'));
