# Hệ thống xác thực văn bằng phi tập trung (Smart Contract + IPFS)

Đồ án: Khoa CNTT, Đại học Đà Lạt.

## Cấu trúc project

```
diploma-project/
  contracts/DiplomaRegistry.sol   # Smart contract (Solidity, OpenZeppelin AccessControl)
  test/DiplomaRegistry.test.js    # 17 kịch bản kiểm thử
  scripts/deploy.js               # Deploy lên testnet + ghi contractInfo.json cho frontend
  scripts/grantIssuerRole.js      # Cấp quyền phát hành cho ví khác
  scripts/demoLocalFlow.js        # Demo toàn bộ luồng trên mạng nội bộ (không cần testnet)
  backend/                        # Express — giữ kín JWT của Pinata khi upload PDF lên IPFS
  frontend/                       # React + ethers.js — Cổng xác minh + Cổng phát hành
  samples/                        # 3 file PDF văn bằng mẫu để demo/kiểm thử (xem samples/README.md)
  BAO_CAO_KIEM_THU.md             # Báo cáo 14 kịch bản kiểm thử + chi phí gas + kiểm thử bảo mật backend
  docker-compose.yml              # Chạy backend + frontend bằng 1 lệnh Docker
```

## Bước 0 — Chuẩn bị máy (làm 1 lần)

1. Cài Node.js bản 18 trở lên: https://nodejs.org (chọn bản LTS).
2. Cài extension **MetaMask** trên Chrome/Edge: https://metamask.io
3. Mở terminal tại thư mục `diploma-project`.

## Bước 1 — Chạy thử toàn bộ luồng cục bộ (3 phút, chưa cần MetaMask/testnet)

```bash
npm install
npm run compile
npm test
npm run demo
```

`npm run demo` tự deploy contract lên mạng Hardhat nội bộ, phát hành 1 văn bằng, xác minh đúng, thử file giả (hash không khớp), cập nhật lại văn bằng, thu hồi, rồi xác minh lại — in kết quả true/false trực tiếp ra màn hình. Đây là cách nhanh nhất để chắc chắn code chạy đúng trước khi động vào testnet thật.

## Bước 2 — Chuẩn bị ví & tài khoản testnet

1. Trong MetaMask, tạo hoặc dùng 1 ví riêng cho việc deploy (không dùng ví có tiền thật).
2. Thêm mạng **Polygon Amoy Testnet** vào MetaMask (Chain ID 80002) — hoặc dùng Ethereum Sepolia nếu đề tài yêu cầu.
3. Lấy MATIC/ETH testnet miễn phí từ faucet:
   - Polygon Amoy: https://faucet.polygon.technology/
   - Ethereum Sepolia: https://sepoliafaucet.com/
4. Xuất **private key** của ví này (MetaMask → 3 chấm → Chi tiết tài khoản → Xuất khóa riêng tư). **Tuyệt đối không** dùng ví chính, không commit key này lên GitHub.

## Bước 3 — Cấu hình biến môi trường

```bash
cp .env.example .env
```

Mở `.env`, dán `PRIVATE_KEY` vừa xuất vào (không có tiền tố `0x` cũng được, hardhat tự nhận).

## Bước 4 — Deploy contract lên testnet

```bash
npm run deploy:amoy
# hoặc: npm run deploy:sepolia
```

Lệnh này tự động ghi địa chỉ contract + ABI vào `frontend/src/contractInfo.json` — frontend sẽ tự dùng file này, không cần sửa tay.

## Bước 5 — Đăng ký Pinata (lưu file PDF lên IPFS)

1. Tạo tài khoản miễn phí tại https://pinata.cloud
2. Vào **API Keys** → tạo key mới → copy **JWT**.
3. Vào `backend/`, tạo file `.env` từ mẫu:
   ```bash
   cd backend
   cp .env.example .env
   ```
   Dán JWT vào biến `PINATA_JWT`.
4. Đặt tiếp `FILE_ENC_MASTER_KEY` — một chuỗi ngẫu nhiên dài, giữ bí mật (có thể tạo bằng
   `openssl rand -hex 32`). Đây là bí mật gốc dùng để mã hoá AES-256-GCM từng file PDF trước
   khi đưa lên IPFS công khai (xem `backend/crypto.js`). **Không đổi giá trị này sau khi đã
   phát hành văn bằng thật** — đổi sẽ khiến không giải mã lại được các file đã phát hành trước đó.

## Bước 6 — Chạy backend

```bash
cd backend
npm install
npm start
```

Backend chạy tại `http://localhost:4000`. Kiểm tra bằng `http://localhost:4000/health`.

## Bước 7 — Chạy frontend

```bash
cd frontend
npm install
cp .env.example .env    # sửa VITE_BACKEND_URL nếu backend chạy ở địa chỉ khác
npm run dev
```

Mở `http://localhost:5173`:
- **Cổng xác minh**: ai cũng dùng được, không cần MetaMask — chỉ cần nhập mã SV + mã ngành + tải file PDF lên để đối soát.
- **Cổng phát hành**: cần kết nối MetaMask bằng ví có `ISSUER_ROLE` (mặc định là ví dùng để deploy contract).
- **Nhập hàng loạt**: cũng cần `ISSUER_ROLE`. Vào tab **Nhập hàng loạt**:
  1. Bấm **Tải file mẫu CSV** để lấy đúng 5 cột: `mssv, ma_nganh, nam_tot_nghiep, loai_van_bang, so_hieu_van_bang`
     (`loai_van_bang` phải là một trong: `CU_NHAN`, `KY_SU`, `THAC_SI`, `TIEN_SI`, `CHUNG_CHI`). File Excel `.xlsx` cũng dùng được.
  2. Chọn toàn bộ file PDF tương ứng — **tên file phải đúng quy ước**
     `mssv_manganh_namtotnghiep_loaivanbang_sohieu.pdf` (không phân biệt hoa/thường) để hệ thống tự khớp đúng dòng CSV.
  3. Bấm **Băm & tải lên IPFS** — từng file được băm SHA-256 và mã hoá tải lên IPFS tuần tự, dòng nào lỗi sẽ báo rõ lý do.
  4. Bấm **Phát hành hàng loạt** — gộp toàn bộ các dòng hợp lệ vào **1 giao dịch `issueBatch` duy nhất**. Dòng nào
     trùng `diplomaId` đã Hợp lệ từ trước sẽ tự động bị bỏ qua (không ghi đè, không làm hỏng cả lô).

Muốn thử ngay mà chưa có văn bằng thật? Dùng bộ file trong `samples/` (xem `samples/README.md` để biết kịch bản demo đúng/sai/thu hồi).

## Cơ sở dữ liệu lịch sử và chữ ký điện tử (mới)

**Cơ sở dữ liệu (SQLite, miễn phí, không cần tài khoản):** Backend tự tạo file `backend/data/diploma.db` và tự đồng bộ mọi sự kiện Phát hành / Cập nhật / Thu hồi từ Smart Contract (lúc khởi động và mỗi 30 giây; giao diện còn gọi đồng bộ ngay sau mỗi giao dịch). DB lưu lịch sử, mã CID, mã băm, người phát hành, trạng thái nên **luôn xem được lịch sử** dù RPC công khai xoá log cũ. DB chỉ là bản sao của Blockchain (nguồn sự thật vẫn là chuỗi); nếu Backend tắt, giao diện tự đọc thẳng từ chuỗi. Đổi hợp đồng (deploy lại) thì DB tự làm mới.

**Chữ ký điện tử của nhà trường:** mỗi văn bằng (khi phát hành/cập nhật/thu hồi) được Backend ký bằng khoá riêng ECDSA (chuẩn EIP-191). Trang Xác minh hiển thị khung "Chữ ký số của nhà trường", **tự kiểm tra ngay trong trình duyệt** chữ ký có đúng địa chỉ ký và có khớp dữ liệu trên Blockchain (mã băm, CID, người phát hành, trạng thái) không, và cho tải "Chứng nhận xác thực (.json)". Website khác không có khoá riêng nên không tạo được chữ ký hợp lệ.

Cách thiết lập:
1. Trong `backend/.env`: đặt `SIGNING_PRIVATE_KEY` (tạo bằng `openssl rand -hex 32`, thêm `0x` ở đầu). Để trống thì Backend tự tạo khoá ở `backend/data/signer.key` — **phải sao lưu file này và không đổi sau khi đã công bố địa chỉ ký**.
2. Chạy Backend, đọc dòng log "Dia chi ky so CHINH THUC…" rồi dán địa chỉ đó vào `frontend/.env` → `VITE_SIGNER_ADDRESS=...` để giao diện cảnh báo khi chữ ký không phải của nhà trường. Nên công bố địa chỉ này công khai (website/văn bản của trường) để bên thứ ba đối chiếu.
3. Backend cần đọc được `contractInfo.json` (mặc định `frontend/src/contractInfo.json`, hoặc đặt `CONTRACT_INFO_PATH`). Docker Compose đã gắn sẵn file này và thư mục `backend/data`.

API mới của Backend: `GET /api/signer`, `GET /api/stats`, `GET /api/diplomas`, `GET /api/diplomas/:id/history`, `GET /api/diplomas/:id/record`, `POST /api/sync`. Kiểm thử: `cd backend && npm test` (mã hoá 6/6 + chữ ký 4/4).

### Giới hạn của chữ ký số và cách giảm rủi ro (mới)

- **Chữ ký chưa nhúng vào PDF (chưa phải PAdES):** chữ ký là chứng nhận `.json` đi kèm. Để chỉ cần có file PDF vẫn tra ngược được, form **Phát hành / Cập nhật / Nhập hàng loạt** có tuỳ chọn **"In mã QR xác minh vào PDF"** (bật sẵn). QR được in vào góc dưới bên phải trang đầu **trước khi băm**, nên mã băm trên chuỗi là của đúng bản PDF có QR — hãy tải và phát cho sinh viên đúng bản đó (nút "Tải bản PDF đã in QR"). QR chỉ là đường dẫn tới trang xác minh (`/?verify=<diplomaId>`), không phải chữ ký. Đặt `VITE_PUBLIC_URL` trong `frontend/.env` là địa chỉ website chính thức của trường.
- **Địa chỉ ký chính thức:** biến `VITE_SIGNER_ADDRESS` chỉ là cấu hình của website nên website giả có thể tự đặt ví của họ. Admin nên lưu địa chỉ ký vào Smart Contract bằng `npm run set-signer:amoy` (`SIGNER=0x... npm run set-signer:amoy`) hoặc ở trang **Quản trị**; frontend ưu tiên đọc từ contract, chỉ khi chưa đặt mới dùng `.env`. Nếu cả hai đều trống, trang Xác minh hiện **cảnh báo vàng** ("chưa đối chiếu được địa chỉ chính thức"), không hiện xanh. Nhà trường vẫn phải công bố địa chỉ ký và địa chỉ contract ở kênh độc lập (website chính thức) vì website giả có thể trỏ tới contract giả.
- **Phải deploy lại contract** (`npm run deploy:amoy`) để có hàm `setAttestationSigner`; contract cũ không có hàm này (frontend tự quay về dùng `.env`).

## Cách khác: chạy bằng Docker (backend + frontend cùng lúc)

Yêu cầu đã cài Docker Desktop. Sau khi đã có `contractInfo.json` (Bước 4) và `backend/.env` (Bước 5):

```bash
PINATA_JWT=dan_jwt_cua_ban docker compose up --build
```

Frontend chạy tại `http://localhost:5173`, backend tại `http://localhost:4000`. Dùng `docker compose down` để tắt.

## Đưa lên Internet để người khác dùng được

Vì hàm **xác minh** gọi thẳng vào RPC công khai của testnet (không qua backend của bạn), bạn chỉ cần host **frontend** để bên thứ ba (nhà tuyển dụng, doanh nghiệp) tự tra cứu được. **Phát hành** vốn chỉ mình bạn (issuer) dùng nên có thể tiếp tục chạy `npm run dev` ở máy cá nhân khi cần.

1. Đẩy code lên GitHub (đã có `.gitignore` chặn `node_modules` và `.env`, kiểm tra kỹ trước khi push để không lộ private key).
2. **Frontend** → https://vercel.com → New Project → chọn repo → Root Directory = `frontend` → thêm biến môi trường `VITE_BACKEND_URL`.
3. **Backend** (nếu muốn host luôn) → https://render.com → New Web Service → Root Directory = `backend` → Build Command `npm install` → Start Command `npm start` → thêm biến `PINATA_JWT` và `FRONTEND_ORIGIN` (link Vercel). Gói free sẽ "ngủ" sau ~15 phút không dùng, lần gọi đầu chậm ~30s — không ảnh hưởng khi demo/bảo vệ đồ án.

## Đánh giá bảo mật (mục 2.7 đề cương)

- Phân quyền bằng `AccessControl` của OpenZeppelin: chỉ ví có `ISSUER_ROLE` mới phát hành/cập nhật/thu hồi được; admin (`DEFAULT_ADMIN_ROLE`) mới cấp/thu quyền `ISSUER_ROLE` cho ví khác.
- Hàm `verify` là `view`, công khai, không tốn phí giao dịch cho bên xác minh.
- File PDF không lưu trên server của bạn — chỉ lưu trên IPFS (qua Pinata); JWT của Pinata luôn nằm ở backend, không lộ ra frontend.
- File được **mã hoá AES-256-GCM** (`backend/crypto.js`) trước khi đưa lên IPFS — CID trên IPFS tuy công khai nhưng nội dung là ciphertext, chỉ backend giải mã lại được, và chỉ giải mã được khi biết đúng `diplomaId` (tức biết đúng 5 trường định danh văn bằng, cùng điều kiện như gọi `verify()`).
- Backend giới hạn dung lượng file (15MB), chỉ nhận đúng MIME type `application/pdf`, có middleware bắt lỗi để không crash khi nhận file sai định dạng.
- Sửa file dù chỉ 1 byte cũng làm SHA-256 hash thay đổi hoàn toàn → `verify` trả về không khớp, phát hiện được file giả mạo/chỉnh sửa.
- Danh sách văn bằng (`totalDiplomas`/`getDiplomasPage`) đọc trực tiếp từ mảng lưu on-chain, không phụ thuộc `eth_getLogs` — vẫn đúng dù RPC node công khai không còn giữ log cũ ("pruned").
- Chi phí giao dịch (gas) đo thực tế và toàn bộ 14 kịch bản kiểm thử (gồm cả `issueBatch`, phân trang): xem `BAO_CAO_KIEM_THU.md`.

## Sự cố thường gặp

| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| `Chưa cài đặt MetaMask` | Chưa cài extension | Cài tại metamask.io rồi tải lại trang |
| Giao dịch báo lỗi quyền | Ví đang dùng không có `ISSUER_ROLE` | Nhờ admin cấp quyền, hoặc dùng đúng ví đã deploy contract |
| Xác minh luôn trả về "Chưa phát hành" | Sai mã SV/mã ngành khi tra cứu (diplomaId tính từ 2 mã này) | Kiểm tra gõ đúng, không phân biệt hoa/thường vì đã tự động viết hoa |
| Upload IPFS lỗi 502 | JWT Pinata sai/hết hạn | Tạo lại API key trên Pinata, cập nhật `backend/.env` |
| Frontend không gọi được backend khi đã deploy | Sai `VITE_BACKEND_URL` hoặc CORS | Kiểm tra biến môi trường trên Vercel và `FRONTEND_ORIGIN` trên Render khớp domain thật |
