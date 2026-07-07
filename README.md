# Polar.web.id — versi Node.js/Express

## Struktur
```
polarid-js/
├── server.js          -> backend Express (auth, coins, sessions, status)
├── vercel.json         -> config deploy ke Vercel
├── schema.sql          -> jalankan di Supabase SQL editor dulu
├── package.json
├── .env.example        -> copy jadi .env, isi kredensial asli (buat testing lokal)
├── .gitignore
└── public/
    ├── login.html       -> halaman login & register (email/password + Google)
    ├── dashboard.html    -> dashboard (statis, data diisi via JS)
    ├── dashboard.js      -> semua logic dashboard (fetch ke /api/...)
    └── style.css         -> CSS neobrutalism (dipisah biar rapi)
```

## Test lokal dulu (opsional, sebelum deploy)
```bash
npm install
cp .env.example .env   # isi SUPABASE_URL, SUPABASE_KEY, JWT_SECRET, dll
npm start
```
Buka `http://localhost:3000/dashboard`.

## Deploy ke Vercel

### 1. Push ke GitHub
```bash
git init
git add .
git commit -m "Polar.web.id - Node.js version"
git remote add origin https://github.com/username/polarid-js.git
git push -u origin main
```

### 2. Import project di Vercel
1. Buka [vercel.com](https://vercel.com) → **Add New Project** → pilih repo GitHub kamu
2. Framework preset biarin **Other** (jangan Next.js dll)
3. **JANGAN** upload file `.env` — semua secret diisi manual di:
   **Project Settings → Environment Variables**, masukin satu-satu:
   ```
   SUPABASE_URL
   SUPABASE_KEY
   JWT_SECRET
   GOOGLE_CLIENT_ID
   GOOGLE_CLIENT_SECRET
   GOOGLE_REDIRECT_URI     <- isi https://polar.web.id/api/auth/google/callback (domain final)
   PTERO_PANEL
   PHOENIX_API_KEY
   PHOENIX_UUID
   OURIN_API_KEY
   OURIN_UUID
   SAFELINK_URL
   SAFELINKU_API_KEY
   MAX_SESSIONS
   APP_URL                 <- isi https://polar.web.id
   ```
4. Klik **Deploy**. Vercel bakal ngasih URL sementara kayak `polarid-js.vercel.app` — cek dulu jalan normal apa enggak sebelum sambungin domain asli.

### 3. Sambungin domain `polar.web.id`
1. Di project Vercel → **Settings → Domains** → masukin `polar.web.id` → **Add**
2. Vercel bakal kasih tau record DNS yang perlu ditambahin di tempat kamu beli domain (Niagahoster/Namecheap/dll), biasanya salah satu dari ini:
   - **A Record** → `76.76.21.21` (arahin ke `@` / root domain)
   - atau **CNAME** → `cname.vercel-dns.com` (kalau pakai subdomain kayak `www` atau custom)
3. Tunggu propagasi DNS (biasanya 5–60 menit, kadang sampai 24 jam)
4. SSL/HTTPS otomatis di-generate Vercel begitu domain terverifikasi — gak perlu setup Certbot manual kayak di VPS/Pterodactyl

### 4. Update Google OAuth
Di [Google Cloud Console](https://console.cloud.google.com) → Credentials → OAuth Client kamu → **Authorized redirect URIs**, tambahin:
```
https://polar.web.id/api/auth/google/callback
```

### Catatan penting soal Vercel
- Ini **serverless**, jadi `server.js` gak "nyala terus" kayak di VPS/Pterodactyl — tiap request nge-spawn function baru. Gak masalah karena auth pakai JWT cookie (stateless), bukan in-memory session.
- File `.env` lokal tetap dipakai kalau kamu test pakai `vercel dev` di komputer sendiri, tapi **di production settings-nya harus lewat dashboard Vercel**, bukan upload file `.env`.
- Kalau mau redeploy manual: `vercel --prod` (butuh install `npm i -g vercel` dan `vercel login` dulu).


## Yang berubah dari versi PHP
- **Auth dipisah jadi 2 jalur**: `auth_provider = 'local'` (email+password, bcrypt) dan `auth_provider = 'google'` (OAuth). Keduanya nyimpen ke tabel `polar_users` yang sama, dibedain lewat kolom `auth_provider`.
- Session pakai **JWT di httpOnly cookie** (`polar_token`), ganti dari PHP `$_SESSION`.
- Fingerprint-based session diganti jadi **user_id** (lebih reliable, ga kebawa hilang pas ganti network/browser).
- Semua endpoint ada di `server.js`: `/api/auth/register`, `/api/auth/login`, `/api/auth/google`, `/api/auth/google/callback`, `/api/auth/logout`, `/api/me`, `/api/coins/update`, `/api/sessions` (GET/POST/DELETE), `/api/server-status`.

## Update: earn coin, config, logout — udah masuk
- `update-coin.php` & `get-coin.php` (session-based) diganti jadi `/api/coins/update` & `/api/me` (langsung baca dari Supabase, ga pake session `$_SESSION['user_coins']` lagi).
- `earn-coin.php` diganti jadi 2 route:
  - `GET /api/earn/start` -> cek `earn_flag`, kalau belum aktif set `true` di Supabase lalu redirect ke `SAFELINK_URL`.
  - `GET /api/earn/callback` -> **PENTING: set URL ini (`https://domainkamu.com/api/earn/callback`) sebagai destination URL di dashboard Safelinku**, bukan `dashboard.html` langsung. Baru di sini coin di-+1 dan `earn_flag` di-reset, lalu redirect ke `dashboard.html?earn=success&coins=X`.
  - Kalau Safelinku kamu ga bisa verifikasi keaslian klik (cuma redirect polos), flow ini masih bisa "dicurangi" user yang langsung buka `/api/earn/callback` tanpa nyelesain shortlink — sama persis kayak versi PHP lama yang juga "tidak ada cek/fallback apapun". Kalau mau lebih aman, perlu pakai SafelinkU API (`SAFELINKU_API_KEY`) buat verifikasi token, tapi itu butuh dokumentasi API SafelinkU-nya dulu.
- `logout.php` -> `POST /api/auth/logout` (clear cookie JWT).
- `config.php` -> semua constant-nya pindah ke `.env` (`BOT_NUMBER`, `CS_NUMBER`, `SAFELINK_URL`, `SAFELINKU_API_KEY`, `MAX_SESSIONS`, dll). `MAX_SESSIONS` dipakai buat batas slot per user (bukan per fingerprint lagi).

## Yang belum
- Kalau ada file lain (misalnya halaman redeem token, admin panel, atau webhook SafelinkU), kirim aja nanti.

## SQL yang perlu dijalanin
Jalankan `schema.sql` di Supabase SQL editor **sebelum** deploy server.js, karena kolom `password_hash`, `auth_provider`, dan `user_id` di `polar_sessions` belum ada di skema lama.
