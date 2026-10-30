/**
 * config.js — Hằng số, giá trị mặc định và các bộ cài sẵn (preset).
 */

/** Phiên bản ứng dụng (hiển thị trong nhật ký khi khởi động). */
export const APP_VERSION = '1.2.0';

/** Khoá lưu trữ trong localStorage. */
export const LS_KEYS = {
  settings: 'kai.settings.v1',
  history: 'kai.history.v1',
};

/** Tên / phiên bản cơ sở dữ liệu IndexedDB chứa ảnh. */
export const IDB_NAME = 'kai-images';
export const IDB_VERSION = 1;
export const IDB_STORE = 'images';

/** Cài đặt mặc định khi mở app lần đầu. */
export const DEFAULT_SETTINGS = {
  chatBaseUrl: 'https://api.x.ai/v1',
  chatModel: 'grok-4',
  chatApiKey: '',
  stream: true,              // phát trực tiếp (SSE), tự lùi về không-stream nếu lỗi
  imageBaseUrl: 'https://api.x.ai/v1',
  imageModel: 'grok-2-image',
  imageApiKey: '',
  imageShareKey: true,       // dùng chung khoá với trò chuyện
  imageSize: '',             // '' = để nhà cung cấp tự chọn kích thước
  // 'free' = Miễn phí (Pollinations, không cần khoá) | 'openai' = Chuẩn OpenAI (/images/generations) | 'fal' = fal.ai
  // Người dùng cũ chưa lưu nhà cung cấp → nhận mặc định 'free'; ai đã chọn rồi thì giữ nguyên.
  imageProvider: 'free',
  pollModel: 'sana',         // mô hình Pollinations
  pollApiKey: '',            // khoá Pollinations (không bắt buộc; chỉ cần cho mô hình ngoài 'sana')
  falApiKey: '',             // khoá fal.ai dạng KEY_ID:KEY_SECRET (gửi qua header "Authorization: Key ...")
  falModel: 'fal-ai/flux/schnell',
  falMode: 'auto',           // 'auto' | 'sync' (fal.run) | 'queue' (queue.fal.run + thăm dò trạng thái)
};

/** Bộ cài sẵn: điền nhanh các ô cài đặt. */
export const PRESETS = {
  // Tạo ảnh miễn phí qua Pollinations; phần trò chuyện giữ nguyên.
  free: {
    label: 'Miễn phí (không cần khoá)',
    imageProvider: 'free',
    pollModel: 'sana',
    imageSize: '1024x1024',
  },
  xai: {
    label: 'xAI (Grok)',
    chatBaseUrl: 'https://api.x.ai/v1',
    chatModel: 'grok-4',
    imageBaseUrl: 'https://api.x.ai/v1',
    imageModel: 'grok-2-image',
    imageSize: '',
    imageProvider: 'openai',
  },
  openai: {
    label: 'OpenAI',
    chatBaseUrl: 'https://api.openai.com/v1',
    chatModel: 'gpt-4o-mini',
    imageBaseUrl: 'https://api.openai.com/v1',
    imageModel: 'gpt-image-1',
    imageSize: '1024x1024',
    imageProvider: 'openai',
  },
  // fal.ai chỉ dùng cho TẠO ẢNH; phần trò chuyện giữ nguyên.
  fal: {
    label: 'fal.ai (chỉ tạo ảnh)',
    imageProvider: 'fal',
    falModel: 'fal-ai/flux/schnell',
    falMode: 'auto',
    imageSize: '1024x1024',
  },
};

/**
 * Các mô hình tạo ảnh từ văn bản phổ biến trên fal.ai (id lấy từ fal.ai/models, 10/2026).
 *  - safety: mô hình có tham số `enable_safety_checker`.
 *  - queue:  chế độ 'auto' sẽ dùng hàng đợi (queue.fal.run) cho mô hình chậm.
 */
export const FAL_MODELS = [
  { id: 'fal-ai/flux/schnell', label: 'FLUX.1 [schnell] — nhanh', safety: true, queue: false },
  { id: 'fal-ai/flux/dev', label: 'FLUX.1 [dev]', safety: true, queue: true },
  { id: 'fal-ai/flux-pro/v1.1', label: 'FLUX1.1 [pro]', safety: false, queue: true },
  { id: 'fal-ai/recraft/v3/text-to-image', label: 'Recraft V3', safety: true, queue: true },
];

/** Địa chỉ gọi fal.ai: đồng bộ và hàng đợi. */
export const FAL_SYNC_URL = 'https://fal.run';
export const FAL_QUEUE_URL = 'https://queue.fal.run';

/** Đổi kích thước kiểu OpenAI (ô chọn) sang tên kích thước của fal.ai. '' = mặc định của mô hình. */
export const FAL_SIZE_MAP = {
  '1024x1024': 'square_hd',
  '512x512': 'square',
  '256x256': 'square',
  '1024x1536': 'portrait_4_3',
  '1536x1024': 'landscape_4_3',
  '1024x1792': 'portrait_16_9',
  '1792x1024': 'landscape_16_9',
};

/**
 * Pollinations (kiểm tra 30/10/2026):
 *  - Không khoá: GET https://image.pollinations.ai/prompt/<mô tả>?width&height&seed&nologo=true
 *    → máy chủ luôn dùng mô hình 'sana' (DreamShaper 8 LCM), ảnh bị thu nhỏ còn ~0,6 MP.
 *  - Có khoá (enter.pollinations.ai, gói miễn phí): GET https://gen.pollinations.ai/image/<mô tả>
 *    với header Authorization: Bearer <khoá> → dùng được các mô hình bên dưới.
 */
export const POLL_ANON_URL = 'https://image.pollinations.ai/prompt';
export const POLL_KEY_URL = 'https://gen.pollinations.ai/image';
export const POLL_MODELS = [
  { id: 'sana', label: 'sana // DreamShaper 8 LCM (không cần khoá)', needsKey: false },
  { id: 'flux', label: 'flux // FLUX.1 schnell (cần khoá)', needsKey: true },
  { id: 'zimage', label: 'zimage // Z-Image Turbo (cần khoá)', needsKey: true },
  { id: 'klein', label: 'klein // FLUX.2 klein 4B (cần khoá)', needsKey: true },
  { id: 'kontext', label: 'kontext // FLUX.1 Kontext pro (cần khoá)', needsKey: true },
];

/** Khoá API đang dùng cho TẠO ẢNH theo nhà cung cấp. */
export function imageKeyOf(s) {
  if (s.imageProvider === 'free') return s.pollApiKey || '';
  if (s.imageProvider === 'fal') return s.falApiKey;
  return s.imageShareKey ? s.chatApiKey : s.imageApiKey;
}

/** Mô hình đang dùng cho TẠO ẢNH theo nhà cung cấp. */
export function imageModelOf(s) {
  if (s.imageProvider === 'free') return s.pollModel || 'sana';
  return s.imageProvider === 'fal' ? s.falModel : s.imageModel;
}

/** Các kích thước ảnh cho ô chọn. '' = mặc định của nhà cung cấp. */
export const IMAGE_SIZES = [
  { value: '', label: 'mặc định' },
  { value: '1024x1024', label: '1024x1024 (vuông)' },
  { value: '1024x1536', label: '1024x1536 (dọc)' },
  { value: '1536x1024', label: '1536x1024 (ngang)' },
  { value: '1024x1792', label: '1024x1792 (dọc cao)' },
  { value: '1792x1024', label: '1792x1024 (ngang rộng)' },
  { value: '512x512', label: '512x512' },
  { value: '256x256', label: '256x256' },
];

/** Ngưỡng thời gian (ms): quá mức này mà chưa có phản hồi thì cảnh báo "phản hồi chậm". */
export const SLOW_MS = 15000;

/** Số lần thử lại tối đa khi gặp 429 / 5xx. */
export const MAX_RETRIES = 3;

/** Tỉ lệ bộ nhớ đã dùng để cảnh báo. */
export const STORAGE_WARN_RATIO = 0.8;
