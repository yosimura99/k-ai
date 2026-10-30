/**
 * settings.js — Trang CÀI ĐẶT (bảng trượt toàn màn hình trên điện thoại, hộp giữa màn hình trên máy tính):
 * địa chỉ API, hai mô hình Nhanh / Chuyên gia, khoá, nhà cung cấp ảnh (miễn phí / fal.ai / chuẩn OpenAI),
 * bộ cài sẵn, khoá sinh trắc, xuất / xoá dữ liệu.
 * Mọi thay đổi được tự động lưu vào localStorage.
 */
import { APP_VERSION, PRESETS, DEFAULT_SETTINGS, FAL_MODELS, POLL_MODELS } from './config.js';
import { el, ask, toast, setIcon, downloadBlob, fileStamp } from './ui.js';
import { wipeAll, storageEstimate } from './storage.js';
import { SYSTEM_PROMPT } from '../system-prompt.js';

/**
 * @param {object} ctx { getSettings, setSettings(patch), lock, chat, image }
 */
export function initSettings(ctx) {
  const $ = (id) => document.getElementById(id);
  const sheet = $('settings');
  // Thông báo ngắn thay cho nhật ký kiểu terminal
  const cap = (t) => String(t).replace(/\s+\/\/\s+/g, ' — ').replace(/^./, (c) => c.toUpperCase());
  const log = { ok: (t) => toast(cap(t), 'ok'), info: (t) => toast(cap(t)), warn: (t) => toast(cap(t), 'warn', 3500), error: (t) => toast(cap(t), 'error', 4000) };
  const fields = ['chatBaseUrl', 'chatModel', 'chatModelExpert', 'chatApiKey', 'imageBaseUrl', 'imageModel', 'imageApiKey', 'falApiKey', 'falModel', 'pollApiKey'];

  /* ---------- bộ cài sẵn ---------- */
  const presetSel = $('set-preset');
  Object.entries(PRESETS).forEach(([k, p]) => {
    const o = el('option', '', p.label);
    o.value = k;
    presetSel.appendChild(o);
  });
  presetSel.addEventListener('change', () => {
    const p = PRESETS[presetSel.value];
    if (!p) return;
    const { label, ...patch } = p;
    ctx.setSettings(patch);
    fill();
    log.ok(`đã áp dụng bộ cài sẵn ${label} // khoá API giữ nguyên`);
  });

  /** Đổ giá trị cài đặt hiện tại vào các ô. */
  function fill() {
    const s = ctx.getSettings();
    fields.forEach((f) => { $(`set-${f}`).value = s[f] || ''; });
    $('set-imageShareKey').checked = !!s.imageShareKey;
    $('set-stream').checked = !!s.stream;
    $('set-vision').checked = !!s.vision;
    $('row-imageApiKey').classList.toggle('disabled', !!s.imageShareKey);
    $('set-imageApiKey').disabled = !!s.imageShareKey;
    // Nhà cung cấp tạo ảnh: hiện nhóm ô tương ứng
    const prov = ['free', 'openai', 'fal'].includes(s.imageProvider) ? s.imageProvider : 'free';
    $('set-imageProvider').value = prov;
    $('img-prov-free').hidden = prov !== 'free';
    $('img-prov-openai').hidden = prov !== 'openai';
    $('img-prov-fal').hidden = prov !== 'fal';
    $('set-pollModel').value = s.pollModel || 'sana';
    $('set-falMode').value = s.falMode || 'auto';
    $('set-falModelPick').value = FAL_MODELS.some((m) => m.id === s.falModel) ? s.falModel : '';
    // Đánh dấu bộ cài sẵn đang khớp (mọi trường của bộ cài sẵn trùng với cài đặt hiện tại)
    const match = Object.entries(PRESETS).find(([, p]) =>
      Object.entries(p).every(([k, v]) => k === 'label' || s[k] === v));
    presetSel.value = match ? match[0] : '';
    syncLock();
  }

  /* ---------- ô nhập: tự lưu ---------- */
  fields.forEach((f) => {
    const input = $(`set-${f}`);
    input.addEventListener('input', () => ctx.setSettings({ [f]: input.value.trim() }, { quiet: true }));
    input.addEventListener('change', () => {
      ctx.setSettings({ [f]: input.value.trim() });
      fill();
    });
  });

  $('set-imageShareKey').addEventListener('change', (e) => {
    ctx.setSettings({ imageShareKey: e.target.checked });
    fill();
    log.ok(e.target.checked ? 'ảnh dùng chung khoá với trò chuyện' : 'ảnh dùng khoá riêng');
  });
  /* ---------- nhà cung cấp tạo ảnh / fal.ai ---------- */
  FAL_MODELS.forEach((m) => {
    const o = el('option', '', m.label);
    o.value = m.id;
    $('set-falModelPick').appendChild(o);
  });
  $('set-imageProvider').addEventListener('change', (e) => {
    ctx.setSettings({ imageProvider: e.target.value });
    fill();
    log.ok(`tạo ảnh dùng ${{ free: 'miễn phí (Pollinations)', fal: 'fal.ai', openai: 'chuẩn OpenAI' }[e.target.value]}`);
  });
  POLL_MODELS.forEach((m) => {
    const o = el('option', '', m.label);
    o.value = m.id;
    $('set-pollModel').appendChild(o);
  });
  $('set-pollModel').addEventListener('change', (e) => {
    ctx.setSettings({ pollModel: e.target.value });
    const m = POLL_MODELS.find((x) => x.id === e.target.value);
    if (m?.needsKey && !ctx.getSettings().pollApiKey) log.warn(`mô hình ${m.id} cần khoá Pollinations // không có khoá sẽ dùng sana`);
    else log.ok(`mô hình miễn phí // ${e.target.value}`);
  });
  $('set-falModelPick').addEventListener('change', (e) => {
    if (!e.target.value) { $('set-falModel').focus(); return; }
    ctx.setSettings({ falModel: e.target.value });
    fill();
    log.ok(`mô hình fal.ai // ${e.target.value}`);
  });
  $('set-falMode').addEventListener('change', (e) => {
    ctx.setSettings({ falMode: e.target.value });
    log.ok(`cách gọi fal.ai // ${e.target.selectedOptions[0].textContent}`);
  });

  $('set-stream').addEventListener('change', (e) => {
    ctx.setSettings({ stream: e.target.checked });
    log.ok(e.target.checked ? 'đã bật phát trực tiếp' : 'đã tắt phát trực tiếp');
  });
  $('set-vision').addEventListener('change', (e) => {
    ctx.setSettings({ vision: e.target.checked });
    log.ok(e.target.checked ? 'đã hiện nút đính kèm ảnh' : 'đã ẩn nút đính kèm ảnh');
  });

  /* ---------- hiện / ẩn khoá ---------- */
  document.querySelectorAll('[data-toggle-secret]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = $(btn.dataset.toggleSecret);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      setIcon(btn, show ? 'eye-off' : 'eye');
      btn.setAttribute('aria-label', show ? 'Ẩn khoá' : 'Hiện khoá');
    });
  });

  /* ---------- khôi phục mặc định ---------- */
  $('set-defaults').addEventListener('click', async () => {
    const ok = await ask('Khôi phục địa chỉ và mô hình về mặc định? (khoá API giữ nguyên)');
    if (!ok) return;
    const { chatApiKey, imageApiKey, falApiKey, pollApiKey, ...rest } = DEFAULT_SETTINGS;
    ctx.setSettings(rest);
    fill();
    log.ok('đã khôi phục mặc định');
  });

  /* ---------- khoá sinh trắc ---------- */
  const lockToggle = $('set-lock');
  function syncLock() {
    lockToggle.checked = ctx.lock.isEnabled();
    $('set-lock-state').textContent = ctx.lock.hasCredential() ? 'Đã thiết lập trên thiết bị này' : 'Chưa thiết lập';
  }
  lockToggle.addEventListener('change', async () => {
    if (lockToggle.checked) {
      const ok = await ctx.lock.enable();
      if (ok) log.ok('đã bật khoá sinh trắc');
      else log.warn('chưa bật được khoá sinh trắc');
    } else {
      ctx.lock.disable();
      log.warn('đã tắt khoá sinh trắc');
    }
    syncLock();
  });
  $('set-lock-reset').addEventListener('click', async () => {
    const ok = await ask('Đặt lại khoá sinh trắc? Bạn sẽ thiết lập lại ở lần mở tiếp theo.', [
      { label: 'Đặt lại', value: true, danger: true },
      { label: 'Huỷ', value: false },
    ]);
    if (!ok) return;
    ctx.lock.reset();
    syncLock();
    log.ok('đã đặt lại khoá sinh trắc');
  });

  /* ---------- xoá toàn bộ dữ liệu ---------- */
  $('set-wipe').addEventListener('click', async () => {
    const ok = await ask('Xoá toàn bộ dữ liệu trên máy: cài đặt, khoá API, lịch sử trò chuyện, ảnh, khoá sinh trắc. Không thể hoàn tác.', [
      { label: 'Xoá hết', value: true, danger: true },
      { label: 'Huỷ', value: false },
    ]);
    if (!ok) return;
    ctx.lock.reset();
    await wipeAll();
    location.reload();
  });

  /* ---------- lịch sử trò chuyện ---------- */
  $('set-export').addEventListener('click', () => {
    const chats = ctx.chat.exportAll();
    if (!chats.length) { log.warn('chưa có cuộc trò chuyện nào để xuất'); return; }
    const name = `kai-lichsu-${fileStamp()}.json`;
    downloadBlob(new Blob([JSON.stringify({
      app: 'K.AI', phienBan: APP_VERSION, xuatLuc: new Date().toISOString(),
      loiNhacHeThong: SYSTEM_PROMPT, cuocTroChuyen: chats,
    }, null, 2)], { type: 'application/json' }), name);
    log.ok(`đã xuất ${name}`);
  });
  $('set-clear-chats').addEventListener('click', async () => {
    const ok = await ask('Xoá toàn bộ lịch sử trò chuyện? Không thể hoàn tác.', [
      { label: 'Xoá', value: true, danger: true },
      { label: 'Huỷ', value: false },
    ]);
    if (!ok) return;
    ctx.chat.clearAll();
    log.ok('đã xoá lịch sử trò chuyện');
  });

  async function showStorage() {
    const est = await storageEstimate();
    const n = ctx.chat.list().length;
    let t = `${n} cuộc trò chuyện`;
    if (est && est.usage != null) t += ` · đã dùng ${(est.usage / 1048576).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB bộ nhớ máy`;
    $('set-storage').textContent = t;
  }

  /* ---------- mở / đóng ---------- */
  let lastFocus = null;
  function open(section) {
    fill();
    showStorage();
    lastFocus = document.activeElement;
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add('show'));
    if (section) $(`sec-${section}`)?.scrollIntoView({ block: 'start' });
    else sheet.querySelector('.sheet-body').scrollTop = 0;
    sheet.querySelector('.sheet-box').focus({ preventScroll: true });
  }
  function close() {
    sheet.classList.remove('show');
    setTimeout(() => { sheet.hidden = true; }, 200);
    ctx.onClose?.();
    lastFocus?.focus?.({ preventScroll: true });
  }
  $('settings-close').addEventListener('click', close);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden && !document.querySelector('.modal')) close(); });

  $('set-version').textContent = `phiên bản ${APP_VERSION}`;
  fill();
  return { fill, open, close, get isOpen() { return !sheet.hidden; } };
}
