/**
 * ui.js — Tiện ích giao diện dùng chung: hộp thoại xác nhận, tải file xuống, tạo phần tử.
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
export function ask(message, buttons = [{ label: 'ĐỒNG Ý', value: true }, { label: 'HUỶ', value: false }]) {
  return new Promise((resolve) => {
    const overlay = el('div', 'modal');
    const box = el('div', 'modal-box');
    box.appendChild(el('div', 'modal-msg', message));
    const row = el('div', 'modal-btns');
    const done = (v) => { overlay.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    buttons.forEach((b) => {
      const btn = el('button', 'btn' + (b.danger ? ' btn-red' : ''), b.label);
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
