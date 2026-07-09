// ============================================================
// STATE
// ============================================================
let currentUser = null;
let currentSessions = [];
let selectedDays = 1;
let selectedCoin = 1;
const MAX_SESSIONS = 10;

const PACKAGES = [
  { days: 1, coin: 1, label: '1 Hari', icon: 'fa-calendar-day' },
  { days: 2, coin: 2, label: '2 Hari', icon: 'fa-calendar-week' },
  { days: 4, coin: 3, label: '4 Hari', icon: 'fa-calendar-alt' },
  { days: 10, coin: 10, label: '10 Hari', icon: 'fa-calendar-check' }
];

// ============================================================
// CHANNEL POPUP (ajakan join saluran WA)
// ============================================================
const CHANNEL_POPUP_COOLDOWN_DAYS = 7;

function maybeShowChannelPopup() {
  const lastDismissed = localStorage.getItem('polar_channel_popup_dismissed');
  const now = Date.now();
  if (lastDismissed && (now - Number(lastDismissed)) < CHANNEL_POPUP_COOLDOWN_DAYS * 24 * 60 * 60 * 1000) {
    return;
  }
  setTimeout(() => {
    document.getElementById('channelPopupOverlay')?.classList.add('active');
  }, 1200);
}

function closeChannelPopup() {
  document.getElementById('channelPopupOverlay')?.classList.remove('active');
  localStorage.setItem('polar_channel_popup_dismissed', Date.now().toString());
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadMe();
  renderPackages();
  await Promise.all([loadSessions(), loadServerStatus()]);
  loadCoinHistory();
  checkEarnCoinReturn();
  maybeShowChannelPopup();
  setInterval(loadMe, 30000);
});

// ============================================================
// AUTH / ME
// ============================================================
async function loadMe() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    const data = await res.json();
    if (!data.success) {
      window.location.href = '/login';
      return;
    }
    currentUser = data.user;
    renderUser();
  } catch (e) {
    console.error(e);
  }
}

function renderUser() {
  document.getElementById('body').classList.remove('locked-bg');
  document.getElementById('coinCount').textContent = currentUser.coins;
  document.getElementById('navAvatar').src = currentUser.avatar;
  document.getElementById('navName').textContent = currentUser.name.split(' ')[0];
  document.getElementById('claimInitial').textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('claimName').textContent = currentUser.name;
  document.getElementById('claimCoinDisplay').textContent = currentUser.coins;
  document.getElementById('profileAvatar').src = currentUser.avatar;
  document.getElementById('profileName').textContent = currentUser.name;
  document.getElementById('profileEmail').textContent = currentUser.email;
  document.getElementById('profileCoinDisplay').textContent = currentUser.coins;
  document.getElementById('profileCoinStat').textContent = currentUser.coins;
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  window.location.href = '/login';
}

// ============================================================
// TOAST / MODALS
// ============================================================
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + type;
  toast.style.display = 'block';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

function toggleMenu() {
  document.getElementById('sidebar').classList.toggle('active');
  document.getElementById('sidebarOverlay').classList.toggle('active');
}

// ============================================================
// DARK MODE
// ============================================================
function applyThemeIcon() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const icon = document.getElementById('themeIcon');
  if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('polar_theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('polar_theme', 'dark');
  }
  applyThemeIcon();
}

applyThemeIcon();

function navTo(sectionId) {
  document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
  document.getElementById('sec-' + sectionId).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// loading modal lama udah dihapus — sekarang cukup pakai top progress bar + spinner di tombol

// ============================================================
// PACKAGE / SCRIPT SELECT
// ============================================================
function renderPackages() {
  const grid = document.getElementById('packageGrid');
  grid.innerHTML = PACKAGES.map((pkg, i) => {
    const isActive = currentUser.coins >= pkg.coin;
    return `
      <div class="select-box ${i === 0 ? 'active' : ''}" style="${!isActive ? 'opacity:.5;cursor:not-allowed;' : ''}"
           onclick="${isActive ? `selectPackage(this, ${pkg.days}, ${pkg.coin})` : ''}">
        <i class="fas ${pkg.icon}"></i>
        <h4>${pkg.label}</h4>
        <p style="font-size:11px;font-weight:700;">🪙 ${pkg.coin} Polar Coin</p>
        ${!isActive ? '<p style="color:var(--red);font-size:9px;font-weight:700;margin-top:2px;">Koin tidak cukup</p>' : ''}
      </div>`;
  }).join('');
}

function selectScript(el) {
  document.querySelectorAll('.select-box[data-script]').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

function selectPackage(el, days, coin) {
  document.querySelectorAll('#packageGrid .select-box').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  selectedDays = days;
  selectedCoin = coin;
}

// ============================================================
// EARN COIN
// ============================================================
function earnCoin() {
  window.location.href = '/api/earn/start';
}

// Cek balikan dari /api/earn/callback (?earn=success&coins=X / pending / expired / error)
function checkEarnCoinReturn() {
  const params = new URLSearchParams(window.location.search);
  const earn = params.get('earn');
  if (!earn) return;

  history.replaceState(null, '', window.location.pathname);

  if (earn === 'success') {
    const coins = params.get('coins');
    showToast(`🎉 +1 Polar Coin berhasil diklaim! Total: ${coins} 🪙`, 'gold');
    if (currentUser) { currentUser.coins = Number(coins); renderUser(); renderPackages(); }
    loadCoinHistory();
  } else if (earn === 'pending') {
    showToast('⏳ Selesaikan dulu earn coin yang sedang berjalan!', 'error');
  } else if (earn === 'expired') {
    showToast('⏰ Link kadaluarsa. Silakan earn coin lagi.', 'error');
  } else if (earn === 'error') {
    showToast('❌ Gagal klaim coin, coba lagi.', 'error');
  }
}

// ============================================================
// SESSIONS
// ============================================================
async function loadSessions() {
  try {
    const res = await fetch('/api/sessions', { credentials: 'include' });
    const data = await res.json();
    if (!data.success) return;
    currentSessions = data.sessions;
    renderSessions();
  } catch (e) {
    console.error(e);
  }
}

function renderSessions() {
  const total = currentSessions.length;
  const free = MAX_SESSIONS - total;

  document.getElementById('slotFreeHome').textContent = free;
  document.getElementById('slotFreeClaim').textContent = free;
  document.getElementById('sessionCountLabel').textContent = `${total} / ${MAX_SESSIONS}`;
  document.getElementById('profileSessionCount').textContent = total;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statSlot').textContent = free;

  const list = document.getElementById('sessionsList');
  if (total === 0) {
    list.innerHTML = `
      <div class="card" style="text-align:center;padding:40px 16px;">
        <div style="font-size:48px;margin-bottom:12px;opacity:.3;">🤖</div>
        <h3 style="font-weight:900;font-size:20px;">Belum Ada Bot</h3>
        <p style="color:var(--text-muted);font-size:13px;font-weight:500;margin-top:4px;">Claim server dulu untuk mulai menggunakan bot</p>
        <button class="btn btn-orange" style="margin-top:16px;" onclick="navTo('claim')">CLAIM SEKARANG</button>
      </div>`;
    return;
  }

  list.innerHTML = currentSessions.map(s => {
    const statusClass = s.status === 'online' ? 'bg-online' : (s.status === 'pending' ? 'bg-pending' : 'bg-offline');
    const statusText = s.status === 'online' ? 'Online' : (s.status === 'pending' ? 'Pending' : 'Offline');
    const showPairBtn = s.status === 'waiting_pair' || s.status === 'pending';
    return `
      <div class="card">
        <div class="session-item">
          <div>
            <div class="session-phone"><i class="fab fa-whatsapp"></i> +${s.phone}</div>
            <div style="font-size:9px;font-weight:700;color:var(--text-muted);margin-top:2px;">${s.script}</div>
          </div>
          <div class="badge-status ${statusClass}">${statusText}</div>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px;">
          ${showPairBtn ? `<button class="btn btn-sm btn-orange" onclick="openPairModal('${s.phone}')"><i class="fas fa-link"></i> Pairing</button>` : ''}
          ${s.status === 'online' ? `<button class="btn btn-sm btn-success" onclick="showToast('Bot sedang online! ✅','success')"><i class="fas fa-circle"></i> Online</button>` : ''}
          <button class="btn btn-sm btn-danger" onclick="deleteSession(${s.id}, '${s.phone}')"><i class="fas fa-trash"></i> Hapus</button>
        </div>
      </div>`;
  }).join('');
}

async function createSessionWithCoin() {
  const phoneRaw = document.getElementById('phoneInput').value.trim();
  const scriptEl = document.querySelector('.select-box.active[data-script]');
  const script = scriptEl ? scriptEl.dataset.script : 'phoenix_md';

  if (!phoneRaw) { showToast('📱 Masukkan nomor WhatsApp', 'error'); return; }
  if (currentUser.coins < selectedCoin) { showToast(`🪙 Polar Coin tidak cukup! Butuh ${selectedCoin} coin.`, 'error'); return; }
  if (currentSessions.length >= MAX_SESSIONS) { showToast(`❌ Slot session penuh (maksimal ${MAX_SESSIONS})`, 'error'); return; }

  let phone = phoneRaw.replace(/[^0-9]/g, '');
  if (phone.startsWith('0')) phone = '62' + phone.substring(1);
  if (!phone.startsWith('62')) phone = '62' + phone;
  if (phone.length < 10) { showToast('📱 Nomor terlalu pendek', 'error'); return; }

  const btn = document.getElementById('claimBtn');
  btn.disabled = true;

  try {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone, script, days: selectedDays, coin: selectedCoin })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal membuat session');

    currentUser.coins = data.coins;
    renderUser();
    showToast(`✅ Server berhasil di-claim! ${selectedDays} hari aktif. 🎉`, 'success');
    await loadSessions();
    loadCoinHistory();
    showPairingModal(phone);
  } catch (e) {
    showToast('❌ ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-rocket"></i> CLAIM SERVER SEKARANG';
  }
}

async function deleteSession(id, phone) {
  if (!confirm(`Hapus session +${phone}?`)) return;
  try {
    const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE', credentials: 'include' });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal hapus session');
    showToast('✅ Session dihapus', 'success');
    await loadSessions();
  } catch (e) {
    showToast('❌ ' + e.message, 'error');
  }
}

// ============================================================
// PAIRING MODAL
// ============================================================
let pairInterval = null;

function showPairingModal(phone) {
  document.getElementById('pairingCodeDisplay').textContent = 'Menunggu pairing code...';
  document.getElementById('pairingOverlay').classList.add('active');

  if (pairInterval) clearInterval(pairInterval);
  pairInterval = setInterval(async () => {
    try {
      await loadSessions();
      const s = currentSessions.find(x => x.phone === phone);
      if (!s) return;
      if (s.pairing_code) {
        const code = s.pairing_code.match(/.{1,4}/g)?.join('-') || s.pairing_code;
        document.getElementById('pairingCodeDisplay').textContent = code;
      }
      if (s.status === 'online') {
        document.getElementById('pairingCodeDisplay').textContent = '✅ Bot Online!';
        clearInterval(pairInterval);
        setTimeout(closePairingModal, 2000);
      }
    } catch (e) { console.error(e); }
  }, 3000);
}

function closePairingModal() {
  if (pairInterval) clearInterval(pairInterval);
  document.getElementById('pairingOverlay').classList.remove('active');
}

function copyPairingCode() {
  const code = document.getElementById('pairingCodeDisplay').textContent;
  if (code && !code.includes('Menunggu') && !code.includes('Online')) {
    navigator.clipboard.writeText(code.replace(/-/g, ''));
    showToast('✅ Kode disalin!', 'success');
  }
}

function openPairModal(phone) {
  showPairingModal(phone);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('pairingOverlay').addEventListener('click', function (e) {
    if (e.target === this) closePairingModal();
  });
  document.getElementById('channelPopupOverlay')?.addEventListener('click', function (e) {
    if (e.target === this) closeChannelPopup();
  });
});

// ============================================================
// COIN HISTORY
// ============================================================
const REASON_LABELS = {
  earn: '🪙 Earn Coin (Shortlink)',
  claim_session: '🤖 Claim Server',
  manual_adjust: '⚙️ Penyesuaian Manual'
};

function formatHistoryReason(reason) {
  if (reason.startsWith('claim_session:')) {
    const script = reason.split(':')[1];
    return `🤖 Claim Server (${script})`;
  }
  return REASON_LABELS[reason] || reason;
}

function formatHistoryDate(ts) {
  const d = new Date(Number(ts));
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function loadCoinHistory() {
  try {
    const res = await fetch('/api/coins/history', { credentials: 'include' });
    const data = await res.json();
    if (!data.success) return;
    renderHistory(data.logs);
  } catch (e) {
    console.error(e);
  }
}

function renderHistory(logs) {
  const list = document.getElementById('historyList');
  if (!list) return;

  if (!logs || logs.length === 0) {
    list.innerHTML = `
      <div style="text-align:center;padding:24px 0;">
        <div style="font-size:36px;margin-bottom:8px;opacity:.3;">🪙</div>
        <p style="color:var(--text-muted);font-size:13px;font-weight:600;">Belum ada riwayat transaksi</p>
      </div>`;
    return;
  }

  list.innerHTML = logs.map(log => {
    const isPlus = log.amount > 0;
    return `
      <div class="history-item">
        <div class="history-left">
          <div class="history-icon ${isPlus ? 'plus' : 'minus'}"><i class="fas ${isPlus ? 'fa-plus' : 'fa-minus'}"></i></div>
          <div>
            <div class="history-reason">${formatHistoryReason(log.reason)}</div>
            <div class="history-date">${formatHistoryDate(log.created_at)}</div>
          </div>
        </div>
        <div class="history-amount ${isPlus ? 'plus' : 'minus'}">${isPlus ? '+' : ''}${log.amount} 🪙</div>
      </div>`;
  }).join('');
}

// ============================================================
// SERVER STATUS
// ============================================================
async function loadServerStatus() {
  try {
    const res = await fetch('/api/server-status');
    const data = await res.json();
    if (!data.success) return;

    const { phoenix, ourin } = data;
    setStatusUI('phoenix', phoenix);
    setStatusUI('ourin', ourin);

    const onlineCount = (phoenix.online ? 1 : 0) + (ourin.online ? 1 : 0);
    document.getElementById('statOnline').textContent = onlineCount;
    document.getElementById('statOffline').textContent = 2 - onlineCount;
  } catch (e) {
    console.error(e);
  }
}

function setStatusUI(prefix, status) {
  const badge = document.getElementById(prefix + 'Badge');
  badge.textContent = status.online ? 'ONLINE' : 'OFFLINE';
  badge.className = 'badge-status ' + (status.online ? 'bg-online' : 'bg-offline');
  document.getElementById(prefix + 'Ram').textContent = status.ram;
  document.getElementById(prefix + 'Ping').textContent = status.ping;
}
