/**
 * app.js — Điểm khởi động: nạp cài đặt, chuyển tab, đồng hồ, dòng trạng thái,
 * khoá sinh trắc và service worker (PWA).
 */
import { APP_VERSION, imageKeyOf, imageModelOf } from './config.js';
import { loadSettings, saveSettings, requestPersist, storageEstimate } from './storage.js';
import { hms } from './log.js';
import { initChat } from './chat.js';
import { initImage } from './image.js';
import { initSettings } from './settings.js';
import { createLock } from './lock.js';

/* ---------- cài đặt dùng chung ---------- */
let settings = loadSettings();
let keyVerified = false; // đã có ít nhất một phản hồi thành công với khoá hiện tại
let warnedSave = false;
let chat = null;  // gán sau khi khởi tạo
let image = null;

const getSettings = () => settings;
function setSettings(patch, { quiet = false } = {}) {
  const keyChanged = 'chatApiKey' in patch && patch.chatApiKey !== settings.chatApiKey;
  settings = { ...settings, ...patch };
  if (keyChanged) keyVerified = false;
  if (!saveSettings(settings) && !warnedSave) {
    warnedSave = true;
    chat?.log.warn('không lưu được cài đặt // bộ nhớ trình duyệt bị chặn hoặc đầy');
  }
  if (!quiet || keyChanged) refreshStatus();
  if ('imageSize' in patch) image?.syncSize();
}

/* ---------- dòng trạng thái ---------- */
const statusEl = document.getElementById('status');
let statusOverride = null; // dòng trạng thái riêng của tab ảnh

function refreshStatus() {
  const tab = document.body.dataset.tab;
  statusEl.className = 'status';
  if (tab === 'image' && statusOverride) {
    statusEl.textContent = statusOverride.text;
    statusEl.classList.add(`lv-${statusOverride.level}`);
    return;
  }
  const online = navigator.onLine;
  const isImg = tab === 'image';
  const model = isImg ? imageModelOf(settings) : settings.chatModel;
  const key = isImg ? imageKeyOf(settings) : settings.chatApiKey;
  const parts = [online ? 'TRỰC TUYẾN' : 'NGOẠI TUYẾN', `MÔ HÌNH: ${model || '?'}`];
  if (isImg && settings.imageProvider === 'free') parts.push(key ? 'ĐÃ NẠP KHOÁ' : 'MIỄN PHÍ // KHÔNG CẦN KHOÁ');
  else if (!key) parts.push('CHƯA CÓ KHOÁ');
  else parts.push(keyVerified && !isImg ? 'KHOÁ HỢP LỆ' : 'ĐÃ NẠP KHOÁ');
  statusEl.textContent = parts.join(' // ');
  if (!online || (!key && !(isImg && settings.imageProvider === 'free'))) statusEl.classList.add('lv-warn');
}
window.addEventListener('online', refreshStatus);
window.addEventListener('offline', refreshStatus);

/* ---------- tab ---------- */
const tabs = document.querySelectorAll('[data-tab-btn]');
function showTab(name) {
  document.body.dataset.tab = name;
  tabs.forEach((t) => {
    const on = t.dataset.tabBtn === name;
    t.classList.toggle('on', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  refreshStatus();
  try { sessionStorage.setItem('kai.tab', name); } catch { /* bỏ qua */ }
}
tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tabBtn)));

/* ---------- đồng hồ ---------- */
const clockEl = document.getElementById('clock');
const idleTimeEl = document.querySelector('#chat-idle .idle-time');
function tick() {
  const t = hms();
  clockEl.textContent = t;
  if (idleTimeEl) idleTimeEl.textContent = `[${t}] `;
}
tick();
setInterval(tick, 1000);

/* ---------- khởi tạo các tab ---------- */
const lock = createLock();
chat = initChat({
  getSettings,
  onStatus(ok) { keyVerified = ok; refreshStatus(); },
});
image = initImage({
  getSettings,
  setSettings,
  setStatusLine(text, level) { statusOverride = { text, level }; refreshStatus(); },
});
initSettings({ getSettings, setSettings, lock });

showTab(sessionStorage.getItem('kai.tab') || 'chat');

/* ---------- nhật ký khởi động ---------- */
chat.log.info(`hệ thống ${APP_VERSION} // sẵn sàng`);
if (!settings.chatApiKey) chat.log.warn('chưa có khoá API // vào CÀI ĐẶT để nhập khoá');
else chat.log.ok(`đã nạp khoá API // mô hình ${settings.chatModel}`);

requestPersist();
storageEstimate().then((est) => {
  if (est && est.warn) chat.log.warn(`bộ nhớ máy đã dùng ${Math.round(est.ratio * 100)}%`);
});

/* ---------- khoá sinh trắc ---------- */
lock.gate();

/* ---------- service worker (PWA) ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => chat.log.warn(`không đăng ký được chế độ ngoại tuyến // ${e.message}`));
  });
}
