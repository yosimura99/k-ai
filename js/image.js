/**
 * image.js — Trang TẠO ẢNH.
 * Nhà cung cấp (chọn ngay trên thanh nhập hoặc trong Cài đặt):
 *  - Miễn phí: Pollinations (pollinations.js) — mặc định, không cần khoá.
 *  - fal.ai (fal.js) — khoá fal.
 *  - Chuẩn OpenAI: POST {baseUrl}/images/generations — nhận cả `b64_json` lẫn `url`.
 * Ảnh lưu trong IndexedDB trên máy, hiển thị dạng lưới so le; bấm để xem ở kích thước gốc,
 * tải xuống, đánh dấu yêu thích hoặc xoá. Không phủ lớp nào lên ảnh.
 */
import { SLOW_MS, MAX_RETRIES, ASPECTS, PROVIDER_LABELS, sizeFor, imageKeyOf, imageModelOf } from './config.js';
import { falGenerate } from './fal.js';
import { pollGenerate } from './pollinations.js';
import { putImage, listImages, deleteImage, storageEstimate } from './storage.js';
import { describeHttpError, readErrorDetail } from './log.js';
import { el, icon, iconButton, setIcon, ask, toast, popMenu, autoGrow, downloadBlob, sleep, joinUrl } from './ui.js';
import { canDictate, toggleDictation } from './speech.js';

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

/** Chuyển chuỗi base64 thành Blob. */
function b64ToBlob(b64, type = 'image/png') {
  const bin = atob(b64.replace(/^data:[^,]+,/, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: sniffType(bytes) || type });
}

/** Đoán định dạng ảnh từ vài byte đầu. */
function sniffType(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return 'image/webp';
  return '';
}

function extOf(type) {
  return { 'image/jpeg': 'jpg', 'image/webp': 'webp' }[type] || 'png';
}

/** Tên tệp tải xuống kiểu anh_0007.png */
function imageName(rec, index) {
  const ext = rec.blob ? extOf(rec.blob.type) : 'png';
  return `ANH_${String(index).padStart(4, '0')}.${ext.toUpperCase()}`;
}


const fmtSecs = (ms) => `${(ms / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} giây`;
const PROVIDER_ICON = { free: 'spark', fal: 'bolt', openai: 'image' };
const isDesktopInput = () => !window.matchMedia('(pointer: coarse)').matches; // điện thoại / máy tính bảng: chạm

function ratioOf(size) {
  const m = /^(\d+)x(\d+)$/.exec(size || '');
  return m ? `${m[1]} / ${m[2]}` : '1 / 1';
}

/**
 * @param {object} ctx { getSettings, updateSettings(patch), openSettings(section) }
 */
export function initImage(ctx) {
  const grid = document.getElementById('img-grid');
  const emptyBox = document.getElementById('img-empty');
  const promptEl = document.getElementById('img-prompt');
  const sendBtn = document.getElementById('img-send');
  const micBtn = document.getElementById('img-mic');
  const provBtn = document.getElementById('prov-btn');
  const ratioBtn = document.getElementById('ratio-btn');
  const statusEl = document.getElementById('img-status');
  const filterBtns = [...document.querySelectorAll('#img-filters [data-filter]')];

  let images = [];          // bản ghi từ IndexedDB, mới nhất trước
  const urls = new Map();   // id -> object URL
  let controller = null;
  let filter = 'mine';
  let pendingTile = null;

  /* ---------- trạng thái (thay cho nhật ký kiểu terminal) ---------- */
  let statusTimer = null;
  function status(text, level = 'info', sticky = false) {
    text = String(text || '').replace(/\s+\/\/\s+/g, ' · ').replace(/^./, (c) => c.toUpperCase());
    statusEl.textContent = text;
    statusEl.dataset.level = level;
    statusEl.hidden = !text;
    clearTimeout(statusTimer);
    if (!sticky && text) statusTimer = setTimeout(() => { statusEl.hidden = true; }, level === 'error' ? 12000 : 6000);
  }
  /** Bộ ghi tương thích giao diện cũ cho fal.js / pollinations.js. */
  const log = {
    info: (t) => { if (controller) status(t, 'info', true); },
    ok: (t) => status(t, 'ok'),
    warn: (t) => status(t, 'warn', !!controller),
    error: (t) => status(t, 'error'),
  };

  /* ---------- nút chọn nhà cung cấp / tỉ lệ ---------- */
  function drawPills() {
    const s = ctx.getSettings();
    const p = s.imageProvider || 'free';
    setIcon(provBtn, PROVIDER_ICON[p] || 'image');
    provBtn.querySelector('.pill-label').textContent = PROVIDER_LABELS[p] || p;
    provBtn.title = `Nhà cung cấp: ${PROVIDER_LABELS[p]} · ${imageModelOf(s)}`;
    const a = ASPECTS.includes(s.imageAspect) ? s.imageAspect : '1:1';
    ratioBtn.querySelector('.pill-label').textContent = a;
    setIcon(ratioBtn, a === '3:4' ? 'portrait' : a === '16:9' ? 'landscape' : 'square');
    ratioBtn.title = `Tỉ lệ ${a} · ${sizeFor(p, a)}`;
  }

  provBtn.addEventListener('click', async () => {
    const s = ctx.getSettings();
    const cur = s.imageProvider || 'free';
    const sub = {
      free: 'Pollinations · không cần khoá',
      fal: s.falApiKey ? (s.falModel || 'fal.ai') : 'cần khoá fal.ai',
      openai: s.imageModel ? `${s.imageModel}${imageKeyOf({ ...s, imageProvider: 'openai' }) ? '' : ' · cần khoá'}` : 'chưa đặt mô hình',
    };
    const v = await popMenu(provBtn, ['free', 'fal', 'openai'].map((k) => ({
      label: PROVIDER_LABELS[k], sub: sub[k], value: k, icon: PROVIDER_ICON[k], on: k === cur,
    })));
    if (!v) return;
    ctx.updateSettings({ imageProvider: v });
    drawPills();
    const ns = ctx.getSettings();
    if (v !== 'free' && !imageKeyOf(ns)) toast(`Chưa có khoá ${PROVIDER_LABELS[v]} — nhập trong Cài đặt → Tạo ảnh`, 'warn', 3500);
  });

  ratioBtn.addEventListener('click', async () => {
    const s = ctx.getSettings();
    const p = s.imageProvider || 'free';
    const v = await popMenu(ratioBtn, ASPECTS.map((a) => ({
      label: a, sub: sizeFor(p, a), value: a, icon: a === '1:1' ? 'square' : a === '3:4' ? 'portrait' : 'landscape', on: a === (s.imageAspect || '1:1'),
    })));
    if (v) { ctx.updateSettings({ imageAspect: v }); drawPills(); }
  });

  /* ---------- lưới ảnh ---------- */
  function srcOf(rec) {
    if (rec.blob) {
      if (!urls.has(rec.id)) urls.set(rec.id, URL.createObjectURL(rec.blob));
      return urls.get(rec.id);
    }
    return rec.url || '';
  }
  const indexOf = (rec) => images.length - images.indexOf(rec);
  const visible = () => (filter === 'fav' ? images.filter((r) => r.fav) : images);

  function tileFor(rec) {
    const b = el('button', 'tile');
    b.type = 'button';
    b.title = rec.prompt;
    b.style.aspectRatio = ratioOf(rec.size);
    const img = el('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = rec.prompt;
    img.src = srcOf(rec);
    img.addEventListener('load', () => { if (img.naturalWidth) b.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`; }, { once: true });
    b.appendChild(img);
    b.addEventListener('click', () => openViewer(rec));
    return b;
  }

  function render() {
    grid.textContent = '';
    if (pendingTile) grid.appendChild(pendingTile);
    const list = visible();
    list.forEach((rec) => grid.appendChild(tileFor(rec)));
    const empty = !list.length && !pendingTile;
    emptyBox.hidden = !empty;
    grid.hidden = empty;
    emptyBox.querySelector('.img-empty-title').textContent = filter === 'fav' ? 'Chưa có ảnh yêu thích' : 'Chưa có ảnh nào';
    emptyBox.querySelector('.img-empty-sub').textContent = filter === 'fav'
      ? 'Mở một ảnh rồi bấm trái tim để thêm vào đây.'
      : 'Nhập mô tả bên dưới để tạo ảnh đầu tiên.';
    filterBtns.forEach((f) => {
      const n = f.dataset.filter === 'fav' ? images.filter((r) => r.fav).length : images.length;
      f.querySelector('.count').textContent = n ? String(n) : '';
    });
  }

  filterBtns.forEach((f) => f.addEventListener('click', () => {
    filter = f.dataset.filter;
    filterBtns.forEach((x) => x.classList.toggle('on', x === f));
    render();
  }));

  /* ---------- trình xem ---------- */
  function openViewer(rec) {
    const ov = el('div', 'viewer');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'Xem ảnh');
    const top = el('div', 'viewer-top');
    const close = iconButton('x', 'Đóng');
    const info = el('div', 'viewer-info');
    info.appendChild(el('div', 'viewer-title', `Ảnh ${indexOf(rec)}`));
    info.appendChild(el('div', 'viewer-sub', [rec.size || 'mặc định', PROVIDER_LABELS[rec.provider] || rec.provider, rec.model].filter(Boolean).join(' · ')));
    top.append(close, info);

    const stage = el('div', 'viewer-stage');
    const img = el('img');
    img.src = srcOf(rec);
    img.alt = rec.prompt;
    stage.appendChild(img);
    // Bấm vào ảnh: chuyển giữa "vừa màn hình" và "100% điểm ảnh" (cuộn để xem)
    img.addEventListener('click', () => {
      const z = !stage.classList.contains('actual');
      stage.classList.toggle('actual', z);
      if (z && img.naturalWidth) {
        img.style.width = `${img.naturalWidth / (window.devicePixelRatio || 1)}px`;
        stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2;
        stage.scrollTop = (stage.scrollHeight - stage.clientHeight) / 2;
      } else img.style.width = '';
    });

    const bottom = el('div', 'viewer-bottom');
    bottom.appendChild(el('div', 'viewer-cap', rec.prompt));
    const row = el('div', 'viewer-btns');
    const dl = el('button', 'pill-btn');
    dl.append(icon('download'), el('span', '', 'Tải xuống'));
    const fav = el('button', 'pill-btn' + (rec.fav ? ' on' : ''));
    fav.append(icon(rec.fav ? 'heart-fill' : 'heart'), el('span', '', 'Yêu thích'));
    const reuse = el('button', 'pill-btn');
    reuse.append(icon('redo'), el('span', '', 'Dùng lại mô tả'));
    const del = el('button', 'pill-btn danger');
    del.append(icon('trash'), el('span', '', 'Xoá'));
    [dl, fav, reuse, del].forEach((b) => { b.type = 'button'; row.appendChild(b); });
    bottom.appendChild(row);

    const done = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') done(); };
    document.addEventListener('keydown', onKey);
    close.addEventListener('click', done);
    stage.addEventListener('click', (e) => { if (e.target === stage) done(); });
    dl.addEventListener('click', () => download(rec));
    fav.addEventListener('click', async () => {
      rec.fav = !rec.fav;
      fav.classList.toggle('on', !!rec.fav);
      setIcon(fav, rec.fav ? 'heart-fill' : 'heart');
      try { await putImage(rec); } catch (e) { toast(`Không lưu được: ${e.message || e}`, 'error'); }
      render();
    });
    reuse.addEventListener('click', () => {
      promptEl.value = rec.prompt;
      autoGrow(promptEl, 160);
      refreshSend();
      done();
      promptEl.focus();
    });
    del.addEventListener('click', async () => { if (await remove(rec)) done(); });
    ov.append(top, stage, bottom);
    document.body.appendChild(ov);
    close.focus();
  }

  async function download(rec) {
    const name = imageName(rec, indexOf(rec)).toLowerCase();
    if (rec.blob) { downloadBlob(rec.blob, name); toast(`Đã tải ${name}`, 'ok'); return; }
    try {
      const r = await fetch(rec.url);
      downloadBlob(await r.blob(), name);
      toast(`Đã tải ${name}`, 'ok');
    } catch {
      window.open(rec.url, '_blank', 'noopener');
      toast('Không tải trực tiếp được — đã mở ảnh trong thẻ mới', 'warn');
    }
  }

  async function remove(rec) {
    const ok = await ask('Xoá ảnh này khỏi máy?', [
      { label: 'Xoá', value: true, danger: true },
      { label: 'Huỷ', value: false },
    ]);
    if (!ok) return false;
    await deleteImage(rec.id);
    if (urls.has(rec.id)) { URL.revokeObjectURL(urls.get(rec.id)); urls.delete(rec.id); }
    images = images.filter((r) => r.id !== rec.id);
    render();
    toast('Đã xoá ảnh', 'ok');
    return true;
  }

  /* ---------- gọi API ---------- */
  /**
   * Gửi yêu cầu tạo ảnh. Tự thích nghi với nhà cung cấp:
   *  - Nếu bị từ chối vì `response_format` → bỏ tham số đó và thử lại.
   *  - Nếu bị từ chối vì `size` → bỏ tham số đó và thử lại.
   *  - 429 / 5xx → chờ rồi thử lại tối đa MAX_RETRIES lần.
   */
  async function callApi(url, key, body, signal) {
    let retries = 0;
    for (;;) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal,
      });
      if (res.ok) return res.json();
      const detail = await readErrorDetail(res);
      const low = detail.toLowerCase();
      if (res.status >= 400 && res.status < 500 && ![401, 403, 429].includes(res.status) && !low.includes('api key')) {
        if ('response_format' in body && (low.includes('response_format') || low.includes('response format'))) {
          log.warn('nhà cung cấp không nhận response_format // thử lại không có tham số này');
          delete body.response_format;
          continue;
        }
        if ('size' in body && low.includes('size')) {
          log.warn(`nhà cung cấp không nhận kích thước ${body.size} // thử lại với kích thước mặc định`);
          delete body.size;
          continue;
        }
        if ('response_format' in body) {
          // Lỗi 4xx không rõ nguyên nhân: thử lần cuối không có response_format
          log.warn(`${describeHttpError(res.status, detail)} // thử lại không có response_format`);
          delete body.response_format;
          continue;
        }
      }
      if (RETRY_STATUS.has(res.status) && retries < MAX_RETRIES) {
        const ra = parseFloat(res.headers.get('retry-after'));
        const wait = Number.isFinite(ra) ? Math.min(ra * 1000, 60000) : 2000 * 2 ** retries;
        retries++;
        log.error(`${describeHttpError(res.status, detail)} // chờ ${Math.round(wait / 1000)} giây`);
        log.warn(`thử lại (${retries}/${MAX_RETRIES})`);
        await sleep(wait, signal);
        continue;
      }
      const err = new Error(describeHttpError(res.status, detail));
      err.status = res.status;
      throw err;
    }
  }

  /**
   * Tải ảnh từ URL về thành Blob để lưu lâu dài (URL của nhà cung cấp thường hết hạn).
   * Thất bại (CORS / mạng) → chỉ lưu URL.
   */
  async function attachFromUrl(rec, url, signal) {
    if (url.startsWith('data:')) { rec.blob = b64ToBlob(url); return; }
    try {
      const r = await fetch(url, { signal });
      if (!r.ok) throw new Error();
      rec.blob = await r.blob();
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      rec.url = url;
      log.warn('không tải được ảnh về máy (CORS) // chỉ lưu đường dẫn, có thể hết hạn');
    }
  }

  /** Nhà cung cấp chuẩn OpenAI: POST {baseUrl}/images/generations */
  async function generateOpenAI(s, key, prompt, size, rec, signal) {
    const url = joinUrl(s.imageBaseUrl, '/images/generations');
    const body = { model: s.imageModel, prompt, n: 1, response_format: 'b64_json' };
    if (size) body.size = size;
    log.info(`đang tạo ảnh // ${s.imageModel}${body.size ? ' // ' + body.size : ''}`);
    let j;
    try {
      j = await callApi(url, key, body, signal);
    } catch (e) {
      if (e instanceof TypeError) throw new Error(`không kết nối được ${url} // mạng hoặc CORS bị chặn (${e.message})`);
      throw e;
    }
    const item = j?.data?.[0];
    if (!item) throw new Error('phản hồi không có ảnh');
    rec.size = body.size || '';
    rec.revisedPrompt = item.revised_prompt || '';
    if (item.b64_json) rec.blob = b64ToBlob(item.b64_json);
    else if (item.url) await attachFromUrl(rec, item.url, signal);
    else throw new Error('phản hồi không có b64_json hoặc url');
  }

  /** Nhà cung cấp fal.ai: fal.run (đồng bộ) hoặc queue.fal.run (hàng đợi). */
  async function generateFal(s, key, prompt, size, rec, signal) {
    let out;
    try {
      out = await falGenerate({ model: s.falModel, key, prompt, size, mode: s.falMode, signal, log });
    } catch (e) {
      if (e instanceof TypeError) throw new Error(`không kết nối được fal.ai // mạng hoặc CORS bị chặn (${e.message})`);
      throw e;
    }
    rec.size = out.size;
    await attachFromUrl(rec, out.url, signal);
  }

  /** Nhà cung cấp miễn phí Pollinations: phản hồi là chính tấm ảnh. */
  async function generateFree(s, key, prompt, size, rec, signal) {
    const out = await pollGenerate({ model: s.pollModel, key, prompt, size, signal, log });
    rec.size = out.size;
    rec.seed = out.seed;
    rec.blob = out.blob;
  }


  function makePendingTile(size) {
    const t = el('div', 'tile tile-pending');
    t.style.aspectRatio = ratioOf(size);
    const lab = el('div', 'pending-label');
    lab.appendChild(el('span', 'pending-text', 'Đang tạo…'));
    lab.appendChild(el('span', 'pending-time', ''));
    t.appendChild(lab);
    return t;
  }

  async function generate() {
    const prompt = promptEl.value.trim();
    if (!prompt) { promptEl.focus(); return; }
    const s = ctx.getSettings();
    const provider = s.imageProvider || 'free';
    const isFal = provider === 'fal';
    const isFree = provider === 'free';
    const key = imageKeyOf(s);
    if (!key && !isFree) {
      status(isFal ? 'Chưa có khoá fal.ai — nhập trong Cài đặt → Tạo ảnh (dạng KEY_ID:KEY_SECRET).' : 'Chưa có khoá API tạo ảnh — nhập trong Cài đặt → Tạo ảnh.', 'warn');
      ctx.openSettings('image');
      return;
    }
    const aspect = ASPECTS.includes(s.imageAspect) ? s.imageAspect : '1:1';
    const size = sizeFor(provider, aspect);

    controller = new AbortController();
    const signal = controller.signal;
    setBusy(true);
    if (filter !== 'mine') filterBtns.find((f) => f.dataset.filter === 'mine')?.click();
    pendingTile = makePendingTile(size);
    render();
    document.getElementById('img-scroll').scrollTop = 0;
    status(`Đang tạo ảnh · ${PROVIDER_LABELS[provider]} · ${size}`, 'info', true);
    const t0 = performance.now();
    const tick = setInterval(() => {
      const tt = pendingTile?.querySelector('.pending-time');
      if (tt) tt.textContent = `${Math.floor((performance.now() - t0) / 1000)} giây`;
    }, 500);
    const slow = setTimeout(() => status('Phản hồi chậm — vẫn đang chờ…', 'warn', true), SLOW_MS * 2);

    try {
      const rec = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        prompt, model: imageModelOf(s), provider, size: '', aspect, createdAt: Date.now(),
      };
      if (isFree) await generateFree(s, key, prompt, size, rec, signal);
      else if (isFal) await generateFal(s, key, prompt, size, rec, signal);
      else await generateOpenAI(s, key, prompt, size, rec, signal);
      try {
        await putImage(rec);
      } catch (e) {
        toast(`Không lưu được ảnh vào máy: ${e.message || e}`, 'warn', 4000);
      }
      images.unshift(rec);
      pendingTile = null;
      render();
      grid.firstElementChild?.classList.add('fresh');
      status(`Đã tạo xong · ${rec.size || 'mặc định'} · ${fmtSecs(performance.now() - t0)}`, 'ok');
      checkStorage();
    } catch (e) {
      pendingTile = null;
      render();
      if (e.name === 'AbortError') status('Đã dừng tạo ảnh', 'warn');
      else {
        let msg = e.message || String(e);
        if (e.turnstile) msg += ' — máy chủ miễn phí đòi xác minh, hãy nhập khoá Pollinations trong Cài đặt.';
        else if (e.free && (e.status === 401 || e.status === 403)) msg += ' — mô hình này cần khoá Pollinations.';
        else if (!isFree && (e.status === 401 || e.status === 403)) msg += ' — kiểm tra khoá trong Cài đặt.';
        status(msg.charAt(0).toUpperCase() + msg.slice(1), 'error');
      }
    } finally {
      clearTimeout(slow);
      clearInterval(tick);
      controller = null;
      setBusy(false);
    }
  }

  async function checkStorage() {
    const est = await storageEstimate();
    if (est && est.warn) toast(`Bộ nhớ máy đã dùng ${Math.round(est.ratio * 100)}% — nên xoá bớt ảnh`, 'warn', 5000);
  }

  function setBusy(busy) {
    setIcon(sendBtn, busy ? 'stop' : 'up');
    sendBtn.setAttribute('aria-label', busy ? 'Dừng' : 'Tạo ảnh');
    sendBtn.title = busy ? 'Dừng' : 'Tạo ảnh';
    sendBtn.classList.toggle('busy', busy);
    refreshSend();
  }
  function refreshSend() { sendBtn.disabled = !controller && !promptEl.value.trim(); }

  /* ---------- sự kiện ---------- */
  sendBtn.addEventListener('click', () => (controller ? controller.abort() : generate()));
  promptEl.addEventListener('input', () => { autoGrow(promptEl, 160); refreshSend(); });
  promptEl.addEventListener('keydown', (e) => {
    // Máy tính: Enter = tạo ảnh (Shift+Enter xuống dòng). Ctrl/Cmd+Enter luôn tạo ảnh.
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && ((!e.shiftKey && isDesktopInput()) || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!controller) generate();
    }
  });
  if (canDictate) {
    micBtn.addEventListener('click', () => toggleDictation(promptEl, {
      onState: (on) => micBtn.classList.toggle('on', on),
      onError: (m) => toast(`Giọng nói: ${m}`, 'error', 3500),
      onText: () => { autoGrow(promptEl, 160); refreshSend(); },
    }));
  } else micBtn.hidden = true;

  async function load() {
    try {
      images = await listImages();
    } catch (e) {
      images = [];
      status(`Không mở được thư viện ảnh: ${e.message || e}`, 'error');
    }
    render();
    checkStorage();
  }

  drawPills();
  refreshSend();
  load();
  return {
    drawPills,
    focus() { if (isDesktopInput()) promptEl.focus(); },
    reset() { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); images = []; render(); },
  };
}
