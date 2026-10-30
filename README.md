# K.AI

Trợ lý AI cá nhân của Khang: **trò chuyện** và **tạo ảnh**, giao diện kiểu terminal xanh lá trên nền đen.
Ứng dụng web tĩnh (HTML/CSS/JS thuần, không cần build), chạy trên GitHub Pages, cài được lên màn hình chính iPhone.

## Sử dụng

1. Mở trang trên Safari (iPhone) → nút Chia sẻ → **Thêm vào MH chính** để dùng như ứng dụng.
2. Lần đầu mở: bấm **THIẾT LẬP KHOÁ SINH TRẮC** để dùng Face ID / Touch ID (hoặc **BỎ QUA**).
3. Vào **CÀI ĐẶT**:
   - Chọn bộ cài sẵn **xAI** hoặc **OpenAI**, hoặc tự nhập địa chỉ API (tương thích OpenAI) và tên mô hình.
   - Nhập **khoá API**. Tạo ảnh có thể **dùng chung khoá với trò chuyện** hoặc dùng khoá riêng.
   - **TẠO ẢNH → nhà cung cấp**: chọn **Miễn phí (Pollinations)** (mặc định, không cần khoá), **Chuẩn OpenAI** (xAI, OpenAI, …) hoặc **fal.ai** (xem bên dưới).
4. **TRÒ CHUYỆN**: gõ lệnh, `Enter` để gửi, `Shift+Enter` để xuống dòng. **XUẤT NHẬT KÝ** lưu ra `.txt` / `.json`; **XOÁ NHẬT KÝ** xoá lịch sử.
5. **TẠO ẢNH**: nhập mô tả, chọn kích thước, bấm **TẠO ẢNH**. Ảnh được lưu trong thư viện trên máy; chạm để xem lớn, tải xuống hoặc xoá.

## Tạo ảnh miễn phí (Pollinations)

Mặc định cho người dùng mới: không cần khoá, không cần tài khoản. Bộ cài sẵn **Miễn phí (không cần khoá)** trong CÀI ĐẶT đưa về chế độ này. Cài đặt cũ đã lưu giữ nguyên; chỉ khi chưa chọn nhà cung cấp mới tự dùng Pollinations.

- **Không khoá** → `GET https://image.pollinations.ai/prompt/<lời nhắc>?width=&height=&seed=&model=sana&nologo=true&referrer=<tên miền>`. Máy chủ hiện chỉ phục vụ mô hình **sana** (DreamShaper 8 LCM), ảnh bị thu nhỏ còn khoảng 0,6 MP (vd. 1024x1024 → ~776x776), mỗi ảnh ~4–10 giây.
- **Có khoá** (miễn phí tại <https://enter.pollinations.ai/keys>) → `GET https://gen.pollinations.ai/image/<lời nhắc>` với `Authorization: Bearer <khoá>`, dùng được `flux`, `zimage`, `klein`, `kontext`.
- Kích thước ở tab TẠO ẢNH được đổi thành `width`/`height`; mỗi yêu cầu dùng một hạt giống ngẫu nhiên.
- Khi bị giới hạn tốc độ (HTTP 429/503) app ghi `[CẢNH BÁO]`, chờ theo `Retry-After` (mặc định 10 giây) rồi thử lại **một lần**.
- Ảnh được tải về dạng Blob và lưu vào thư viện IndexedDB.
- Lưu ý: máy chủ đòi xác minh Turnstile (HTTP 403) với yêu cầu từ `localhost`; chạy từ GitHub Pages thì không. Khi thử cục bộ hãy nhập khoá Pollinations.

## Tạo ảnh bằng fal.ai

1. Tạo khoá tại <https://fal.ai/dashboard/keys>. Khoá có dạng `KEY_ID:KEY_SECRET`.
2. **CÀI ĐẶT** → bộ cài sẵn **fal.ai (chỉ tạo ảnh)**, hoặc **TẠO ẢNH → nhà cung cấp → fal.ai**.
3. Dán khoá vào ô **khoá fal.ai** (khoá riêng, không dùng chung với trò chuyện).
4. Chọn mô hình có sẵn hoặc tự nhập id mô hình bất kỳ trên fal.ai:

| Mô hình | id |
|---|---|
| FLUX.1 [schnell] (mặc định, nhanh) | `fal-ai/flux/schnell` |
| FLUX.1 [dev] | `fal-ai/flux/dev` |
| FLUX1.1 [pro] | `fal-ai/flux-pro/v1.1` |
| Recraft V3 | `fal-ai/recraft/v3/text-to-image` |

5. **Cách gọi**:
   - **đồng bộ** — `POST https://fal.run/<mô hình>`, chờ trả thẳng kết quả.
   - **hàng đợi** — `POST https://queue.fal.run/<mô hình>`, rồi thăm dò trạng thái mỗi giây (hiện dòng `[TIN]` vị trí hàng đợi / đang xử lý), xong thì lấy kết quả. Bấm **DỪNG** sẽ huỷ yêu cầu.
   - **tự động** — schnell gọi đồng bộ, các mô hình chậm hơn dùng hàng đợi.

Kích thước ở tab TẠO ẢNH được đổi sang tên của fal.ai: `1024x1024 → square_hd`, `512x512 / 256x256 → square`, `1024x1536 → portrait_4_3`, `1536x1024 → landscape_4_3`, `1024x1792 → portrait_16_9`, `1792x1024 → landscape_16_9`, `mặc định` → để mô hình tự chọn.
Yêu cầu gửi `num_images: 1` và `enable_safety_checker: false` với mô hình có tham số này (fal.ai chỉ tôn trọng khi tài khoản được phép). Ảnh trả về (`images[0].url`) được tải về và lưu thành Blob trong IndexedDB nên thư viện xem được khi ngoại tuyến; nếu không tải được thì chỉ lưu đường dẫn.

## Lời nhắc hệ thống

Lời nhắc hệ thống nằm trong file **`system-prompt.js`** ở thư mục gốc. Sửa chuỗi `SYSTEM_PROMPT`, commit và push lên GitHub, rồi tải lại trang là áp dụng.

## Dữ liệu & bảo mật

- Cài đặt, khoá API và nhật ký lưu trong `localStorage`; ảnh lưu trong `IndexedDB`. Tất cả chỉ ở trên thiết bị của bạn.
- Yêu cầu được gửi thẳng từ trình duyệt tới địa chỉ API bạn cấu hình (nhà cung cấp phải cho phép CORS).
- Khoá sinh trắc là khoá tiện lợi trên máy (WebAuthn, không có máy chủ xác minh). Bật/tắt hoặc đặt lại trong **CÀI ĐẶT → BẢO MẬT**.
- **XOÁ TOÀN BỘ DỮ LIỆU** trong CÀI ĐẶT để xoá sạch mọi thứ trên máy.

## Cấu trúc

```
index.html          giao diện
system-prompt.js    lời nhắc hệ thống (sửa ở đây)
css/style.css       giao diện terminal
js/app.js           khởi động, tab, đồng hồ, trạng thái
js/chat.js          trò chuyện (stream SSE + dự phòng)
js/image.js         tạo ảnh + thư viện
js/fal.js           nhà cung cấp fal.ai (đồng bộ + hàng đợi)
js/pollinations.js  nhà cung cấp miễn phí Pollinations
js/settings.js      cài đặt
js/lock.js          khoá sinh trắc (WebAuthn)
js/storage.js       localStorage + IndexedDB
js/log.js           dòng nhật ký terminal
js/ui.js            tiện ích giao diện
js/config.js        mặc định, bộ cài sẵn
sw.js               service worker (chế độ ngoại tuyến)
manifest.json       cấu hình PWA
```
