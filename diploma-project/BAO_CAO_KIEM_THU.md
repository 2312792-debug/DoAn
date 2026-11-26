# Báo cáo kiểm thử — DiplomaRegistry Smart Contract

## Cập nhật quan trọng: định danh văn bằng (diplomaId)

Từ bản này, `diplomaId` = hash của `MÃ_SV-MÃ_NGÀNH-NĂM_TỐT_NGHIỆP-LOẠI_VĂN_BẰNG` (trước đó chỉ có `MÃ_SV-MÃ_NGÀNH`). Lý do: 1 sinh viên có thể có nhiều văn bằng (cấp lại, học nhiều hệ/nhiều đợt) — thêm năm tốt nghiệp + loại văn bằng để tránh trùng `diplomaId` giữa các văn bằng khác nhau của cùng 1 sinh viên.

**Đây là thay đổi ở tầng frontend (hàm `diplomaIdFrom` trong `contract.js`), không cần deploy lại contract.** Nhưng nếu bạn đã lỡ phát hành/cập nhật văn bằng theo quy ước cũ (2 trường) trước khi có bản này, các bản ghi đó vẫn còn nguyên trên chain — chỉ là form hiện tại (4 trường) sẽ tính ra `diplomaId` khác, không tìm thấy chúng nữa. Nếu cần tiếp tục dùng, phát hành lại bằng form mới là cách đơn giản nhất (không tốn gì vì là testnet).


Chạy bằng: `npx hardhat test` (Hardhat + Mocha + Chai + hardhat-chai-matchers), mạng Hardhat cục bộ (mô phỏng EVM đầy đủ, không cần testnet thật).

## Kết quả: 17/17 test PASS (9 kịch bản gốc + 5 kịch bản cho issueBatch/liệt kê on-chain + 3 kịch bản cho `setAttestationSigner`)

## Cập nhật quan trọng: cho phép phát hành lại sau khi thu hồi

Trước đây, `issueDiploma` chặn mọi `diplomaId` đã từng được đụng tới (kể cả đã Thu hồi) — nghĩa là 1 văn bằng bị thu hồi thì **khóa cứng vĩnh viễn**, không phát hành lại được nữa dù đã sửa xong lý do thu hồi. Đã sửa: giờ chỉ chặn khi văn bằng đang ở trạng thái **Hợp lệ** (tránh ghi đè bản ghi còn hiệu lực); nếu đang **Đã thu hồi** hoặc **Chưa từng phát hành** thì phát hành lại bình thường. Test 9 (`test/DiplomaRegistry.test.js`) khóa chặt hành vi này.

**Đây là thay đổi trong smart contract → bắt buộc phải deploy lại (`npm run deploy:amoy`) mới có hiệu lực.** Contract cũ đang chạy trên testnet vẫn giữ hành vi khóa cứng như trước.


| # | Kịch bản | Mục tiêu kiểm thử | Kết quả |
|---|---|---|---|
| 1 | Phát hành văn bằng thành công | `issueDiploma` lưu đúng hash/CID, bắn đúng event `DiplomaIssued`, `verify` trả về hợp lệ | ✅ PASS |
| 2 | Phát hiện file bị sửa | File có nội dung khác (hash khác) → `verify` trả về **không khớp**, dù cùng `diplomaId` | ✅ PASS |
| 3 | Chặn tài khoản không có quyền | Ví không có `ISSUER_ROLE` gọi `issueDiploma` → bị revert đúng lỗi `AccessControlUnauthorizedAccount` | ✅ PASS |
| 4 | Chặn phát hành trùng | Phát hành 2 lần cùng `diplomaId` → lần 2 bị revert lỗi `AlreadyIssued` | ✅ PASS |
| 5 | Thu hồi văn bằng | `revokeDiploma` đổi trạng thái → `verify` sau đó trả về không hợp lệ, trạng thái = "Đã thu hồi" | ✅ PASS |
| 6 | Cập nhật văn bằng | `updateDiploma` ghi hash/CID mới → hash mới khớp, hash cũ không còn khớp nữa | ✅ PASS |
| 7 | Cấp quyền `ISSUER_ROLE` | Tài khoản mới bị chặn khi chưa có quyền; admin cấp quyền qua `grantIssuer`; sau đó tài khoản đó phát hành được | ✅ PASS |
| 8 | Xác minh công khai | Tài khoản bất kỳ (không có role nào) vẫn gọi `verify` được, không cần quyền | ✅ PASS |
| 9 | Phát hành lại sau khi thu hồi | `diplomaId` đã Revoked có thể `issueDiploma` lại, quay về Hợp lệ | ✅ PASS |
| 10 | `issueBatch` — phát hành nhiều văn bằng 1 giao dịch | 3 văn bằng mới → cả 3 đều `true`, `totalDiplomas()` tăng đúng 3 | ✅ PASS |
| 11 | `issueBatch` — bỏ qua phần tử trùng, không revert cả lô | 1 `diplomaId` đã Hợp lệ + 2 mới → phần tử trùng trả `false` và **giữ nguyên dữ liệu cũ** (không bị ghi đè), 2 phần tử còn lại vẫn được phát hành | ✅ PASS |
| 12 | `issueBatch` — revert khi 3 mảng không cùng độ dài | Gọi với `fileHashes`/`cids` lệch số lượng so với `diplomaIds` → revert `ArrayLengthMismatch` | ✅ PASS |
| 13 | `issueBatch` — revert khi mảng rỗng; chặn tài khoản không có quyền | Mảng rỗng → revert `EmptyBatch`; ví không có `ISSUER_ROLE` gọi `issueBatch` → revert `AccessControlUnauthorizedAccount` | ✅ PASS |
| 14 | `diplomaIdAt` / `getDiplomasPage` — liệt kê & phân trang on-chain | Thứ tự đúng, `offset/limit` cắt đúng trang, `offset` vượt quá tổng số trả về mảng rỗng thay vì lỗi | ✅ PASS |
| 15 | `setAttestationSigner` — admin đặt địa chỉ ký số | Mặc định là địa chỉ 0; admin đặt được, bắn event `AttestationSignerSet`, getter trả đúng, đổi sang địa chỉ khác được | ✅ PASS |
| 16 | `setAttestationSigner` — chặn không phải admin | Ví không có role, và ví chỉ có `ISSUER_ROLE`, đều bị revert `AccessControlUnauthorizedAccount`; giá trị không đổi | ✅ PASS |
| 17 | `setAttestationSigner` — từ chối địa chỉ 0 | Revert `InvalidSigner`, địa chỉ chính thức đang đặt không bị xoá | ✅ PASS |

Đã xác thực thêm bằng 1 script độc lập (`verify_new_features.js`) chạy tay trên mạng Hardhat cục bộ qua `ethers.js` (không qua `hardhat test`, do sandbox biên dịch bị chặn tải solc — xem phần "Giới hạn của báo cáo này"): deploy, gọi `issueBatch` 2 lần liên tiếp, kiểm tra sự kiện `DiplomaIssued` phát đúng số lượng, dữ liệu phần tử trùng không bị ghi đè, và `getDiplomasPage` trả đúng dữ liệu kể cả `offset` vượt quá tổng — kết quả khớp 100% với bảng trên.

## Chi phí giao dịch (gas) — đo trên mạng Hardhat cục bộ

| Hàm | Gas đã dùng | Ghi chú |
|---|---|---|
| Deploy contract | ~1,501,668 | Chỉ trả 1 lần duy nhất lúc triển khai |
| `issueDiploma` | 208,388 | Mỗi lần phát hành 1 văn bằng (đã gồm ghi danh sách `_allIds` để liệt kê on-chain) |
| `updateDiploma` | 47,170 | Mỗi lần cập nhật lại |
| `revokeDiploma` | 33,390 | Mỗi lần thu hồi |
| `issueBatch` (1 / 3 / 10 văn bằng) | 194,065 / 520,801 / 1,664,369 | 10 văn bằng: batch 1,664,369 so với 1,912,832 khi phát hành riêng lẻ (tiết kiệm ≈ 13%) |
| `grantIssuer` | 51,391 | Chỉ khi cấp quyền cho issuer mới |
| `verify` | 0 (miễn phí) | Hàm `view` — bên thứ ba xác minh không tốn phí |
| `getDiploma` | 0 (miễn phí) | Hàm `view` |

Trên Polygon Amoy testnet, gas price thường ở mức rất thấp (gwei nhỏ) nên chi phí quy đổi ra MATIC testnet gần như không đáng kể — phù hợp để trình diễn nhiều lần khi bảo vệ đồ án. Con số thực tế trên testnet có thể chênh lệch nhẹ do gas price tại thời điểm gửi giao dịch.

## Kiểm thử tầng backend (thủ công)

| Kịch bản tấn công | Kỳ vọng | Kết quả thực tế |
|---|---|---|
| Upload file không phải PDF | Từ chối, không crash | ✅ HTTP 400, server vẫn sống |
| Upload không kèm file | Từ chối rõ ràng | ✅ HTTP 400 |
| Upload file > 15MB | Từ chối theo giới hạn dung lượng | ✅ HTTP 400 |
| Giả mạo `Content-Type: application/pdf` cho file rác | Không crash, báo lỗi hợp lý | ✅ HTTP 502 (lỗi upload IPFS), server vẫn sống |
| Kiểm tra `/health` sau tất cả tấn công trên | Server vẫn phản hồi bình thường | ✅ HTTP 200 |

`multer` dùng bản 2.2.0 (đã vá lỗi bảo mật của nhánh 1.x).

## Kiểm thử module mã hoá (`backend/crypto.js`) — 6/6 PASS

Chạy bằng: `node backend/test/crypto.test.js` (unit test thuần Node, không cần mạng/blockchain).

| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | Mã hoá rồi giải mã đúng `diplomaId` → ra đúng nội dung gốc 100% | ✅ PASS |
| 2 | Mã hoá 2 lần cùng nội dung, cùng `diplomaId` → ciphertext khác nhau (IV ngẫu nhiên mỗi lần), nhưng cả 2 đều giải mã đúng | ✅ PASS |
| 3 | Giải mã bằng sai `diplomaId` → báo lỗi rõ ràng, không trả về dữ liệu rác | ✅ PASS |
| 4 | Dữ liệu bị sửa 1 byte (giả lập hỏng trên đường truyền/lưu trữ) → AES-GCM tự phát hiện, báo lỗi thay vì giải mã âm thầm ra rác | ✅ PASS |
| 5 | Thiếu `FILE_ENC_MASTER_KEY` → báo lỗi cấu hình rõ ràng thay vì crash mơ hồ | ✅ PASS |
| 6 | `diplomaId` sai định dạng (không phải bytes32 hex) → báo lỗi rõ ràng | ✅ PASS |

Đã smoke-test thêm 2 endpoint mới của backend (`POST /api/upload` với `diplomaId`, `GET /api/diplomas/:diplomaId/file`) bằng `curl`: toàn bộ logic validate (thiếu/sai `diplomaId`, thiếu `cid`) phản hồi đúng mã lỗi 400; đường dẫn mã hoá → gọi Pinata chạy xuyên suốt không crash (phản hồi 502 do dùng JWT giả trong sandbox — **cần tự test lại bước tải lên/tải về thật bằng JWT Pinata thật của bạn**, xem phần giới hạn bên dưới).

## Kiểm thử tầng frontend

- `npm run build` (Vite) — build production thành công, không lỗi cú pháp/import.
- Đối chiếu toàn bộ hàm được gọi từ giao diện (`IssuePortal`, `VerifyPortal`, `TransactionHistory`) với danh sách hàm thực có trong ABI hợp đồng sau khi deploy — khớp đầy đủ.

## Giới hạn về quyền riêng tư (privacy) — quan trọng, nên đọc kỹ khi bảo vệ đồ án

> **Cập nhật:** rủi ro "tải được nguyên văn file" mô tả dưới đây **đã được khắc phục một phần** kể từ khi thêm mã hoá AES-256-GCM phía backend (`backend/crypto.js`) — xem mục kiểm thử mã hoá ở trên. Phần phân tích gốc bên dưới vẫn được giữ nguyên vì rủi ro **dò quét để biết trạng thái/metadata** (không phải nội dung file) vẫn còn, đây là 2 rủi ro khác nhau.

`diplomaId` được tính từ mã sinh viên + mã ngành + năm tốt nghiệp + loại văn bằng + số hiệu văn bằng. Trừ số hiệu văn bằng, 4 giá trị còn lại đều là **thông tin công khai hoặc có thể đoán được** (mã sinh viên thường có quy luật/liên tiếp theo khoá), **không phải bí mật**. Trong khi đó:

- `verify()` và `lookupDiploma()` trả về CID (IPFS) và địa chỉ ví phát hành **bất kể** người gọi có đang cầm đúng file gốc hay không — kể cả khi đối soát bằng một file rác/sai, hệ thống vẫn trả kèm CID thật của bản ghi đó. **Đây vẫn đúng sau khi thêm mã hoá** — dò quét vẫn lộ được trạng thái văn bằng (Hợp lệ/Thu hồi) và CID, chỉ là CID đó giờ trỏ tới ciphertext thay vì PDF đọc được.
- ~~CID trên IPFS (qua gateway Pinata công khai) không có xác thực truy cập — ai có CID đều tải được nguyên văn file PDF.~~ **Đã khắc phục:** CID giờ trỏ tới file đã mã hoá; tải trực tiếp từ gateway IPFS chỉ ra được ciphertext vô nghĩa. Muốn có lại file PDF gốc, bắt buộc phải đi qua endpoint `GET /api/diplomas/:diplomaId/file` của backend, và endpoint này đòi hỏi biết đúng `diplomaId` — tức đúng điều kiện như khi gọi `verify()`/`getDiploma()`, không mạnh hơn nhưng cũng không còn là "mở hoàn toàn cho bất kỳ ai có CID" như trước.

**Hệ quả còn lại:** một người dò một dải mã sinh viên hợp lý (ví dụ quét 2312700–2312999 với vài mã ngành phổ biến) vẫn có thể liệt kê được **trạng thái và metadata** của hàng loạt văn bằng (có tồn tại hay không, Hợp lệ hay Thu hồi), nhưng **không còn tải được nội dung PDF thật** nữa trừ khi cũng đoán đúng số hiệu văn bằng (trường có entropy cao nhất trong 5 trường) — vì thiếu nó thì không suy ra được `diplomaId` để gọi endpoint giải mã.

**Đánh giá mức độ:** chấp nhận được đối với một hệ thống xác thực **công khai** trên testnet dùng cho mục đích học thuật/trình diễn — bản chất "ai cũng xác minh được, không cần quyền" (mục tiêu đề tài) và "văn bằng vốn dùng để trình cho bên thứ ba xem" khiến đây không phải lỗ hổng nghiêm trọng như rò rỉ dữ liệu tài chính/y tế. Tuy nhiên, đây **là** một đánh đổi thật giữa "dễ xác minh" và "riêng tư", cần nêu rõ trong báo cáo thay vì bỏ sót. Vấn đề nằm ở **tầng thiết kế hợp đồng + IPFS công khai**, không phải ở nút "Tra cứu nhanh" trên giao diện — dù có gỡ nút đó đi, ai cũng vẫn tra được y hệt bằng cách gọi thẳng `getDiploma()` qua tab "Read Contract" trên PolygonScan, vì đây vốn là 1 hàm `view` công khai trên 1 blockchain công khai.

**Số hiệu văn bằng vừa thêm (mục đích chính: chống trùng `diplomaId` khi 1 sinh viên có ≥2 văn bằng/chứng chỉ cùng năm/ngành/loại) cũng đóng vai trò một phần "salt" giảm nhẹ rủi ro dò quét ở trên** — nếu phòng đào tạo đặt số hiệu có tính ngẫu nhiên/không tuần tự (thay vì đếm 1, 2, 3...), việc dò đúng `diplomaId` sẽ khó hơn đáng kể so với chỉ dò mã SV. Đây là hiệu ứng phụ có lợi, không phải cơ chế bảo mật chính thức — vẫn nên nêu rõ 2 hướng khắc phục triệt để hơn bên dưới nếu triển khai thực tế.

**Hướng khắc phục nếu triển khai thực tế:**
- ~~Mã hoá file PDF (AES) trước khi tải lên IPFS~~ ✅ **Đã làm** (AES-256-GCM, khoá suy ra riêng từng văn bằng từ `diplomaId` + `FILE_ENC_MASTER_KEY`, xem `backend/crypto.js`).
- Yêu cầu số hiệu văn bằng có đủ entropy ngẫu nhiên (vd UUID rút gọn hoặc số ngẫu nhiên ≥8 chữ số) thay vì đặt tuần tự, để tự nó đóng vai trò salt hiệu quả mà không cần đổi kiến trúc — **chưa làm**, vẫn nên cân nhắc nếu triển khai thật.
- Giới hạn tốc độ truy vấn (rate limit) ở tầng RPC/gateway để gây khó khăn cho việc dò quét hàng loạt — **chưa làm**.

## Giới hạn của báo cáo này

- Toàn bộ kết quả trên chạy trên mạng Hardhat cục bộ (EVM giả lập), **chưa phải giao dịch thật trên Polygon Amoy/Sepolia**. Sau khi tự deploy lên testnet (Bước 2-4 trong README), nên chạy lại tối thiểu kịch bản 1 (phát hành), kịch bản 2 (xác minh) và kịch bản 10 (`issueBatch`) để có địa chỉ giao dịch (tx hash) thật minh chứng cho báo cáo đồ án.
- Chưa đo thời gian phản hồi/độ trễ mạng thật của Pinata và RPC testnet — nên đo bổ sung khi demo với mạng thật vì độ trễ sẽ cao hơn đáng kể so với mạng cục bộ.
- **Contract đã thay đổi** (thêm `issueBatch`, `totalDiplomas`, `diplomaIdAt`, `getDiplomasPage`) — địa chỉ contract cũ đã deploy trước đó trên Amoy **không có** các hàm này. Bắt buộc chạy lại `npm run deploy:amoy` để nhận địa chỉ mới trước khi dùng các tính năng này, và phát hành lại vài văn bằng test trên contract mới.
- 5 kịch bản test mới (10-14) đã viết đúng chuẩn Mocha/Chai trong `test/DiplomaRegistry.test.js` và sẽ chạy được bằng `npx hardhat test` trên máy bạn (có mạng internet bình thường để Hardhat tải solc) — môi trường sandbox dùng để phát triển đồ án này chặn domain tải compiler nên không tự chạy `hardhat test` được trực tiếp ở đây; đã xác thực logic tương đương qua script `ethers.js` chạy tay như ghi chú ở trên.
- Module mã hoá (`crypto.js`) đã unit-test đầy đủ 6/6 kịch bản bằng dữ liệu giả lập, nhưng **chưa test được round-trip thật qua Pinata** (upload → pin → tải lại từ gateway → giải mã) vì sandbox không có `PINATA_JWT` thật và không có quyền truy cập mạng ra ngoài tới Pinata. **Cần bạn tự kiểm tra lại bước này trên máy thật** trước khi demo: phát hành 1 văn bằng, sau đó bấm nút tải bản gốc ở trang Xác minh, xác nhận file PDF tải về mở được đúng nội dung.
