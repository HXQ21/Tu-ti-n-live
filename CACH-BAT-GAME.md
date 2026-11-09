# Cách bật game Tiên Môn Vấn Đạo

## Làm một lần duy nhất

1. Cài Node.js bản 24 trở lên từ nodejs.org (chọn bản LTS hoặc Current mới nhất). Cài xong khởi động lại máy.
2. Tải repo về (nút **Code → Download ZIP** trên GitHub). Chuột phải file zip, chọn **Extract All…**, giải nén vào một **thư mục trống**. Không giải nén đè lên bản cũ.
3. Chỉ giữ **một** bản game trên máy. Nếu có nhiều thư mục `Tu-ti-n-live-master` (ở `Downloads`, ổ D, ổ E…), xoá bớt, chỉ để lại bản mới nhất. Muốn giữ dữ liệu người chơi thì chép thư mục `data` từ bản cũ sang bản mới trước khi xoá.

## Mỗi lần muốn chơi

1. Vào thư mục game, **bấm đúp file `BAT-GAME.bat`**. Cửa sổ đen hiện ra. Lần đầu nó tự cài thư viện, chờ vài phút.
2. Dòng `Dang bat game tu thu muc: ...` cho biết đang chạy bản ở đâu. Kiểm tra đúng thư mục bạn muốn. Không tắt cửa sổ này khi đang chơi.
3. Mở trình duyệt, vào `http://localhost:3000`. Đây là màn hình game.
4. Muốn thử khi chưa live: mở thêm `http://localhost:3000/sim.html`. Bấm **Bắt đầu phiên**, rồi **Thêm 50 người chơi ảo**, rồi bấm các nút gọi boss hoặc sự kiện.

## Khi live TikTok thật

1. Bắt đầu live trên TikTok trước.
2. Mở `http://localhost:3000/sim`. Ở mục **Kết nối TikTok LIVE**, điền ID TikTok của bạn (`@tenban`, hoặc dán link `tiktok.com/@tenban/live`), bấm **Kết nối**. Không cần tắt game. ID được lưu cho lần bật sau.
3. Chấm trên đầu trang chuyển xanh, ghi `đã kết nối` là xong. Nếu ghi `chưa vào được phòng live`: kiểm tra đã bắt đầu live chưa, và ID có đúng không.
4. Đưa màn hình game vào OBS hoặc TikTok LIVE Studio. Chi tiết xem file `HUONG-DAN.md`.

## Tắt game

Bấm Ctrl+C trong cửa sổ đen, hoặc đóng cửa sổ đó.

## Nếu gặp lỗi

- Báo "Chua cai Node.js" hoặc "npm không nhận ra": chưa cài Node.js hoặc chưa khởi động lại máy sau khi cài.
- Tự gõ lệnh trong PowerShell mà báo `running scripts is disabled on this system`: gõ `npm.cmd` thay cho `npm`. Dễ nhất là dùng `BAT-GAME.bat`.
- Sửa `config.json` mà game không đổi: bạn đang sửa bản ở thư mục khác. Xem dòng `Dang bat game tu thu muc` trong cửa sổ đen và sửa đúng `config.json` trong thư mục đó.
- Không vào được `http://localhost:3000`: cửa sổ đen đã bị tắt, hoặc cổng 3000 đang bị chương trình khác dùng.
- Các lỗi khác: chụp lại thông báo trong cửa sổ đen để được hỗ trợ.
