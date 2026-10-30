/**
 * fal.js — Nhà cung cấp tạo ảnh fal.ai.
 *
 * Hai cách gọi:
 *  - Đồng bộ:  POST https://fal.run/<mô hình>        → trả thẳng kết quả.
 *  - Hàng đợi: POST https://queue.fal.run/<mô hình>  → { request_id, status_url, response_url }
 *              rồi thăm dò GET status_url cho tới khi COMPLETED, sau đó GET response_url.
 * Xác thực: header `Authorization: Key <KEY_ID:KEY_SECRET>`.
 * Kết quả: { images: [{ url, content_type, width, height }], seed, ... }
 */
import { FAL_MODELS, FAL_SYNC_URL, FAL_QUEUE_URL, FAL_SIZE_MAP, MAX_RETRIES } from './config.js';
import { describeHttpError, readErrorDetail } from './log.js';
import { sleep } from './ui.js';

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const POLL_MS = 1000;          // chu kỳ thăm dò trạng thái hàng đợi
const POLL_MAX_MS = 10 * 60e3; // tối đa 10 phút

/** Bỏ dấu "/" thừa ở đầu/cuối id mô hình. */
const cleanModel = (m) => String(m || '').trim().replace(/^\/+|\/+$/g, '');

/** Thông tin mô hình đã biết (nếu có). */
const known = (model) => FAL_MODELS.find((m) => m.id === model);

/** Tạo thân yêu cầu cho fal.ai từ mô tả + ô chọn kích thước. */
export function buildFalBody(model, prompt, size) {
  const body = { prompt, num_images: 1 };
  const falSize = FAL_SIZE_MAP[size];
  if (falSize) body.image_size = falSize;
  // Mô hình đã biết: chỉ gửi khi mô hình có tham số này. Mô hình tự nhập: cứ gửi, bị từ chối thì bỏ.
  const info = known(model);
  if (!info || info.safety) body.enable_safety_checker = false;
  return body;
}

/** Có nên dùng hàng đợi cho mô hình này không. */
export function useQueue(model, mode) {
  if (mode === 'queue') return true;
  if (mode === 'sync') return false;
  const info = known(model);
  return info ? info.queue : false;
}

/**
 * Gọi fetch tới fal.ai, tự thử lại khi 429 / 5xx.
 * Trả về JSON khi thành công; ném lỗi (kèm .status, .detail) khi thất bại.
 */
async function falFetch(url, key, { method = 'GET', body, signal, log }) {
  let retries = 0;
  for (;;) {
    const headers = { Authorization: `Key ${key}` };
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal });
    if (res.ok) return res.json();
    const detail = await readErrorDetail(res);
    if (RETRY_STATUS.has(res.status) && retries < MAX_RETRIES) {
      const ra = parseFloat(res.headers.get('retry-after'));
      const wait = Number.isFinite(ra) ? Math.min(ra * 1000, 60000) : 2000 * 2 ** retries;
      retries++;
      log.error(`${describeHttpError(res.status, detail)} // chờ ${Math.round(wait / 1000)} giây`);
      log.warn(`thử lại (${retries}/${MAX_RETRIES})`);
      await sleep(wait, signal);
      continue;
    }
    let msg = describeHttpError(res.status, detail);
    // Tài khoản fal.ai bị khoá vì hết số dư → gợi ý nạp thêm
    if (/top_?up|balance|exhausted/i.test(detail)) msg += ' // tài khoản fal.ai hết số dư, nạp thêm tại fal.ai/dashboard/billing';
    const err = new Error(msg);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
}

/**
 * Gửi yêu cầu (đồng bộ hoặc hàng đợi). Nếu mô hình không nhận một tham số
 * (enable_safety_checker / image_size) thì bỏ tham số đó và thử lại một lần.
 */
async function submit(model, key, body, { queue, signal, log }) {
  for (;;) {
    try {
      return queue
        ? await runQueue(model, key, body, { signal, log })
        : await falFetch(`${FAL_SYNC_URL}/${model}`, key, { method: 'POST', body, signal, log });
    } catch (e) {
      const d = (e.detail || '').toLowerCase();
      if (e.status === 422 || e.status === 400) {
        if ('enable_safety_checker' in body && d.includes('safety')) {
          log.warn('mô hình không nhận enable_safety_checker // thử lại không có tham số này');
          delete body.enable_safety_checker;
          continue;
        }
        if ('image_size' in body && d.includes('image_size')) {
          log.warn(`mô hình không nhận kích thước ${body.image_size} // thử lại với kích thước mặc định`);
          delete body.image_size;
          continue;
        }
      }
      throw e;
    }
  }
}

/** Chế độ hàng đợi: gửi, thăm dò trạng thái kèm dòng [TIN], rồi lấy kết quả. */
async function runQueue(model, key, body, { signal, log }) {
  const sub = await falFetch(`${FAL_QUEUE_URL}/${model}`, key, { method: 'POST', body, signal, log });
  const id = sub.request_id;
  log.info(`đã vào hàng đợi fal.ai // mã ${String(id).slice(0, 8)}`);
  // fal trả sẵn status_url / response_url (đúng với cả id mô hình nhiều cấp như fal-ai/flux/schnell)
  const statusUrl = sub.status_url;
  const responseUrl = sub.response_url;
  const cancelUrl = sub.cancel_url;
  if (!statusUrl || !responseUrl) throw new Error('phản hồi hàng đợi thiếu status_url / response_url');

  // Huỷ yêu cầu trên máy chủ khi người dùng bấm DỪNG (không chờ kết quả)
  const onAbort = () => {
    if (cancelUrl) fetch(cancelUrl, { method: 'PUT', headers: { Authorization: `Key ${key}` } }).catch(() => {});
  };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    const t0 = Date.now();
    let last = '';
    let shownLogs = 0;
    for (;;) {
      const st = await falFetch(`${statusUrl}${statusUrl.includes('?') ? '&' : '?'}logs=1`, key, { signal, log });
      const sig = `${st.status}:${st.queue_position ?? ''}`;
      if (sig !== last) {
        last = sig;
        if (st.status === 'IN_QUEUE') log.info(`đang xếp hàng${st.queue_position != null ? ` // vị trí ${st.queue_position}` : ''}`);
        else if (st.status === 'IN_PROGRESS') log.info('đang xử lý trên máy chủ fal.ai...');
        else if (st.status === 'COMPLETED') log.info('đã xong // đang lấy kết quả...');
      }
      // Dòng nhật ký của mô hình (nếu có), chỉ in dòng mới
      const logs = Array.isArray(st.logs) ? st.logs : [];
      for (; shownLogs < logs.length; shownLogs++) {
        const m = logs[shownLogs]?.message;
        if (m) log.info(`fal // ${String(m).slice(0, 160)}`);
      }
      if (st.status === 'COMPLETED') {
        if (st.error) throw new Error(`fal.ai báo lỗi // ${st.error}`);
        return await falFetch(responseUrl, key, { signal, log });
      }
      if (Date.now() - t0 > POLL_MAX_MS) throw new Error('hàng đợi quá lâu (10 phút) // đã dừng thăm dò');
      await sleep(POLL_MS, signal);
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Tạo một ảnh bằng fal.ai.
 * @returns {Promise<{ url: string, contentType: string, width?: number, height?: number, size: string }>}
 */
export async function falGenerate({ model, key, prompt, size, mode, signal, log }) {
  model = cleanModel(model);
  if (!model) throw new Error('chưa nhập mô hình fal.ai');
  const body = buildFalBody(model, prompt, size);
  const queue = useQueue(model, mode);
  log.info(`đang tạo ảnh // fal.ai // ${model}${body.image_size ? ' // ' + body.image_size : ''}${queue ? ' // hàng đợi' : ''}`);
  const j = await submit(model, key, body, { queue, signal, log });
  const img = j?.images?.[0] || j?.image;
  if (!img?.url) throw new Error('phản hồi fal.ai không có images[0].url');
  return {
    url: img.url,
    contentType: img.content_type || '',
    width: img.width,
    height: img.height,
    size: img.width && img.height ? `${img.width}x${img.height}` : body.image_size || '',
  };
}
