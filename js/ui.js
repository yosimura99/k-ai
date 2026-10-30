/**
 * ui.js — Tiện ích giao diện dùng chung: hộp thoại xác nhận, thông báo nhanh, biểu tượng, tải file xuống, tạo phần tử.
 */

/** Tạo phần tử nhanh: el('div', 'lop', 'nội dung') — nội dung luôn là textContent. */
export function el(tag, className = '', text = '') {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

/**
 * Hộp thoại tuỳ biến (thay confirm() để mọi chữ đều là tiếng Việt).
 * @param {string} message
 * @param {{label:string,value:any,danger?:boolean}[]} buttons
 * @returns {Promise<any>} giá trị của nút được bấm (null nếu đóng)
 */
export function ask(message, buttons = [{ label: 'Đồng ý', value: true, primary: true }, { label: 'Huỷ', value: false }]) {
  return new Promise((resolve) => {
    const overlay = el('div', 'modal');
    const box = el('div', 'modal-box');
    box.appendChild(el('div', 'modal-msg', message));
    const row = el('div', 'modal-btns');
    const done = (v) => { overlay.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    buttons.forEach((b) => {
      const btn = el('button', 'btn' + (b.danger ? ' btn-danger' : b.primary ? ' btn-primary' : ''), b.label);
      btn.type = 'button';
      btn.addEventListener('click', () => done(b.value));
      row.appendChild(btn);
    });
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) done(null); });
    box.appendChild(row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    row.querySelector('button')?.focus();
  });
}

/** Tải một Blob xuống với tên file cho trước. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Dấu thời gian gọn cho tên file: 20261030-142701 */
export function fileStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Ngủ một khoảng thời gian (có thể huỷ bằng AbortSignal). */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Đã huỷ', 'AbortError')); }, { once: true });
  });
}

/** Ghép URL gốc với đường dẫn, bỏ dấu / thừa. */
export function joinUrl(base, path) {
  return String(base || '').trim().replace(/\/+$/, '') + path;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Biểu tượng từ bộ sprite trong index.html: icon('copy') → <svg><use href="#i-copy"/></svg> */
export function icon(name, className = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

/** Nút tròn chỉ có biểu tượng. */
export function iconButton(name, label, className = 'icon-btn') {
  const b = el('button', className);
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.title = label;
  b.appendChild(icon(name));
  return b;
}

/** Đổi biểu tượng của một nút (thay <use> bên trong svg đầu tiên). */
export function setIcon(btn, name) {
  const use = btn.querySelector('svg use');
  if (use) use.setAttribute('href', `#i-${name}`);
}

let toastTimer = null;
/** Thông báo nhanh ở đáy màn hình. level: 'info' | 'ok' | 'warn' | 'error' */
export function toast(text, level = 'info', ms = 2600) {
  let t = document.getElementById('toast');
  if (!t) {
    t = el('div', 'toast');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.dataset.level = level;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/**
 * Menu nhỏ bật lên cạnh một nút.
 * @param {HTMLElement} anchor
 * @param {{label:string, sub?:string, value:any, on?:boolean, icon?:string}[]} items
 * @returns {Promise<any>} giá trị được chọn (null nếu đóng)
 */
export function popMenu(anchor, items) {
  return new Promise((resolve) => {
    const scrim = el('div', 'menu-scrim');
    const menu = el('div', 'menu');
    menu.setAttribute('role', 'menu');
    const done = (v) => { scrim.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    items.forEach((it) => {
      const b = el('button', 'menu-item' + (it.on ? ' on' : ''));
      b.type = 'button';
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', it.on ? 'true' : 'false');
      if (it.icon) b.appendChild(icon(it.icon));
      const txt = el('span', 'menu-txt');
      txt.appendChild(el('span', 'menu-label', it.label));
      if (it.sub) txt.appendChild(el('span', 'menu-sub', it.sub));
      b.appendChild(txt);
      if (it.on) b.appendChild(icon('check', 'menu-check'));
      b.addEventListener('click', () => done(it.value));
      menu.appendChild(b);
    });
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', onKey);
    scrim.addEventListener('click', (e) => { if (e.target === scrim) done(null); });
    scrim.appendChild(menu);
    document.body.appendChild(scrim);
    // Đặt menu ngay trên nút (ô nhập nằm ở đáy màn hình)
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8));
    menu.style.left = `${left}px`;
    const below = r.top < window.innerHeight / 2;
    if (below) menu.style.top = `${r.bottom + 8}px`;
    else menu.style.bottom = `${window.innerHeight - r.top + 8}px`;
    menu.querySelector('.menu-item.on, .menu-item')?.focus();
  });
}

/** Chép chữ vào bộ nhớ tạm (có dự phòng cho trình duyệt cũ). */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;font-size:16px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* bỏ qua */ }
    ta.remove();
    return ok;
  }
}

/** Tự giãn chiều cao ô nhập theo nội dung. */
export function autoGrow(ta, max = 200) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, max) + 'px';
}
