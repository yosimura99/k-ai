/**
 * log.js — Dòng nhật ký kiểu terminal.
 * Mọi nội dung đều được chèn bằng textContent / createElement,
 * KHÔNG dùng innerHTML với dữ liệu từ mô hình hay API.
 */

/** Định dạng giờ HH:MM:SS. */
export function hms(date = new Date()) {
  return date.toTimeString().slice(0, 8);
}

/** Các mức nhật ký: nhãn + lớp CSS. */
export const LEVELS = {
  ok: { tag: '[ ĐẠT ]', cls: 'lv-ok' },
  info: { tag: '[TIN]', cls: 'lv-info' },
  warn: { tag: '[CẢNH BÁO]', cls: 'lv-warn' },
  error: { tag: '[LỖI]', cls: 'lv-error' },
};

/**
 * Tạo một bộ ghi nhật ký gắn với một khung (container).
 * @param {HTMLElement} box   Khung cuộn chứa các dòng
 * @param {HTMLElement} [anchor] Phần tử luôn nằm cuối (dòng "đang chờ lệnh")
 */
export function createLogger(box, anchor = null) {
  /** Cuộn xuống cuối nếu người dùng đang ở gần cuối. */
  function scroll(force = false) {
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    if (force || nearBottom) box.scrollTop = box.scrollHeight;
  }

  /** Chèn phần tử trước dòng neo. */
  function append(el, force = true) {
    if (anchor && anchor.parentNode === box) box.insertBefore(el, anchor);
    else box.appendChild(el);
    scroll(force);
    return el;
  }

  /** Ghi một dòng nhật ký có mức. */
  function line(level, text) {
    const lv = LEVELS[level] || LEVELS.info;
    const el = document.createElement('div');
    el.className = `log-line ${lv.cls}`;
    el.textContent = `[${hms()}] ${lv.tag} ${text}`;
    return append(el);
  }

  return {
    ok: (t) => line('ok', t),
    info: (t) => line('info', t),
    warn: (t) => line('warn', t),
    error: (t) => line('error', t),
    append,
    scroll,
    /** Xoá mọi dòng (giữ lại dòng neo). */
    clear() {
      [...box.children].forEach((c) => { if (c !== anchor) c.remove(); });
    },
    /** Dòng trống ngăn cách. */
    gap() {
      const el = document.createElement('div');
      el.className = 'log-gap';
      return append(el);
    },
  };
}

/**
 * Chuyển lỗi HTTP / mạng thành câu tiếng Việt ngắn gọn.
 * @param {number} status
 * @param {string} detail Thông điệp lỗi từ API (nếu có)
 */
export function describeHttpError(status, detail = '') {
  const map = {
    400: 'yêu cầu không hợp lệ',
    401: 'khoá API sai hoặc hết hạn',
    403: 'bị từ chối truy cập',
    404: 'không tìm thấy địa chỉ / mô hình',
    408: 'hết thời gian chờ',
    413: 'yêu cầu quá lớn',
    422: 'tham số không hợp lệ',
    429: 'vượt giới hạn yêu cầu',
    500: 'máy chủ lỗi',
    502: 'cổng lỗi',
    503: 'máy chủ quá tải',
    504: 'máy chủ hết thời gian chờ',
  };
  const base = map[status] || 'lỗi máy chủ';
  return `HTTP ${status} // ${base}${detail ? ' // ' + detail : ''}`;
}

/** Lấy thông điệp lỗi từ thân phản hồi JSON / text của API. */
export async function readErrorDetail(res) {
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      const e = j.error;
      if (typeof e === 'string') return e;
      if (e && e.message) return e.message;
      if (j.message) return j.message;
      if (j.detail) return typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
      return text.slice(0, 300);
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return '';
  }
}

/** Định dạng số giây kiểu Việt: 6,1 giây. */
export function secs(ms) {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} giây`;
}
