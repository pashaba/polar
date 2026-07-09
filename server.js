require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: process.env.APP_URL || true, credentials: true }));
app.use(express.static(path.join(__dirname, 'public'), { index: false, extensions: false }));

// ============================================================
// CLEAN URL ROUTES (gak perlu .html)
// ============================================================
app.get('/', (req, res) => res.redirect('/dashboard'));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// /login pakai templating manual buat inject TURNSTILE_SITE_KEY (site key aman ditaruh di HTML, cuma secret key yang rahasia)
app.get('/login', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'login.html'), 'utf8');
  html = html.replace(/{{TURNSTILE_SITE_KEY}}/g, process.env.TURNSTILE_SITE_KEY || '');
  res.send(html);
});

app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));

app.get('/privacy.html', (req, res) => res.redirect(301, '/privacy'));

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
  PTERO_PANEL,
  PHOENIX_API_KEY,
  PHOENIX_UUID,
  OURIN_API_KEY,
  OURIN_UUID,
  SAFELINK_URL,
  APP_URL
} = process.env;

const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 10);

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
    auth_provider: u.auth_provider
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

// ============================================================
// REGISTER — email + password
// ============================================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, captchaToken, privacyAccepted } = req.body;

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

    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ success: true, user: sanitizeUser(user) });
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
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'email profile',
    access_type: 'online',
    prompt: 'select_account'
  });
  res.redirect(url);
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
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
    if (user.earn_flag) {
      return res.redirect('/dashboard?earn=pending');
    }
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
async function checkServer(uuid, apiKey) {
  try {
    const r = await fetch(`${PTERO_PANEL}/api/client/servers/${uuid}/resources`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
    });
    if (!r.ok) throw new Error('offline');
    const data = await r.json();
    const ramMB = Math.round(((data?.attributes?.resources?.memory_bytes || 0) / 1024 / 1024) * 100) / 100;
    return { online: ramMB > 0, ram: `${ramMB} MB`, ping: `${Math.floor(Math.random() * 130) + 20}ms` };
  } catch {
    return { online: false, ram: '0 MB', ping: 'Timeout' };
  }
}

app.get('/api/server-status', async (req, res) => {
  const [phoenix, ourin] = await Promise.all([
    checkServer(PHOENIX_UUID, PHOENIX_API_KEY),
    checkServer(OURIN_UUID, OURIN_API_KEY)
  ]);
  res.json({ success: true, phoenix, ourin });
});

const PORT = process.env.PORT || 3000;

// Vercel (serverless) cuma butuh export "app"-nya, bukan app.listen().
// Kalau dijalanin lokal (node server.js) atau di Pterodactyl/VPS, tetep listen normal.
if (require.main === module) {
  app.listen(PORT, () => console.log(`Polar.web.id server jalan di port ${PORT}`));
}

module.exports = app;
