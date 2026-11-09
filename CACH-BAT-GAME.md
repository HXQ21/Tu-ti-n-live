# Cách bật game Tiên Môn Vấn Đạo

## Làm một lần duy nhất

1. Cài Node.js bản 24 trở lên từ nodejs.org (chọn bản LTS hoặc Current mới nhất). Cài xong khởi động lại máy.
2. Tải repo về (nút **Code → Download ZIP** trên GitHub). Chuột phải file zip, chọn **Extract All…**. Vào thư mục `Tu-ti-n-live-master` vừa giải nén.
3. Bấm vào thanh địa chỉ của thư mục, gõ `cmd`, nhấn Enter. Cửa sổ đen hiện ra.
4. Gõ lệnh sau rồi nhấn Enter, chờ chạy xong:

```
npm install
```

## Mỗi lần muốn chơi

1. Mở cửa sổ đen trong thư mục game như bước 3 ở trên.
2. Gõ lệnh sau rồi nhấn Enter. Không tắt cửa sổ này khi đang chơi:

```
npm start
```

3. Mở trình duyệt, vào `http://localhost:3000`. Đây là màn hình game.
4. Muốn thử khi chưa live: mở thêm `http://localhost:3000/sim.html`. Bấm **Bắt đầu phiên**, rồi **Thêm 50 người chơi ảo**, rồi bấm các nút gọi boss hoặc sự kiện.

## Khi live TikTok thật

1. Mở file `config.json`, điền tên TikTok của bạn vào `"username"` trong mục `tiktok`.
2. Tắt cửa sổ đen (hoặc bấm Ctrl+C) rồi chạy lại `npm start`.
3. Đưa màn hình game vào OBS hoặc TikTok LIVE Studio. Chi tiết xem file `HUONG-DAN.md`.

## Tắt game

Bấm Ctrl+C trong cửa sổ đen, hoặc đóng cửa sổ đó.

## Nếu gặp lỗi

- Báo "npm không nhận ra": chưa cài Node.js hoặc chưa khởi động lại máy sau khi cài.
- Không vào được `http://localhost:3000`: cửa sổ đen đã bị tắt, hoặc cổng 3000 đang bị chương trình khác dùng.
- Các lỗi khác: chụp lại thông báo trong cửa sổ đen để được hỗ trợ.
