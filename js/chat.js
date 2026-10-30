/**
 * chat.js — Tab TRÒ CHUYỆN.
 * Gọi endpoint Chat Completions tương thích OpenAI: POST {baseUrl}/chat/completions
 * Hỗ trợ phát trực tiếp (SSE) và tự lùi về chế độ thường khi cần.
 */
import { SYSTEM_PROMPT } from '../system-prompt.js';
import { SLOW_MS, MAX_RETRIES } from './config.js';
import { loadHistory, saveHistory, clearHistory } from './storage.js';
import { createLogger, describeHttpError, readErrorDetail, secs, hms } from './log.js';
import { el, ask, downloadBlob, fileStamp, sleep, joinUrl } from './ui.js';

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * Hiển thị văn bản có khối mã ```...``` thành các khối đơn cách.
 * Chỉ dùng textContent — không bao giờ chèn HTML thô từ mô hình.
 */
export function renderRich(container, text) {
  container.textContent = '';
  const fence = /```([^\n`]*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let m;
  while ((m = fence.exec(text)) !== null) {
    if (m.index > last) appendInline(container, text.slice(last, m.index));
    const pre = el('pre', 'code-block');
    if (m[1].trim()) pre.dataset.lang = m[1].trim();
    pre.appendChild(el('code', '', m[2].replace(/\n$/, '')));
    container.appendChild(pre);
    last = fence.lastIndex;
    if (m[0].length === 0) break; // phòng vòng lặp vô hạn
  }
  if (last < text.length) appendInline(container, text.slice(last));
}

/** Văn bản thường, nhận dạng `mã nội dòng`. */
function appendInline(container, text) {
  const parts = text.replace(/^\n+|\n+$/g, '').split(/(`[^`\n]+`)/);
  if (parts.length === 1 && !parts[0]) return;
  const span = el('span', 'rich-text');
  parts.forEach((p) => {
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) span.appendChild(el('code', 'code-inline', p.slice(1, -1)));
    else if (p) span.appendChild(document.createTextNode(p));
  });
  container.appendChild(span);
}

/**
 * Khởi tạo tab trò chuyện.
 * @param {object} ctx { getSettings, onStatus(ok:boolean) }
 */
export function initChat(ctx) {
  const box = document.getElementById('chat-log');
  const anchor = document.getElementById('chat-idle');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const log = createLogger(box, anchor);

  let history = loadHistory();
  let controller = null; // AbortController của yêu cầu đang chạy

  /* ---------- hiển thị ---------- */

  function renderUser(text) {
    const d = el('div', 'msg-user');
    d.appendChild(el('span', 'prompt', '> ban@iphone:~$ '));
    d.appendChild(el('span', '', text));
    return log.append(d);
  }

  function renderAI(text = '') {
    const d = el('div', 'msg-ai');
    d.appendChild(el('span', 'prefix', 'MÁY> '));
    const body = el('div', 'msg-body');
    d.appendChild(body);
    renderRich(body, text);
    log.append(d);
    return body;
  }

  function persist() {
    if (!saveHistory(history)) log.warn('bộ nhớ trình duyệt đầy // không lưu được lịch sử');
  }

  /** Vẽ lại toàn bộ lịch sử (khi mở app). */
  function restore() {
    log.clear();
    log.info(`đã nạp lời nhắc hệ thống (${SYSTEM_PROMPT.length} ký tự)`);
    if (history.length) {
      log.info(`đã khôi phục phiên // ${history.length} tin nhắn`);
      history.forEach((m) => {
        if (m.role === 'user') { log.gap(); renderUser(m.content); }
        else renderAI(m.content);
      });
    }
  }

  /* ---------- gọi API ---------- */

  /** Một lần gửi yêu cầu, trả về Response (đã kiểm tra lỗi tạm thời / thử lại). */
  async function request(url, key, body, signal) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal,
      });
      if (res.ok) return res;
      const detail = await readErrorDetail(res);
      if (RETRY_STATUS.has(res.status) && attempt < MAX_RETRIES) {
        const ra = parseFloat(res.headers.get('retry-after'));
        const wait = Number.isFinite(ra) ? Math.min(ra * 1000, 60000) : 2000 * 2 ** attempt;
        log.error(`${describeHttpError(res.status, detail)} // chờ ${Math.round(wait / 1000)} giây`);
        log.warn(`thử lại (${attempt + 1}/${MAX_RETRIES})`);
        await sleep(wait, signal);
        continue;
      }
      const err = new Error(describeHttpError(res.status, detail));
      err.status = res.status;
      throw err;
    }
  }

  /** Đọc luồng SSE, gọi onDelta(chuỗi) cho từng mẩu nội dung. */
  async function readSSE(res, onDelta) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const j = JSON.parse(payload);
          if (j.error) throw new Error(j.error.message || String(j.error));
          const delta = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? '';
          if (delta) onDelta(delta);
        } catch (e) {
          if (e instanceof SyntaxError) continue; // mẩu JSON hỏng: bỏ qua
          throw e;
        }
      }
    }
  }

  /** Lấy nội dung từ phản hồi JSON không-stream. */
  function extractContent(j) {
    const c = j?.choices?.[0]?.message?.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map((p) => p.text || '').join('');
    return '';
  }

  /** Gửi tin nhắn hiện tại trong ô nhập. */
  async function send() {
    const text = input.value.trim();
    if (!text) return;
    const s = ctx.getSettings();
    if (!s.chatApiKey) {
      log.warn('chưa có khoá API // vào CÀI ĐẶT để nhập khoá trò chuyện');
      ctx.onStatus(false);
      return;
    }
    if (!s.chatBaseUrl || !s.chatModel) {
      log.warn('thiếu địa chỉ API hoặc tên mô hình // kiểm tra CÀI ĐẶT');
      return;
    }

    input.value = '';
    autoGrow();
    log.gap();
    renderUser(text);
    history.push({ role: 'user', content: text, t: Date.now() });
    persist();

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map(({ role, content }) => ({ role, content })),
    ];
    const url = joinUrl(s.chatBaseUrl, '/chat/completions');
    controller = new AbortController();
    setBusy(true);
    log.info('đang gửi yêu cầu...');
    const t0 = performance.now();
    let got = false;
    const slowTimer = setTimeout(() => { if (!got) log.warn('phản hồi chậm // vẫn đang chờ...'); }, SLOW_MS);

    let reply = '';
    let body = null;
    let pending = false;
    const paint = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; if (body) { renderRich(body, reply); log.scroll(); } });
    };

    try {
      let stream = !!s.stream;
      let res;
      try {
        res = await request(url, s.chatApiKey, { model: s.chatModel, messages, stream }, controller.signal);
      } catch (e) {
        // Một số nhà cung cấp không hỗ trợ stream → thử lại một lần ở chế độ thường
        if (stream && e.status >= 400 && e.status < 500 && ![401, 403, 429].includes(e.status) && !/api key|khoá/i.test(e.message)) {
          log.warn(`${e.message} // thử lại không phát trực tiếp`);
          stream = false;
          res = await request(url, s.chatApiKey, { model: s.chatModel, messages, stream: false }, controller.signal);
        } else throw e;
      }

      const type = res.headers.get('content-type') || '';
      if (stream && res.body && type.includes('text/event-stream')) {
        body = renderAI('');
        try {
          await readSSE(res, (d) => {
            if (!got) { got = true; log.info(`đang nhận dữ liệu // ${secs(performance.now() - t0)}`); }
            reply += d;
            paint();
          });
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          if (!reply) throw e;
          log.warn(`luồng bị ngắt giữa chừng // ${e.message}`);
        }
      } else {
        const j = await res.json();
        reply = extractContent(j);
        got = true;
        body = renderAI('');
      }
      got = true;
      renderRich(body, reply || '(phản hồi trống)');
      if (reply) {
        history.push({ role: 'assistant', content: reply, t: Date.now() });
        persist();
      }
      log.ok(`đã phản hồi // ${secs(performance.now() - t0)}`);
      ctx.onStatus(true);
    } catch (e) {
      got = true;
      if (e.name === 'AbortError') {
        log.warn('đã dừng yêu cầu');
        if (reply) { history.push({ role: 'assistant', content: reply, t: Date.now() }); persist(); }
      } else if (e instanceof TypeError) {
        log.error(`không kết nối được ${url} // mạng hoặc CORS bị chặn (${e.message})`);
      } else {
        log.error(e.message || String(e));
        if (e.status === 401 || e.status === 403 || /api key/i.test(e.message)) ctx.onStatus(false);
      }
    } finally {
      clearTimeout(slowTimer);
      controller = null;
      setBusy(false);
    }
  }

  function setBusy(busy) {
    sendBtn.textContent = busy ? 'DỪNG' : 'GỬI';
    sendBtn.classList.toggle('btn-red', busy);
    anchor.querySelector('.idle-text').textContent = busy ? 'đang xử lý' : 'đang chờ lệnh';
  }

  /* ---------- xuất / xoá ---------- */

  async function exportLog() {
    if (!history.length) { log.warn('nhật ký trống // không có gì để xuất'); return; }
    const fmt = await ask('Chọn định dạng xuất nhật ký:', [
      { label: '.TXT', value: 'txt' },
      { label: '.JSON', value: 'json' },
      { label: 'HUỶ', value: null },
    ]);
    if (!fmt) return;
    const s = ctx.getSettings();
    const name = `kai-nhatky-${fileStamp()}.${fmt}`;
    let blob;
    if (fmt === 'json') {
      blob = new Blob([JSON.stringify({
        app: 'K.AI', xuatLuc: new Date().toISOString(), moHinh: s.chatModel,
        loiNhacHeThong: SYSTEM_PROMPT, tinNhan: history,
      }, null, 2)], { type: 'application/json' });
    } else {
      const lines = history.map((m) => {
        const who = m.role === 'user' ? 'BẠN' : 'K.AI';
        const time = m.t ? new Date(m.t).toLocaleString('vi-VN') : '';
        return `[${time}] ${who}:\n${m.content}\n`;
      });
      blob = new Blob([`NHẬT KÝ K.AI — ${new Date().toLocaleString('vi-VN')}\n\n` + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    }
    downloadBlob(blob, name);
    log.ok(`đã xuất ${name}`);
  }

  async function clearLog() {
    const ok = await ask('Xoá toàn bộ nhật ký trò chuyện? Không thể hoàn tác.', [
      { label: 'XOÁ', value: true, danger: true },
      { label: 'HUỶ', value: false },
    ]);
    if (!ok) return;
    controller?.abort();
    history = [];
    clearHistory();
    log.clear();
    log.ok('đã xoá nhật ký');
  }

  /* ---------- sự kiện ---------- */

  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  }

  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', (e) => {
    // Enter = gửi, Shift+Enter = xuống dòng (bỏ qua khi đang gõ bộ gõ tiếng Việt / IME)
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      if (!controller) send();
    }
  });
  sendBtn.addEventListener('click', () => (controller ? controller.abort() : send()));
  document.getElementById('chat-export').addEventListener('click', exportLog);
  document.getElementById('chat-clear').addEventListener('click', clearLog);

  restore();
  return { log, restore, reset() { history = []; log.clear(); } };
}

export { hms };
