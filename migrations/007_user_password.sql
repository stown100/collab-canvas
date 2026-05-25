-- Add password hash column for email/password authentication
-- OAuth users (Google, Yandex) leave this NULL
ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;
