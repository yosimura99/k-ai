/**
 * image.js — Tab TẠO ẢNH.
 * Gọi endpoint tạo ảnh tương thích OpenAI: POST {baseUrl}/images/generations
 * Nhận cả `b64_json` lẫn `url`. Ảnh được lưu trong IndexedDB trên máy.
 * Hoặc nhà cung cấp miễn phí Pollinations (pollinations.js), fal.ai (fal.js), chọn trong CÀI ĐẶT → TẠO ẢNH → nhà cung cấp.
 */
import { SLOW_MS, MAX_RETRIES, IMAGE_SIZES, imageKeyOf, imageModelOf } from './config.js';
import { falGenerate } from './fal.js';
import { pollGenerate } from './pollinations.js';
import { putImage, listImages, deleteImage, storageEstimate } from './storage.js';
import { createLogger, describeHttpError, readErrorDetail, secs } from './log.js';
import { el, ask, downloadBlob, sleep, joinUrl } from './ui.js';

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

/** Tên hiển thị kiểu ANH_0007.PNG */
function imageName(rec, index) {
  const ext = rec.blob ? extOf(rec.blob.type) : 'png';
  return `ANH_${String(index).padStart(4, '0')}.${ext.toUpperCase()}`;
}

/**
 * @param {object} ctx { getSettings, setSettings(patch), setStatusLine(text, level) }
 */
export function initImage(ctx) {
  const promptEl = document.getElementById('img-prompt');
  const genBtn = document.getElementById('img-generate');
  const clearBtn = document.getElementById('img-clear');
  const sizeSel = document.getElementById('img-size');
  const stage = document.getElementById('img-stage');
  const gallery = document.getElementById('img-gallery');
  const log = createLogger(document.getElementById('img-log'));

  let images = [];          // bản ghi từ IndexedDB, mới nhất trước
  const urls = new Map();   // id -> object URL (để giải phóng khi xoá)
  let controller = null;
  let currentId = null;

  /* ---------- kích thước ---------- */
  IMAGE_SIZES.forEach((o) => {
    const opt = el('option', '', o.label);
    opt.value = o.value;
    sizeSel.appendChild(opt);
  });
  sizeSel.value = ctx.getSettings().imageSize || '';
  sizeSel.addEventListener('change', () => ctx.setSettings({ imageSize: sizeSel.value }));

  /** Lấy URL hiển thị cho bản ghi (Blob → object URL, hoặc URL gốc). */
  function srcOf(rec) {
    if (rec.blob) {
      if (!urls.has(rec.id)) urls.set(rec.id, URL.createObjectURL(rec.blob));
      return urls.get(rec.id);
    }
    return rec.url || '';
  }

  /** Số thứ tự ảnh (cũ nhất = 1). */
  const indexOf = (rec) => images.length - images.indexOf(rec);

  /* ---------- khung hiển thị ---------- */
  function showStage(rec) {
    stage.textContent = '';
    currentId = rec ? rec.id : null;
    if (!rec) {
      stage.classList.add('empty');
      stage.appendChild(el('div', 'stage-empty', 'chưa có ảnh // nhập mô tả rồi bấm TẠO ẢNH'));
      return;
    }
    stage.classList.remove('empty');
    const img = el('img');
    img.alt = rec.prompt;
    img.src = srcOf(rec);
    img.addEventListener('click', () => openViewer(rec));
    stage.appendChild(img);
    stage.appendChild(el('div', 'stage-label', imageName(rec, indexOf(rec))));
  }

  function showLoading() {
    stage.textContent = '';
    stage.classList.add('empty');
    const d = el('div', 'stage-empty');
    d.appendChild(el('span', '', 'đang tạo ảnh '));
    d.appendChild(el('span', 'cursor'));
    stage.appendChild(d);
  }

  /* ---------- thư viện ---------- */
  function renderGallery() {
    gallery.textContent = '';
    document.getElementById('img-count').textContent = images.length ? `(${images.length})` : '';
    if (!images.length) {
      gallery.appendChild(el('div', 'gallery-empty', 'trống'));
      return;
    }
    images.forEach((rec) => {
      const b = el('button', 'thumb');
      b.type = 'button';
      b.title = rec.prompt;
      const img = el('img');
      img.loading = 'lazy';
      img.alt = rec.prompt;
      img.src = srcOf(rec);
      b.appendChild(img);
      b.addEventListener('click', () => openViewer(rec));
      gallery.appendChild(b);
    });
  }

  /** Trình xem toàn màn hình: TẢI XUỐNG / XOÁ / ĐÓNG. */
  function openViewer(rec) {
    const ov = el('div', 'viewer');
    const top = el('div', 'viewer-top', `${imageName(rec, indexOf(rec))} // ${rec.size || 'mặc định'} // ${rec.model}`);
    const img = el('img');
    img.src = srcOf(rec);
    img.alt = rec.prompt;
    const cap = el('div', 'viewer-cap', `> ${rec.prompt}`);
    const row = el('div', 'viewer-btns');
    const dl = el('button', 'btn', 'TẢI XUỐNG');
    const del = el('button', 'btn btn-red', 'XOÁ');
    const close = el('button', 'btn', 'ĐÓNG');
    [dl, del, close].forEach((b) => { b.type = 'button'; row.appendChild(b); });
    const done = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') done(); };
    document.addEventListener('keydown', onKey);
    close.addEventListener('click', done);
    dl.addEventListener('click', () => download(rec));
    del.addEventListener('click', async () => { if (await remove(rec)) done(); });
    ov.addEventListener('click', (e) => { if (e.target === ov) done(); });
    ov.append(top, img, cap, row);
    document.body.appendChild(ov);
  }

  async function download(rec) {
    const name = imageName(rec, indexOf(rec)).toLowerCase();
    if (rec.blob) { downloadBlob(rec.blob, name); log.ok(`đã tải ${name}`); return; }
    try {
      const r = await fetch(rec.url);
      downloadBlob(await r.blob(), name);
      log.ok(`đã tải ${name}`);
    } catch {
      window.open(rec.url, '_blank', 'noopener');
      log.warn('không tải trực tiếp được // đã mở ảnh trong thẻ mới');
    }
  }

  async function remove(rec) {
    const ok = await ask('Xoá ảnh này khỏi máy?', [
      { label: 'XOÁ', value: true, danger: true },
      { label: 'HUỶ', value: false },
    ]);
    if (!ok) return false;
    const name = imageName(rec, indexOf(rec));
    await deleteImage(rec.id);
    if (urls.has(rec.id)) { URL.revokeObjectURL(urls.get(rec.id)); urls.delete(rec.id); }
    images = images.filter((r) => r.id !== rec.id);
    if (currentId === rec.id) showStage(null);
    renderGallery();
    log.ok(`đã xoá ${name}`);
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
  async function generateOpenAI(s, key, prompt, rec, signal) {
    const url = joinUrl(s.imageBaseUrl, '/images/generations');
    const body = { model: s.imageModel, prompt, n: 1, response_format: 'b64_json' };
    if (sizeSel.value) body.size = sizeSel.value;
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
  async function generateFal(s, key, prompt, rec, signal) {
    let out;
    try {
      out = await falGenerate({ model: s.falModel, key, prompt, size: sizeSel.value, mode: s.falMode, signal, log });
    } catch (e) {
      if (e instanceof TypeError) throw new Error(`không kết nối được fal.ai // mạng hoặc CORS bị chặn (${e.message})`);
      throw e;
    }
    rec.size = out.size;
    await attachFromUrl(rec, out.url, signal);
  }

  /** Nhà cung cấp miễn phí Pollinations: phản hồi là chính tấm ảnh. */
  async function generateFree(s, key, prompt, rec, signal) {
    const out = await pollGenerate({ model: s.pollModel, key, prompt, size: sizeSel.value, signal, log });
    rec.size = out.size;
    rec.seed = out.seed;
    rec.blob = out.blob;
  }

  async function generate() {
    const prompt = promptEl.value.trim();
    if (!prompt) { log.warn('chưa nhập mô tả ảnh'); return; }
    const s = ctx.getSettings();
    const isFal = s.imageProvider === 'fal';
    const isFree = s.imageProvider === 'free';
    const key = imageKeyOf(s);
    if (!key && !isFree) {
      log.warn(isFal ? 'chưa có khoá fal.ai // vào CÀI ĐẶT để nhập khoá (dạng KEY_ID:KEY_SECRET)' : 'chưa có khoá API tạo ảnh // vào CÀI ĐẶT để nhập khoá');
      ctx.setStatusLine('[CẢNH BÁO] CHƯA CÓ KHOÁ API TẠO ẢNH', 'warn');
      return;
    }

    if (isFal && !key.includes(':')) log.warn('khoá fal.ai thường có dạng KEY_ID:KEY_SECRET // vẫn thử gửi');

    controller = new AbortController();
    genBtn.textContent = 'DỪNG';
    genBtn.classList.add('btn-red');
    showLoading();
    const t0 = performance.now();
    const slow = setTimeout(() => log.warn('phản hồi chậm // vẫn đang chờ...'), SLOW_MS * 2);

    try {
      const rec = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        prompt, model: imageModelOf(s), provider: s.imageProvider || 'free', size: '', createdAt: Date.now(),
      };
      if (isFree) await generateFree(s, key, prompt, rec, controller.signal);
      else if (isFal) await generateFal(s, key, prompt, rec, controller.signal);
      else await generateOpenAI(s, key, prompt, rec, controller.signal);
      try {
        await putImage(rec);
      } catch (e) {
        log.warn(`không lưu được ảnh vào bộ nhớ máy // ${e.message || e}`);
      }
      images.unshift(rec);
      showStage(rec);
      renderGallery();
      const took = secs(performance.now() - t0);
      log.ok(`tạo xong // ${rec.size || 'mặc định'} // ${took}`);
      ctx.setStatusLine(`[ ĐẠT ] TẠO XONG // ${rec.size || 'MẶC ĐỊNH'} // ${took.toUpperCase()}`, 'ok');
      checkStorage();
    } catch (e) {
      showStage(images.find((r) => r.id === currentId) || null);
      if (e.name === 'AbortError') log.warn('đã dừng tạo ảnh');
      else {
        log.error(e.message || String(e));
        if (/hết số dư/.test(e.message)) ctx.setStatusLine('[LỖI] TÀI KHOẢN FAL.AI HẾT SỐ DƯ', 'error');
        else if (e.status === 429 || e.status === 503) ctx.setStatusLine('[CẢNH BÁO] MÁY CHỦ MIỄN PHÍ ĐANG BẬN', 'warn');
        else if (e.turnstile) ctx.setStatusLine('[LỖI] MÁY CHỦ MIỄN PHÍ ĐÒI XÁC MINH // CẦN KHOÁ POLLINATIONS', 'error');
        else if (e.free && (e.status === 401 || e.status === 403)) ctx.setStatusLine('[LỖI] MÔ HÌNH NÀY CẦN KHOÁ POLLINATIONS', 'error');
        else if (e.status === 401 || e.status === 403) ctx.setStatusLine('[LỖI] KHOÁ API TẠO ẢNH SAI HOẶC HẾT HẠN', 'error');
      }
    } finally {
      clearTimeout(slow);
      controller = null;
      genBtn.textContent = 'TẠO ẢNH';
      genBtn.classList.remove('btn-red');
    }
  }

  async function checkStorage() {
    const est = await storageEstimate();
    if (est && est.warn) log.warn(`bộ nhớ máy đã dùng ${Math.round(est.ratio * 100)}% // nên xoá bớt ảnh`);
  }

  /* ---------- sự kiện ---------- */
  genBtn.addEventListener('click', () => (controller ? controller.abort() : generate()));
  clearBtn.addEventListener('click', () => {
    promptEl.value = '';
    showStage(null);
    promptEl.focus();
  });
  promptEl.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter để tạo nhanh
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (!controller) generate(); }
  });

  /** Nạp thư viện ảnh từ IndexedDB. */
  async function load() {
    try {
      images = await listImages();
    } catch (e) {
      images = [];
      log.error(`không mở được thư viện ảnh // ${e.message || e}`);
    }
    showStage(images[0] || null);
    renderGallery();
    log.info(`thư viện ảnh // ${images.length} ảnh trên máy`);
    checkStorage();
  }

  load();
  return {
    log,
    syncSize() { sizeSel.value = ctx.getSettings().imageSize || ''; },
    reset() { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); images = []; showStage(null); renderGallery(); },
  };
}
