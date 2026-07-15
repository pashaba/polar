// ============================================================
// POLAR.WEB.ID — i18n (Bahasa Indonesia / English)
// Auto-detect dari bahasa browser visitor, bisa di-override manual + disimpen di localStorage
// ============================================================

const POLAR_I18N = {
  id: {
    // ===== Umum =====
    brand: 'POLAR.WEB.ID',
    cs_label: 'Customer Service',
    privacy_label: 'Kebijakan Privasi',

    // ===== Login page =====
    login_title: 'LOGIN',
    login_subtitle: 'Masuk ke akun Polar.web.id kamu',
    login_email_label: 'Email',
    login_email_placeholder: 'email@gmail.com',
    login_password_label: 'Password',
    login_password_placeholder: '••••••••',
    login_btn: 'LOGIN',
    login_or: 'ATAU',
    login_google_btn: 'Login dengan Google',
    login_google_sub: 'Aman & cepat',
    login_switch_text: 'Belum punya akun?',
    login_switch_link: 'Daftar di sini',
    login_privacy_check: 'Saya udah baca & setuju sama',

    register_title: 'DAFTAR',
    register_subtitle: 'Buat akun Polar.web.id baru pakai email',
    register_name_label: 'Nama',
    register_name_placeholder: 'Nama kamu',
    register_email_label: 'Email',
    register_password_label: 'Password',
    register_password_placeholder: 'Minimal 6 karakter',
    register_btn: 'DAFTAR',
    register_google_btn: 'Daftar dengan Google',
    register_switch_text: 'Sudah punya akun?',
    register_switch_link: 'Login di sini',

    // ===== Sidebar =====
    nav_section_main: 'Menu Utama',
    nav_section_account: 'Akun Saya',
    nav_section_other: 'Lainnya',
    nav_home: 'HOME',
    nav_event: 'EVENT',
    nav_status: 'STATUS',
    nav_claim: 'CLAIM',
    nav_sessions: 'SESSIONS',
    nav_profile: 'PROFILE',
    nav_history: 'RIWAYAT KOIN',
    nav_redeem: 'REDEEM KODE',
    nav_earn: 'EARN POLAR COIN',
    nav_feedback: 'FEEDBACK',
    nav_request_script: 'REQUEST SCRIPT',
    nav_sponsor: 'SPONSOR',
    nav_cs: 'CUSTOMER SERVICE',
    nav_privacy: 'KEBIJAKAN PRIVASI',
    nav_logout: 'LOGOUT',

    // ===== Home =====
    home_slots_available: 'SLOT TERSEDIA',
    home_title_1: 'Jadibot',
    home_title_2: 'WhatsApp Gratis',
    home_desc: 'Dapatkan server bot gratis. Claim sekarang sebelum slot habis!',
    home_btn_claim: 'CLAIM SEKARANG',
    home_btn_status: 'LIHAT STATUS',
    home_btn_tutorial: 'MULAI TUTORIAL',
    nav_tutorial: 'MULAI TUTORIAL',

    // ===== Claim =====
    claim_title_1: 'CLAIM',
    claim_title_2: 'SERVER',
    claim_desc: 'Pilih paket dan claim server bot gratis',
    claim_login_as: 'LOGIN AS',
    claim_package_title: '🪙 PAKET POLAR COIN',
    claim_script_title: '⚙️ JENIS SCRIPT',
    claim_phone_label: '📱 Nomor WhatsApp',
    claim_phone_placeholder: '628xxxxxxxxxx',
    claim_btn: 'CLAIM SERVER SEKARANG',
    claim_insufficient_coin: 'Koin tidak cukup',

    // ===== Status =====
    status_badge: 'REAL-TIME MONITORING',
    status_title_1: 'SERVER',
    status_title_2: 'STATUS',
    status_total: 'TOTAL',
    status_slot: 'SLOT',
    status_online: 'ONLINE',
    status_offline: 'OFFLINE',
    status_ram: 'RAM',
    status_ping: 'PING',

    // ===== Sessions =====
    sessions_badge_suffix: 'SESSION',
    sessions_title_1: 'MY',
    sessions_title_2: 'BOTS',
    sessions_empty_title: 'Belum Ada Bot',
    sessions_empty_desc: 'Claim server dulu untuk mulai menggunakan bot',
    sessions_btn_claim: 'CLAIM SEKARANG',

    // ===== Event =====
    event_badge: 'INFO TERBARU',
    event_title_1: 'EVENT &',
    event_title_2: 'PROMO',
    event_desc: 'Jangan sampai ketinggalan',
    event_empty_title: 'Belum Ada Event',
    event_empty_desc: 'Pantau terus, event baru bakal muncul di sini',

    // ===== History =====
    history_badge: 'LOG TRANSAKSI',
    history_title_1: 'RIWAYAT',
    history_title_2: 'KOIN',
    history_desc: '50 transaksi terakhir',
    history_empty: 'Belum ada riwayat transaksi',

    // ===== Redeem =====
    redeem_badge: 'PUNYA KODE?',
    redeem_title_1: 'REDEEM',
    redeem_title_2: 'KODE',
    redeem_desc: 'Masukkan kode promo/giveaway buat dapetin Polar Coin gratis',
    redeem_label: 'Kode Redeem',
    redeem_btn: 'REDEEM SEKARANG',

    // ===== Feedback =====
    feedback_badge: 'SUARA KAMU PENTING',
    feedback_title_1: 'KASIH',
    feedback_title_2: 'FEEDBACK',
    feedback_desc: 'Ada saran, kritik, atau nemu bug? Kasih tau kami',
    feedback_rating_label: 'Rating (opsional)',
    feedback_message_label: 'Pesan Kamu',
    feedback_message_placeholder: 'Ceritain di sini...',
    feedback_btn: 'KIRIM FEEDBACK',

    // ===== Request Script =====
    reqscript_badge: 'USUL SCRIPT BARU',
    reqscript_title_1: 'REQUEST',
    reqscript_title_2: 'SCRIPT',
    reqscript_desc: 'Mau script bot tertentu ditambahin? Kasih tau kami',
    reqscript_name_label: 'Nama Script',
    reqscript_link_label: 'Link Referensi (opsional)',
    reqscript_reason_label: 'Kenapa Pengen Script Ini?',
    reqscript_btn: 'KIRIM REQUEST',

    // ===== Sponsor =====
    sponsor_badge: 'KERJA SAMA',
    sponsor_title_1: 'JADI',
    sponsor_title_2: 'SPONSOR',
    sponsor_desc: 'Mau bantu biaya server atau kerja sama promosi? Isi form ini',
    sponsor_name_label: 'Nama',
    sponsor_contact_label: 'Kontak (Email / WhatsApp)',
    sponsor_company_label: 'Perusahaan/Brand (opsional)',
    sponsor_message_label: 'Pesan',
    sponsor_btn: 'KIRIM PENGAJUAN',

    // ===== Profile =====
    profile_you_badge: '✦ YOU!',
    profile_stat_title: 'STATISTIK',
    profile_total_session: 'Total Session:',
    profile_coin: 'Polar Coin:',
    profile_btn_claim: 'CLAIM SERVER',
    profile_logout: 'LOGOUT'
  },

  en: {
    // ===== General =====
    brand: 'POLAR.WEB.ID',
    cs_label: 'Customer Service',
    privacy_label: 'Privacy Policy',

    // ===== Login page =====
    login_title: 'LOGIN',
    login_subtitle: 'Sign in to your Polar.web.id account',
    login_email_label: 'Email',
    login_email_placeholder: 'email@gmail.com',
    login_password_label: 'Password',
    login_password_placeholder: '••••••••',
    login_btn: 'LOGIN',
    login_or: 'OR',
    login_google_btn: 'Sign in with Google',
    login_google_sub: 'Safe & fast',
    login_switch_text: "Don't have an account?",
    login_switch_link: 'Sign up here',
    login_privacy_check: "I've read and agree to the",

    register_title: 'SIGN UP',
    register_subtitle: 'Create a new Polar.web.id account with email',
    register_name_label: 'Name',
    register_name_placeholder: 'Your name',
    register_email_label: 'Email',
    register_password_label: 'Password',
    register_password_placeholder: 'Minimum 6 characters',
    register_btn: 'SIGN UP',
    register_google_btn: 'Sign up with Google',
    register_switch_text: 'Already have an account?',
    register_switch_link: 'Login here',

    // ===== Sidebar =====
    nav_section_main: 'Main Menu',
    nav_section_account: 'My Account',
    nav_section_other: 'Others',
    nav_home: 'HOME',
    nav_event: 'EVENTS',
    nav_status: 'STATUS',
    nav_claim: 'CLAIM',
    nav_sessions: 'SESSIONS',
    nav_profile: 'PROFILE',
    nav_history: 'COIN HISTORY',
    nav_redeem: 'REDEEM CODE',
    nav_earn: 'EARN POLAR COIN',
    nav_feedback: 'FEEDBACK',
    nav_request_script: 'REQUEST SCRIPT',
    nav_sponsor: 'SPONSOR',
    nav_cs: 'CUSTOMER SERVICE',
    nav_privacy: 'PRIVACY POLICY',
    nav_logout: 'LOGOUT',

    // ===== Home =====
    home_slots_available: 'SLOTS AVAILABLE',
    home_title_1: 'Free WhatsApp',
    home_title_2: 'Bot Hosting',
    home_desc: 'Get a free bot server. Claim now before slots run out!',
    home_btn_claim: 'CLAIM NOW',
    home_btn_status: 'VIEW STATUS',
    home_btn_tutorial: 'START TUTORIAL',
    nav_tutorial: 'START TUTORIAL',

    // ===== Claim =====
    claim_title_1: 'CLAIM',
    claim_title_2: 'SERVER',
    claim_desc: 'Pick a package and claim your free bot server',
    claim_login_as: 'LOGGED IN AS',
    claim_package_title: '🪙 POLAR COIN PACKAGE',
    claim_script_title: '⚙️ SCRIPT TYPE',
    claim_phone_label: '📱 WhatsApp Number',
    claim_phone_placeholder: '628xxxxxxxxxx',
    claim_btn: 'CLAIM SERVER NOW',
    claim_insufficient_coin: 'Not enough coins',

    // ===== Status =====
    status_badge: 'REAL-TIME MONITORING',
    status_title_1: 'SERVER',
    status_title_2: 'STATUS',
    status_total: 'TOTAL',
    status_slot: 'SLOTS',
    status_online: 'ONLINE',
    status_offline: 'OFFLINE',
    status_ram: 'RAM',
    status_ping: 'PING',

    // ===== Sessions =====
    sessions_badge_suffix: 'SESSIONS',
    sessions_title_1: 'MY',
    sessions_title_2: 'BOTS',
    sessions_empty_title: 'No Bots Yet',
    sessions_empty_desc: 'Claim a server first to start using a bot',
    sessions_btn_claim: 'CLAIM NOW',

    // ===== Event =====
    event_badge: 'LATEST NEWS',
    event_title_1: 'EVENTS &',
    event_title_2: 'PROMOS',
    event_desc: "Don't miss out",
    event_empty_title: 'No Events Yet',
    event_empty_desc: 'Stay tuned, new events will show up here',

    // ===== History =====
    history_badge: 'TRANSACTION LOG',
    history_title_1: 'COIN',
    history_title_2: 'HISTORY',
    history_desc: 'Last 50 transactions',
    history_empty: 'No transaction history yet',

    // ===== Redeem =====
    redeem_badge: 'GOT A CODE?',
    redeem_title_1: 'REDEEM',
    redeem_title_2: 'CODE',
    redeem_desc: 'Enter a promo/giveaway code to get free Polar Coin',
    redeem_label: 'Redeem Code',
    redeem_btn: 'REDEEM NOW',

    // ===== Feedback =====
    feedback_badge: 'YOUR VOICE MATTERS',
    feedback_title_1: 'SEND',
    feedback_title_2: 'FEEDBACK',
    feedback_desc: 'Got suggestions, criticism, or found a bug? Let us know',
    feedback_rating_label: 'Rating (optional)',
    feedback_message_label: 'Your Message',
    feedback_message_placeholder: 'Tell us here...',
    feedback_btn: 'SEND FEEDBACK',

    // ===== Request Script =====
    reqscript_badge: 'SUGGEST A NEW SCRIPT',
    reqscript_title_1: 'REQUEST',
    reqscript_title_2: 'SCRIPT',
    reqscript_desc: 'Want a specific bot script added? Let us know',
    reqscript_name_label: 'Script Name',
    reqscript_link_label: 'Reference Link (optional)',
    reqscript_reason_label: 'Why Do You Want This Script?',
    reqscript_btn: 'SEND REQUEST',

    // ===== Sponsor =====
    sponsor_badge: 'PARTNERSHIP',
    sponsor_title_1: 'BECOME A',
    sponsor_title_2: 'SPONSOR',
    sponsor_desc: 'Want to help fund servers or partner for promotion? Fill this form',
    sponsor_name_label: 'Name',
    sponsor_contact_label: 'Contact (Email / WhatsApp)',
    sponsor_company_label: 'Company/Brand (optional)',
    sponsor_message_label: 'Message',
    sponsor_btn: 'SEND PROPOSAL',

    // ===== Profile =====
    profile_you_badge: '✦ YOU!',
    profile_stat_title: 'STATISTICS',
    profile_total_session: 'Total Sessions:',
    profile_coin: 'Polar Coin:',
    profile_btn_claim: 'CLAIM SERVER',
    profile_logout: 'LOGOUT'
  }
};

// ============================================================
// Deteksi & terapin bahasa
// ============================================================
function polarDetectLang() {
  const saved = localStorage.getItem('polar_lang');
  if (saved === 'id' || saved === 'en') return saved;
  const browserLang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  return browserLang.startsWith('id') ? 'id' : 'en';
}

let polarCurrentLang = polarDetectLang();

function t(key) {
  return (POLAR_I18N[polarCurrentLang] && POLAR_I18N[polarCurrentLang][key]) || POLAR_I18N.id[key] || key;
}

function applyTranslations() {
  document.documentElement.lang = polarCurrentLang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });

  updateLangToggleLabel();
}

function setLang(lang) {
  polarCurrentLang = lang;
  localStorage.setItem('polar_lang', lang);
  applyTranslations();
}

function toggleLang() {
  setLang(polarCurrentLang === 'id' ? 'en' : 'id');
}

function updateLangToggleLabel() {
  document.querySelectorAll('.lang-toggle-label').forEach(el => {
    el.textContent = polarCurrentLang === 'id' ? 'EN' : 'ID';
  });
}

document.addEventListener('DOMContentLoaded', applyTranslations);
