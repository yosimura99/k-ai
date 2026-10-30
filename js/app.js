/**
 * app.js — Điểm khởi động: nạp cài đặt, bố cục (thanh bên / ngăn kéo, tab Hỏi · Tạo ảnh),
 * lịch sử trò chuyện, trò chuyện tạm thời, cài đặt, khoá sinh trắc và service worker (PWA).
 */
import { APP_VERSION } from './config.js';
import { loadSettings, saveSettings, requestPersist } from './storage.js';
import { initChat } from './chat.js';
import { initImage } from './image.js';
import { initSettings } from './settings.js';
import { createLock } from './lock.js';
import { el, iconButton, toast, copyText } from './ui.js';

const $ = (id) => document.getElementById(id);
const desktopMQ = window.matchMedia('(min-width: 900px)');

/* ---------- cài đặt dùng chung ---------- */
let settings = loadSettings();
let warnedSave = false;
let chat = null;
let image = null;
let prefs = null;

const getSettings = () => settings;
function setSettings(patch) {
  settings = { ...settings, ...patch };
  if (!saveSettings(settings) && !warnedSave) {
    warnedSave = true;
    toast('Không lưu được cài đặt — bộ nhớ trình duyệt bị chặn hoặc đầy', 'warn', 4000);
  }
  if ('chatModel' in patch || 'chatModelExpert' in patch || 'vision' in patch || 'chatMode' in patch) chat?.drawMode();
  if ('imageProvider' in patch || 'falModel' in patch || 'imageModel' in patch || 'pollModel' in patch || 'imageAspect' in patch) image?.drawPills();
}

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
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === name));
  try { sessionStorage.setItem('kai.tab', name); } catch { /* bỏ qua */ }
  drawHistory();
  (name === 'image' ? image : chat)?.focus();
}
tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tabBtn)));

/* ---------- thanh bên / ngăn kéo ---------- */
const scrim = $('scrim');
function openDrawer() {
  document.body.classList.add('drawer-open');
  scrim.hidden = false;
}
function closeDrawer() {
  document.body.classList.remove('drawer-open');
  scrim.hidden = true;
}
function toggleSidebar() {
  if (desktopMQ.matches) {
    const c = !document.body.classList.contains('side-collapsed');
    document.body.classList.toggle('side-collapsed', c);
    try { localStorage.setItem('kai.side', c ? 'collapsed' : 'open'); } catch { /* bỏ qua */ }
  } else closeDrawer();
}
$('menu-btn').addEventListener('click', () => {
  if (desktopMQ.matches) toggleSidebar();
  else openDrawer();
});
$('side-toggle').addEventListener('click', toggleSidebar);
scrim.addEventListener('click', closeDrawer);
desktopMQ.addEventListener?.('change', closeDrawer);
try { if (localStorage.getItem('kai.side') === 'collapsed') document.body.classList.add('side-collapsed'); } catch { /* bỏ qua */ }
// Vuốt sang trái để đóng ngăn kéo
let touchX = null;
$('sidebar').addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
$('sidebar').addEventListener('touchend', (e) => {
  if (touchX != null && touchX - e.changedTouches[0].clientX > 60) closeDrawer();
  touchX = null;
});

$('nav-new').addEventListener('click', (e) => { e.preventDefault(); newChat(); });
document.querySelectorAll('[data-nav]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  showTab(a.dataset.nav);
  closeDrawer();
}));

function newChat() {
  chat.newChat(false);
  showTab('chat');
  closeDrawer();
}
$('new-btn').addEventListener('click', newChat);

/* ---------- lịch sử ---------- */
const histEl = $('hist');
const searchEl = $('side-search');

function groupOf(t) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const today = d.getTime();
  if (t >= today) return 'Hôm nay';
  if (t >= today - 864e5) return 'Hôm qua';
  if (t >= today - 7 * 864e5) return '7 ngày trước';
  if (t >= today - 30 * 864e5) return '30 ngày trước';
  return 'Cũ hơn';
}

function drawHistory() {
  if (!chat) return;
  histEl.textContent = '';
  const q = searchEl.value.trim().toLocaleLowerCase('vi');
  const list = chat.list().filter((c) => !q
    || c.title.toLocaleLowerCase('vi').includes(q)
    || c.messages.some((m) => (m.content || '').toLocaleLowerCase('vi').includes(q)));
  if (!list.length) {
    histEl.appendChild(el('div', 'hist-empty', q ? 'Không tìm thấy cuộc trò chuyện nào' : 'Chưa có cuộc trò chuyện nào'));
    return;
  }
  let last = '';
  const cur = chat.current;
  list.forEach((c) => {
    const g = groupOf(c.updatedAt || c.createdAt);
    if (g !== last) { histEl.appendChild(el('div', 'hist-group', g)); last = g; }
    const row = el('div', 'hist-item' + (c.id === cur.id && document.body.dataset.tab === 'chat' ? ' on' : ''));
    const a = el('a', '', c.title || 'Cuộc trò chuyện');
    a.href = '#';
    a.title = c.title;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      chat.openChat(c.id);
      showTab('chat');
      closeDrawer();
    });
    const del = iconButton('trash', 'Xoá cuộc trò chuyện', 'icon-btn sm hist-del');
    del.addEventListener('click', () => chat.deleteChat(c.id));
    row.append(a, del);
    histEl.appendChild(row);
  });
}
searchEl.addEventListener('input', drawHistory);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (!desktopMQ.matches) openDrawer();
    else document.body.classList.remove('side-collapsed');
    searchEl.focus();
    searchEl.select();
  }
});

/* ---------- trò chuyện tạm thời (biểu tượng con ma) ---------- */
const tempBtn = $('temp-btn');
function drawTemp() {
  const on = !!chat?.temp;
  tempBtn.classList.toggle('on', on);
  tempBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  document.body.classList.toggle('temp-chat', on);
}
tempBtn.addEventListener('click', () => {
  const on = !chat.temp;
  chat.setTemp(on);
  showTab('chat');
  toast(on ? 'Trò chuyện tạm thời — không lưu vào lịch sử' : 'Đã tắt trò chuyện tạm thời');
});

/* ---------- chia sẻ ---------- */
$('share-btn').addEventListener('click', async () => {
  const c = chat.current;
  if (!c.messages.length) { toast('Chưa có nội dung để chia sẻ', 'warn'); return; }
  const text = c.messages.map((m) => `${m.role === 'user' ? 'Bạn' : 'K.AI'}: ${m.content}`).join('\n\n');
  if (navigator.share) {
    try { await navigator.share({ title: c.title || 'K.AI', text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const ok = await copyText(text);
  toast(ok ? 'Đã chép cuộc trò chuyện vào bộ nhớ tạm' : 'Không chia sẻ được', ok ? 'ok' : 'error');
});

/* ---------- khởi tạo ---------- */
const lock = createLock();
chat = initChat({
  getSettings,
  updateSettings: setSettings,
  showTab,
  openSettings: (sec) => prefs.open(sec),
  onChatsChanged: drawHistory,
  onCurrentChanged: () => { drawTemp(); drawHistory(); },
});
image = initImage({
  getSettings,
  updateSettings: setSettings,
  openSettings: (sec) => prefs.open(sec),
});
prefs = initSettings({ getSettings, setSettings, lock, chat, image });
$('open-settings').addEventListener('click', () => { closeDrawer(); prefs.open(); });

drawTemp();
showTab(sessionStorage.getItem('kai.tab') === 'image' ? 'image' : 'chat');
document.documentElement.dataset.version = APP_VERSION;

requestPersist();

/* ---------- khoá sinh trắc ---------- */
lock.gate().then(() => chat.focus());

/* ---------- service worker (PWA) ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Không đăng ký được chế độ ngoại tuyến:', e.message));
  });
}
