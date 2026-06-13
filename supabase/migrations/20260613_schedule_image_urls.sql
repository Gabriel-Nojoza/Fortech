ALTER TABLE schedules ADD COLUMN IF NOT EXISTS image_urls jsonb;

UPDATE schedules
SET image_urls = jsonb_build_array(image_url)
WHERE image_url IS NOT NULL
  AND image_url <> ''
  AND image_urls IS NULL;
