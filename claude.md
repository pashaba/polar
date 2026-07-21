# CLAUDE.md

Konteks project ini buat Claude Code (atau AI assistant lain) yang bakal lanjut ngerjain repo ini. **Baca file ini dulu sebelum ngoding apapun** — banyak keputusan desain yang gak intuitif kalau cuma baca kode-nya doang.

---

## 1. Tentang Project

**Polar.web.id** — platform SaaS hosting bot WhatsApp gratis. User claim server bot (Phoenix MD, Ourin, dll — script-nya dinamis, lihat bagian 6) pakai sistem koin virtual ("Polar Coin"). Koin didapet dari: nonton shortlink (Safelinku), redeem kode promo, ajak teman (referral), atau di-adjust manual sama admin.

Project ini hasil migrasi total dari PHP (procedural, session-based, single file) ke Node.js/Express modern, dideploy di **Vercel** (serverless). Ini bukan lagi "port PHP ke JS" — udah banyak fitur baru di luar cakupan versi PHP aslinya.

---

## 2. Tech Stack

| Layer | Teknologi | Catatan |
|---|---|---|
| Backend | Node.js + Express | Satu file `server.js`, semua route di situ. Gak dipecah jadi router terpisah — sengaja, biar gampang di-grep. |
| Auth | JWT di httpOnly cookie (`polar_token`) | Bukan session server-side, karena Vercel serverless stateless per-request. |
| Database | Supabase (Postgres) via REST API `/rest/v1/` | Pakai `fetch()` manual lewat helper `sb()`, **BUKAN** `@supabase/supabase-js` SDK. |
| Frontend | HTML statis + vanilla JS | Gak ada framework (React/Vue). Semua data diisi lewat `fetch()` ke `/api/*` dari `dashboard.js` / inline script di `login.html`. |
| Styling | Neobrutalism | Border tebal hitam (`--border-thick`), shadow offset kotak, warna orange `#ff5e00` + gold `#fbbf24`. CSS di `public/style.css`, dipakai bareng di semua halaman. |
| Deploy | Vercel (serverless function) | Lihat `vercel.json`. |

---

## 3. Struktur File

```
server.js              -> SEMUA backend logic & route API (satu file besar, disengaja)
vercel.json             -> config Vercel (includeFiles: public/** wajib ada, karena express.static baca fs dinamis)
schema.sql               -> ALTER + CREATE TABLE buat Supabase. Jalanin manual di SQL editor. Aman dijalanin berkali-kali (semua pakai IF NOT EXISTS / idempotent check)
.env.example              -> daftar env var. Diisi di Vercel dashboard buat production, BUKAN file .env yang di-commit
package.json, .gitignore

public/
  login.html               -> Login + Register (2 card, toggle via JS). PWA meta, anti-flash dark mode, Turnstile captcha, checkbox consent privacy, i18n penuh, capture referral code dari URL
  dashboard.html            -> Dashboard utama. SEMUA section (home/event/claim/status/sessions/history/redeem/referral/feedback/requestscript/sponsor/profile) ada di 1 file, ditoggle via class `.active`. i18n penuh di bagian statis
  dashboard.js              -> Semua logic dashboard: fetch ke /api/*, render dinamis, dark mode, tutorial spotlight
  i18n.js                    -> Dictionary terjemahan ID/EN + logic apply/toggle bahasa
  admin.html                 -> Panel admin. TIDAK dilink dari dashboard (akses cuma lewat URL /admin langsung). 8 tab: Kode Redeem, Event, Script, User, Feedback, Req. Script, Sponsor, Produk
  store.html                  -> Halaman toko produk (/store), PUBLIK (gak perlu login). Ada link "Shop" di sidebar dashboard (buka tab baru), tapi halamannya sendiri berdiri sendiri, gak jadi section di dalam dashboard.html
  privacy.html                -> Kebijakan privasi (/privacy)
  404.html                     -> Halaman 404 custom
  style.css                     -> Shared CSS neobrutalism + dark mode variables ([data-theme="dark"])
  manifest.json, sw.js            -> PWA (installable, service worker cache-first buat asset statis, network-only buat /api/*)
  sitemap.xml, robots.txt          -> SEO
  icons/                             -> Icon PWA (placeholder, ganti kalau ada logo asli)
```

**Gak ada file HTML lain di luar yang disebut di atas** (contoh: gak ada `blogs/` atau `docs/` kecuali eksplisit diminta dan dikonfirmasi udah dibikin — cek dulu ke owner, jangan asumsi).

---

## 4. Konvensi & Aturan Main (WAJIB DIIKUTIN)

1. **Bahasa**: komentar kode & komunikasi ke owner pakai **Bahasa Indonesia informal**, campur istilah teknis Inggris secukupnya. Jangan diubah ke Bahasa Inggris kecuali diminta eksplisit.
2. **File delivery**: owner mau dikasih **file lengkap yang langsung bisa dipakai**, bukan potongan diff/snippet yang harus digabung manual.
3. **Environment variables**: semua secret (API key, DB credential) lewat `.env` / Vercel Environment Variables. **Jangan hardcode API key/secret ke dalam `server.js`** — beda dari kebiasaan owner di script bot lamanya (PHP), di project ini polanya udah konsisten pakai env var, pertahankan.
4. **URL bersih**: routing pakai `/dashboard`, `/login`, `/admin`, `/privacy` (tanpa `.html`), di-handle manual di `server.js` (bukan otomatis dari framework). Kalau nambah halaman publik baru, ikutin pola ini.
5. **Konfigurasi script bot** (Phoenix, Ourin, dll — panel URL, API key, UUID Pterodactyl) **HARUS lewat admin panel** (`/admin` → tab Script), **BUKAN** env var atau edit kode. Ini udah diubah dari versi awal yang sempet hardcode di env — jangan dibalikin ke pola lama.
6. **Loading indicator**: default-nya **gak ada** — bukan splash screen, bukan skeleton loader, bukan progress bar, bukan spinner tombol. Ini keputusan eksplisit owner. Tombol boleh di-`disable` selama request (mencegah double-submit), tapi teks/icon-nya gak berubah jadi spinner. **Pengecualian**: `#scriptSelectGrid` (form Claim) dan `#statusCardsContainer` (halaman Status) punya spinner ikon (`fa-spinner fa-spin`) sebagai initial state HTML, ke-replace otomatis pas `renderScriptSelect()`/`renderStatusCards()` jalan — ini ditambahin eksplisit atas permintaan owner karena dua elemen ini sempet keliatan kosong pas nunggu fetch `/api/scripts`/`/api/server-status`. Jangan tambahin loading indicator lain di luar dua tempat ini tanpa diminta eksplisit.
7. **Earn Coin flow (Safelinku) sengaja gak ada verifikasi keaslian klik** — begitu user klik "Earn", flag `earn_flag` jadi `true` dan dia bisa langsung buka `/api/earn/callback` manual dapat coin tanpa beneran nyelesain shortlink-nya. **Owner tau soal ini dan MEMUTUSKAN GAK MAU DI-FIX** (sama kayak versi PHP lama). **Jangan "amanin" atau ubah behavior ini tanpa diminta eksplisit** — ini bukan bug, ini keputusan produk.
8. **Riwayat koin wajib konsisten**: kalau nambah cara baru buat ubah `coins` di `polar_users`, WAJIB panggil `logCoinTransaction(userId, amount, reason, balanceAfter)` juga, biar kecatet di `polar_coin_logs`. Jangan update kolom `coins` langsung tanpa logging.
9. **i18n**: kalau nambah teks statis baru di `login.html` atau `dashboard.html`, WAJIB tambah entry di **kedua** object `POLAR_I18N.id` dan `POLAR_I18N.en` (`public/i18n.js`), pakai atribut `data-i18n="key"` (textContent) atau `data-i18n-placeholder="key"` (placeholder input). Jangan hardcode teks langsung di HTML kalau halamannya udah kepasang i18n.

---

## 5. Auth Flow

Dua jalur, disatuin di tabel `polar_users` lewat kolom `auth_provider` (`'local'` atau `'google'`):

1. **Local (email+password)**: `POST /api/auth/register`, `POST /api/auth/login`. Password di-hash bcrypt. Wajib centang consent privacy policy (`privacyAccepted`) & lolos captcha Turnstile.
2. **Google OAuth**: `GET /api/auth/google` → redirect Google → `GET /api/auth/google/callback` → exchange code, upsert user by email.

Abis login (jalur manapun), server sign JWT (`signToken()`) → set httpOnly cookie `polar_token` (7 hari). Middleware `authMiddleware` cek cookie ini di semua route yang butuh login. Middleware `adminMiddleware` (dipasang SETELAH `authMiddleware`) cek kolom `is_admin` di `polar_users` buat route khusus admin.

**Jadi admin**: gak ada endpoint/UI buat toggle `is_admin` — sengaja, biar gak ada celah privilege escalation. Di-set manual lewat Supabase Table Editor.

---

## 6. Sistem-Sistem Utama

### Script Bot (dinamis, bukan hardcode)
Dulu Phoenix/Ourin/dll hardcode di env var. **Sekarang full dinamis dari tabel `polar_scripts`**, dikelola admin lewat `/admin` → tab Script (nama, subtitle, icon, panel URL, API key, UUID).
- `GET /api/scripts` (auth biasa) → cuma balikin field aman (`script_key`, `display_name`, `subtitle`, `icon`). **TIDAK PERNAH** balikin `panel_url`/`api_key`/`server_uuid` ke client biasa.
- `GET /api/server-status` (publik) → cek status live tiap script ke panel Pterodactyl-nya via `checkServer()`, yang pakai `AbortController` timeout 8 detik (WAJIB ada, jangan dihapus — kalau panel lemot/gak respon, tanpa timeout ini `/api/server-status` bisa nyangkut lama dan nge-block penentuan script available).
- Icon bisa Font Awesome class (`fa-robot`) atau URL gambar (mulai `http`) — dirender beda di `renderScriptIcon()` (dashboard.js & admin.html).
- Ada tool "Cek Server & UUID dari Panel" di admin (`POST /api/admin/check-uuid`) buat bantu isi UUID tanpa buka panel Pterodactyl manual.

### Sessions (claim server bot)
`polar_sessions` direlasikan via `user_id` (bukan `fingerprint` kayak versi PHP lama). Validasi sebelum claim (`POST /api/sessions`): script harus online, nomor WA belum kepake di session lain manapun. Validasi ini jalan SEBELUM koin dipotong.

### Riwayat Koin
Tabel `polar_coin_logs` (`user_id, amount, reason, balance_after, created_at`), dicatat otomatis lewat `logCoinTransaction()`. Lihat aturan #8 di atas.

### Redeem Code
Admin bikin kode (`/admin` → tab Kode Redeem: coin value, max uses, expiry). User tukar lewat `POST /api/redeem`. Satu user cuma bisa redeem satu kode yang sama sekali (unique constraint di `polar_redeem_logs`).

### Referral
Tiap user punya `referral_code` unik (format `POLAR<id>`, di-assign otomatis pas akun baru dibuat via `assignReferralCode()`). Link: `/login?ref=KODE`.
- Alur lokal: `login.html` nangkep `?ref=` dari URL → `localStorage` → dikirim sebagai `referralCode` pas register.
- Alur Google: ref code dikirim lewat parameter `state` OAuth (Google balikin `state` apa adanya di callback).
- Bonus cuma diproses buat **user yang BARU dibuat** (bukan login ulang), lewat `applyReferral()`: pengundang +5 koin, yang diundang +2 koin. Konstanta di `REFERRAL_BONUS_REFERRER` / `REFERRAL_BONUS_NEW_USER` (server.js).

### Event / Promo
Admin bikin event (judul, deskripsi, thumbnail URL, tanggal mulai/berakhir, link+label tombol) lewat tab Event. `GET /api/events` otomatis exclude event yang udah lewat `end_date` (dicek server-side). Muncul di dashboard sebagai card + banner teaser di Home.

### Feedback / Request Script / Sponsor
Tiga form terpisah di dashboard user (`POST /api/feedback`, `/api/script-requests`, `/api/sponsor`), semua butuh login (gak ada versi publik/anonim). Submission otomatis kebawa `user_id` dari JWT. Admin liat & kelola statusnya lewat 3 tab terakhir di `/admin`. Query admin-nya pakai PostgREST embed (`?select=*,polar_users(name,email,avatar)`) buat sekalian narik data user tanpa query terpisah.

### Toko Produk (`/store`)
Halaman **publik berdiri sendiri** (gak butuh login, bukan section di dalam `dashboard.html`), tapi ada link "Shop" di sidebar dashboard (buka tab baru ke `/store`). Nampilin katalog produk (`polar_products`: judul, deskripsi, harga, gambar, kategori), ada filter kategori (tab horizontal scroll). Sistem order bukan checkout beneran — tombol "Pesan" tiap produk generate link `wa.me/6285715294026?text=...` yang udah prefilled pesan otomatis (nama produk + harga), buka WhatsApp buat lanjut nego manual. `GET /api/products` (publik) cuma balikin produk `active=true`. Admin kelola CRUD produk lewat tab "Produk" di `/admin` (8 tab total sekarang). Konsisten pola sama Script/Event: field `image_url` nerima link gambar publik (bukan upload file).

### Admin Panel (`/admin`)
8 tab: **Kode Redeem**, **Event**, **Script**, **User** (cari by nama/email, tambah/kurang coin manual via `POST /api/admin/users/:id/adjust-coins`), **Feedback**, **Req. Script**, **Sponsor**, **Produk**. Halaman ini **sengaja gak dilink dari sidebar dashboard** — cuma kebuka kalau tau URL `/admin` langsung, dan tetep di-gate `is_admin` check di JS-nya (`checkAdminAccess()`) + di setiap endpoint backend-nya (`adminMiddleware`).

---

## 7. Frontend Conventions

- **Multi-bahasa (i18n)**: auto-detect dari `navigator.language` browser visitor (default EN kalau bukan `id-*`), bisa di-override manual (tombol toggle, disimpen `localStorage` key `polar_lang`). **Diterapkan penuh** di `login.html` dan bagian statis `dashboard.html` (sidebar, judul section, label, tombol). **BELUM** diterapkan di: konten dinamis hasil render JS (list session, riwayat koin, event card — representasi data mentah, bukan UI chrome), dan di `privacy.html`/`404.html`/`admin.html` (admin panel sengaja dibiarin Indonesia aja, cuma owner yang pakai).
- **Dark mode**: atribut `data-theme="dark"` di `<html>`, `localStorage` key `polar_theme`. **Default selalu tema terang (putih)** — TIDAK auto-detect dari `prefers-color-scheme` sistem, cuma pindah ke dark kalau user eksplisit klik toggle. Tiap halaman ada inline script anti-flash di `<head>` yang cek `localStorage` dan set atribut SEBELUM body render (biar gak ada flash). Kalau nambah halaman baru, script ini wajib disalin juga — dan JANGAN tambah balik logic `matchMedia('(prefers-color-scheme: dark)')`, itu udah sengaja dihapus.
- **PWA**: `manifest.json` + `sw.js`. Service worker **skip caching semua path `/api/*`** — jangan diubah, karena data user harus selalu fresh.
- **Tutorial spotlight**: tombol "Mulai Tutorial" di Home + shortcut sidebar. Highlight elemen UI satu-satu pakai spotlight ring + arrow + card, target ditandain atribut `data-tut="..."` di HTML, logic-nya di `dashboard.js` (`TUTORIAL_STEPS`, `getTutorialSidebarSteps()`, `startTutorial()`). Kalau nambah nav-link baru yang mau ikut di-highlight, tambah `data-tut` di elemennya + entry baru di `getTutorialSidebarSteps()`.
- **Captcha (Cloudflare Turnstile)**: dipasang di form login & register. `login.html` butuh inject `TURNSTILE_SITE_KEY` dari env var, jadi route `GET /login` di server.js **bukan** `sendFile` biasa — baca file, `.replace()` placeholder `{{TURNSTILE_SITE_KEY}}`, baru dikirim. Jangan hapus placeholder ini kalau edit `login.html`. Verifikasi di `verifyTurnstile()` — kalau `TURNSTILE_SECRET_KEY` belum di-set, verifikasi di-skip otomatis (biar gak ke-lock pas development).
- **Customer Service & Privacy**: nomor WA CS di-hardcode di HTML (bukan env var, karena itu info publik) di beberapa halaman (dashboard, login, privacy, 404).

---

## 8. Database Schema (Supabase)

Jalankan `schema.sql` manual di SQL Editor Supabase — idempotent, aman dijalanin berkali-kali kapan pun ada update.

Tabel utama:
- **`polar_users`** — `id, email(unique), name, avatar, coins, password_hash, auth_provider, google_id, is_admin, earn_flag, referral_code, referred_by, privacy_accepted_at, created_at, updated_at`
- **`polar_sessions`** — bot yang diclaim, relasi via `user_id`. Kolom `script` isinya `script_key` dari `polar_scripts`.
- **`polar_scripts`** — config script bot (lihat bagian 6)
- **`polar_coin_logs`** — riwayat transaksi koin
- **`polar_redeem_codes`** + **`polar_redeem_logs`** — sistem redeem code
- **`polar_events`** — event/promo
- **`polar_feedback`**, **`polar_script_requests`**, **`polar_sponsor_requests`** — inbox submission user, masing-masing punya kolom `status`
- **`polar_products`** — katalog produk buat halaman `/store`: `title, description, price, image_url, category, active, sort_order`

---

## 9. API Routes (server.js)

| Route | Method | Auth | Fungsi |
|---|---|---|---|
| `/api/auth/register` | POST | - | Daftar email+password (+ captcha + referral) |
| `/api/auth/login` | POST | - | Login email+password (+ captcha) |
| `/api/auth/google` | GET | - | Redirect ke Google OAuth (+ referral via `state`) |
| `/api/auth/google/callback` | GET | - | Terima balikan Google, upsert user |
| `/api/auth/logout` | POST | ✓ | Clear cookie |
| `/api/me` | GET | ✓ | Data user yang login |
| `/api/coins/update` | POST | ✓ | Update coin manual |
| `/api/coins/history` | GET | ✓ | 50 riwayat transaksi koin terakhir |
| `/api/sessions` | GET/POST | ✓ | List / claim server bot |
| `/api/sessions/:id` | DELETE | ✓ | Hapus session |
| `/api/scripts` | GET | ✓ | Script aktif buat form Claim (safe fields) |
| `/api/server-status` | GET | - | Status live semua script |
| `/api/earn/start` / `/api/earn/callback` | GET | ✓ | Alur earn coin via Safelinku (lihat aturan #7) |
| `/api/redeem` | POST | ✓ | Tukar kode promo jadi coin |
| `/api/events` | GET | ✓ | Event aktif & belum expired |
| `/api/referral` | GET | ✓ | Link referral + statistik user |
| `/api/feedback` | POST | ✓ | Kirim feedback |
| `/api/script-requests` | POST | ✓ | Request script baru |
| `/api/sponsor` | POST | ✓ | Pengajuan sponsor |
| `/api/products` | GET | - | Daftar produk aktif buat halaman /store (publik) |
| `/api/admin/*` | GET/POST/PATCH/DELETE | ✓ + admin | Semua fungsi admin panel (lihat bagian 6) |

---

## 10. Deploy

Target: **Vercel** (serverless). `server.js` masih backward-compatible buat VPS/Pterodactyl lewat `if (require.main === module) app.listen(...)`, tapi itu bukan target utama lagi.

- Environment variables diisi manual di **Vercel dashboard** (Project Settings → Environment Variables), **BUKAN** file `.env` yang di-commit.
- Redirect URI Google OAuth: `https://polar.web.id/api/auth/google/callback` (harus sama persis di Google Cloud Console).
- Abis ubah env var, **wajib redeploy manual** — Vercel gak auto-apply env var baru ke deployment yang udah jalan.
