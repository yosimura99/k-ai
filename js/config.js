/**
 * config.js — Hằng số, giá trị mặc định và các bộ cài sẵn (preset).
 */

/** Phiên bản ứng dụng (hiển thị trong nhật ký khi khởi động). */
export const APP_VERSION = '1.0.0';

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
};

/** Bộ cài sẵn: điền nhanh các ô cài đặt. */
export const PRESETS = {
  xai: {
    label: 'xAI (Grok)',
    chatBaseUrl: 'https://api.x.ai/v1',
    chatModel: 'grok-4',
    imageBaseUrl: 'https://api.x.ai/v1',
    imageModel: 'grok-2-image',
    imageSize: '',
  },
  openai: {
    label: 'OpenAI',
    chatBaseUrl: 'https://api.openai.com/v1',
    chatModel: 'gpt-4o-mini',
    imageBaseUrl: 'https://api.openai.com/v1',
    imageModel: 'gpt-image-1',
    imageSize: '1024x1024',
  },
};

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
