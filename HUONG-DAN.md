# Hướng dẫn chạy game "Tiên Môn Vấn Đạo"

Viết cho người mới. Làm lần lượt từ trên xuống. Nên thử xong Phần A, B với giả lập rồi mới gắn vào live thật.

Trạng thái kiểm thử: game đã chạy tốt bằng giả lập trên máy này và trong trình duyệt Edge. **OBS, TikTok LIVE Studio và live TikTok thật chưa từng được thử.** Lần đầu lên sóng, hãy làm theo Phần F để phát hiện sớm nếu có gì sai.

## A. Bật game

Cần có Node.js từ bản 24.2 trở lên. Máy hiện tại đã có sẵn (24.21). Nếu chuyển sang máy khác, xem Phần H.

1. Mở **PowerShell** (bấm phím Windows, gõ `PowerShell`, Enter).
2. Chạy hai lệnh sau:

```
cd "D:\game live"
npm.cmd start
```

Phải gõ `npm.cmd`, không gõ `npm`: PowerShell mặc định chặn `npm` với lỗi `running scripts is disabled on this system`.

3. Khi thấy dòng `Bảng giả lập: http://127.0.0.1:3000/sim` là đã chạy.
4. **Giữ nguyên cửa sổ này suốt buổi live.** Đóng nó là game dừng.

**Tắt game:** bấm vào cửa sổ đó rồi nhấn `Ctrl + C`. Dữ liệu được lưu ngay lúc tắt, và tự lưu mỗi 30 giây khi đang chạy. Đừng tắt bằng nút X: cách này chưa được thử, nên có thể mất tối đa 30 giây dữ liệu gần nhất.

## B. Chạy thử bằng giả lập

1. Mở trình duyệt (Edge hoặc Chrome), tab 1: `http://127.0.0.1:3000/`. Đây là màn hình game.
2. Tab 2: `http://127.0.0.1:3000/sim`. Đây là bảng điều khiển, người xem không thấy.
3. Bấm một lần vào tab 1 nếu thấy dòng "Bấm vào đây để bật âm thanh". Trình duyệt thường chặn âm thanh đến khi có một lần bấm.

Thử theo thứ tự này trên bảng giả lập:

| Bấm | Phải thấy trên màn hình game |
|---|---|
| Bắt đầu phiên | Mất dòng "Chưa bắt đầu phiên live", Lịch Thiên Đạo bắt đầu đếm ngược. Boss phút 00 bị bỏ qua nếu chưa có ai |
| Nút `tu luyện` | Một đạo hữu vào điện, có tiếng chuông, Truyền Tin ghi "nhập môn" và "điểm danh" |
| Thêm 50 người chơi ảo | Điện đầy 36 ghế, các ghế Chưởng Môn, Lão Tổ có người, dòng "đang chờ vào điện" |
| Thả tim (100) | Tên đổi thân phận thành ngoại môn, Truyền Tin "đủ 100 tim" |
| Tặng quà Corgi | Truyền Tin "+2.990 tu vi", chữ +N bay trên avatar |
| Tặng quà tùy chọn 1000 xu | Thông báo lớn, đột phá Kim Đan có tiếng sấm |
| Nút `check` | Thẻ hồ sơ hiện 6 giây ở nửa dưới điện |
| Gọi Mưa Linh Thạch ngay, rồi nút `nhặt` | Banner giữa điện, linh thạch rơi, tu vi tăng |
| Gọi boss ngay, chờ 60 giây, rồi nút `đánh` | Tiếng trống, boss chiếm vùng điện, Bảng Sát Thương bên trái |
| Thả tim 1000 | Dải trạng thái đổi thành "LINH KHÍ TRIỀU" |
| Chuyển sang ngày mới / tuần mới | Nhiệm vụ ngày, điểm danh, Bảng Tuần làm mới |
| Kết thúc phiên | Top 10 Thiên Kiêu nhận thưởng, lịch dừng |
| Thử chuông, Thử sấm, Thử trống | Nghe rõ tiếng |

Hệ thống mở rộng (Phần 2) đã đủ mục A–M: Bảo Khố, Bình cảnh & Độ kiếp, Luận Đạo, Pháp bảo, Dị thú, Thiên dực, Khiêu chiến, Luyện Đan, Đăng Thiên Thê, Bí Cảnh, Chính Đạo – Ma Đạo, Rơi đồ & Linh Thú Đản, hiệu ứng quanh ghế VIP. Khe phút 12 của lịch luân phiên Luận Đạo → Luyện Đan → Đăng Thiên Thê → Bí Cảnh; bảng quản trị có nút gọi ngay từng sự kiện. Mỗi hệ thống bật/tắt trong `config.json`, mục `modules` (`true` là bật, `false` là tắt), rồi tắt và bật lại game. Thử nhanh:

| Bấm | Phải thấy |
|---|---|
| Tặng quà tùy chọn 1500 xu cho một người, rồi nút `độ kiếp` với tên đó | Truyền Tin "chạm bình cảnh Kim Đan", rồi sét đánh, thanh "Tỉ lệ thành công" |
| Nút `hộ pháp` với tên khác | Tỉ lệ tăng 1% mỗi người |
| Gọi Luận Đạo ngay, rồi nút `1`/`2`/`3` | Câu hỏi giữa điện, sau 20 giây hiện Phong Thưởng · Ngộ Đạo |
| Tặng quà 10 xu | Truyền Tin "+1 lượt luyện" pháp bảo, vòng sáng cạnh avatar |

Câu hỏi Luận Đạo nằm trong `D:\game live\questions.json`, có thể tự thêm câu theo đúng mẫu (3 đáp án, `answer` là số thứ tự đáp án đúng).

"Tạm dừng sự kiện" làm Lịch Thiên Đạo đứng yên: không có boss hay mưa mới cho tới khi bỏ tích. Sự kiện đang chạy vẫn chạy tiếp.

Khi kết nối được live TikTok, phiên tự bắt đầu. Mất kết nối dưới 30 phút vẫn tính cùng một phiên. Lịch sử các phiên xem tại `http://127.0.0.1:3000/api/sessions`.

Muốn đổi âm lượng: sửa `audio.volumes` trong `config.json` (0 là tắt tiếng, 1 là to nhất), rồi tắt và bật lại game.

**Quan trọng, trước khi live thật:** người chơi giả lập được lưu chung với người chơi thật và sẽ chiếm Thiên Bảng. Sau khi thử xong, hãy xóa dữ liệu thử:

1. Tắt game bằng `Ctrl + C`.
2. Xóa thư mục `D:\game live\data`.

Việc xóa này không khôi phục được. Về sau, khi đã có người chơi thật, đừng xóa thư mục này và đừng dùng giả lập trong lúc đang live.

## C. Điền tài khoản TikTok

1. Tắt game.
2. Chuột phải `D:\game live\config.json`, chọn **Open with > Notepad**.
3. Sửa dòng đầu tiên, điền username của bạn vào giữa hai dấu ngoặc kép. Ví dụ:

```
"tiktok": { "username": "ten_cua_ban", "signApiKey": "", "reconnectSec": 10 },
```

4. Lưu lại (`Ctrl + S`), rồi bật game.

Nếu lỡ gõ sai định dạng, game sẽ báo `File config.json bị sai định dạng` khi bật.

**Nhạc nền (không bắt buộc):** đặt file nhạc bạn có quyền sử dụng vào `D:\game live\public\sounds\bgm.mp3`, rồi tải lại màn hình game.

**Giọng đọc:** 39 file trong `D:\game live\public\sounds\voice\` tự đọc khi mở/đóng phiên, boss (đếm ngược theo hệ, xuất hiện, còn 60/30 giây, nổi giận, khiên, bị hạ, bỏ chạy), mưa linh thạch, Linh Khí Triều, Thiên Linh Căn, quà lớn, lên ghế Chưởng Môn / Lão Tổ / Thái Thượng, đột phá từ Kim Đan trở lên. Các câu đọc lần lượt, không chồng nhau. Đổi file cho từng sự kiện ở mục `audio.voice` trong `config.json` (mỗi sự kiện là một danh sách, game chọn ngẫu nhiên một file). Bật tắt bằng ô **Giọng đọc** ở bảng giả lập.

## D. Gắn vào OBS

Mở OBS, rồi làm một lần duy nhất:

1. **Settings > Video**, đặt cả **Base (Canvas) Resolution** và **Output (Scaled) Resolution** thành `1080x1920` (gõ tay vào ô). Bấm OK.
2. Trong ô **Sources**, bấm **+**, chọn **Browser**, đặt tên `Tien Mon`, OK.
3. Trong bảng hiện ra:
   - **URL:** `http://127.0.0.1:3000/`
   - **Width:** `1080`, **Height:** `1920`
   - Tích **Control audio via OBS** để âm thanh game vào luồng phát.
   - Bỏ tích **Shutdown source when not visible** để game không bị tải lại khi đổi cảnh.
   - Bỏ tích **Refresh browser when scene becomes active**.
4. Bấm OK.
5. Trong ô **Audio Mixer** sẽ có thêm kênh `Tien Mon`. Mở **Thử chuông** ở bảng giả lập và xem vạch âm lượng có nhảy không.

Muốn tự nghe tiếng game qua tai nghe: chuột phải kênh `Tien Mon` trong Audio Mixer > **Advanced Audio Properties** > mục **Audio Monitoring** chọn **Monitor and Output**.

Nếu thấy dòng "Bấm vào đây để bật âm thanh": chuột phải nguồn `Tien Mon` > **Interact**, bấm vào dòng đó một lần.

Sau khi game đã đổi code hoặc ảnh: chuột phải nguồn > **Properties** > **Refresh cache of current page**.

Để phát từ OBS lên TikTok, tài khoản của bạn cần có stream key. Không phải tài khoản nào cũng có, hãy kiểm tra trong TikTok LIVE Center.

## E. Gắn vào TikTok LIVE Studio

Tên nút có thể khác giữa các phiên bản, và các bước sau lấy từ hướng dẫn của bên thứ ba, không phải của TikTok.

1. Mở cảnh dọc (9:16), bấm **Add source**.
2. Chọn **Link** (có bản gọi là webpage hoặc URL).
3. Dán `http://127.0.0.1:3000/`, đặt **Width** `1080`, **Height** `1920`.
4. Kéo nguồn cho phủ kín khung hình.

Hai lỗi được các nhà cung cấp overlay báo lại, chưa kiểm chứng với game này:

- **Nguồn hiện thành ô nhỏ hoặc không hiện:** kích thước bị nhận thành 0x0. Thử kéo giãn lại nguồn.
- **Màn hình đứng hình:** sửa URL thêm đuôi, ví dụ `http://127.0.0.1:3000/?refresh=2`, để ép tải lại.

Nếu Link vẫn không ổn, cách dự phòng phổ biến là: dựng nguồn Browser trong OBS theo Phần D, bấm **Start Virtual Camera** trong OBS, rồi trong LIVE Studio thêm nguồn **Camera** và chọn **OBS Virtual Camera**. Lưu ý: camera ảo chỉ truyền hình, **không truyền tiếng**, nên âm thanh game phải đi đường khác, ví dụ LIVE Studio thu âm thanh máy tính.

## F. Lần live thật đầu tiên

Nên làm một buổi live thử ngắn, có một người bạn vào giúp.

1. Bật game, rồi bật OBS hoặc LIVE Studio.
2. Bắt đầu phát live trên TikTok.
3. Chấm đỏ nhỏ ở góc trên bên phải nghĩa là chưa kết nối được với TikTok. Game tự thử lại mỗi 10 giây, không mất dữ liệu. Khi đã kết nối, cửa sổ PowerShell in dòng `[tiktok] đã kết nối phòng ...` và chấm đỏ biến mất.
4. Nhờ bạn thử lần lượt và đánh dấu:

- [ ] Chat `tu luyện`: có avatar, đúng ảnh đại diện TikTok, đúng tên.
- [ ] Chat `Tu Luyen` không dấu: vẫn nhận.
- [ ] Thả tim liên tục: số tim cộng đúng. Với phòng đông người, TikTok có thể không gửi đủ mọi đợt tim.
- [ ] Tặng Hoa hồng nhiều lần liên tiếp: tu vi chỉ cộng một lần khi hết combo, đúng số lượng.
- [ ] Chia sẻ phòng live: có thông báo, tu vi tăng.

5. Đối chiếu quà: mỗi quà đều in ra cửa sổ PowerShell, dạng:

```
[quà] Tên: Rose id=5655 xu=1 x3
```

Mã `giftIds` của Donut và Sư tử trong `config.json` được điền theo trí nhớ, chưa xác minh. Khi có người tặng thật, so `id` in ra với `gifts.washMarrow.giftIds` và `gifts.mutation.giftIds`, sai thì sửa lại.

Hiện tại, quà nào có cùng số xu cũng kích hoạt hiệu ứng (mọi quà 30 xu đều tính là Tẩy Tủy). Khi đã có `id` đúng và muốn chỉ nhận đúng Donut, đặt `diamondCount` của quà đó về `0`.

**Mở bảng giả lập trong lúc live:** chỉ dùng các ô bật tắt âm thanh. Đừng bấm nút giả lập chat hay quà, vì dữ liệu giả sẽ lẫn vào dữ liệu thật.

## G. Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `Cổng 3000 đang bị chiếm` | Game đang chạy ở cửa sổ khác. Tắt cửa sổ đó, hoặc đổi `server.port` trong `config.json` và đổi cả URL trong OBS |
| Trình duyệt báo không kết nối được | Cửa sổ PowerShell đã bị đóng. Bật lại Phần A |
| Chấm đỏ mãi không tắt | Chưa bắt đầu live, sai `username`, hoặc dịch vụ ký kết nối đang lỗi. Đọc dòng `[tiktok] chưa kết nối được` trong PowerShell |
| PowerShell báo `SignatureRateLimitError` | Vượt giới hạn của dịch vụ Euler Stream. Đợi một lúc, hoặc tạo khóa tại eulerstream.com và điền vào `tiktok.signApiKey` |
| Không có tiếng trong OBS | Kiểm tra đã tích **Control audio via OBS** chưa, kênh có bị tắt tiếng không, ô bật tắt trên bảng giả lập có đang tích không |
| Avatar chỉ hiện chữ cái đầu | Ảnh TikTok không tải được. Game vẫn chạy bình thường |
| Hình giật trong OBS | Giảm FPS của OBS xuống 30 trong Settings > Video |

Thư viện kết nối TikTok là hàng không chính thức, dựa trên dịch ngược. TikTok thay đổi hệ thống thì nó có thể ngừng chạy cho đến khi được cập nhật. Khi đó giả lập vẫn dùng được, dữ liệu vẫn còn.

**Bảo mật:**

- Không ai được yêu cầu cookie hay mật khẩu TikTok của bạn: game không cần chúng.
- Đừng chia sẻ `signApiKey` nếu có. Giá trị này chỉ nằm trong `config.json`.
- Game chỉ nhận kết nối từ chính máy này, nên OBS và LIVE Studio phải chạy cùng máy với game.

## H. Việc khác

**Sao lưu dữ liệu người chơi:** tắt game, sao chép cả thư mục `D:\game live\data` đi nơi khác.

**Đổi luật chơi:** mọi con số nằm trong `config.json`. Sửa xong phải tắt và bật lại game.

**Đổi ảnh:** thay file trong `D:\ảnh game` (giữ nguyên tên), rồi chạy lệnh dưới đây và tải lại màn hình game. Ảnh `title.png` không được dùng, vì tiêu đề dùng font thật.

```
cd "D:\game live"
node tools/prepare-assets.js "D:\ảnh game"
```

**Chuyển sang máy khác:**

1. Cài Node.js bản 24 từ nodejs.org.
2. Sao chép thư mục `D:\game live`, có thể bỏ `node_modules`.
3. Chạy `npm.cmd install` trong thư mục đó một lần, rồi làm từ Phần A.

**Kiểm tra game còn đúng luật không:** chạy `npm.cmd test`, phải báo `fail 0`.

## Nguồn tham khảo cho Phần E

- Hướng dẫn cài overlay trong OBS và TikTok LIVE Studio: https://docs.indofinity.com/en/docs/mulai-cepat/pasang-overlay
- Nguồn Link không hiện: https://help.tiktory.com/en/pages/link-source-not-visible
- Overlay đứng hình: https://help.tiktory.com/en/pages/overlay-stuck-or-not-updating
- Dùng OBS Virtual Camera với LIVE Studio: https://help.tiktory.com/en/pages/how-to-setup-obs-virtual-camera-with-tiktok-live-studio
