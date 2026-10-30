/**
 * chat.js — Trang HỎI (trò chuyện).
 * Gọi endpoint Chat Completions tương thích OpenAI: POST {baseUrl}/chat/completions
 * Hỗ trợ phát trực tiếp (SSE), tự lùi về chế độ thường khi nhà cung cấp không hỗ trợ stream.
 * Nhiều cuộc trò chuyện (localStorage), trò chuyện tạm thời (không lưu), đính kèm ảnh (vision),
 * chế độ Nhanh / Chuyên gia (hai tên mô hình trong Cài đặt), đọc chính tả và đọc to.
 */
import { SYSTEM_PROMPT } from '../system-prompt.js';
import { SLOW_MS, MAX_RETRIES } from './config.js';
import { loadChats, saveChats } from './storage.js';
import { describeHttpError, readErrorDetail } from './log.js';
import { el, icon, iconButton, setIcon, toast, popMenu, copyText, autoGrow, sleep, joinUrl, ask } from './ui.js';
import { renderMarkdown } from './md.js';
import { canDictate, canSpeak, toggleDictation, toggleSpeak, plainForSpeech } from './speech.js';

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const MODE_LABEL = { fast: 'Nhanh', expert: 'Chuyên gia' };
const MODE_ICON = { fast: 'bolt', expert: 'brain' };
const MAX_ATTACH = 4;
const isDesktopInput = () => !window.matchMedia('(pointer: coarse)').matches; // điện thoại / máy tính bảng: chạm

const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const fmtSecs = (ms) => `${(ms / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} giây`;

/**
 * @param {object} ctx { getSettings, updateSettings(patch), showTab(name), openSettings(), onChatsChanged(), onCurrentChanged() }
 */
export function initChat(ctx) {
  const scroller = document.getElementById('thread-scroll');
  const thread = document.getElementById('thread');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const micBtn = document.getElementById('chat-mic');
  const attachBtn = document.getElementById('chat-attach');
  const fileInput = document.getElementById('chat-file');
  const attachRow = document.getElementById('chat-attachments');
  const modeBtn = document.getElementById('mode-btn');
  const panel = document.getElementById('panel-chat');
  const emptySub = document.getElementById('empty-sub');

  let chats = loadChats();
  let current = blankChat(false);
  let controller = null;   // AbortController của yêu cầu đang chạy
  let pending = [];        // ảnh đính kèm (data URL) chờ gửi

  function blankChat(temp) {
    return { id: newId(), title: '', createdAt: Date.now(), updatedAt: Date.now(), messages: [], temp };
  }

  /* ---------- lưu ---------- */

  function persist() {
    if (current.temp || !current.messages.length) return;
    current.updatedAt = Date.now();
    if (!current.title) {
      const first = current.messages.find((m) => m.role === 'user');
      current.title = (first?.content || 'Ảnh đính kèm').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Cuộc trò chuyện';
    }
    if (!chats.includes(current)) chats.unshift(current);
    chats.sort((a, b) => b.updatedAt - a.updatedAt);
    const { temp, ...clean } = current; // eslint-disable-line no-unused-vars
    const list = chats.map((c) => (c === current ? clean : c));
    if (!saveChats(list)) toast('Bộ nhớ trình duyệt đầy — không lưu được lịch sử', 'warn', 4000);
    ctx.onChatsChanged?.();
  }

  /* ---------- hiển thị ---------- */

  const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
  const toBottom = (force = false) => { if (force || nearBottom()) scroller.scrollTop = scroller.scrollHeight; };

  function updateEmpty() {
    const empty = !current.messages.length && !thread.querySelector('.msg-note');
    panel.classList.toggle('is-empty', empty);
    emptySub.textContent = current.temp ? 'Trò chuyện tạm thời — không lưu vào lịch sử' : '';
    emptySub.hidden = !current.temp;
  }

  function renderUser(m) {
    const d = el('div', 'msg-user');
    if (m.images?.length) {
      const imgs = el('div', 'msg-imgs');
      m.images.forEach((src) => { const im = el('img'); im.src = src; im.alt = 'Ảnh đính kèm'; im.decoding = 'async'; imgs.appendChild(im); });
      d.appendChild(imgs);
    }
    if (m.content) d.appendChild(el('div', 'bubble', m.content));
    thread.appendChild(d);
    return d;
  }

  function renderAI(m, index) {
    const d = el('div', 'msg-ai');
    const body = el('div', 'md');
    d.appendChild(body);
    renderMarkdown(body, m.content);
    d.appendChild(actionsFor(m, index));
    thread.appendChild(d);
    return d;
  }

  function actionsFor(m, index) {
    const row = el('div', 'msg-actions');
    const copy = iconButton('copy', 'Sao chép', 'act');
    copy.addEventListener('click', async () => {
      if (await copyText(m.content)) { setIcon(copy, 'check'); setTimeout(() => setIcon(copy, 'copy'), 1400); toast('Đã sao chép'); }
      else toast('Không sao chép được', 'error');
    });
    row.appendChild(copy);
    const redo = iconButton('redo', 'Tạo lại câu trả lời', 'act');
    redo.addEventListener('click', () => regenerate(index));
    row.appendChild(redo);
    if (canSpeak) {
      const sp = iconButton('speaker', 'Đọc to', 'act');
      sp.addEventListener('click', () => {
        const on = toggleSpeak(plainForSpeech(m.content), () => sp.classList.remove('on'));
        document.querySelectorAll('.act.on').forEach((b) => b.classList.remove('on'));
        sp.classList.toggle('on', on);
      });
      row.appendChild(sp);
    }
    const meta = [];
    if (m.mode) meta.push(MODE_LABEL[m.mode] || m.mode);
    if (m.ms) meta.push(fmtSecs(m.ms));
    if (meta.length) {
      const span = el('span', 'meta', meta.join(' · '));
      if (m.model) span.title = m.model;
      row.appendChild(span);
    }
    return row;
  }

  /** Ghi chú lỗi / nhắc nhở (không lưu). */
  function renderNote(text, actions = []) {
    thread.querySelectorAll('.msg-note').forEach((n) => n.remove());
    const d = el('div', 'msg-note');
    d.appendChild(icon('alert'));
    const t = el('div', 'note-body');
    t.appendChild(el('div', 'note-text', text));
    if (actions.length) {
      const r = el('div', 'note-actions');
      actions.forEach(({ label, run }) => {
        const b = el('button', 'pill-btn', label);
        b.type = 'button';
        b.addEventListener('click', () => { d.remove(); updateEmpty(); run(); });
        r.appendChild(b);
      });
      t.appendChild(r);
    }
    d.appendChild(t);
    thread.appendChild(d);
    updateEmpty();
    toBottom(true);
  }

  function renderAll() {
    thread.textContent = '';
    current.messages.forEach((m, i) => (m.role === 'user' ? renderUser(m) : renderAI(m, i)));
    updateEmpty();
    requestAnimationFrame(() => toBottom(true));
  }

  /* ---------- gọi API ---------- */

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
        toast(`${describeHttpError(res.status, detail)} — thử lại sau ${Math.round(wait / 1000)} giây (${attempt + 1}/${MAX_RETRIES})`, 'warn', wait);
        await sleep(wait, signal);
        continue;
      }
      const err = new Error(describeHttpError(res.status, detail));
      err.status = res.status;
      throw err;
    }
  }

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

  function extractContent(j) {
    const c = j?.choices?.[0]?.message?.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map((p) => p.text || '').join('');
    return '';
  }

  /** Tin nhắn gửi đi: lời nhắc hệ thống + lịch sử (ảnh đính kèm dạng content parts). */
  function apiMessages() {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      ...current.messages.map((m) => {
        if (m.role === 'user' && m.images?.length) {
          return {
            role: 'user',
            content: [
              ...(m.content ? [{ type: 'text', text: m.content }] : []),
              ...m.images.map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          };
        }
        return { role: m.role, content: m.content };
      }),
    ];
  }

  function modelFor(s, mode) {
    return (mode === 'expert' ? s.chatModelExpert : s.chatModel) || s.chatModel || s.chatModelExpert;
  }

  function checkReady(s) {
    if (!s.chatApiKey) {
      renderNote('Chưa có khoá API trò chuyện. Mở Cài đặt → Trò chuyện để nhập khoá.', [{ label: 'Mở cài đặt', run: () => ctx.openSettings('chat') }]);
      return false;
    }
    if (!s.chatBaseUrl || !modelFor(s, s.chatMode)) {
      renderNote('Thiếu địa chỉ API hoặc tên mô hình. Kiểm tra Cài đặt → Trò chuyện.', [{ label: 'Mở cài đặt', run: () => ctx.openSettings('chat') }]);
      return false;
    }
    return true;
  }

  /** Gửi tin nhắn trong ô nhập. */
  async function send() {
    const text = input.value.trim();
    if (!text && !pending.length) return;
    const s = ctx.getSettings();
    if (!checkReady(s)) return;
    thread.querySelectorAll('.msg-note').forEach((n) => n.remove());
    const m = { role: 'user', content: text, t: Date.now() };
    if (pending.length) m.images = pending.slice();
    input.value = '';
    autoGrow(input);
    clearAttachments();
    current.messages.push(m);
    renderUser(m);
    updateEmpty();
    persist();
    toBottom(true);
    await complete();
  }

  /** Tạo lại câu trả lời tại vị trí index (bỏ câu trả lời đó và mọi thứ sau nó). */
  async function regenerate(index) {
    if (controller) return;
    current.messages = current.messages.slice(0, index);
    while (current.messages.length && current.messages[current.messages.length - 1].role !== 'user') current.messages.pop();
    if (!current.messages.length) { renderAll(); return; }
    renderAll();
    persist();
    if (!checkReady(ctx.getSettings())) return;
    await complete();
  }

  /** Gọi mô hình cho lịch sử hiện tại (tin cuối là của người dùng). */
  async function complete() {
    const s = ctx.getSettings();
    const mode = s.chatMode === 'expert' ? 'expert' : 'fast';
    const model = modelFor(s, mode);
    const url = joinUrl(s.chatBaseUrl, '/chat/completions');
    const chat = current;
    const messages = apiMessages();

    const d = el('div', 'msg-ai');
    const body = el('div', 'md');
    const typing = el('div', 'typing');
    typing.append(el('i'), el('i'), el('i'));
    d.append(typing, body);
    thread.appendChild(d);
    toBottom(true);

    controller = new AbortController();
    const signal = controller.signal;
    setBusy(true);
    const t0 = performance.now();
    let got = false;
    const slowTimer = setTimeout(() => { if (!got) toast('Phản hồi chậm — vẫn đang chờ…', 'info', 4000); }, SLOW_MS);

    let reply = '';
    let queued = false;
    const paint = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; const stick = nearBottom(); renderMarkdown(body, reply); if (stick) toBottom(true); });
    };
    const finish = () => {
      typing.remove();
      const msg = { role: 'assistant', content: reply, t: Date.now(), mode, model, ms: Math.round(performance.now() - t0) };
      if (chat !== current) {
        // người dùng đã chuyển sang cuộc khác: vẫn lưu phần trả lời vào cuộc cũ
        chat.messages.push(msg);
        chat.updatedAt = Date.now();
        if (!chat.temp && chats.includes(chat)) saveChats(chats.map(({ temp, ...c }) => c)); // eslint-disable-line no-unused-vars
        return;
      }
      chat.messages.push(msg);
      renderMarkdown(body, reply);
      d.appendChild(actionsFor(msg, chat.messages.length - 1));
      persist();
    };

    try {
      let stream = !!s.stream;
      let res;
      try {
        res = await request(url, s.chatApiKey, { model, messages, stream }, signal);
      } catch (e) {
        // Một số nhà cung cấp không hỗ trợ stream → thử lại một lần ở chế độ thường
        if (stream && e.status >= 400 && e.status < 500 && ![401, 403, 429].includes(e.status) && !/api key|khoá/i.test(e.message)) {
          stream = false;
          res = await request(url, s.chatApiKey, { model, messages, stream: false }, signal);
        } else throw e;
      }
      const type = res.headers.get('content-type') || '';
      if (stream && res.body && type.includes('text/event-stream')) {
        try {
          await readSSE(res, (delta) => {
            if (!got) { got = true; typing.remove(); }
            reply += delta;
            paint();
          });
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          if (!reply) throw e;
          toast(`Luồng bị ngắt giữa chừng: ${e.message}`, 'warn', 4000);
        }
      } else {
        reply = extractContent(await res.json());
      }
      got = true;
      if (!reply) reply = '(phản hồi trống)';
      finish();
    } catch (e) {
      got = true;
      if (e.name === 'AbortError') {
        if (reply) finish();
        else d.remove();
      } else {
        d.remove();
        let msg = e.message || String(e);
        if (e instanceof TypeError) msg = `Không kết nối được ${url} — mạng hoặc CORS bị chặn (${e.message}).`;
        if (chat === current) {
          const acts = [{ label: 'Thử lại', run: () => { if (!controller) complete(); } }];
          if (e.status === 401 || e.status === 403 || /api key/i.test(msg)) acts.push({ label: 'Mở cài đặt', run: () => ctx.openSettings('chat') });
          renderNote(msg, acts);
        }
      }
    } finally {
      clearTimeout(slowTimer);
      controller = null;
      setBusy(false);
      updateEmpty();
    }
  }

  function setBusy(busy) {
    setIcon(sendBtn, busy ? 'stop' : 'up');
    sendBtn.setAttribute('aria-label', busy ? 'Dừng' : 'Gửi');
    sendBtn.title = busy ? 'Dừng' : 'Gửi';
    sendBtn.classList.toggle('busy', busy);
    refreshSend();
  }

  function refreshSend() {
    sendBtn.disabled = !controller && !input.value.trim() && !pending.length;
  }

  /* ---------- đính kèm ảnh (vision) ---------- */

  async function downscale(file, max = 1024) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.86);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function addFiles(files) {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      if (pending.length >= MAX_ATTACH) { toast(`Tối đa ${MAX_ATTACH} ảnh mỗi tin nhắn`, 'warn'); break; }
      try { pending.push(await downscale(f)); } catch { toast(`Không đọc được ảnh ${f.name || ''}`, 'error'); }
    }
    drawAttachments();
  }

  function drawAttachments() {
    attachRow.textContent = '';
    attachRow.hidden = !pending.length;
    pending.forEach((src, i) => {
      const t = el('div', 'att');
      const im = el('img');
      im.src = src;
      im.alt = 'Ảnh đính kèm';
      const x = iconButton('x', 'Bỏ ảnh', 'att-x');
      x.addEventListener('click', () => { pending.splice(i, 1); drawAttachments(); });
      t.append(im, x);
      attachRow.appendChild(t);
    });
    refreshSend();
  }

  function clearAttachments() { pending = []; drawAttachments(); }

  /* ---------- chế độ Nhanh / Chuyên gia ---------- */

  function drawMode() {
    const s = ctx.getSettings();
    const mode = s.chatMode === 'expert' ? 'expert' : 'fast';
    setIcon(modeBtn, MODE_ICON[mode]);
    modeBtn.querySelector('.mode-label').textContent = MODE_LABEL[mode];
    modeBtn.title = `Mô hình: ${modelFor(s, mode)}`;
    attachBtn.hidden = !s.vision;
  }

  modeBtn.addEventListener('click', async () => {
    const s = ctx.getSettings();
    const v = await popMenu(modeBtn, [
      { label: 'Nhanh', sub: s.chatModel || 'chưa đặt mô hình', value: 'fast', icon: 'bolt', on: s.chatMode !== 'expert' },
      { label: 'Chuyên gia', sub: s.chatModelExpert || 'chưa đặt mô hình', value: 'expert', icon: 'brain', on: s.chatMode === 'expert' },
    ]);
    if (v) { ctx.updateSettings({ chatMode: v }); drawMode(); }
  });

  /* ---------- sự kiện ---------- */

  input.addEventListener('input', () => { autoGrow(input); refreshSend(); });
  input.addEventListener('keydown', (e) => {
    // Máy tính: Enter = gửi, Shift+Enter = xuống dòng. Điện thoại: Enter = xuống dòng.
    // Bỏ qua khi đang gõ bộ gõ tiếng Việt / IME.
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && isDesktopInput()) {
      e.preventDefault();
      if (!controller) send();
    }
  });
  input.addEventListener('paste', (e) => {
    if (!ctx.getSettings().vision) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  sendBtn.addEventListener('click', () => (controller ? controller.abort() : send()));
  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { addFiles([...fileInput.files]); fileInput.value = ''; });

  const dictCb = (btn) => ({
    onState: (on) => btn.classList.toggle('on', on),
    onError: (m) => toast(`Giọng nói: ${m}`, 'error', 3500),
    onText: () => { autoGrow(input); refreshSend(); },
  });
  if (canDictate) micBtn.addEventListener('click', () => toggleDictation(input, dictCb(micBtn)));
  else micBtn.hidden = true;

  // Gợi ý ở màn hình trống
  document.querySelectorAll('#chips [data-chip]').forEach((chip) => {
    const kind = chip.dataset.chip;
    if (kind === 'voice' && !canDictate) { chip.remove(); return; }
    chip.addEventListener('click', () => {
      if (kind === 'image') ctx.showTab('image');
      else if (kind === 'voice') toggleDictation(input, dictCb(micBtn));
      else if (chip.dataset.prefill) {
        input.value = chip.dataset.prefill;
        autoGrow(input);
        refreshSend();
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });
  });

  /* ---------- API cho app.js ---------- */

  function open(chat) {
    controller?.abort();
    current = chat;
    clearAttachments();
    renderAll();
    ctx.onCurrentChanged?.();
  }

  const api = {
    get current() { return current; },
    get temp() { return !!current.temp; },
    list: () => chats,
    newChat(temp = false) { open(blankChat(temp)); },
    openChat(id) { const c = chats.find((x) => x.id === id); if (c) open(c); },
    setTemp(on) { open(blankChat(on)); },
    async deleteChat(id) {
      const c = chats.find((x) => x.id === id);
      if (!c) return;
      const ok = await ask(`Xoá cuộc trò chuyện “${c.title}”? Không thể hoàn tác.`, [
        { label: 'Xoá', value: true, danger: true },
        { label: 'Huỷ', value: false },
      ]);
      if (!ok) return;
      chats = chats.filter((x) => x !== c);
      saveChats(chats);
      if (current === c) open(blankChat(false));
      ctx.onChatsChanged?.();
    },
    clearAll() {
      controller?.abort();
      chats = [];
      saveChats(chats);
      open(blankChat(false));
      ctx.onChatsChanged?.();
    },
    reload() { chats = loadChats(); open(blankChat(false)); ctx.onChatsChanged?.(); },
    exportAll() { return chats.map(({ temp, ...c }) => c); }, // eslint-disable-line no-unused-vars
    drawMode,
    focus() { if (isDesktopInput()) input.focus(); },
  };

  drawMode();
  renderAll();
  refreshSend();
  return api;
}
