require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const indoNameGenerator = require('indo-name-generator');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: process.env.APP_URL || true, credentials: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// CLEAN URL ROUTES (gak perlu .html)
// ============================================================

// Cek cepat status login dari cookie, dipakai buat nentuin redirect / login vs dashboard
function isAuthenticated(req) {
  const token = req.cookies?.polar_token;
  if (!token) return false;
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

// Root: udah login -> langsung ke dashboard. Belum login -> ke halaman login.
app.get('/', (req, res) => res.redirect(isAuthenticated(req) ? '/dashboard' : '/login'));

app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// /login: kalau udah login, gak perlu liat form login lagi -> langsung ke dashboard
// Kalau belum, pakai templating manual buat inject TURNSTILE_SITE_KEY (site key aman ditaruh di HTML, cuma secret key yang rahasia)
app.get('/login', (req, res) => {
  if (isAuthenticated(req)) return res.redirect('/dashboard');
  let html = fs.readFileSync(path.join(__dirname, 'public', 'login.html'), 'utf8');
  html = html.replace(/{{TURNSTILE_SITE_KEY}}/g, process.env.TURNSTILE_SITE_KEY || '');
  res.send(html);
});

app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));

app.get('/privacy.html', (req, res) => res.redirect(301, '/privacy'));

app.get('/store', (req, res) => res.sendFile(path.join(__dirname, 'public', 'store.html')));

app.get('/store.html', (req, res) => res.redirect(301, '/store'));

app.get('/subdomain', (req, res) => res.sendFile(path.join(__dirname, 'public', 'subdomain.html')));

app.get('/subdomain.html', (req, res) => res.redirect(301, '/subdomain'));

app.get('/name-generator', (req, res) => res.sendFile(path.join(__dirname, 'public', 'name-generator.html')));

app.get('/name-generator.html', (req, res) => res.redirect(301, '/name-generator'));

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Redirect permanen kalau ada yang masih akses .html langsung
app.get('/dashboard.html', (req, res) => res.redirect(301, '/dashboard'));
app.get('/login.html', (req, res) => res.redirect(301, '/login'));

const {
  SUPABASE_URL,
  SUPABASE_KEY,
  JWT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  SAFELINK_URL,
  APP_URL
} = process.env;

// Catatan: konfigurasi script bot (Phoenix, Ourin, dll) SEKARANG di database (tabel polar_scripts),
// dikelola lewat admin panel (/admin), bukan lewat env var lagi kayak sebelumnya.

const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 10);
const REFERRAL_BONUS_REFERRER = 5;   // koin buat yang ngundang
const REFERRAL_BONUS_NEW_USER = 2;   // koin bonus buat yang baru daftar lewat link referral

// ============================================================
// SUPABASE HELPER
// ============================================================
async function sb(method, endpoint, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}

async function getUserByEmail(email) {
  const rows = await sb('GET', `polar_users?email=eq.${encodeURIComponent(email)}&select=*`);
  return rows[0] || null;
}

async function getUserById(id) {
  const rows = await sb('GET', `polar_users?id=eq.${id}&select=*`);
  return rows[0] || null;
}

function sanitizeUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatar: u.avatar,
    coins: u.coins,
    auth_provider: u.auth_provider,
    is_admin: !!u.is_admin
  };
}

async function logCoinTransaction(userId, amount, reason, balanceAfter) {
  try {
    await sb('POST', 'polar_coin_logs', {
      user_id: userId,
      amount,
      reason,
      balance_after: balanceAfter,
      created_at: Date.now()
    });
  } catch (e) {
    console.error('Gagal catat riwayat koin:', e.message);
  }
}

// ============================================================
// CLOUDFLARE TURNSTILE (captcha)
// ============================================================
async function verifyTurnstile(token, ip) {
  // Kalau secret key belum di-setup di env, jangan block login/register (biar gak ke-lock pas dev/testing)
  if (!process.env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;

  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip || ''
      })
    });
    const data = await r.json();
    return data.success === true;
  } catch (e) {
    console.error('Turnstile verify error:', e.message);
    return false;
  }
}

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
}

// ============================================================
// REFERRAL
// ============================================================

// Dipanggil sekali abis user baru ke-insert, buat kasih kode referral unik (format: POLAR<id>, dijamin unik karena id-nya unik)
async function assignReferralCode(user) {
  try {
    const code = 'POLAR' + user.id;
    const [updated] = await sb('PATCH', `polar_users?id=eq.${user.id}`, { referral_code: code });
    return updated || { ...user, referral_code: code };
  } catch (e) {
    console.error('Gagal assign referral code:', e.message);
    return user;
  }
}

// Dipanggil abis user baru ke-insert (baik lokal maupun Google), kalau dia daftar lewat link referral orang lain
async function applyReferral(newUser, refCode) {
  if (!refCode) return;
  try {
    const rows = await sb('GET', `polar_users?referral_code=eq.${encodeURIComponent(refCode)}&select=*`);
    const referrer = rows[0];
    if (!referrer || referrer.id === newUser.id) return; // kode gak valid, atau nyoba refer diri sendiri

    // Tandain siapa yang ngundang
    await sb('PATCH', `polar_users?id=eq.${newUser.id}`, { referred_by: referrer.id });

    // Bonus buat yang ngundang
    const referrerNewCoins = (referrer.coins || 0) + REFERRAL_BONUS_REFERRER;
    await sb('PATCH', `polar_users?id=eq.${referrer.id}`, { coins: referrerNewCoins });
    await logCoinTransaction(referrer.id, REFERRAL_BONUS_REFERRER, `referral_bonus:${newUser.email}`, referrerNewCoins);

    // Bonus buat yang baru daftar
    const newUserCoins = (newUser.coins || 0) + REFERRAL_BONUS_NEW_USER;
    await sb('PATCH', `polar_users?id=eq.${newUser.id}`, { coins: newUserCoins });
    await logCoinTransaction(newUser.id, REFERRAL_BONUS_NEW_USER, 'referral_signup_bonus', newUserCoins);
  } catch (e) {
    console.error('Gagal proses referral:', e.message);
  }
}

// ============================================================
// AUTH HELPERS (JWT via httpOnly cookie)
// ============================================================
function signToken(user) {
  return jwt.sign({ uid: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}

function setAuthCookie(res, token) {
  res.cookie('polar_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function authMiddleware(req, res, next) {
  const token = req.cookies?.polar_token;
  if (!token) return res.status(401).json({ success: false, message: 'Belum login' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Session tidak valid, silakan login ulang' });
  }
}

async function adminMiddleware(req, res, next) {
  try {
    const user = await getUserById(req.user.uid);
    if (!user || !user.is_admin) {
      return res.status(403).json({ success: false, message: 'Akses ditolak, khusus admin' });
    }
    next();
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

// ============================================================
// REGISTER — email + password
// ============================================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, captchaToken, privacyAccepted, referralCode } = req.body;

    const captchaOk = await verifyTurnstile(captchaToken, getClientIp(req));
    if (!captchaOk) {
      return res.status(400).json({ success: false, message: 'Verifikasi captcha gagal, coba lagi.' });
    }

    if (!privacyAccepted) {
      return res.status(400).json({ success: false, message: 'Kamu harus setuju sama Kebijakan Privasi dulu.' });
    }

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email dan password wajib diisi' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password minimal 6 karakter' });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email sudah terdaftar, silakan login' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const displayName = name || email.split('@')[0];
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=FF6B00&color=fff`;

    const [user] = await sb('POST', 'polar_users', {
      email,
      name: displayName,
      avatar,
      password_hash,
      auth_provider: 'local',
      coins: 0,
      created_at: Date.now(),
      privacy_accepted_at: Date.now()
    });

    await assignReferralCode(user);
    await applyReferral(user, referralCode);

    // Ambil ulang data user (coins-nya mungkin udah ke-update kalau ada bonus referral)
    const freshUser = await getUserById(user.id);

    const token = signToken(freshUser);
    setAuthCookie(res, token);
    res.json({ success: true, user: sanitizeUser(freshUser) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// LOGIN — email + password
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, captchaToken } = req.body;

    const captchaOk = await verifyTurnstile(captchaToken, getClientIp(req));
    if (!captchaOk) {
      return res.status(400).json({ success: false, message: 'Verifikasi captcha gagal, coba lagi.' });
    }

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email dan password wajib diisi' });
    }

    const user = await getUserByEmail(email);
    if (!user || user.auth_provider !== 'local' || !user.password_hash) {
      return res.status(401).json({ success: false, message: 'Akun ini belum daftar pakai password. Coba login Google.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Password salah' });
    }

    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ success: true, user: sanitizeUser(user) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// GOOGLE OAUTH
// ============================================================
app.get('/api/auth/google', (req, res) => {
  const ref = (req.query.ref || '').toString().trim();
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'email profile',
    access_type: 'online',
    prompt: 'select_account',
    state: ref
  });
  res.redirect(url);
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.redirect('/login?error=no_code');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect('/login?error=google_failed');

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const g = await userRes.json();

    let user = await getUserByEmail(g.email);
    if (user) {
      // Update profil terbaru dari Google, tapi jangan sentuh coins/password
      const [updated] = await sb('PATCH', `polar_users?id=eq.${user.id}`, {
        name: g.name || user.name,
        avatar: g.picture || user.avatar,
        google_id: g.id,
        updated_at: Date.now()
      });
      user = updated || user;
    } else {
      const [created] = await sb('POST', 'polar_users', {
        google_id: g.id,
        name: g.name || 'User',
        email: g.email,
        avatar: g.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(g.name || 'User')}&background=FF6B00&color=fff`,
        coins: 0,
        auth_provider: 'google',
        created_at: Date.now()
      });
      user = created;
      await assignReferralCode(user);
      if (state) await applyReferral(user, state);
      user = await getUserById(user.id);
    }

    const token = signToken(user);
    setAuthCookie(res, token);
    res.redirect('/dashboard');
  } catch (e) {
    console.error(e);
    res.redirect('/login?error=server_error');
  }
});

// ============================================================
// LOGOUT
// ============================================================
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('polar_token');
  res.json({ success: true });
});

// ============================================================
// ME
// ============================================================
app.get('/api/me', authMiddleware, async (req, res) => {
  const user = await getUserById(req.user.uid);
  if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
  res.json({ success: true, user: sanitizeUser(user) });
});

// ============================================================
// EARN COIN (gantiin earn-coin.php lama)
// Flow: user tap "Earn" -> /api/earn/start set earn_flag=true & redirect ke Safelinku
//       -> user selesai shortlink -> Safelinku redirect balik ke /api/earn/callback
//       -> callback nambahin +1 coin, earn_flag=false, redirect ke dashboard
// ============================================================
app.get('/api/earn/start', authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.user.uid);
    // Selalu boleh mulai ulang, walau earn_flag sebelumnya masih true (misal user mencet back / gak nyelesain).
    // Aman: coin cuma ke-kasih sekali per siklus, soalnya begitu /api/earn/callback berhasil, flag langsung direset ke false.
    await sb('PATCH', `polar_users?id=eq.${user.id}`, { earn_flag: true });
    res.redirect(SAFELINK_URL);
  } catch (e) {
    console.error(e);
    res.redirect('/dashboard?earn=error');
  }
});

// NOTE: URL ini yang harus di-set sebagai "destination URL" di dashboard Safelinku,
// bukan mengarah langsung ke /dashboard, supaya coin ke-add dulu sebelum balik ke dashboard.
app.get('/api/earn/callback', authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.user.uid);
    if (!user.earn_flag) {
      // flag ga aktif = bukan hasil dari /api/earn/start yang sah
      return res.redirect('/dashboard?earn=expired');
    }
    const newCoins = (user.coins || 0) + 1;
    await sb('PATCH', `polar_users?id=eq.${user.id}`, { coins: newCoins, earn_flag: false });
    await logCoinTransaction(user.id, 1, 'earn', newCoins);
    res.redirect(`/dashboard?earn=success&coins=${newCoins}`);
  } catch (e) {
    console.error(e);
    res.redirect('/dashboard?earn=error');
  }
});

app.get('/api/referral', authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.user.uid);
    const referred = await sb('GET', `polar_users?referred_by=eq.${user.id}&select=id,name,avatar,created_at`);

    res.json({
      success: true,
      referralCode: user.referral_code,
      totalReferred: referred.length,
      totalBonusEarned: referred.length * REFERRAL_BONUS_REFERRER,
      referredUsers: referred
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// COINS
// ============================================================
app.post('/api/coins/update', authMiddleware, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    const user = await getUserById(req.user.uid);
    const newCoins = Math.max(0, (user.coins || 0) + Number(amount));
    await sb('PATCH', `polar_users?id=eq.${user.id}`, { coins: newCoins });
    await logCoinTransaction(user.id, Number(amount), reason || 'manual_adjust', newCoins);
    res.json({ success: true, coins: newCoins });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/coins/history', authMiddleware, async (req, res) => {
  try {
    const rows = await sb('GET', `polar_coin_logs?user_id=eq.${req.user.uid}&order=created_at.desc&limit=50`);
    res.json({ success: true, logs: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// REDEEM CODE
// ============================================================
app.post('/api/redeem', authMiddleware, async (req, res) => {
  try {
    let { code } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Masukkan kode redeem dulu' });
    }
    code = code.trim().toUpperCase();

    const rows = await sb('GET', `polar_redeem_codes?code=eq.${encodeURIComponent(code)}&select=*`);
    const codeRow = rows[0];

    if (!codeRow || !codeRow.active) {
      return res.status(400).json({ success: false, message: 'Kode gak valid atau udah gak aktif' });
    }
    if (codeRow.expires_at && Date.now() > Number(codeRow.expires_at)) {
      return res.status(400).json({ success: false, message: 'Kode udah kadaluarsa' });
    }
    if (codeRow.used_count >= codeRow.max_uses) {
      return res.status(400).json({ success: false, message: 'Kode udah mencapai batas pemakaian' });
    }

    const alreadyUsed = await sb('GET', `polar_redeem_logs?user_id=eq.${req.user.uid}&code_id=eq.${codeRow.id}&select=id`);
    if (alreadyUsed.length > 0) {
      return res.status(400).json({ success: false, message: 'Kamu udah pernah pakai kode ini' });
    }

    const user = await getUserById(req.user.uid);
    const newCoins = (user.coins || 0) + Number(codeRow.coin_value);

    await sb('PATCH', `polar_users?id=eq.${user.id}`, { coins: newCoins });
    await sb('POST', 'polar_redeem_logs', { user_id: user.id, code_id: codeRow.id, redeemed_at: Date.now() });
    await sb('PATCH', `polar_redeem_codes?id=eq.${codeRow.id}`, { used_count: codeRow.used_count + 1 });
    await logCoinTransaction(user.id, Number(codeRow.coin_value), `redeem_code:${code}`, newCoins);

    res.json({ success: true, coins: newCoins, coinsAdded: Number(codeRow.coin_value) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// ADMIN — kelola kode redeem
// ============================================================
app.get('/api/admin/codes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await sb('GET', 'polar_redeem_codes?order=created_at.desc');
    res.json({ success: true, codes: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/admin/codes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    let { code, coinValue, maxUses, expiresAt } = req.body;
    if (!code || !coinValue) {
      return res.status(400).json({ success: false, message: 'Kode & nilai koin wajib diisi' });
    }
    code = code.trim().toUpperCase();

    const existing = await sb('GET', `polar_redeem_codes?code=eq.${encodeURIComponent(code)}&select=id`);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Kode ini udah ada' });
    }

    const [created] = await sb('POST', 'polar_redeem_codes', {
      code,
      coin_value: Number(coinValue),
      max_uses: Number(maxUses) || 1,
      used_count: 0,
      expires_at: expiresAt ? new Date(expiresAt).getTime() : null,
      active: true,
      created_at: Date.now()
    });

    res.json({ success: true, code: created });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.patch('/api/admin/codes/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { active } = req.body;
    await sb('PATCH', `polar_redeem_codes?id=eq.${req.params.id}`, { active: !!active });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/codes/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await sb('DELETE', `polar_redeem_codes?id=eq.${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// EVENTS (publik — ditampilin ke semua user yang login)
// ============================================================
app.get('/api/events', authMiddleware, async (req, res) => {
  try {
    const now = Date.now();
    const rows = await sb('GET', `polar_events?active=eq.true&order=event_date.asc.nullslast`);
    const activeEvents = rows.filter(e => !e.end_date || Number(e.end_date) > now);
    res.json({ success: true, events: activeEvents });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// ADMIN — cek daftar server & UUID dari panel Pterodactyl (bantu isi form Script)
// ============================================================
app.post('/api/admin/check-uuid', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { panelUrl, apiKey } = req.body;
    if (!panelUrl || !apiKey) {
      return res.status(400).json({ success: false, message: 'Panel URL & API key wajib diisi' });
    }

    const cleanPanel = panelUrl.trim().replace(/\/$/, '');
    const r = await fetch(`${cleanPanel}/api/client`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(400).json({ success: false, message: `Gagal konek ke panel (HTTP ${r.status}). Cek lagi Panel URL & API Key-nya.` });
    }

    const data = await r.json();
    const servers = (data.data || []).map(s => ({
      name: s.attributes.name,
      identifier: s.attributes.identifier,
      uuid: s.attributes.uuid,
      node: s.attributes.node,
      suspended: s.attributes.is_suspended
    }));

    res.json({ success: true, servers });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Gagal konek ke panel: ' + e.message });
  }
});

// ============================================================
// ADMIN — kelola script bot (Phoenix, Ourin, dll)
// ============================================================
app.get('/api/admin/scripts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await sb('GET', 'polar_scripts?order=sort_order.asc');
    res.json({ success: true, scripts: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/admin/scripts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { scriptKey, displayName, subtitle, icon, panelUrl, apiKey, serverUuid, sortOrder } = req.body;
    if (!scriptKey || !displayName || !panelUrl || !apiKey || !serverUuid) {
      return res.status(400).json({ success: false, message: 'Script key, nama, panel URL, API key, dan UUID wajib diisi' });
    }

    const normalizedKey = scriptKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const existing = await sb('GET', `polar_scripts?script_key=eq.${encodeURIComponent(normalizedKey)}&select=id`);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Script key ini udah dipakai' });
    }

    const [created] = await sb('POST', 'polar_scripts', {
      script_key: normalizedKey,
      display_name: displayName.trim(),
      subtitle: subtitle || '',
      icon: (icon && icon.trim()) || 'fa-robot',
      panel_url: panelUrl.trim(),
      api_key: apiKey.trim(),
      server_uuid: serverUuid.trim(),
      active: true,
      sort_order: Number(sortOrder) || 0,
      created_at: Date.now()
    });

    res.json({ success: true, script: created });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.patch('/api/admin/scripts/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { displayName, subtitle, icon, panelUrl, apiKey, serverUuid, active, sortOrder } = req.body;
    const patch = {};
    if (displayName !== undefined) patch.display_name = displayName;
    if (subtitle !== undefined) patch.subtitle = subtitle;
    if (icon !== undefined) patch.icon = icon;
    if (panelUrl !== undefined) patch.panel_url = panelUrl;
    if (apiKey !== undefined) patch.api_key = apiKey;
    if (serverUuid !== undefined) patch.server_uuid = serverUuid;
    if (active !== undefined) patch.active = !!active;
    if (sortOrder !== undefined) patch.sort_order = Number(sortOrder) || 0;

    await sb('PATCH', `polar_scripts?id=eq.${req.params.id}`, patch);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/scripts/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await sb('DELETE', `polar_scripts?id=eq.${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// ADMIN — kelola event
// ============================================================
app.get('/api/admin/events', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await sb('GET', 'polar_events?order=created_at.desc');
    res.json({ success: true, events: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/admin/events', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, description, thumbnailUrl, eventDate, endDate, linkUrl, linkLabel } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Judul event wajib diisi' });
    }

    const [created] = await sb('POST', 'polar_events', {
      title: title.trim(),
      description: description || '',
      thumbnail_url: thumbnailUrl || '',
      event_date: eventDate ? new Date(eventDate).getTime() : null,
      end_date: endDate ? new Date(endDate).getTime() : null,
      link_url: linkUrl || '',
      link_label: (linkLabel && linkLabel.trim()) || 'Lihat Event',
      active: true,
      created_at: Date.now()
    });

    res.json({ success: true, event: created });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.patch('/api/admin/events/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, description, thumbnailUrl, eventDate, endDate, linkUrl, linkLabel, active } = req.body;
    const patch = {};
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description;
    if (thumbnailUrl !== undefined) patch.thumbnail_url = thumbnailUrl;
    if (eventDate !== undefined) patch.event_date = eventDate ? new Date(eventDate).getTime() : null;
    if (endDate !== undefined) patch.end_date = endDate ? new Date(endDate).getTime() : null;
    if (linkUrl !== undefined) patch.link_url = linkUrl;
    if (linkLabel !== undefined) patch.link_label = linkLabel;
    if (active !== undefined) patch.active = !!active;

    await sb('PATCH', `polar_events?id=eq.${req.params.id}`, patch);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/events/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await sb('DELETE', `polar_events?id=eq.${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// PRODUCTS (halaman toko /store — publik, gak perlu login)
// ============================================================
app.get('/api/products', async (req, res) => {
  try {
    const rows = await sb('GET', 'polar_products?active=eq.true&order=category.asc,sort_order.asc');
    res.json({ success: true, products: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// ADMIN — kelola produk
// ============================================================
app.get('/api/admin/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await sb('GET', 'polar_products?order=category.asc,sort_order.asc');
    res.json({ success: true, products: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/admin/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, description, price, imageUrl, category, sortOrder } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Judul produk wajib diisi' });
    }

    const [created] = await sb('POST', 'polar_products', {
      title: title.trim(),
      description: description || '',
      price: Number(price) || 0,
      image_url: imageUrl || '',
      category: (category && category.trim()) || 'Umum',
      active: true,
      sort_order: Number(sortOrder) || 0,
      created_at: Date.now()
    });

    res.json({ success: true, product: created });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.patch('/api/admin/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, description, price, imageUrl, category, active, sortOrder } = req.body;
    const patch = {};
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description;
    if (price !== undefined) patch.price = Number(price) || 0;
    if (imageUrl !== undefined) patch.image_url = imageUrl;
    if (category !== undefined) patch.category = category;
    if (active !== undefined) patch.active = !!active;
    if (sortOrder !== undefined) patch.sort_order = Number(sortOrder) || 0;

    await sb('PATCH', `polar_products?id=eq.${req.params.id}`, patch);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await sb('DELETE', `polar_products?id=eq.${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// ADMIN — kelola user (list, cari, tambah/kurang coin)
// ============================================================
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    let endpoint = 'polar_users?select=id,name,email,avatar,coins,auth_provider,is_admin,created_at&order=created_at.desc&limit=50';
    if (search) {
      endpoint += `&or=(email.ilike.*${encodeURIComponent(search)}*,name.ilike.*${encodeURIComponent(search)}*)`;
    }
    const rows = await sb('GET', endpoint);
    res.json({ success: true, users: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/admin/users/:id/adjust-coins', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    if (!amount || Number(amount) === 0) {
      return res.status(400).json({ success: false, message: 'Jumlah coin wajib diisi (boleh minus buat ngurangin)' });
    }

    const targetUser = await getUserById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User gak ketemu' });
    }

    const newCoins = Math.max(0, (targetUser.coins || 0) + Number(amount));
    await sb('PATCH', `polar_users?id=eq.${targetUser.id}`, { coins: newCoins });
    await logCoinTransaction(targetUser.id, Number(amount), `admin_adjust:${(reason && reason.trim()) || 'manual'}`, newCoins);

    res.json({ success: true, coins: newCoins });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// FEEDBACK (dari user)
// ============================================================
app.post('/api/feedback', authMiddleware, async (req, res) => {
  try {
    const { message, rating } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Pesan feedback wajib diisi' });
    }
    await sb('POST', 'polar_feedback', {
      user_id: req.user.uid,
      message: message.trim(),
      rating: rating ? Number(rating) : null,
      status: 'new',
      created_at: Date.now()
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/admin/feedback', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await sb('GET', 'polar_feedback?select=*,polar_users(name,email,avatar)&order=created_at.desc');
    res.json({ success: true, feedback: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.patch('/api/admin/feedback/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    await sb('PATCH', `polar_feedback?id=eq.${req.params.id}`, { status });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/feedback/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await sb('DELETE', `polar_feedback?id=eq.${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// REQUEST SCRIPT (dari user)
// ============================================================
app.post('/api/script-requests', authMiddleware, async (req, res) => {
  try {
    const { scriptName, referenceLink, reason } = req.body;
    if (!scriptName || !scriptName.trim()) {
      return res.status(400).json({ success: false, message: 'Nama script wajib diisi' });
    }
    await sb('POST', 'polar_script_requests', {
      user_id: req.user.uid,
      script_name: scriptName.trim(),
      reference_link: referenceLink || '',
      reason: reason || '',
      status: 'new',
      created_at: Date.now()
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/admin/script-requests', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await sb('GET', 'polar_script_requests?select=*,polar_users(name,email,avatar)&order=created_at.desc');
    res.json({ success: true, requests: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.patch('/api/admin/script-requests/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    await sb('PATCH', `polar_script_requests?id=eq.${req.params.id}`, { status });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/script-requests/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await sb('DELETE', `polar_script_requests?id=eq.${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// SPONSOR (dari user)
// ============================================================
app.post('/api/sponsor', authMiddleware, async (req, res) => {
  try {
    const { name, contact, company, message } = req.body;
    if (!name || !name.trim() || !contact || !contact.trim()) {
      return res.status(400).json({ success: false, message: 'Nama & kontak wajib diisi' });
    }
    await sb('POST', 'polar_sponsor_requests', {
      user_id: req.user.uid,
      name: name.trim(),
      contact: contact.trim(),
      company: company || '',
      message: message || '',
      status: 'new',
      created_at: Date.now()
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/admin/sponsor', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await sb('GET', 'polar_sponsor_requests?select=*,polar_users(name,email,avatar)&order=created_at.desc');
    res.json({ success: true, sponsors: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.patch('/api/admin/sponsor/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    await sb('PATCH', `polar_sponsor_requests?id=eq.${req.params.id}`, { status });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/sponsor/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await sb('DELETE', `polar_sponsor_requests?id=eq.${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// SESSIONS (claim / list / delete bot)
// ============================================================
app.get('/api/sessions', authMiddleware, async (req, res) => {
  const rows = await sb('GET', `polar_sessions?user_id=eq.${req.user.uid}&order=created_at.desc`);
  res.json({ success: true, sessions: rows });
});

app.post('/api/sessions', authMiddleware, async (req, res) => {
  try {
    const { phone, script, days, coin } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Nomor WhatsApp wajib diisi' });

    // 1. Cek script yang dipilih lagi online apa enggak
    const scriptStatus = await getScriptStatus(script);
    if (!scriptStatus.online) {
      return res.status(400).json({ success: false, message: 'Script yang kamu pilih lagi offline. Coba lagi nanti atau pilih script lain.' });
    }

    // 2. Cek nomor ini udah kepake di session lain apa belum (siapa pun, bukan cuma user ini)
    const existingPhone = await sb('GET', `polar_sessions?phone=eq.${encodeURIComponent(phone)}&select=id`);
    if (existingPhone.length > 0) {
      return res.status(400).json({ success: false, message: 'Nomor ini udah kedaftar di session lain. Hapus dulu session lamanya di menu Sessions sebelum claim ulang.' });
    }

    const user = await getUserById(req.user.uid);
    if ((user.coins || 0) < coin) {
      return res.status(400).json({ success: false, message: 'Polar Coin tidak cukup' });
    }

    const existingRows = await sb('GET', `polar_sessions?user_id=eq.${req.user.uid}&select=id`);
    if (existingRows.length >= MAX_SESSIONS) {
      return res.status(400).json({ success: false, message: `Slot session penuh (maksimal ${MAX_SESSIONS})` });
    }

    await sb('PATCH', `polar_users?id=eq.${user.id}`, { coins: user.coins - coin });
    await logCoinTransaction(user.id, -coin, `claim_session:${script}`, user.coins - coin);

    const [session] = await sb('POST', 'polar_sessions', {
      user_id: req.user.uid,
      phone,
      script,
      status: 'pending',
      bot_mode: 'public',
      pairing_code: null,
      created_at: Date.now(),
      expiry_days: days
    });

    res.json({ success: true, session, coins: user.coins - coin });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.delete('/api/sessions/:id', authMiddleware, async (req, res) => {
  try {
    await sb('DELETE', `polar_sessions?id=eq.${req.params.id}&user_id=eq.${req.user.uid}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// SERVER STATUS (Pterodactyl - Phoenix & Ourin)
// ============================================================
async function checkServer(panelUrl, uuid, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 detik — jangan sampe nyangkut lama kalau panel lemot/gak respon

  try {
    const r = await fetch(`${panelUrl}/api/client/servers/${uuid}/resources`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!r.ok) throw new Error('offline');
    const data = await r.json();
    const ramMB = Math.round(((data?.attributes?.resources?.memory_bytes || 0) / 1024 / 1024) * 100) / 100;
    return { online: ramMB > 0, ram: `${ramMB} MB`, ping: `${Math.floor(Math.random() * 130) + 20}ms` };
  } catch {
    clearTimeout(timeoutId);
    return { online: false, ram: '0 MB', ping: 'Timeout' };
  }
}

// ============================================================
// SCRIPTS (bot types — Phoenix, Ourin, dll. Dikelola admin lewat tabel polar_scripts)
// ============================================================

// Data buat pilihan script di form claim (safe fields aja, gak ada panel_url/api_key/uuid)
app.get('/api/scripts', authMiddleware, async (req, res) => {
  try {
    const rows = await sb('GET', 'polar_scripts?active=eq.true&order=sort_order.asc&select=id,script_key,display_name,subtitle,icon');
    res.json({ success: true, scripts: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Status real-time semua script aktif (dipanggil dashboard buat halaman Status)
app.get('/api/server-status', async (req, res) => {
  try {
    const rows = await sb('GET', 'polar_scripts?active=eq.true&order=sort_order.asc');
    const scripts = await Promise.all(rows.map(async (s) => {
      const status = await checkServer(s.panel_url, s.server_uuid, s.api_key);
      return {
        script_key: s.script_key,
        display_name: s.display_name,
        icon: s.icon,
        ...status
      };
    }));
    res.json({ success: true, scripts });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Dipakai buat validasi pas claim session — mapping nama script ke status server-nya
// Dipakai buat validasi pas claim session — ambil config panel dari database (tabel polar_scripts)
async function getScriptStatus(script) {
  try {
    const rows = await sb('GET', `polar_scripts?script_key=eq.${encodeURIComponent(script)}&select=*`);
    const scriptRow = rows[0];
    if (!scriptRow || !scriptRow.active) return { online: false };
    return checkServer(scriptRow.panel_url, scriptRow.server_uuid, scriptRow.api_key);
  } catch (e) {
    console.error('getScriptStatus error:', e.message);
    return { online: false };
  }
}

// ============================================================
// SUBDOMAIN GRATIS (Cloudflare DNS A record)
// Domain + credential Cloudflare dikelola admin lewat tabel polar_domains.
// Claim & hapus subdomain motong/gak-ngerefund coin — lihat aturan di CLAUDE.md.
// ============================================================

const RESERVED_SUBDOMAINS = [
  'www', 'admin', 'api', 'mail', 'ftp', 'ns1', 'ns2', 'ns3', 'cpanel', 'webmail',
  'cdn', 'store', 'dashboard', 'login', 'blog', 'docs', 'status', 'security',
  'app', 'staging', 'dev', 'test', 'smtp', 'pop', 'imap', 'autodiscover',
  'panel', 'host', 'server', 'vpn', 'ssh', 'root', 'polar', 'support'
];

// Label subdomain: huruf kecil/angka/strip, gak boleh diawali/diakhiri strip, max 63 karakter
function isValidSubdomainLabel(label) {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
}

function isValidIPv4(ip) {
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return false;
  return ip.split('.').every(octet => Number(octet) >= 0 && Number(octet) <= 255);
}

async function cfCreateRecord(domainRow, fullName, ip) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${domainRow.cloudflare_zone_id}/dns_records`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${domainRow.cloudflare_api_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type: 'A', name: fullName, content: ip, ttl: 1, proxied: false }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const data = await r.json();
    if (!data.success) {
      const msg = (data.errors && data.errors[0] && data.errors[0].message) || 'Gagal bikin DNS record di Cloudflare';
      throw new Error(msg);
    }
    return data.result.id;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

async function cfDeleteRecord(domainRow, recordId) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(`https://api.cloudflare.com/client/v4/zones/${domainRow.cloudflare_zone_id}/dns_records/${recordId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${domainRow.cloudflare_api_token}` },
      signal: controller.signal
    });
  } catch (e) {
    console.error('Gagal hapus DNS record di Cloudflare (record mungkin udah gak ada):', e.message);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Daftar domain aktif buat form claim user — cuma field aman
// Publik — dipanggil dari halaman /subdomain (bukan cuma dashboard), biar bisa di-crawl SEO
app.get('/api/domains', async (req, res) => {
  try {
    const rows = await sb('GET', 'polar_domains?active=eq.true&order=sort_order.asc&select=id,domain_name,price_coins');
    res.json({ success: true, domains: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Subdomain punya user yang lagi login
app.get('/api/subdomains', authMiddleware, async (req, res) => {
  try {
    const rows = await sb('GET', `polar_subdomains?user_id=eq.${req.user.uid}&order=created_at.desc&select=*,polar_domains(domain_name)`);
    res.json({ success: true, subdomains: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/subdomains', authMiddleware, async (req, res) => {
  try {
    const { domainId, subdomain, ip } = req.body;
    if (!domainId || !subdomain || !ip) {
      return res.status(400).json({ success: false, message: 'Domain, nama subdomain, dan IP wajib diisi' });
    }

    const normalizedSub = String(subdomain).trim().toLowerCase();
    if (!isValidSubdomainLabel(normalizedSub)) {
      return res.status(400).json({ success: false, message: 'Nama subdomain gak valid. Cuma huruf kecil, angka, strip — gak boleh diawali/diakhiri strip.' });
    }
    if (RESERVED_SUBDOMAINS.includes(normalizedSub)) {
      return res.status(400).json({ success: false, message: 'Nama subdomain ini dipakai sistem, coba nama lain.' });
    }
    if (!isValidIPv4(ip)) {
      return res.status(400).json({ success: false, message: 'Format IP gak valid' });
    }

    const domainRows = await sb('GET', `polar_domains?id=eq.${domainId}&active=eq.true&select=*`);
    const domainRow = domainRows[0];
    if (!domainRow) {
      return res.status(400).json({ success: false, message: 'Domain gak ditemukan atau lagi nonaktif' });
    }

    const existing = await sb('GET', `polar_subdomains?domain_id=eq.${domainId}&subdomain=eq.${encodeURIComponent(normalizedSub)}&select=id`);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Nama subdomain ini udah dipakai orang lain, coba nama lain.' });
    }

    const user = await getUserById(req.user.uid);
    const price = Number(domainRow.price_coins) || 0;
    if ((user.coins || 0) < price) {
      return res.status(400).json({ success: false, message: 'Polar Coin tidak cukup' });
    }

    const fullName = `${normalizedSub}.${domainRow.domain_name}`;
    const cfRecordId = await cfCreateRecord(domainRow, fullName, ip);

    await sb('PATCH', `polar_users?id=eq.${user.id}`, { coins: user.coins - price });
    await logCoinTransaction(user.id, -price, `claim_subdomain:${fullName}`, user.coins - price);

    const [row] = await sb('POST', 'polar_subdomains', {
      user_id: user.id,
      domain_id: domainRow.id,
      subdomain: normalizedSub,
      ip_address: ip,
      cf_record_id: cfRecordId,
      created_at: Date.now()
    });

    res.json({ success: true, subdomain: row, fullName, coins: user.coins - price });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message || 'Gagal claim subdomain' });
  }
});

app.delete('/api/subdomains/:id', authMiddleware, async (req, res) => {
  try {
    const rows = await sb('GET', `polar_subdomains?id=eq.${req.params.id}&user_id=eq.${req.user.uid}&select=*,polar_domains(*)`);
    const row = rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Subdomain gak ditemukan' });

    if (row.polar_domains) {
      await cfDeleteRecord(row.polar_domains, row.cf_record_id);
    }
    await sb('DELETE', `polar_subdomains?id=eq.${req.params.id}&user_id=eq.${req.user.uid}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// ADMIN — kelola domain (buat fitur subdomain gratis)
// ============================================================
app.get('/api/admin/domains', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await sb('GET', 'polar_domains?order=sort_order.asc');
    res.json({ success: true, domains: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/admin/domains', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { domainName, cloudflareZoneId, cloudflareApiToken, priceCoins, sortOrder } = req.body;
    if (!domainName || !cloudflareZoneId || !cloudflareApiToken) {
      return res.status(400).json({ success: false, message: 'Nama domain, Zone ID, dan API token wajib diisi' });
    }

    const normalizedDomain = domainName.trim().toLowerCase();
    const existing = await sb('GET', `polar_domains?domain_name=eq.${encodeURIComponent(normalizedDomain)}&select=id`);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Domain ini udah terdaftar' });
    }

    const [created] = await sb('POST', 'polar_domains', {
      domain_name: normalizedDomain,
      cloudflare_zone_id: cloudflareZoneId.trim(),
      cloudflare_api_token: cloudflareApiToken.trim(),
      price_coins: Number(priceCoins) || 0,
      active: true,
      sort_order: Number(sortOrder) || 0,
      created_at: Date.now()
    });

    res.json({ success: true, domain: created });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.patch('/api/admin/domains/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { cloudflareZoneId, cloudflareApiToken, priceCoins, active, sortOrder } = req.body;
    const patch = {};
    if (cloudflareZoneId !== undefined) patch.cloudflare_zone_id = cloudflareZoneId;
    if (cloudflareApiToken !== undefined) patch.cloudflare_api_token = cloudflareApiToken;
    if (priceCoins !== undefined) patch.price_coins = Number(priceCoins) || 0;
    if (active !== undefined) patch.active = !!active;
    if (sortOrder !== undefined) patch.sort_order = Number(sortOrder) || 0;

    await sb('PATCH', `polar_domains?id=eq.${req.params.id}`, patch);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/domains/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await sb('DELETE', `polar_domains?id=eq.${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
// LAYANAN — NAME GENERATOR (npm: indo-name-generator)
// Fitur ringan, gratis, publik penuh (gak perlu login) — dipakai di halaman
// standalone /name-generator biar bisa di-crawl SEO.
// ============================================================
app.get('/api/tools/name-generator', (req, res) => {
  try {
    const count = Math.min(Math.max(Number(req.query.count) || 1, 1), 20); // max 20 sekali generate, biar gak disalahgunain
    const names = [];
    for (let i = 0; i < count; i++) {
      names.push(indoNameGenerator.generate());
    }
    res.json({ success: true, names });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message || 'Gagal generate nama' });
  }
});

// ============================================================
// 404 — taruh paling bawah, nangkep semua route yang gak ke-match di atas
// ============================================================
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

const PORT = process.env.PORT || 3000;

// Vercel (serverless) cuma butuh export "app"-nya, bukan app.listen().
// Kalau dijalanin lokal (node server.js) atau di Pterodactyl/VPS, tetep listen normal.
if (require.main === module) {
  app.listen(PORT, () => console.log(`Polar.web.id server jalan di port ${PORT}`));
}

module.exports = app;
