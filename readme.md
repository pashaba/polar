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
README.md                 -> dokumentasi project
claude.md                 -> konteks project untuk Claude Code / AI assistant
package.json              -> dependencies & scripts
server.js                 -> semua backend logic + Express routes
vercel.json               -> konfigurasi deploy Vercel

public/
│
├── admin.html            -> panel admin
├── dashboard.html        -> dashboard user
├── dashboard.js          -> logic dashboard
├── login.html            -> login & register
├── privacy.html          -> kebijakan privasi
├── style.css             -> shared stylesheet
├── sw.js                 -> service worker
├── manifest.json         -> konfigurasi PWA
├── sitemap.xml           -> sitemap SEO
├── robots.txt            -> robots SEO
├── BingSiteAuth.xml      -> verifikasi Bing Webmaster
├── llms.txt              -> metadata untuk AI crawler
├── 404.html              -> halaman 404
│
├── icons/                -> favicon & icon PWA
│
├── blogs/                -> artikel SEO
│   ├── index.html
│   ├── bot-whatsapp-multi-device/
│   ├── bot-whatsapp-tanpa-vps/
│   └── cara-membuat-bot-whatsapp-gratis/
│
├── docs/                 -> dokumentasi penggunaan Polar
│   ├── index.html
│   ├── getting-started/
│   ├── account/
│   ├── dashboard/
│   ├── claim-server/
│   ├── pairing-whatsapp/
│   ├── scripts/
│   ├── polar-coin/
│   └── troubleshooting/
│
├── about/                -> halaman About
├── contact/              -> halaman Contact
├── community/            -> halaman Community
├── changelog/            -> changelog project
├── compare/              -> halaman perbandingan
├── faq/                  -> FAQ
├── guides/               -> panduan umum
├── media/                -> media / press kit
├── security/             -> security policy
├── status/               -> status layanan
└── terms/                -> Terms of Service
```
## Fitur Tambahan (di luar auth/dashboard dasar)

- **Riwayat transaksi koin**: setiap perubahan `coins` di `polar_users` (earn, claim session, manual adjust) dicatat ke tabel `polar_coin_logs` lewat helper `logCoinTransaction()` di server.js. Endpoint: `GET /api/coins/history`. **Kalau nambah cara baru buat ubah koin, WAJIB panggil `logCoinTransaction()` juga**, biar riwayatnya konsisten.
- **PWA**: `manifest.json` + `sw.js` bikin web bisa di-install ke homescreen. Service worker sengaja **skip caching buat semua path `/api/*`** — jangan diubah jadi ke-cache, karena data user (coins, sessions) harus selalu fresh.
- **Dark mode**: pakai atribut `data-theme="dark"` di `<html>`, disimpen di `localStorage` key `polar_theme`. Ada inline script di `<head>` tiap halaman (`dashboard.html`, `login.html`, `privacy.html`) yang set atribut ini **sebelum** body render, biar gak ada flash putih. Kalau nambah halaman baru, script anti-flash ini harus ikut disalin.
- **Splash progress**: progress bar splash screen di dashboard **ngikutin progres loading asli** (`setSplashProgress()` dipanggil manual di titik-titik fetch penting di `dashboard.js`), bukan animasi CSS timer. Kalau nambah fetch penting baru di init flow, sesuaikan juga persentasenya.
- **Cloudflare Turnstile (captcha)**: dipasang di form login & register. Karena `login.html` butuh inject `TURNSTILE_SITE_KEY` (public, aman ditaruh di HTML) yang nilainya dari env var, route `GET /login` di server.js **bukan** `sendFile` biasa — dia baca file, `.replace()` placeholder `{{TURNSTILE_SITE_KEY}}`, baru dikirim. Kalau ubah `login.html`, jangan hapus placeholder ini. Verifikasi token captcha di server pakai `verifyTurnstile()` — kalau `TURNSTILE_SECRET_KEY` belum di-set di env, verifikasi **di-skip otomatis** (biar gak ke-lock pas development).
- **Customer Service & Privacy Policy**: nomor WA CS (`6285715294026`) di-hardcode langsung di HTML (`dashboard.html`, `login.html`, `privacy.html`) karena itu info publik, bukan secret — sengaja gak ditaruh di env var biar gak perlu templating tambahan di semua halaman. Halaman kebijakan privasi ada di `public/privacy.html`, diakses lewat `/privacy` (clean URL, sama pola kayak `/login` & `/dashboard`).
- **Consent privacy policy wajib**: checkbox "Saya setuju Kebijakan Privasi" wajib dicentang sebelum login/register (validasi di frontend `login.html`, DAN divalidasi ulang di backend khusus pas register — field `privacyAccepted` di body request, kalau `false`/kosong balikin 400). Timestamp consent disimpen di `polar_users.privacy_accepted_at` pas register. Kalau nanti ada halaman auth baru, jangan lupa checkbox ini + validasi backend-nya.
- **Loading UX**: gak ada loading indicator sama sekali (bukan splash, bukan top progress bar, bukan skeleton, bukan spinner tombol) — sengaja dihapus semua atas permintaan owner. Tombol tetep di-`disable` selama request berlangsung (mencegah double-submit), tapi teks/icon-nya gak berubah. Konten langsung dirender begitu fetch selesai. **Jangan nambahin loading indicator lagi kecuali diminta eksplisit.**
- **Redeem code + Admin panel**: user bisa masukin kode promo di section "Redeem Kode" buat dapet coin gratis (`POST /api/redeem`). Admin (akun dengan `is_admin = true` di `polar_users`, di-set manual lewat Supabase Table Editor, gak ada UI buat toggle ini) bisa bikin/nonaktifin/hapus kode lewat `/admin` (halaman `public/admin.html`, **sengaja gak dilink dari sidebar dashboard** — cuma bisa diakses kalau tau URL-nya langsung, dan tetep di-gate lewat cek `is_admin` via `/api/me` di JS-nya). Satu user cuma bisa redeem satu kode yang sama sekali (dicegah lewat unique constraint di `polar_redeem_logs`).
- **Event/promo**: admin bikin event (judul, deskripsi, thumbnail URL, tanggal mulai/berakhir, link + label tombol) lewat tab "Event" di `/admin`. Event otomatis ilang dari `GET /api/events` begitu lewat `end_date` (dicek server-side, bukan cuma disembunyiin di frontend). Muncul di dashboard user sebagai card di section "EVENT" + banner teaser kecil di Home kalau ada event aktif.
- **Admin panel (`/admin`) sekarang punya 7 tab**: Kode Redeem, Event, Script, User (cari user by nama/email, lihat coin & auth provider, tambah/kurang coin manual lewat `POST /api/admin/users/:id/adjust-coins` — otomatis kecatet ke `polar_coin_logs` juga), **Feedback**, **Req. Script**, **Sponsor**. Tiga terakhir itu inbox submission dari user (`polar_feedback`, `polar_script_requests`, `polar_sponsor_requests`) — masing-masing punya status (`new`/`resolved`/dst), admin bisa update status atau hapus. Query admin-nya pakai PostgREST embed (`?select=*,polar_users(name,email,avatar)`) buat sekalian narik data user yang submit tanpa query terpisah.
- **Form Feedback/Request Script/Sponsor** ada di dashboard user (perlu login, gak ada versi publik/anonim). Semua submission otomatis kebawa `user_id` dari JWT, gak perlu isi nama/email manual (kecuali Sponsor yang tetep minta kontak eksplisit karena bisa aja beda dari akun Polar-nya, misal WA bisnis).
- **Tool cek UUID server**: di form tambah/edit Script (tab Script) ada tombol "Cek Server & UUID dari Panel" — manggil `POST /api/admin/check-uuid` (server-side, ngehit endpoint `{panel}/api/client` Pterodactyl pakai API key yang diisi di form), nampilin semua server yang keakses beserta UUID-nya, admin tinggal klik "Pakai" buat auto-isi field UUID. Ini butuh lewat backend karena Pterodactyl biasanya nolak request cross-origin langsung dari browser (CORS).

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

Kolom penting di `polar_users`: `id, email (unique), name, avatar, coins, password_hash, auth_provider, google_id, earn_flag, created_at, updated_at, privacy_accepted_at`.

`polar_sessions` sekarang direlasikan via `user_id` (bukan `fingerprint` kayak versi PHP lama). Kolom `script` isinya salah satu dari: `phoenix_md`, `ourin_md`, `ourin_md_deluxe`.

**Server status monitoring**: dulu 3 script (Phoenix/Ourin/Ourin Deluxe) hardcode di env var, **sekarang full dinamis dari tabel `polar_scripts`**, dikelola admin lewat tab "Script" di `/admin`. Server.js gak lagi punya `PHOENIX_PANEL`/`OURIN_PANEL`/dst di env — semua panel URL, API key, dan UUID Pterodactyl disimpen di database. `GET /api/scripts` (dipanggil dashboard buat render pilihan script di form Claim) cuma balikin field aman (`script_key`, `display_name`, `subtitle`, `icon`) — TIDAK PERNAH balikin `panel_url`/`api_key`/`server_uuid` ke client biasa, itu cuma kebuka lewat `/api/admin/scripts` yang di-gate `adminMiddleware`. `GET /api/server-status` (publik, dipanggil buat halaman Status) query semua script aktif dari DB, cek status live ke tiap panel-nya, balikin array. Icon di kolom `icon` bisa berupa class Font Awesome (`fa-robot`) atau URL gambar (mulai dengan `http`) — dirender beda di frontend (`renderScriptIcon()` di `dashboard.js`, ada juga versi mirip di `admin.html`).

**Kalau nambah/ubah/hapus script bot, HARUS lewat admin panel** (`/admin` → tab Script), bukan edit kode atau env var lagi. `script_key` yang di-generate harus konsisten dipakai sebagai value di `polar_sessions.script`.

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
| `/api/scripts` | GET | ✓ | Daftar script aktif buat pilihan di form Claim (safe fields aja) |
| `/api/server-status` | GET | - | Cek status live semua script aktif dari database |
| `/api/earn/start` | GET | ✓ | Set `earn_flag`, redirect ke Safelinku |
| `/api/earn/callback` | GET | ✓ | Destination Safelinku, tambah +1 coin |
| `/api/redeem` | POST | ✓ | Tukar kode promo jadi Polar Coin |
| `/api/events` | GET | ✓ | Daftar event aktif & belum expired |
| `/api/admin/*` | GET/POST/PATCH/DELETE | ✓ + admin | Kelola kode redeem, event, script, user (lihat `server.js` bagian ADMIN) |

## Known Gaps / Belum Selesai

- **Earn coin flow gak ada verifikasi keaslian klik** — user yang udah klik "Earn" (earn_flag jadi true) bisa langsung buka `/api/earn/callback` manual tanpa nyelesain shortlink, tetep dapet coin. **Owner udah tau soal ini dan memutuskan gak mau di-fix** (sama kayak versi PHP lama yang juga gak ada pengecekan). Jangan diubah/di-"amanin" tanpa diminta eksplisit.
- Belum ada admin panel.
- File PHP lain dari project lama (kalau ada) belum tentu udah dikonversi semua — cek dulu ke owner sebelum asumsi fitur X udah ada.

## Deploy

Target deploy: **Vercel** (bukan Pterodactyl/VPS lagi, walau `server.js` masih backward-compatible buat itu lewat `if (require.main === module) app.listen(...)`).

Environment variables diisi manual di Vercel dashboard (Project Settings → Environment Variables), **bukan** lewat file `.env` yang di-commit.

Redirect URI Google OAuth harus disesuaikan ke domain final: `https://polar.web.id/api/auth/google/callback`.
