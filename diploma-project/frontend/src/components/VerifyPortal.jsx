import { useRef, useState } from "react";
import {
  Upload,
  Check,
  CheckCircle2,
  AlertTriangle,
  Link2,
  Package,
  ShieldCheck,
  ExternalLink,
  User,
  FileText,
} from "lucide-react";
import { computeFileHash } from "../utils/hash";
import {
  getReadOnlyContract,
  diplomaIdFrom,
  DIPLOMA_TYPES,
  STATUS_LABELS,
  secureFileUrl,
  lookupDiploma,
  explorerContractEventsUrl,
} from "../utils/contract";
import TransactionHistory from "./TransactionHistory";
import SignaturePanel from "./SignaturePanel";
import { verifyPdfEmbeddedSignature } from "../utils/pinataClient";

const CURRENT_YEAR = new Date().getFullYear();

function shortenAddress(address) {
  if (!address) return "—";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function VerifyPortal() {
  const [studentCode, setStudentCode] = useState("");
  const [programCode, setProgramCode] = useState("");
  const [gradYear, setGradYear] = useState(String(CURRENT_YEAR));
  const [diplomaType, setDiplomaType] = useState(DIPLOMA_TYPES[0].value);
  const [refNumber, setRefNumber] = useState("");

  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [diplomaId, setDiplomaId] = useState(null);

  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookupResult, setLookupResult] = useState(null);

  function currentIdOrError(setErrFn) {
    if (!studentCode || !programCode || !gradYear || !refNumber) {
      setErrFn(
        "⚠️ Vui lòng nhập đủ mã sinh viên, mã chương trình, năm tốt nghiệp và số hiệu văn bằng."
      );
      return null;
    }

    return diplomaIdFrom(
      studentCode,
      programCode,
      gradYear,
      diplomaType,
      refNumber
    );
  }

  function handleFileChange(selectedFile) {
    if (!selectedFile) return;

    if (selectedFile.type !== "application/pdf" && !selectedFile.name.toLowerCase().endsWith(".pdf")) {
      setError("⚠️ Chỉ hỗ trợ file PDF.");
      return;
    }

    setFile(selectedFile);
    setError("");
    setResult(null);
    setLookupResult(null);
  }

  function handleDrop(event) {
    event.preventDefault();

    const droppedFile = event.dataTransfer.files?.[0];

    if (droppedFile) {
      handleFileChange(droppedFile);
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleVerify() {
    if (!file) {
      setError(
        "⚠️ Vui lòng chọn file PDF cần đối soát hoặc dùng chức năng tra cứu nhanh."
      );
      return;
    }

    const id = currentIdOrError(setError);
    if (!id) return;

    setLoading(true);
    setError("");
    setResult(null);
    setLookupResult(null);
    setDiplomaId(null);

    try {
      const fileHash = await computeFileHash(file);
      const contract = getReadOnlyContract();

      const [isValid, status, cid, issuer, issuedAt] =
        await contract.verify(id, fileHash);

      // Lay them fileHash THAT da luu (khong phu thuoc status Active/Revoked)
      // de tach rieng "hash co khop khong" voi "trang thai co con hieu luc khong".
      // Neu chi dung isValid, mot van bang da bi thu hoi se LUON hien "khong khop"
      // du file dua vao la ban goc that hay file gia - khong phan biet duoc.
      const [diploma, pdfSig] = await Promise.all([
        contract.getDiploma(id),
        backendIsLocalOnly ? Promise.resolve(null) : verifyPdfEmbeddedSignature(file),
      ]);
      const hashMatches = diploma.fileHash === fileHash;

      setDiplomaId(id);

      setResult({
        isValid,
        hashMatches,
        statusNum: Number(status),
        statusLabel: STATUS_LABELS[Number(status)],
        cid,
        issuer,
        issuedAt:
          Number(issuedAt) > 0
            ? new Date(Number(issuedAt) * 1000).toLocaleString("vi-VN")
            : "—",
        fileHash,
        pdfSig,
      });
    } catch (err) {
      console.error(err);
      setError(
        "❌ Lỗi khi xác minh: " +
          (err.message || "Không xác định")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLookup() {
    const id = currentIdOrError(setLookupError);
    if (!id) return;

    setLookupLoading(true);
    setLookupError("");
    setLookupResult(null);
    setResult(null);
    setDiplomaId(null);

    try {
      const d = await lookupDiploma(id);

      setDiplomaId(id);

      setLookupResult({
        statusNum: Number(d.status),
        statusLabel: STATUS_LABELS[Number(d.status)],
        cid: d.cid,
        issuer: d.issuer,
        fileHash: d.fileHash,
        issuedAt:
          Number(d.issuedAt) > 0
            ? new Date(Number(d.issuedAt) * 1000).toLocaleString("vi-VN")
            : "—",
      });
    } catch (err) {
      console.error(err);

      setLookupError(
        "❌ Lỗi khi tra cứu: " +
          (err.message || "Không xác định")
      );
    } finally {
      setLookupLoading(false);
    }
  }

  const backendUrl = (import.meta.env.VITE_BACKEND_URL || "http://localhost:4000").trim();
  const backendIsLocalOnly =
    typeof window !== "undefined" &&
    !["localhost", "127.0.0.1"].includes(window.location.hostname) &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(backendUrl);

  const verifyFormCard = (
      <section className="verify-card">

        <div className="verify-card-header">
          <div>
            <h3>Thông tin văn bằng</h3>
            <p>
              Nhập thông tin giống với văn bằng cần kiểm tra.
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="verify-form-grid">

          <div className="field">
            <label>Mã sinh viên</label>

            <input
              type="text"
              placeholder="VD: 2312792"
              value={studentCode}
              onChange={(e) => setStudentCode(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Mã chương trình / ngành</label>

            <input
              type="text"
              placeholder="VD: 7480201 (Công nghệ thông tin)"
              value={programCode}
              onChange={(e) => setProgramCode(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Năm tốt nghiệp</label>

            <input
              type="number"
              placeholder="VD: 2026"
              value={gradYear}
              onChange={(e) => setGradYear(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Loại văn bằng</label>

            <select
              value={diplomaType}
              onChange={(e) => setDiplomaType(e.target.value)}
            >
              {DIPLOMA_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Số hiệu văn bằng / Số vào sổ gốc</label>

            <input
              type="text"
              placeholder="VD: DHDL-2026-001234"
              value={refNumber}
              onChange={(e) => setRefNumber(e.target.value)}
            />
          </div>

        </div>

        {/* Upload */}
        <div className="field">
          <label>File PDF cần đối soát</label>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden-file-input"
            onChange={(e) => handleFileChange(e.target.files?.[0])}
          />

          <div
            className={`upload-zone ${file ? "has-file" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={openFilePicker}
          >
            <div className="upload-icon">
              {file ? (
                <Check size={22} strokeWidth={2.5} />
              ) : (
                <Upload size={22} strokeWidth={2} />
              )}
            </div>

            {file ? (
              <>
                <div className="upload-title">
                  {file.name}
                </div>

                <div className="upload-subtitle">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </div>

                <button
                  type="button"
                  className="upload-change-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFilePicker();
                  }}
                >
                  Chọn file khác
                </button>
              </>
            ) : (
              <>
                <div className="upload-title">
                  Kéo thả file PDF vào đây
                </div>

                <div className="upload-subtitle">
                  hoặc nhấn để chọn file từ máy tính
                </div>

                <div className="upload-format">
                  PDF · Tối đa theo cấu hình hệ thống
                </div>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="verify-actions">
          <button
            className="primary-btn"
            onClick={handleVerify}
            disabled={loading}
          >
            {loading
              ? "Đang xác minh..."
              : "🔍 Xác minh văn bằng"}
          </button>

          <div className="verify-divider">
            <span>hoặc</span>
          </div>

          <button
            className="secondary-btn"
            onClick={handleLookup}
            disabled={lookupLoading}
          >
            {lookupLoading
              ? "Đang tra cứu..."
              : "Tra cứu không cần file"}
          </button>
        </div>

        {error && (
          <div className="verify-alert error-alert">
            {error}
          </div>
        )}

        {lookupError && (
          <div className="verify-alert error-alert">
            {lookupError}
          </div>
        )}

      </section>
  );

  const resultsSection = (
    <>
      {/* Verification result */}
      {result && (
  <section
    className={`verification-result ${
      result.isValid ? "valid" : "invalid"
    }`}
  >
    {/* Result header */}
    <div className="verification-result-header">
      <div
        className={`verification-result-icon ${
          result.isValid ? "valid-icon" : "invalid-icon"
        }`}
      >
        {result.isValid ? (
          <CheckCircle2 size={26} strokeWidth={2} />
        ) : (
          <AlertTriangle size={26} strokeWidth={2} />
        )}
      </div>

      <div className="verification-result-heading">
        <div className="verification-result-label">
          KẾT QUẢ XÁC MINH
        </div>

        <h3 style={result.statusNum === 2 || result.statusNum === 0 ? { color: "#dc2626" } : undefined}>
          {result.statusNum === 2
            ? "Văn bằng đã bị thu hồi"
            : result.statusNum === 0
            ? "Văn bằng không tồn tại"
            : result.isValid
            ? "Văn bằng hợp lệ"
            : "Văn bằng không hợp lệ"}
        </h3>

        <p>
          {result.isValid
            ? "File PDF khớp với dữ liệu được ghi nhận trên Blockchain."
            : result.statusNum === 0
            ? "Không tìm thấy văn bằng nào trên Blockchain khớp với thông tin đã nhập (trạng thái: Chưa phát hành)."
            : result.statusNum === 2 && !result.hashMatches
            ? "Văn bằng đã bị thu hồi VÀ file không khớp bản gốc — có dấu hiệu giả mạo trên văn bằng đã thu hồi."
            : result.statusNum === 2
            ? "Văn bằng này đã bị đơn vị phát hành thu hồi trên Blockchain, không còn hiệu lực pháp lý."
            : !result.hashMatches
            ? "File PDF không khớp với dữ liệu đã ghi nhận trên Blockchain — có dấu hiệu bị chỉnh sửa."
            : "Không tìm thấy văn bằng khớp với thông tin đã nhập."}
        </p>
      </div>

      <div
        className={`verification-status-badge ${
          result.isValid ? "badge-valid" : "badge-invalid"
        }`}
        style={
          result.statusNum === 2 || result.statusNum === 0
            ? { background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", fontWeight: "bold" }
            : undefined
        }
      >
        {result.statusNum === 2
          ? "ĐÃ THU HỒI"
          : result.statusNum === 0
          ? "KHÔNG TỒN TẠI"
          : result.isValid
          ? "HỢP LỆ"
          : "KHÔNG HỢP LỆ"}
      </div>
    </div>

    {/* Diploma information */}
    <div className="verification-section">
      <div className="verification-section-title">
        Thông tin văn bằng
      </div>

      <div className="verification-details">
        <div className="verification-detail">
          <span>Mã sinh viên</span>
          <strong>{studentCode}</strong>
        </div>

        <div className="verification-detail">
          <span>Chương trình / ngành</span>
          <strong>{programCode}</strong>
        </div>

        <div className="verification-detail">
          <span>Năm tốt nghiệp</span>
          <strong>{gradYear}</strong>
        </div>

        <div className="verification-detail">
          <span>Loại văn bằng</span>
          <strong>
            {DIPLOMA_TYPES.find(
              (t) => t.value === diplomaType
            )?.label || diplomaType}
          </strong>
        </div>

        <div className="verification-detail">
          <span>Số hiệu văn bằng</span>
          <strong>{refNumber}</strong>
        </div>

        <div className="verification-detail">
          <span>Trạng thái</span>
          <strong
            style={
              result.statusNum === 2 || result.statusNum === 0
                ? { color: "#dc2626", fontWeight: "bold" }
                : { color: "#16a34a" }
            }
          >
            {result.statusNum === 2 ? "⛔ Đã thu hồi" : result.statusLabel}
          </strong>
        </div>

        <div className="verification-detail">
          <span>Ngày phát hành</span>
          <strong>{result.issuedAt}</strong>
        </div>
      </div>
    </div>

    {/* Verification checks */}
    <div className="verification-section">
      <div className="verification-section-title">
        Kết quả đối chiếu
      </div>

      <div className="verification-checks">
        <div
          className={`verification-check ${
            result.statusNum !== 0 && result.hashMatches ? "check-success" : "check-failed"
          }`}
        >
          <span className="check-icon">
            {result.statusNum !== 0 && result.hashMatches ? (
              <Check size={15} strokeWidth={3} />
            ) : (
              <AlertTriangle size={15} strokeWidth={2.5} />
            )}
          </span>

          <div>
            <strong>Đối chiếu file PDF</strong>
            <span>
              {result.statusNum === 0
                ? "Chưa có dữ liệu văn bằng trên Blockchain để đối chiếu với file PDF này"
                : result.hashMatches
                ? "Đây đúng là file gốc — hash khớp với dữ liệu đã lưu trên Blockchain"
                : "File này KHÔNG khớp bản gốc — có dấu hiệu đã bị chỉnh sửa/giả mạo"}
            </span>
          </div>
        </div>

        <div
          className={`verification-check ${
            result.statusNum === 1 ? "check-success" : "check-failed"
          }`}
        >
          <span className="check-icon">
            {result.statusNum === 1 ? (
              <Check size={15} strokeWidth={3} />
            ) : (
              <AlertTriangle size={15} strokeWidth={2.5} />
            )}
          </span>

          <div>
            <strong>Trạng thái văn bằng</strong>
            <span>
              {result.statusLabel}
            </span>
          </div>
        </div>

        <div
          className={`verification-check ${
            result.statusNum !== 0 ? "check-success" : "check-failed"
          }`}
        >
          <span className="check-icon">
            {result.statusNum !== 0 ? (
              <Check size={15} strokeWidth={3} />
            ) : (
              <AlertTriangle size={15} strokeWidth={2.5} />
            )}
          </span>

          <div>
            <strong>Blockchain</strong>
            <span>
              {result.statusNum !== 0
                ? "Dữ liệu được xác thực trên Polygon Amoy"
                : "Không tìm thấy bản ghi văn bằng này trên Polygon Amoy"}
            </span>
          </div>
        </div>

        {result.pdfSig && (
          <div
            className={`verification-check ${
              !result.pdfSig.hasSignature
                ? "check-failed"
                : result.pdfSig.intact && result.pdfSig.matchesSchoolCert
                ? "check-success"
                : "check-failed"
            }`}
          >
            <span className="check-icon">
              {result.pdfSig.hasSignature && result.pdfSig.intact && result.pdfSig.matchesSchoolCert ? (
                <Check size={15} strokeWidth={3} />
              ) : (
                <AlertTriangle size={15} strokeWidth={2.5} />
              )}
            </span>

            <div>
              <strong>Chữ ký số nhúng trong file PDF (X.509 / PKCS#7)</strong>
              <span>
                {!result.pdfSig.hasSignature
                  ? "File PDF này không có chữ ký số X.509 nhúng bên trong."
                  : result.pdfSig.intact && result.pdfSig.matchesSchoolCert
                  ? `Hợp lệ — Ký bởi ${result.pdfSig.signer} (${result.pdfSig.location || "VN"}), chưa bị chỉnh sửa sau khi ký.`
                  : result.pdfSig.intact
                  ? `Chữ ký trong PDF do "${result.pdfSig.signer}" ký, KHÔNG khớp chứng thư số chính thức của trường.`
                  : "Chữ ký số bên trong file PDF đã bị hỏng hoặc tài liệu bị chỉnh sửa sau khi ký!"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Technical information */}
    <div className="verification-section verification-tech-section">
      <div className="verification-section-title">
        Dữ liệu Blockchain & IPFS
      </div>

      <div className="verification-tech">

        <div className="tech-row">
          <div className="tech-label">
            <span className="tech-icon">
              <Link2 size={14} strokeWidth={2} />
            </span>
            <span>Blockchain</span>
          </div>

          <strong>Polygon Amoy</strong>
        </div>

        <div className="tech-row">
          <div className="tech-label">
            <span className="tech-icon">
              <Package size={14} strokeWidth={2} />
            </span>
            <span>IPFS CID</span>
          </div>

          <div className="tech-value">
            {result.cid ? (
              <a
                href={secureFileUrl(diplomaId, result.cid)}
                target="_blank"
                rel="noreferrer"
              >
                {result.cid} <ExternalLink size={12} strokeWidth={2} style={{ display: "inline", verticalAlign: "middle" }} />
              </a>
            ) : (
              "—"
            )}
          </div>
        </div>

        <div className="tech-row">
          <div className="tech-label">
            <span className="tech-icon">
              <User size={14} strokeWidth={2} />
            </span>
            <span>Đơn vị phát hành</span>
          </div>

          <strong
            title={result.issuer}
            className="mono-value"
          >
            {result.statusNum === 0 ? "—" : shortenAddress(result.issuer)}
          </strong>
        </div>

        <div className="tech-row">
          <div className="tech-label">
            <span className="tech-icon">
              <ShieldCheck size={14} strokeWidth={2} />
            </span>
            <span>File Hash</span>
          </div>

          <strong
            title={result.fileHash}
            className="mono-value"
          >
            {result.fileHash
              ? `${result.fileHash.slice(0, 12)}...${result.fileHash.slice(-10)}`
              : "—"}
          </strong>
        </div>

      </div>
    </div>

    {/* Actions */}
    <div className="verification-result-actions">
      {result.cid && (
        <a
          href={secureFileUrl(diplomaId, result.cid)}
          target="_blank"
          rel="noreferrer"
          className="result-action primary-result-action"
        >
          <FileText size={15} strokeWidth={2} style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }} />
          {result.statusNum === 2 ? "Xem file gốc đối soát (Đã thu hồi)" : "Xem bản gốc"}
        </a>
      )}

      <a
        href={explorerContractEventsUrl()}
        target="_blank"
        rel="noreferrer"
        className="result-action secondary-result-action"
      >
        <Link2 size={14} strokeWidth={2} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
        Xem Blockchain
        <ExternalLink size={12} strokeWidth={2} style={{ display: "inline", verticalAlign: "middle", marginLeft: 4 }} />
      </a>
    </div>

    {/* Invalid explanation */}
    {!result.isValid && (
      <div className="invalid-explanation">
        <strong>
          {result.statusNum === 0
            ? "Vì sao văn bằng không tồn tại?"
            : result.statusNum === 2
            ? "Văn bằng này đã bị thu hồi"
            : "Vì sao văn bằng không hợp lệ?"}
        </strong>

        <p>
          {result.statusNum === 0
            ? "Smart Contract chưa ghi nhận văn bằng nào khớp với 5 thông tin bạn nhập. Có thể văn bằng chưa từng được phát hành hoặc bị gõ sai thông tin."
            : result.statusNum === 2
            ? "Đơn vị phát hành đã thu hồi văn bằng này trên Smart Contract nên văn bằng không còn giá trị sử dụng."
            : "File PDF bạn cung cấp có thể đã bị thay đổi hoặc thông tin nhập vào không tương ứng với dữ liệu đã được ghi nhận trên Blockchain."}
        </p>

        <div className="invalid-tips">
          <span>• Kiểm tra lại mã sinh viên</span>
          <span>• Kiểm tra mã chương trình / ngành</span>
          <span>• Kiểm tra năm tốt nghiệp, loại và số hiệu văn bằng</span>
        </div>
      </div>
    )}
  </section>
)}

      {/* Quick lookup result */}
      {lookupResult && (
        <section
          className={`verification-result lookup-result ${
            lookupResult.statusNum === 2 || lookupResult.statusNum === 0 ? "lookup-revoked" : ""
          }`}
          style={
            lookupResult.statusNum === 2 || lookupResult.statusNum === 0
              ? { borderColor: "#fca5a5", background: "#fffdfd" }
              : undefined
          }
        >

          <div className="verification-result-header">

            <div
              className={`verification-result-icon ${
                lookupResult.statusNum === 2 || lookupResult.statusNum === 0 ? "invalid-icon" : "lookup-icon"
              }`}
              style={
                lookupResult.statusNum === 2 || lookupResult.statusNum === 0
                  ? { background: "#fee2e2", borderColor: "#fca5a5" }
                  : undefined
              }
            >
              {lookupResult.statusNum === 2 ? "⛔" : lookupResult.statusNum === 0 ? "❌" : "🔎"}
            </div>

            <div style={{ flex: 1 }}>
              <div
                className="verification-result-label"
                style={
                  lookupResult.statusNum === 2 || lookupResult.statusNum === 0
                    ? { color: "#dc2626" }
                    : undefined
                }
              >
                TRA CỨU BLOCKCHAIN
              </div>

              {lookupResult.statusNum === 2 ? (
                <>
                  <h3
                    style={{
                      color: "#dc2626",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      margin: "4px 0",
                    }}
                  >
                    <AlertTriangle size={22} color="#dc2626" strokeWidth={2.5} />
                    VĂN BẰNG ĐÃ BỊ THU HỒI
                  </h3>
                  <p style={{ color: "#b91c1c", fontWeight: 500, margin: 0 }}>
                    ⚠️ Văn bằng này đã bị đơn vị phát hành thu hồi trên Smart Contract và KHÔNG còn giá trị sử dụng.
                  </p>
                </>
              ) : lookupResult.statusNum === 0 ? (
                <>
                  <h3
                    style={{
                      color: "#dc2626",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      margin: "4px 0",
                    }}
                  >
                    <AlertTriangle size={22} color="#dc2626" strokeWidth={2.5} />
                    Văn bằng không tồn tại
                  </h3>
                  <p style={{ color: "#b91c1c", fontWeight: 500, margin: 0 }}>
                    Không tìm thấy văn bằng nào trên Smart Contract khớp với thông tin đã nhập (chưa từng được phát hành).
                  </p>
                </>
              ) : (
                <>
                  <h3>Đã tìm thấy văn bằng</h3>
                  <p>
                    Đây là thông tin được đọc trực tiếp từ Smart Contract.
                  </p>
                </>
              )}
            </div>

            {(lookupResult.statusNum === 2 || lookupResult.statusNum === 0) && (
              <div
                className="verification-status-badge badge-invalid"
                style={{
                  background: "#fee2e2",
                  color: "#dc2626",
                  border: "1px solid #fca5a5",
                  fontWeight: "bold",
                }}
              >
                {lookupResult.statusNum === 2 ? "ĐÃ THU HỒI" : "KHÔNG TỒN TẠI"}
              </div>
            )}

          </div>

          {lookupResult.statusNum === 2 && (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 8,
                padding: "10px 14px",
                margin: "12px 0 16px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <AlertTriangle size={18} color="#dc2626" strokeWidth={2.5} style={{ flexShrink: 0 }} />
              <span style={{ color: "#991b1b", fontSize: "0.88rem", fontWeight: 600 }}>
                CẢNH BÁO: Văn bằng này đã bị thu hồi chính thức. Mọi quyền lợi học vị và chứng chỉ không còn hiệu lực pháp lý!
              </span>
            </div>
          )}

          <div className="verification-details">

            <div className="verification-detail">
              <span>Sinh viên</span>
              <strong>{studentCode || "—"}</strong>
            </div>

            <div className="verification-detail">
              <span>Chương trình</span>
              <strong>{programCode || "—"}</strong>
            </div>

            <div className="verification-detail">
              <span>Số hiệu văn bằng</span>
              <strong>{refNumber || "—"}</strong>
            </div>

            <div className="verification-detail">
              <span>Trạng thái</span>
              <strong
                style={
                  lookupResult.statusNum === 2 || lookupResult.statusNum === 0
                    ? { color: "#dc2626", fontWeight: "bold", fontSize: "1.05rem" }
                    : { color: "#16a34a" }
                }
              >
                {lookupResult.statusNum === 2
                  ? "⛔ Đã thu hồi"
                  : lookupResult.statusLabel}
              </strong>
            </div>

            <div className="verification-detail">
              <span>Thời điểm phát hành</span>
              <strong>{lookupResult.issuedAt}</strong>
            </div>

          </div>

          <div
            className="lookup-download"
            style={
              lookupResult.statusNum === 2
                ? { background: "#fff1f2", border: "1px dashed #fda4af", padding: "10px 14px", borderRadius: 8 }
                : undefined
            }
          >
            <div>
              <span style={lookupResult.statusNum === 2 ? { color: "#9f1239" } : undefined}>
                {lookupResult.statusNum === 2
                  ? "Bản gốc lưu trữ trên IPFS (Đã thu hồi)"
                  : "Bản gốc trên IPFS"}
              </span>

              <strong style={lookupResult.statusNum === 2 ? { color: "#be123c", display: "block", fontSize: "0.85rem" } : undefined}>
                {lookupResult.cid
                  ? lookupResult.statusNum === 2
                    ? "Đã lưu trữ (chỉ dùng đối soát lịch sử)"
                    : "Đã lưu trữ"
                  : "Chưa có file"}
              </strong>
            </div>

            {lookupResult.cid ? (
              backendIsLocalOnly ? (
                <span style={{ fontSize: "0.82rem", color: "#64748b", textAlign: "right" }}>
                  Cần host Backend trực tuyến để tải file giải mã từ thiết bị khác
                </span>
              ) : (
                <a
                  href={secureFileUrl(diplomaId, lookupResult.cid)}
                  target="_blank"
                  rel="noreferrer"
                  className="outline-action"
                  style={lookupResult.statusNum === 2 ? { borderColor: "#f43f5e", color: "#e11d48" } : undefined}
                >
                  {lookupResult.statusNum === 2 ? "Xem file gốc đối soát" : "Xem / tải bản gốc"}
                  <ExternalLink size={12} strokeWidth={2} style={{ display: "inline", verticalAlign: "middle", marginLeft: 4 }} />
                </a>
              )
            ) : null}
          </div>

          <div className="lookup-note">
            💡 Tra cứu nhanh chỉ kiểm tra dữ liệu văn bằng trên Blockchain. Để xác minh chính file PDF bạn đang có, hãy sử dụng chức năng <strong>Xác minh văn bằng</strong>.
          </div>

        </section>
      )}

      {/* History (chỉ hiển thị khi văn bằng có tồn tại trên chuỗi) */}
      {diplomaId && ((result && result.statusNum !== 0) || (lookupResult && lookupResult.statusNum !== 0)) && (
        <section className="history-section">
          <SignaturePanel diplomaId={diplomaId} />


          <div className="section-heading">
            <div>
              <h3>Lịch sử Blockchain</h3>
              <p>
                Theo dõi các thay đổi của văn bằng trên chain.
              </p>
            </div>
          </div>

          <TransactionHistory diplomaId={diplomaId} />

        </section>
      )}
    </>
  );

  return (
    <div className="verify-page">

      {/* Hero */}
      <section className="verify-hero">
        <div>
          <div className="eyebrow">PUBLIC VERIFICATION</div>

          <h2>Xác minh văn bằng</h2>

          <p>
            Kiểm tra tính hợp lệ của văn bằng bằng cách đối chiếu
            thông tin và file PDF với dữ liệu được lưu trên Blockchain.
          </p>
        </div>

        <div className="verify-hero-icon">
          ✓
        </div>
      </section>

      {verifyFormCard}
      {resultsSection}

      {/* Trust information */}
      {!result && !lookupResult && (
        <section className="verification-info">

          <div className="info-item">
            <span className="info-icon">
              <Link2 size={18} strokeWidth={2} />
            </span>

            <div>
              <strong>Blockchain</strong>
              <p>
                Dữ liệu xác thực được ghi nhận trên Polygon Amoy.
              </p>
            </div>
          </div>

          <div className="info-item">
            <span className="info-icon">
              <Package size={18} strokeWidth={2} />
            </span>

            <div>
              <strong>IPFS</strong>
              <p>
                File văn bằng gốc được lưu trữ phi tập trung.
              </p>
            </div>
          </div>

          <div className="info-item">
            <span className="info-icon">
              <ShieldCheck size={18} strokeWidth={2} />
            </span>

            <div>
              <strong>Không cần MetaMask</strong>
              <p>
                Người kiểm tra không cần ví Blockchain để xác minh.
              </p>
            </div>
          </div>

        </section>
      )}

    </div>
  );
}
