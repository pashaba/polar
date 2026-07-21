-- ============================================================
-- SCHEMA UPDATE: pisahkan auth Google OAuth & auth Email/Password
-- Jalankan ini di Supabase SQL Editor
-- ============================================================

-- 1. google_id ternyata jadi PRIMARY KEY di tabel lama, padahal user local
--    gak punya google_id. Postgres gak izinin kolom PK di-set nullable,
--    jadi kita pindahin PK-nya ke kolom "id" (auto-increment) dulu.

-- 1a. Pastikan ada kolom id sebagai primary key baru
ALTER TABLE polar_users ADD COLUMN IF NOT EXISTS id BIGSERIAL;

-- 1b. Cari & drop primary key constraint yang lama — TAPI cuma kalau PK-nya belum di kolom "id"
--     (idempotent: aman dijalanin berkali-kali, gak bakal nabrak FK yang udah nempel ke PK id)
DO $$
DECLARE
  pk_name text;
  pk_def text;
BEGIN
  SELECT conname, pg_get_constraintdef(oid) INTO pk_name, pk_def
  FROM pg_constraint
  WHERE conrelid = 'polar_users'::regclass AND contype = 'p';

  -- Kalau PK udah bener (di kolom id), skip semua langkah di bawah ini
  IF pk_name IS NOT NULL AND pk_def NOT LIKE '%(id)%' THEN
    EXECUTE format('ALTER TABLE polar_users DROP CONSTRAINT %I', pk_name);
    ALTER TABLE polar_users ADD CONSTRAINT polar_users_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- 1d. google_id tetap harus unik (tapi sekarang boleh NULL, dan boleh banyak NULL sekaligus)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'polar_users_google_id_unique'
  ) THEN
    ALTER TABLE polar_users ADD CONSTRAINT polar_users_google_id_unique UNIQUE (google_id);
  END IF;
END $$;

-- 1e. Sekarang baru bisa di-drop NOT NULL-nya
ALTER TABLE polar_users
  ALTER COLUMN google_id DROP NOT NULL;

-- 2. Tambah kolom buat auth lokal
ALTER TABLE polar_users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'google', -- 'google' | 'local'
  ADD COLUMN IF NOT EXISTS updated_at BIGINT,
  ADD COLUMN IF NOT EXISTS earn_flag BOOLEAN NOT NULL DEFAULT false, -- pengganti $_SESSION['earn_flag']
  ADD COLUMN IF NOT EXISTS privacy_accepted_at BIGINT; -- catatan waktu user setuju kebijakan privasi pas register

-- 3. Email wajib unik (dipakai buat login lokal & lookup google)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'polar_users_email_unique'
  ) THEN
    ALTER TABLE polar_users ADD CONSTRAINT polar_users_email_unique UNIQUE (email);
  END IF;
END $$;

-- 4. polar_sessions sekarang direlasikan ke user_id (ganti dari fingerprint)
ALTER TABLE polar_sessions
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES polar_users(id);

-- fingerprint udah gak diisi lagi sama server.js versi baru, jadi harus boleh NULL
ALTER TABLE polar_sessions
  ALTER COLUMN fingerprint DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_polar_sessions_user_id ON polar_sessions(user_id);

-- 5. Tabel riwayat transaksi koin (earn, claim, dll)
CREATE TABLE IF NOT EXISTS polar_coin_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES polar_users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,            -- positif = nambah, negatif = kepake
  reason TEXT NOT NULL,               -- 'earn', 'claim_session', 'manual_adjust', dst
  balance_after BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_polar_coin_logs_user_id ON polar_coin_logs(user_id, created_at DESC);

-- 6. Kolom admin flag — set manual jadi TRUE buat akun kamu sendiri di Supabase Table Editor
ALTER TABLE polar_users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- 6b. Sistem referral
ALTER TABLE polar_users
  ADD COLUMN IF NOT EXISTS referral_code TEXT,
  ADD COLUMN IF NOT EXISTS referred_by BIGINT REFERENCES polar_users(id);

-- Backfill referral_code buat user yang udah ada (format: POLAR<id>, dijamin unik karena id unik)
UPDATE polar_users SET referral_code = 'POLAR' || id WHERE referral_code IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'polar_users_referral_code_unique'
  ) THEN
    ALTER TABLE polar_users ADD CONSTRAINT polar_users_referral_code_unique UNIQUE (referral_code);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_polar_users_referred_by ON polar_users(referred_by);

-- 7. Tabel kode redeem
CREATE TABLE IF NOT EXISTS polar_redeem_codes (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  coin_value BIGINT NOT NULL,
  max_uses BIGINT NOT NULL DEFAULT 1,
  used_count BIGINT NOT NULL DEFAULT 0,
  expires_at BIGINT,               -- NULL = gak pernah expired
  active BOOLEAN NOT NULL DEFAULT true,
  created_at BIGINT NOT NULL
);

-- 8. Log siapa aja yang udah redeem kode apa (cegah 1 user redeem kode yang sama 2x)
CREATE TABLE IF NOT EXISTS polar_redeem_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES polar_users(id) ON DELETE CASCADE,
  code_id BIGINT NOT NULL REFERENCES polar_redeem_codes(id) ON DELETE CASCADE,
  redeemed_at BIGINT NOT NULL,
  UNIQUE(user_id, code_id)
);

-- 9. Tabel event promosi (dikelola admin, ditampilin ke semua user)
CREATE TABLE IF NOT EXISTS polar_events (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  event_date BIGINT,               -- kapan event mulai (opsional, buat ditampilin)
  end_date BIGINT,                 -- kapan event berakhir — dipakai buat auto-hide dari user
  link_url TEXT,
  link_label TEXT DEFAULT 'Lihat Event',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_polar_events_end_date ON polar_events(end_date);

-- 10. Tabel konfigurasi script bot (Phoenix, Ourin, dst) — dikelola admin, gantiin hardcode env var
CREATE TABLE IF NOT EXISTS polar_scripts (
  id BIGSERIAL PRIMARY KEY,
  script_key TEXT UNIQUE NOT NULL,      -- slug unik dipakai di polar_sessions.script, misal 'phoenix_md'
  display_name TEXT NOT NULL,            -- nama ditampilin ke user, misal 'Phoenix MD'
  subtitle TEXT,                         -- teks kecil di bawah nama, misal 'Pterodactyl Engine'
  icon TEXT NOT NULL DEFAULT 'fa-robot', -- class Font Awesome (mis. 'fa-robot') ATAU URL gambar (mulai dgn http)
  panel_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  server_uuid TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_polar_scripts_active ON polar_scripts(active, sort_order);

-- 11. Feedback dari user
CREATE TABLE IF NOT EXISTS polar_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES polar_users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  rating BIGINT,                          -- 1-5, opsional
  status TEXT NOT NULL DEFAULT 'new',     -- new | read | resolved
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_polar_feedback_status ON polar_feedback(status, created_at DESC);

-- 12. Request script baru dari user
CREATE TABLE IF NOT EXISTS polar_script_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES polar_users(id) ON DELETE SET NULL,
  script_name TEXT NOT NULL,
  reference_link TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'new',     -- new | reviewing | added | rejected
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_polar_script_requests_status ON polar_script_requests(status, created_at DESC);

-- 13. Pengajuan sponsor
CREATE TABLE IF NOT EXISTS polar_sponsor_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES polar_users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,                  -- email atau nomor WA
  company TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',     -- new | contacted | closed
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_polar_sponsor_requests_status ON polar_sponsor_requests(status, created_at DESC);

-- 14. Tabel produk (buat halaman toko /store, dikelola admin)
CREATE TABLE IF NOT EXISTS polar_products (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  price BIGINT NOT NULL DEFAULT 0,     -- disimpen dalam Rupiah (bukan sen)
  image_url TEXT,
  category TEXT NOT NULL DEFAULT 'Umum',
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_polar_products_active ON polar_products(active, category, sort_order);

-- Catatan:
-- - Kolom "fingerprint" di polar_sessions boleh dibiarkan (buat data lama),
--   tapi query baru di server.js pakai user_id, bukan fingerprint lagi.
-- - Kalau mau strict, migrasi data lama fingerprint -> user_id manual dulu
--   sebelum drop kolom fingerprint.
