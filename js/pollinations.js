/**
 * pollinations.js — Nhà cung cấp tạo ảnh MIỄN PHÍ: Pollinations.
 *
 *  - Không khoá:  GET https://image.pollinations.ai/prompt/<mô tả>?width=&height=&seed=&model=&nologo=true
 *  - Có khoá:     GET https://gen.pollinations.ai/image/<mô tả>?...  + header `Authorization: Bearer <khoá>`
 * Phản hồi là chính tấm ảnh (image/jpeg) → đọc thẳng thành Blob để lưu IndexedDB.
 * Bị giới hạn tốc độ (429 / 503 kèm Retry-After) → [CẢNH BÁO], chờ rồi thử lại MỘT lần.
 */
import { POLL_ANON_URL, POLL_KEY_URL } from './config.js';
import { describeHttpError, readErrorDetail } from './log.js';
import { sleep } from './ui.js';

const RATE_STATUS = new Set([429, 503]);
const DEFAULT_WAIT_S = 10; // khi máy chủ không gửi Retry-After
const MAX_WAIT_S = 60;

/** '1024x1792' → { width: 1024, height: 1792 }; '' → 1024x1024. */
function dims(size) {
  const m = /^(\d+)x(\d+)$/.exec(size || '');
  return m ? { width: +m[1], height: +m[2] } : { width: 1024, height: 1024 };
}

/** Hạt giống ngẫu nhiên cho mỗi lần tạo (tránh nhận lại ảnh cũ từ bộ đệm). */
const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

/**
 * Tạo một ảnh bằng Pollinations.
 * @returns {Promise<{ blob: Blob, size: string, seed: number, model: string }>}
 */
export async function pollGenerate({ model, key, prompt, size, signal, log }) {
  model = (model || 'sana').trim();
  const { width, height } = dims(size);
  const seed = randomSeed();
    if (!key && model !== 'sana') {
    log.warn(`mô hình ${model} cần khoá Pollinations // không có khoá, máy chủ sẽ dùng sana`);
  }
  const params = new URLSearchParams({
    width: String(width), height: String(height), seed: String(seed), model, nologo: 'true',
    referrer: location.hostname || 'k-ai',
  });
  const base = key ? POLL_KEY_URL : POLL_ANON_URL;
  const url = `${base}/${encodeURIComponent(prompt)}?${params}`;
  const headers = key ? { Authorization: `Bearer ${key}` } : {};

  log.info(`đang tạo ảnh // miễn phí (Pollinations) // ${model} // ${width}x${height} // hạt giống ${seed}`);

  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers, signal });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new Error(`không kết nối được Pollinations // mạng hoặc CORS bị chặn (${e.message})`);
    }
    const type = res.headers.get('content-type') || '';
    if (res.ok && type.startsWith('image/')) {
      const blob = await res.blob();
      return { blob, size: `${width}x${height}`, seed, model };
    }
    const detail = res.ok ? 'phản hồi không phải ảnh' : await readErrorDetail(res);
    if (RATE_STATUS.has(res.status) && attempt === 0) {
      const ra = parseFloat(res.headers.get('retry-after'));
      const waitS = Math.min(Number.isFinite(ra) ? ra : DEFAULT_WAIT_S, MAX_WAIT_S);
      log.warn(`Pollinations đang giới hạn tốc độ (HTTP ${res.status}) // chờ ${Math.ceil(waitS)} giây rồi thử lại một lần`);
      await sleep(waitS * 1000, signal);
      continue;
    }
    let msg = describeHttpError(res.status, detail);
    if (/turnstile/i.test(detail || '')) msg += ' // máy chủ đòi xác minh Turnstile cho nguồn này (vd. localhost) // mở app từ github.io hoặc nhập khoá Pollinations miễn phí';
    else if (res.status === 401 || res.status === 403) msg += key ? ' // kiểm tra khoá Pollinations' : ' // mô hình này cần khoá Pollinations';
    if (res.status === 402) msg += ' // hết lượt miễn phí của khoá Pollinations';
    if (RATE_STATUS.has(res.status)) msg += ' // vẫn bị giới hạn, đợi một lúc rồi thử lại';
    const err = new Error(msg);
    err.status = res.status;
    err.free = true;
    err.turnstile = /turnstile/i.test(detail || '');
    throw err;
  }
}
