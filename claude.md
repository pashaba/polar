# CLAUDE.md

Konteks project ini buat Claude Code (atau AI assistant lain) yang bakal lanjut ngerjain repo ini.

## Tentang Project

**Polar.web.id** — platform SaaS hosting bot WhatsApp gratis. User claim server bot (Phoenix MD / Ourin MD) pakai sistem koin virtual ("Polar Coin") yang didapet dari nonton shortlink (SafelinkU/Safelinku).

Project ini hasil migrasi dari PHP (procedural, session-based) ke Node.js/Express, dideploy di **Vercel** (serverless).

## Tech Stack

- **Backend**: Node.js + Express (`server.js`, satu file, semua route di situ)
- **Auth**: JWT di httpOnly cookie (`polar_token`) — bukan session server-side, karena serverless (Vercel) stateless per-request
- **Database**: Supabase (Postgres via REST API `/rest/v1/`), diakses pakai `fetch()` manual lewat helper `sb()` di server.js — **bukan** pakai `@supabase/supabase-js` SDK
- **Frontend**: HTML statis + vanilla JS (`public/dashboard.js`, `public/login.js` inline di `login.html`) — semua data diisi lewat `fetch()` ke `/api/*`, gak ada framework (React/Vue)
- **Styling**: neobrutalism (border tebal hitam, shadow offset kotak, warna orange `#ff5e00` + gold `#fbbf24`) — CSS di `public/style.css`
- **Deploy target**: Vercel (serverless function, lihat `vercel.json`)

## Struktur

```
server.js              -> semua backend logic & route API
vercel.json             -> config Vercel (includeFiles: public/** wajib ada, soalnya express.static pakai dynamic fs)
schema.sql               -> ALTER statements + CREATE TABLE buat Supabase (jalanin manual di SQL editor, gak ada migration tool)
.env.example              -> daftar env var yang wajib diisi di Vercel dashboard (bukan file .env di production)
public/
  login.html               -> login + register (2 card di 1 file, toggle via JS), + PWA meta tags, + anti-flash dark mode script
  dashboard.html            -> dashboard utama, semua section (home/claim/status/sessions/history/profile) ada di 1 file, di-toggle via class .active
  dashboard.js              -> semua logic dashboard: fetch /api/me, /api/sessions, /api/server-status, /api/coins/history, dark mode toggle, splash progress
  style.css                 -> shared CSS neobrutalism + dark mode variables ([data-theme="dark"])
  manifest.json              -> config PWA (nama, icon, theme color, start_url: /dashboard)
  sw.js                      -> service worker (cache-first buat static asset, network-first buat halaman, API selalu network-only)
  icons/                     -> icon PWA (192, 512, apple-touch) — placeholder bintang gold, ganti kalau ada logo asli
```

## Fitur Tambahan (di luar auth/dashboard dasar)

- **Riwayat transaksi koin**: setiap perubahan `coins` di `polar_users` (earn, claim session, manual adjust) dicatat ke tabel `polar_coin_logs` lewat helper `logCoinTransaction()` di server.js. Endpoint: `GET /api/coins/history`. **Kalau nambah cara baru buat ubah koin, WAJIB panggil `logCoinTransaction()` juga**, biar riwayatnya konsisten.
- **PWA**: `manifest.json` + `sw.js` bikin web bisa di-install ke homescreen. Service worker sengaja **skip caching buat semua path `/api/*`** — jangan diubah jadi ke-cache, karena data user (coins, sessions) harus selalu fresh.
- **Dark mode**: pakai atribut `data-theme="dark"` di `<html>`, disimpen di `localStorage` key `polar_theme`. Ada inline script di `<head>` tiap halaman (`dashboard.html`, `login.html`, `privacy.html`) yang set atribut ini **sebelum** body render, biar gak ada flash putih. Kalau nambah halaman baru, script anti-flash ini harus ikut disalin.
- **Splash progress**: progress bar splash screen di dashboard **ngikutin progres loading asli** (`setSplashProgress()` dipanggil manual di titik-titik fetch penting di `dashboard.js`), bukan animasi CSS timer. Kalau nambah fetch penting baru di init flow, sesuaikan juga persentasenya.
- **Cloudflare Turnstile (captcha)**: dipasang di form login & register. Karena `login.html` butuh inject `TURNSTILE_SITE_KEY` (public, aman ditaruh di HTML) yang nilainya dari env var, route `GET /login` di server.js **bukan** `sendFile` biasa — dia baca file, `.replace()` placeholder `{{TURNSTILE_SITE_KEY}}`, baru dikirim. Kalau ubah `login.html`, jangan hapus placeholder ini. Verifikasi token captcha di server pakai `verifyTurnstile()` — kalau `TURNSTILE_SECRET_KEY` belum di-set di env, verifikasi **di-skip otomatis** (biar gak ke-lock pas development).
- **Customer Service & Privacy Policy**: nomor WA CS (`6285715294026`) di-hardcode langsung di HTML (`dashboard.html`, `login.html`, `privacy.html`) karena itu info publik, bukan secret — sengaja gak ditaruh di env var biar gak perlu templating tambahan di semua halaman. Halaman kebijakan privasi ada di `public/privacy.html`, diakses lewat `/privacy` (clean URL, sama pola kayak `/login` & `/dashboard`).

## Konvensi Penting

- **Bahasa**: komentar kode & komunikasi ke user pakai Bahasa Indonesia informal, campur istilah teknis Inggris. Jangan diubah ke Bahasa Inggris kecuali diminta.
- **Kredensial**: owner project ini **prefer hardcode credentials langsung di kode** (bukan strict `.env`-only) di script bot lama. Tapi untuk project Node.js/Vercel ini kita udah konsisten pakai `.env` / Vercel Environment Variables — **pertahankan pola ini**, jangan hardcode ulang API key ke dalam `server.js`.
- **File delivery**: owner lebih suka dikasih **file lengkap yang bisa langsung dipakai**, bukan potongan diff/snippet buat digabung manual sendiri.
- **URL bersih**: routing pakai `/dashboard` dan `/login` (tanpa `.html`), di-handle manual di `server.js` (bukan Next.js/framework yang otomatis).

## Auth Flow

Ada 2 jalur, disatuin di tabel Supabase `polar_users` lewat kolom `auth_provider` (`'local'` atau `'google'`):

1. **Local (email+password)**: `POST /api/auth/register`, `POST /api/auth/login` — password di-hash pakai bcrypt (`password_hash` column)
2. **Google OAuth**: `GET /api/auth/google` (redirect ke Google) → `GET /api/auth/google/callback` (exchange code, upsert user by email)

Setelah login (jalur manapun), server sign JWT (`signToken()`) dan set httpOnly cookie `polar_token`. Middleware `authMiddleware` cek cookie ini di semua route yang butuh login.

## Database Schema (Supabase)

Tabel utama: `polar_users`, `polar_sessions`. Kolom yang ditambahin dari skema PHP lama ada di `schema.sql` — **jalankan file ini manual di Supabase SQL editor sebelum server.js pertama kali dijalanin**, karena gak ada migration tool otomatis.

Kolom penting di `polar_users`: `id, email (unique), name, avatar, coins, password_hash, auth_provider, google_id, earn_flag, created_at, updated_at`.

`polar_sessions` sekarang direlasikan via `user_id` (bukan `fingerprint` kayak versi PHP lama).

`polar_coin_logs` (tabel baru): `id, user_id, amount (+/-), reason, balance_after, created_at` — log tiap perubahan koin, dibuat otomatis lewat `logCoinTransaction()`, jangan di-insert manual dari tempat lain.

## API Routes (di server.js)

| Route | Method | Auth? | Fungsi |
|---|---|---|---|
| `/api/auth/register` | POST | - | Daftar email+password (+ verifikasi captcha) |
| `/api/auth/login` | POST | - | Login email+password (+ verifikasi captcha) |
| `/api/auth/google` | GET | - | Redirect ke Google OAuth |
| `/api/auth/google/callback` | GET | - | Terima balikan Google, upsert user, set cookie |
| `/api/auth/logout` | POST | ✓ | Clear cookie |
| `/api/me` | GET | ✓ | Data user yang login |
| `/api/coins/update` | POST | ✓ | Update coin manual |
| `/api/sessions` | GET/POST | ✓ | List / claim server bot |
| `/api/sessions/:id` | DELETE | ✓ | Hapus session |
| `/api/coins/history` | GET | ✓ | Ambil 50 riwayat transaksi koin terakhir |
| `/api/server-status` | GET | - | Cek status Phoenix & Ourin via Pterodactyl API |
| `/api/earn/start` | GET | ✓ | Set `earn_flag`, redirect ke Safelinku |
| `/api/earn/callback` | GET | ✓ | Destination Safelinku, tambah +1 coin |

## Known Gaps / Belum Selesai

- **Earn coin flow gak ada verifikasi keaslian klik** — user yang udah klik "Earn" (earn_flag jadi true) bisa langsung buka `/api/earn/callback` manual tanpa nyelesain shortlink, tetep dapet coin. **Owner udah tau soal ini dan memutuskan gak mau di-fix** (sama kayak versi PHP lama yang juga gak ada pengecekan). Jangan diubah/di-"amanin" tanpa diminta eksplisit.
- Belum ada admin panel.
- File PHP lain dari project lama (kalau ada) belum tentu udah dikonversi semua — cek dulu ke owner sebelum asumsi fitur X udah ada.

## Deploy

Target deploy: **Vercel** (bukan Pterodactyl/VPS lagi, walau `server.js` masih backward-compatible buat itu lewat `if (require.main === module) app.listen(...)`).

Environment variables diisi manual di Vercel dashboard (Project Settings → Environment Variables), **bukan** lewat file `.env` yang di-commit.

Redirect URI Google OAuth harus disesuaikan ke domain final: `https://polar.web.id/api/auth/google/callback`.
