/**
 * settings.js — Tab CÀI ĐẶT: địa chỉ API, mô hình, khoá, nhà cung cấp ảnh (chuẩn OpenAI / fal.ai),
 * bộ cài sẵn, khoá sinh trắc, xoá dữ liệu.
 * Mọi thay đổi được tự động lưu vào localStorage.
 */
import { PRESETS, DEFAULT_SETTINGS, FAL_MODELS } from './config.js';
import { createLogger } from './log.js';
import { el, ask } from './ui.js';
import { wipeAll } from './storage.js';

/**
 * @param {object} ctx { getSettings, setSettings(patch), lock }
 */
export function initSettings(ctx) {
  const $ = (id) => document.getElementById(id);
  const log = createLogger($('set-log'));
  const fields = ['chatBaseUrl', 'chatModel', 'chatApiKey', 'imageBaseUrl', 'imageModel', 'imageApiKey', 'falApiKey', 'falModel'];

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
    $('row-imageApiKey').classList.toggle('disabled', !!s.imageShareKey);
    $('set-imageApiKey').disabled = !!s.imageShareKey;
    // Nhà cung cấp tạo ảnh: hiện nhóm ô tương ứng
    const isFal = s.imageProvider === 'fal';
    $('set-imageProvider').value = isFal ? 'fal' : 'openai';
    $('img-prov-openai').hidden = isFal;
    $('img-prov-fal').hidden = !isFal;
    $('set-falMode').value = s.falMode || 'auto';
    $('set-falModelPick').value = FAL_MODELS.some((m) => m.id === s.falModel) ? s.falModel : '';
    // Đánh dấu bộ cài sẵn đang khớp (mọi trường của bộ cài sẵn trùng với cài đặt hiện tại)
    const match = Object.entries(PRESETS).find(([, p]) =>
      Object.entries(p).every(([k, v]) => k === 'label' || k === 'imageSize' || s[k] === v));
    presetSel.value = match ? match[0] : '';
    syncLock();
  }

  /* ---------- ô nhập: tự lưu ---------- */
  fields.forEach((f) => {
    const input = $(`set-${f}`);
    input.addEventListener('input', () => ctx.setSettings({ [f]: input.value.trim() }, { quiet: true }));
    input.addEventListener('change', () => {
      ctx.setSettings({ [f]: input.value.trim() });
      log.ok('đã lưu cài đặt');
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
    log.ok(`tạo ảnh dùng ${e.target.value === 'fal' ? 'fal.ai' : 'chuẩn OpenAI'}`);
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

  /* ---------- hiện / ẩn khoá ---------- */
  document.querySelectorAll('[data-toggle-secret]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = $(btn.dataset.toggleSecret);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'ẨN' : 'HIỆN';
    });
  });

  /* ---------- khôi phục mặc định ---------- */
  $('set-defaults').addEventListener('click', async () => {
    const ok = await ask('Khôi phục địa chỉ và mô hình về mặc định? (khoá API giữ nguyên)');
    if (!ok) return;
    const { chatApiKey, imageApiKey, falApiKey, ...rest } = DEFAULT_SETTINGS;
    ctx.setSettings(rest);
    fill();
    log.ok('đã khôi phục mặc định');
  });

  /* ---------- khoá sinh trắc ---------- */
  const lockToggle = $('set-lock');
  function syncLock() {
    lockToggle.checked = ctx.lock.isEnabled();
    $('set-lock-state').textContent = ctx.lock.hasCredential() ? 'đã thiết lập' : 'chưa thiết lập';
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
      { label: 'ĐẶT LẠI', value: true, danger: true },
      { label: 'HUỶ', value: false },
    ]);
    if (!ok) return;
    ctx.lock.reset();
    syncLock();
    log.ok('đã đặt lại khoá sinh trắc');
  });

  /* ---------- xoá toàn bộ dữ liệu ---------- */
  $('set-wipe').addEventListener('click', async () => {
    const ok = await ask('XOÁ TOÀN BỘ dữ liệu trên máy: cài đặt, khoá API, nhật ký, ảnh, khoá sinh trắc. Không thể hoàn tác.', [
      { label: 'XOÁ HẾT', value: true, danger: true },
      { label: 'HUỶ', value: false },
    ]);
    if (!ok) return;
    ctx.lock.reset();
    await wipeAll();
    location.reload();
  });

  fill();
  return { log, fill };
}
