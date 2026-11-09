# Tiên Môn Vấn Đạo

Game tu tiên chạy ngay trong buổi **live TikTok**. Người xem chat, thả tim, tặng quà là tự động có nhân vật trong "điện" trên màn hình live, tu luyện lên cảnh giới, đánh boss, nhận thưởng. Chủ phòng không cần bấm gì: game tự chạy theo lịch.

Game là một server Node.js nhỏ chạy trên máy của bạn. Màn hình game là một trang web, đưa vào OBS hoặc TikTok LIVE Studio như một nguồn trình duyệt (khung dọc 1080x1920).

## Game là gì, nói ngắn gọn

- Người xem **chat "tu luyện"** để vào điện. Mỗi người có một **linh căn** ngẫu nhiên (Kim, Mộc, Thủy, Hỏa, Thổ, hiếm hơn là Lôi, Băng, Phong, và Thiên linh căn cực hiếm). Linh căn tốt thì tu vi lên nhanh hơn.
- Có **tu vi** (điểm kinh nghiệm). Đủ điểm thì lên cảnh giới: Phàm Nhân, Luyện Khí, Trúc Cơ, Kim Đan, Nguyên Anh, Hóa Thần, Luyện Hư, Đại Thừa, Chân Tiên. Từ Kim Đan trở lên là đột phá lớn, có thông báo và tiếng sấm.
- Cứ vài phút lại có **sự kiện**: boss xuất hiện, mưa linh thạch, luận đạo, luyện đan... Người xem cùng tham gia bằng cách chat một từ khóa.
- Người nhiều tu vi ngồi **ghế cao** trong điện (Chưởng Môn, Lão Tổ...), có hiệu ứng riêng và tên hiện trên Thiên Bảng.

## Người xem chơi thế nào

Chỉ cần dùng chat, tim và quà của TikTok. Không cần cài gì. Gõ không dấu cũng được (ví dụ `tu luyen`).

| Làm gì | Được gì |
|---|---|
| Chat `tu luyện` | Vào điện, nhận linh căn, điểm danh ngày đầu. Chat tiếp (cách nhau ít nhất 10 giây) sẽ cộng tu vi |
| Thả tim | Cứ 100 tim thì nhận thêm tu vi. Đủ 100 tim thì lên ngoại môn. Cả phòng thả đủ 1.000 tim thì bật **Linh Khí Triều**: tu vi nhân đôi một lúc |
| Chia sẻ phòng live | Nhận tu vi (có giới hạn số lần mỗi phiên) |
| Chat `check`, `linh căn` hoặc `tu vi` | Hiện thẻ hồ sơ của bạn vài giây |
| Chat `đánh` khi có boss | Đánh boss, tính vào Bảng Sát Thương. Boss yếu hệ nào thì đệ tử hệ khắc đánh mạnh hơn |
| Chat `nhặt` khi có Mưa Linh Thạch | Nhặt linh thạch, cộng tu vi |
| Chat `phá trận` khi boss có khiên | Cùng nhau phá khiên cho boss |
| Chat `kiếm`, `đan` hoặc `trận` | Chọn môn phái. Đổi lại được sau 30 phút |
| Chat `1`, `2`, `3` khi có câu hỏi Luận Đạo | Chọn đáp án. Trả lời đúng được thưởng |
| Chat `luyện đan` khi có sự kiện Luyện Đan | Tham gia luyện đan |

Quà tặng:

| Quà | Hiệu ứng |
|---|---|
| Hoa hồng (1 xu) | +10 tu vi |
| Tim tay (5 xu) | +50 tu vi |
| Donut (30 xu) | Tẩy Tủy: bỏ bớt một hệ phụ trong linh căn |
| Corgi (299 xu) | +2.990 tu vi |
| Sư tử (29.999 xu) | 10% cơ hội biến dị linh căn |
| Quà từ 1.000 xu | Thông báo lớn trên màn hình, có thể đột phá cảnh giới |

Tặng liên tiếp một loại quà thì chỉ tính khi hết combo, theo đúng số lượng. Các con số này sửa được trong `config.json`.

## Nhịp một buổi live

Lịch Thiên Đạo lặp mỗi 20 phút, hiện đếm ngược trên màn hình:

| Phút | Sự kiện |
|---|---|
| 00 | Boss xuất hiện |
| 08 | Mưa Linh Thạch |
| 12 | Một trong: Luận Đạo, Luyện Đan, Đăng Thiên Thê, Bí Cảnh (luân phiên) |
| 16 | Mưa Linh Thạch |

Ngoài ra còn: độ kiếp khi chạm bình cảnh, Bảo Khố, pháp bảo, dị thú, thiên dực, khiêu chiến giữa người chơi, Chính Đạo và Ma Đạo, rơi đồ và Linh Thú Đản. Mỗi hệ thống bật hoặc tắt riêng trong mục `modules` của `config.json`.

Cuối phiên, Top 10 Thiên Kiêu nhận thưởng.

## Cho chủ phòng: bắt đầu nhanh

Cần **Node.js bản 24.2 trở lên** (tải ở nodejs.org).

1. Tải repo về, giải nén, mở cửa sổ lệnh trong thư mục game.
2. Cài thư viện một lần:

```
npm install
```

3. Bật game:

```
npm start
```

4. Mở `http://localhost:3000` để xem màn hình game.
5. Mở thêm `http://localhost:3000/sim` để thử bằng **bảng giả lập**. Bấm **Bắt đầu phiên**, rồi **Thêm 50 người chơi ảo**, rồi gọi thử boss hoặc các sự kiện. Cách này không cần live thật.

Trên Windows PowerShell, nếu `npm` báo lỗi chặn script thì gõ `npm.cmd` thay cho `npm`.

Muốn live thật: điền username TikTok vào mục `tiktok` trong `config.json`, tắt và bật lại game, rồi đưa `http://127.0.0.1:3000/` vào OBS (nguồn Browser, 1080x1920) hoặc TikTok LIVE Studio. Từng bước có hình dung chi tiết trong các file bên dưới.

**Nhớ:** người chơi giả lập lưu chung với người chơi thật. Thử xong, trước khi live thật, hãy xóa thư mục `data` khi game đã tắt.

## Tài liệu đi kèm

- [CACH-BAT-GAME.md](CACH-BAT-GAME.md): hướng dẫn ngắn nhất để bật game, dành cho người chưa quen máy tính.
- [HUONG-DAN.md](HUONG-DAN.md): hướng dẫn đầy đủ. Gồm thử bằng giả lập, gắn OBS, gắn TikTok LIVE Studio, lần live thật đầu tiên, xử lý sự cố, sao lưu dữ liệu.

## Tùy chỉnh

| Muốn đổi | Sửa ở đâu |
|---|---|
| Luật chơi, điểm, lịch sự kiện, quà, từ khóa chat | `config.json` (sửa xong phải tắt và bật lại game) |
| Âm lượng, giọng đọc | `audio` trong `config.json` |
| Câu hỏi Luận Đạo | `questions.json` (mỗi câu có 3 đáp án, `answer` là số thứ tự đáp án đúng) |
| Hình ảnh | Thay file ảnh gốc rồi chạy `node tools/prepare-assets.js <thư mục ảnh>` |

Kiểm tra game còn chạy đúng luật:

```
npm test
```

Kết quả phải báo `fail 0`.

## Lưu ý

- Kết nối TikTok dùng thư viện không chính thức (`tiktok-live-connector`). Nếu TikTok đổi hệ thống, phần kết nối có thể tạm ngừng cho đến khi thư viện cập nhật. Bảng giả lập vẫn dùng được và dữ liệu không mất.
- Game không cần cookie hay mật khẩu TikTok của bạn. Không ai có quyền xin những thứ đó.
- Game chỉ nhận kết nối từ chính máy chạy nó, nên OBS hoặc LIVE Studio phải chạy cùng máy.
- Phần OBS, TikTok LIVE Studio và live TikTok thật chưa được kiểm chứng đầy đủ. Hãy chạy một buổi live thử ngắn trước, làm theo mục F trong `HUONG-DAN.md`.
