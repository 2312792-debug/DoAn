# Bộ văn bằng mẫu (dùng để demo / kiểm thử)

5 file PDF giả lập, KHÔNG có giá trị pháp lý, chỉ để trình diễn hệ thống. Mã ngành `7480201` là mã ngành thật của ngành Công nghệ thông tin tại Đại học Đà Lạt (theo danh mục Bộ GD&ĐT).

| File | Mã SV | Mã ngành | Năm TN | Loại văn bằng | Số hiệu văn bằng | Dùng để test |
|---|---|---|---|---|---|---|
| `mau-van-bang-2312792-goc.pdf` | `2312792` | `7480201` | `2026` | Cử nhân | `DHDL-2026-001234` | Phát hành, sau đó Xác minh (kỳ vọng: ✅ HỢP LỆ) |
| `mau-van-bang-2312792-DA-SUA-GIAN-LAN.pdf` | `2312792` | `7480201` | `2026` | Cử nhân | `DHDL-2026-001234` | Xác minh file này SAU KHI đã phát hành file "goc" ở trên (kỳ vọng: ❌ KHÔNG KHỚP — mô phỏng kẻ gian sửa điểm/xếp loại rồi nộp lại) |
| `mau-van-bang-2312793-goc.pdf` | `2312793` | `7480201` | `2026` | Cử nhân | `DHDL-2026-001235` | Phát hành → Xác minh đúng → Thu hồi → Xác minh lại (kỳ vọng lần 2: ❌ "Đã thu hồi") |
| `mau-chungchi-2312792-Java.pdf` | `2312792` | `7480201` | `2026` | Chứng chỉ | `DHDL-CC-2026-000501` | Chứng chỉ Java — phát hành cùng lúc với chứng chỉ Python bên dưới (cùng SV/ngành/năm/loại) |
| `mau-chungchi-2312792-Python.pdf` | `2312792` | `7480201` | `2026` | Chứng chỉ | `DHDL-CC-2026-000502` | Chứng chỉ Python — minh hoạ 1 sinh viên có ≥2 chứng chỉ **trùng mã SV/ngành/năm/loại**, chỉ khác **số hiệu văn bằng** |

**Lưu ý quan trọng:** phải nhập đúng cả 5 giá trị (mã SV, mã ngành, năm tốt nghiệp, loại văn bằng, **số hiệu văn bằng**) giống hệt lúc phát hành thì Xác minh/Cập nhật/Thu hồi mới tìm đúng bản ghi. Số hiệu văn bằng là trường quyết định tính duy nhất — cho phép 1 sinh viên có nhiều văn bằng/chứng chỉ trùng cả 4 trường còn lại (như 2 chứng chỉ Java/Python ở trên) mà không bị đụng `diplomaId`.

## Kịch bản demo đề xuất khi bảo vệ đồ án

1. **Phát hành đúng**: Cổng phát hành → nhập đủ 5 trường của `2312792` → tải `mau-van-bang-2312792-goc.pdf` → Phát hành.
2. **Xác minh đúng**: Cổng xác minh → nhập lại đúng 5 trường → tải đúng file `...-goc.pdf` → kết quả ✅ HỢP LỆ.
3. **Phát hiện gian lận**: Cổng xác minh → cùng 5 trường → nhưng tải file `...-DA-SUA-GIAN-LAN.pdf` → kết quả ❌ KHÔNG KHỚP.
4. **Thu hồi**: Phát hành `2312793` → Xác minh đúng (✅) → Cổng phát hành → Thu hồi → Xác minh lại → trạng thái "Đã thu hồi".
5. **Truy vết**: Ở kết quả xác minh, bấm "Xem lịch sử giao dịch" để thấy đầy đủ log Phát hành/Cập nhật/Thu hồi kèm link xem trên PolygonScan.
6. **Tra cứu khi chưa có file trong tay**: ở Cổng xác minh, nhập 5 trường rồi bấm **"Tra cứu nhanh (không cần file)"** thay vì phải chọn file trước.
7. **1 sinh viên có nhiều chứng chỉ cùng năm/ngành**: Phát hành `mau-chungchi-2312792-Java.pdf` (số hiệu `...000501`) rồi phát hành tiếp `mau-chungchi-2312792-Python.pdf` (số hiệu `...000502`) — cả 2 đều thành công dù trùng mã SV/ngành/năm/loại, vì khác số hiệu văn bằng. Xác minh riêng từng cái để thấy 2 bản ghi độc lập.
