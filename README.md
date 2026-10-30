# K.AI

Trợ lý AI cá nhân của Khang: **trò chuyện** và **tạo ảnh**, giao diện kiểu terminal xanh lá trên nền đen.
Ứng dụng web tĩnh (HTML/CSS/JS thuần, không cần build), chạy trên GitHub Pages, cài được lên màn hình chính iPhone.

## Sử dụng

1. Mở trang trên Safari (iPhone) → nút Chia sẻ → **Thêm vào MH chính** để dùng như ứng dụng.
2. Lần đầu mở: bấm **THIẾT LẬP KHOÁ SINH TRẮC** để dùng Face ID / Touch ID (hoặc **BỎ QUA**).
3. Vào **CÀI ĐẶT**:
   - Chọn bộ cài sẵn **xAI** hoặc **OpenAI**, hoặc tự nhập địa chỉ API (tương thích OpenAI) và tên mô hình.
   - Nhập **khoá API**. Tạo ảnh có thể **dùng chung khoá với trò chuyện** hoặc dùng khoá riêng.
4. **TRÒ CHUYỆN**: gõ lệnh, `Enter` để gửi, `Shift+Enter` để xuống dòng. **XUẤT NHẬT KÝ** lưu ra `.txt` / `.json`; **XOÁ NHẬT KÝ** xoá lịch sử.
5. **TẠO ẢNH**: nhập mô tả, chọn kích thước, bấm **TẠO ẢNH**. Ảnh được lưu trong thư viện trên máy; chạm để xem lớn, tải xuống hoặc xoá.

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
js/settings.js      cài đặt
js/lock.js          khoá sinh trắc (WebAuthn)
js/storage.js       localStorage + IndexedDB
js/log.js           dòng nhật ký terminal
js/ui.js            tiện ích giao diện
js/config.js        mặc định, bộ cài sẵn
sw.js               service worker (chế độ ngoại tuyến)
manifest.json       cấu hình PWA
```
