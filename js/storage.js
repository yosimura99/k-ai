/**
 * storage.js — Lưu trữ cục bộ trên thiết bị.
 *  - Cài đặt + lịch sử trò chuyện: localStorage (nhỏ, đồng bộ).
 *  - Ảnh: IndexedDB (lớn, lưu dạng Blob).
 * Không có dữ liệu nào rời khỏi máy, trừ các yêu cầu gửi tới API bạn cấu hình.
 */
import { LS_KEYS, DEFAULT_SETTINGS, IDB_NAME, IDB_VERSION, IDB_STORE, STORAGE_WARN_RATIO } from './config.js';

/* ---------------- localStorage ---------------- */

/** Đọc JSON an toàn từ localStorage. */
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** Ghi JSON vào localStorage; trả về false nếu đầy bộ nhớ hoặc bị chặn. */
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...readJSON(LS_KEYS.settings, {}) };
}

export function saveSettings(settings) {
  return writeJSON(LS_KEYS.settings, settings);
}

/** Lịch sử trò chuyện: mảng { role: 'user'|'assistant', content, t } */
export function loadHistory() {
  const h = readJSON(LS_KEYS.history, []);
  return Array.isArray(h) ? h : [];
}

export function saveHistory(history) {
  return writeJSON(LS_KEYS.history, history);
}

export function clearHistory() {
  localStorage.removeItem(LS_KEYS.history);
}

/**
 * Các cuộc trò chuyện (bản 2): mảng { id, title, createdAt, updatedAt, messages: [...] }.
 * Lần đầu mở bản 2: lịch sử bản 1.x (một cuộc duy nhất) được chuyển thành một cuộc trò chuyện.
 */
export function loadChats() {
  let chats = readJSON(LS_KEYS.chats, null);
  if (!Array.isArray(chats)) {
    chats = [];
    const old = loadHistory();
    if (old.length) {
      const first = old.find((m) => m.role === 'user');
      const t0 = old[0].t || Date.now();
      chats.push({
        id: `c${t0}`,
        title: (first?.content || 'Cuộc trò chuyện cũ').slice(0, 60),
        createdAt: t0,
        updatedAt: old[old.length - 1].t || t0,
        messages: old.map(({ role, content, t }) => ({ role, content, t })),
      });
    }
    writeJSON(LS_KEYS.chats, chats);
  }
  return chats.filter((c) => c && Array.isArray(c.messages));
}

export function saveChats(chats) {
  return writeJSON(LS_KEYS.chats, chats);
}

/* ---------------- IndexedDB (ảnh) ---------------- */

let dbPromise = null;

/** Mở (hoặc tạo) cơ sở dữ liệu ảnh. */
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('Trình duyệt không hỗ trợ IndexedDB'));
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        const store = db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Chạy một thao tác trong transaction và trả về Promise kết quả. */
async function tx(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(IDB_STORE, mode);
    const store = t.objectStore(IDB_STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** Lưu một ảnh: { id, prompt, model, size, createdAt, blob?, url? } */
export function putImage(record) {
  return tx('readwrite', (s) => s.put(record));
}

/** Lấy toàn bộ ảnh, mới nhất trước. */
export async function listImages() {
  const all = (await tx('readonly', (s) => s.getAll())) || [];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteImage(id) {
  return tx('readwrite', (s) => s.delete(id));
}

/** Xoá toàn bộ dữ liệu cục bộ: localStorage + IndexedDB. */
export async function wipeAll() {
  Object.values(LS_KEYS).forEach((k) => localStorage.removeItem(k));
  try {
    const db = await openDB();
    db.close();
  } catch { /* bỏ qua */ }
  dbPromise = null;
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(IDB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

/**
 * Ước tính dung lượng đã dùng. Trả về { ratio, usage, quota } hoặc null
 * nếu trình duyệt không hỗ trợ.
 */
export async function storageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (!quota) return null;
    return { usage, quota, ratio: usage / quota, warn: usage / quota >= STORAGE_WARN_RATIO };
  } catch {
    return null;
  }
}

/** Xin trình duyệt giữ dữ liệu lâu dài (tránh bị tự xoá). */
export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch { /* bỏ qua */ }
  return false;
}
