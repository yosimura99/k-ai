# K.AI — v2.0.0

Trợ lý AI cá nhân của Khang: **Hỏi** (trò chuyện) và **Tạo ảnh**. Giao diện đen tối giản, logo chữ K trắng–đen.
Ứng dụng web tĩnh (HTML/CSS/JS thuần, không cần build), chạy trên GitHub Pages, cài được lên màn hình chính iPhone (PWA).

Trang: <https://yosimura99.github.io/k-ai/>

## Sử dụng

1. Mở trang trên Safari (iPhone) → nút Chia sẻ → **Thêm vào MH chính** để dùng như ứng dụng.
2. Lần đầu mở: bấm **Thiết lập Face ID** để khoá bằng Face ID / Touch ID (hoặc **Bỏ qua**). Ứng dụng tự khoá lại khi ở nền quá 5 phút.
3. Mở **Cài đặt** (biểu tượng bánh răng ở cuối thanh bên; trên điện thoại bấm nút menu ☰ để mở thanh bên):
   - Chọn bộ cài sẵn **xAI** hoặc **OpenAI**, hoặc tự nhập địa chỉ API (tương thích OpenAI).
   - Hai mô hình: **Nhanh** và **Chuyên gia** — chọn nhanh bằng nút chế độ trong ô nhập.
   - Nhập **khoá API**. Tạo ảnh có thể **dùng chung khoá với trò chuyện** hoặc dùng khoá riêng.
4. **Hỏi**: gõ câu hỏi, `Enter` để gửi trên máy tính (`Shift+Enter` xuống dòng); trên điện thoại bấm nút gửi tròn trắng.
   - Kẹp giấy: đính kèm ảnh (tối đa 4) cho mô hình đọc ảnh. Dán ảnh vào ô nhập cũng được.
   - Micro: đọc chính tả tiếng Việt (nếu trình duyệt hỗ trợ).
   - Dưới mỗi câu trả lời: **chép**, **tạo lại**, **đọc to**.
   - Biểu tượng con ma ở góc phải trên: **trò chuyện tạm thời** — không lưu vào lịch sử.
   - Lịch sử được nhóm Hôm nay / Hôm qua / 7 ngày trước … trong thanh bên, có ô tìm kiếm (`Ctrl/⌘+K`).
5. **Tạo ảnh**: nhập mô tả, chọn nhà cung cấp và tỉ lệ (**1:1**, **3:4**, **16:9**) ngay trên thanh nhập, bấm gửi.
   Ảnh hiện dạng lưới, lưu trên máy; chạm để xem (chạm vào ảnh để xem đúng 100% điểm ảnh), tải xuống, đánh dấu yêu thích, dùng lại mô tả hoặc xoá.

## Tạo ảnh miễn phí (Pollinations)

Mặc định cho người dùng mới: không cần khoá, không cần tài khoản. Bộ cài sẵn **Miễn phí (không cần khoá)** trong Cài đặt đưa về chế độ này. Cài đặt cũ đã lưu giữ nguyên; chỉ khi chưa chọn nhà cung cấp mới tự dùng Pollinations.

- **Không khoá** → `GET https://image.pollinations.ai/prompt/<lời nhắc>?width=&height=&seed=&model=sana&nologo=true&referrer=<tên miền>`. Máy chủ hiện chỉ phục vụ mô hình **sana** (DreamShaper 8 LCM) dù yêu cầu mô hình khác, và giới hạn ảnh ở khoảng 0,59 MP: vuông tối đa 768x768 (yêu cầu 1024, 1536 hay 2048 đều ra 768x768; `enhance`, `quality` không đổi được), dọc 1024x1792 → 580x1015, mỗi ảnh ~4–10 giây, có hình mờ `pollinations.ai` ở góc (tham số `nologo` bị bỏ qua khi không có khoá).
- **Có khoá** (miễn phí tại <https://enter.pollinations.ai/keys>) → `GET https://gen.pollinations.ai/image/<lời nhắc>` với `Authorization: Bearer <khoá>`, dùng được `flux`, `zimage`, `klein`, `kontext`.
- Tỉ lệ khung ở tab Tạo ảnh được đổi thành `width`/`height`; mỗi yêu cầu dùng một hạt giống ngẫu nhiên.
- Khi bị giới hạn tốc độ (HTTP 429/503) app báo trên dòng trạng thái, chờ theo `Retry-After` (mặc định 10 giây) rồi thử lại **một lần**.
- Ảnh được tải về dạng Blob và lưu vào thư viện IndexedDB.
- Lưu ý: máy chủ đòi xác minh Turnstile (HTTP 403) với yêu cầu từ `localhost`; chạy từ GitHub Pages thì không. Khi thử cục bộ hãy nhập khoá Pollinations.

## Tạo ảnh bằng fal.ai

1. Tạo khoá tại <https://fal.ai/dashboard/keys>. Khoá có dạng `KEY_ID:KEY_SECRET`.
2. **Cài đặt** → bộ cài sẵn **fal.ai (chỉ tạo ảnh)**, hoặc nút nhà cung cấp ở thanh nhập của tab **Tạo ảnh** → **fal.ai**.
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
   - **hàng đợi** — `POST https://queue.fal.run/<mô hình>`, rồi thăm dò trạng thái mỗi giây (dòng trạng thái hiện vị trí hàng đợi / đang xử lý), xong thì lấy kết quả. Bấm nút dừng sẽ huỷ yêu cầu.
   - **tự động** — schnell gọi đồng bộ, các mô hình chậm hơn dùng hàng đợi.

Tỉ lệ khung ở tab Tạo ảnh được đổi sang tên của fal.ai: `1024x1024 → square_hd`, `512x512 / 256x256 → square`, `1024x1536 → portrait_4_3`, `1536x1024 → landscape_4_3`, `1024x1792 → portrait_16_9`, `1792x1024 → landscape_16_9`, `mặc định` → để mô hình tự chọn.
Yêu cầu gửi `num_images: 1` và `enable_safety_checker: false` với mô hình có tham số này (fal.ai chỉ tôn trọng khi tài khoản được phép). Ảnh trả về (`images[0].url`) được tải về và lưu thành Blob trong IndexedDB nên thư viện xem được khi ngoại tuyến; nếu không tải được thì chỉ lưu đường dẫn.

## Hiển thị ảnh

Ảnh luôn hiển thị nét: không có lớp phủ, nhãn hay hiệu ứng nào đè lên ảnh (lưới, trình xem), ảnh không bị phóng to quá kích thước gốc, không bộ lọc/độ mờ/hoà trộn. Ảnh lưu trong IndexedDB là đúng các byte gốc máy chủ trả về (không vẽ lại qua canvas, không nén lại).

## Lời nhắc hệ thống

Lời nhắc hệ thống nằm trong file **`system-prompt.js`** ở thư mục gốc. Sửa chuỗi `SYSTEM_PROMPT`, commit và push lên GitHub, rồi tải lại trang là áp dụng.

## Dữ liệu & bảo mật

- Cài đặt, khoá API và lịch sử trò chuyện lưu trong `localStorage` (`kai.chats.v2`; lịch sử bản 1 được tự chuyển sang); ảnh lưu trong `IndexedDB`. Tất cả chỉ ở trên thiết bị của bạn.
- Yêu cầu được gửi thẳng từ trình duyệt tới địa chỉ API bạn cấu hình (nhà cung cấp phải cho phép CORS). Service worker không bao giờ lưu đệm lời gọi API.
- Khoá sinh trắc là khoá tiện lợi trên máy (WebAuthn, không có máy chủ xác minh). Bật/tắt hoặc đặt lại trong **Cài đặt → Bảo mật**.
- **Cài đặt → Dữ liệu**: xuất lịch sử ra `.json`, xoá lịch sử, khôi phục mặc định, xoá toàn bộ dữ liệu.

## Cấu trúc

```
index.html          giao diện + bộ biểu tượng SVG
system-prompt.js    lời nhắc hệ thống (sửa ở đây)
manifest.json       PWA
sw.js               service worker (chỉ lưu đệm vỏ ứng dụng)
css/style.css       giao diện đen tối giản
js/app.js           khởi động, tab, thanh bên, lịch sử, chia sẻ
js/chat.js          trò chuyện (stream SSE + dự phòng, ảnh đính kèm, chế độ Nhanh/Chuyên gia)
js/md.js            hiển thị Markdown an toàn
js/speech.js        đọc chính tả + đọc to
js/image.js         tạo ảnh + lưới ảnh + trình xem
js/fal.js           nhà cung cấp fal.ai (đồng bộ + hàng đợi)
js/pollinations.js  nhà cung cấp miễn phí Pollinations
js/settings.js      cài đặt
js/lock.js          khoá sinh trắc (WebAuthn)
js/config.js        mặc định, bộ cài sẵn, tỉ lệ ảnh
js/storage.js       localStorage + IndexedDB
js/log.js           mô tả lỗi HTTP
js/ui.js            tiện ích giao diện (biểu tượng, menu, thông báo)
icons/              biểu tượng ứng dụng
```

## Lịch sử phiên bản

- **v2.0.0** — Giao diện mới: nền đen tối giản, logo K; tab Hỏi / Tạo ảnh; thanh bên với lịch sử nhóm theo ngày (ngăn kéo trên điện thoại); ô nhập bo tròn hai hàng với chế độ Nhanh / Chuyên gia, đính kèm ảnh, micro; trò chuyện tạm thời; hiển thị Markdown; lưới ảnh kiểu masonry với tỉ lệ 1:1 / 3:4 / 16:9 và yêu thích; cài đặt dạng bảng; màn hình khoá đen trắng.
- v1.x — Giao diện terminal xanh lá.
