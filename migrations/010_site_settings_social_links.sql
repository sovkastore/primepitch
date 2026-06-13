-- 010: Site settings store + admin-managed social/connect links.
CREATE TABLE IF NOT EXISTS site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO site_settings (key, value)
VALUES (
  'social_links',
  '[
    {"id":"telegram","label":"Telegram","enabled":true,"url":"https://t.me/primepitchlive"},
    {"id":"x","label":"X","enabled":false,"url":""},
    {"id":"whatsapp","label":"WhatsApp","enabled":false,"url":""}
  ]'::jsonb
)
ON CONFLICT (key) DO NOTHING;
