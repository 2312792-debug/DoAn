import { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Check,
  X,
  Upload,
  Link2,
  Package,
  ShieldCheck,
  ArrowRight,
  Plus,
  RefreshCw,
  ExternalLink,
  Download,
} from "lucide-react";
import { computeFileHash } from "../utils/hash";
import {
  diplomaIdFrom,
  DIPLOMA_TYPES,
  issueDiploma as issueDiplomaCall,
  revokeDiploma as revokeDiplomaCall,
  updateDiploma as updateDiplomaCall,
  describeTxError,
} from "../utils/contract";
import { uploadPdfToIpfs } from "../utils/pinataClient";
import { stampQrOnPdf, downloadFile } from "../utils/stampQr";

const CURRENT_YEAR = new Date().getFullYear();

function shortenAddress(address) {
  if (!address) return "Chưa kết nối";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function IssuePortal({ account, isIssuer, connecting, connectWallet }) {
  const [activeAction, setActiveAction] = useState("issue");

  // Issue
  const [studentCode, setStudentCode] = useState("");
  const [programCode, setProgramCode] = useState("");
  const [gradYear, setGradYear] = useState(String(CURRENT_YEAR));
  const [diplomaType, setDiplomaType] = useState(DIPLOMA_TYPES[0].value);
  const [refNumber, setRefNumber] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");
  // In ma QR (link xac minh) vao PDF TRUOC khi bam/tai len. Ban co QR moi la ban phat cho sinh vien.
  const [stampQr, setStampQr] = useState(true);
  const [stampedFile, setStampedFile] = useState(null);

  // Update
  const [updStudentCode, setUpdStudentCode] = useState("");
  const [updProgramCode, setUpdProgramCode] = useState("");
  const [updGradYear, setUpdGradYear] = useState(String(CURRENT_YEAR));
  const [updDiplomaType, setUpdDiplomaType] = useState(DIPLOMA_TYPES[0].value);
  const [updRefNumber, setUpdRefNumber] = useState("");
  const [updFile, setUpdFile] = useState(null);
  const [updLoading, setUpdLoading] = useState(false);
  const [updStatus, setUpdStatus] = useState("");
  const [updStampedFile, setUpdStampedFile] = useState(null);

  // Revoke
  const [revokeStudentCode, setRevokeStudentCode] = useState("");
  const [revokeProgramCode, setRevokeProgramCode] = useState("");
  const [revokeGradYear, setRevokeGradYear] = useState(String(CURRENT_YEAR));
  const [revokeDiplomaType, setRevokeDiplomaType] = useState(DIPLOMA_TYPES[0].value);
  const [revokeRefNumber, setRevokeRefNumber] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeStatus, setRevokeStatus] = useState("");

  async function handleIssue() {
    if (!isIssuer) {
      setStatus("⚠️ Ví hiện tại chưa có ISSUER_ROLE.");
      return;
    }

    if (!studentCode || !programCode || !gradYear || !refNumber || !file) {
      setStatus(
        "⚠️ Vui lòng nhập đủ mã sinh viên, mã chương trình, năm tốt nghiệp, số hiệu văn bằng và chọn file PDF."
      );
      return;
    }

    setLoading(true);
    setTxHash("");
    setStampedFile(null);

    try {
      const diplomaId = diplomaIdFrom(
        studentCode,
        programCode,
        gradYear,
        diplomaType,
        refNumber
      );

      // In QR TRUOC khi bam: hash + file tren IPFS phai la cua CHINH ban PDF co QR nay.
      let fileToIssue = file;
      if (stampQr) {
        setStatus("🔳 Đang in mã QR xác minh vào PDF...");
        fileToIssue = await stampQrOnPdf(file, diplomaId);
      }

      setStatus("🔐 Đang tính mã băm của file...");
      const fileHash = await computeFileHash(fileToIssue);

      setStatus("📦 Đang mã hoá và tải file lên IPFS...");
      const { cid } = await uploadPdfToIpfs(fileToIssue, diplomaId);

      setStatus(
        "✍️ Đang gửi giao dịch lên Blockchain. Vui lòng xác nhận trên MetaMask..."
      );

      const hash = await issueDiplomaCall(
        diplomaId,
        fileHash,
        cid
      );

      setTxHash(hash);
      setStampedFile(stampQr ? fileToIssue : null);
      setStatus("success");
    } catch (err) {
      console.error(err);
      setStatus("❌ " + describeTxError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate() {
    if (!isIssuer) {
      setUpdStatus("⚠️ Ví hiện tại chưa có ISSUER_ROLE.");
      return;
    }

    if (
      !updStudentCode ||
      !updProgramCode ||
      !updGradYear ||
      !updRefNumber ||
      !updFile
    ) {
      setUpdStatus(
        "⚠️ Vui lòng nhập đủ mã sinh viên, mã chương trình, năm tốt nghiệp, số hiệu văn bằng và chọn file PDF mới."
      );
      return;
    }

    setUpdLoading(true);
    setUpdStampedFile(null);

    try {
      const diplomaId = diplomaIdFrom(
        updStudentCode,
        updProgramCode,
        updGradYear,
        updDiplomaType,
        updRefNumber
      );

      let fileToUpdate = updFile;
      if (stampQr) {
        setUpdStatus("🔳 Đang in mã QR xác minh vào PDF mới...");
        fileToUpdate = await stampQrOnPdf(updFile, diplomaId);
      }

      setUpdStatus("🔐 Đang tính mã băm của file mới...");
      const fileHash = await computeFileHash(fileToUpdate);

      setUpdStatus("📦 Đang mã hoá và tải file mới lên IPFS...");
      const { cid } = await uploadPdfToIpfs(fileToUpdate, diplomaId);

      setUpdStatus(
        "✍️ Đang gửi giao dịch cập nhật. Vui lòng xác nhận trên MetaMask..."
      );

      const hash = await updateDiplomaCall(
        diplomaId,
        fileHash,
        cid
      );

      setUpdStampedFile(stampQr ? fileToUpdate : null);
      setUpdStatus(
        `✅ Cập nhật thành công!\nTx: ${hash}\nCID mới: ${cid}`
      );
    } catch (err) {
      console.error(err);
      setUpdStatus("❌ " + describeTxError(err));
    } finally {
      setUpdLoading(false);
    }
  }

  async function handleRevoke() {
    if (!isIssuer) {
      setRevokeStatus("⚠️ Ví hiện tại chưa có ISSUER_ROLE.");
      return;
    }

    if (
      !revokeStudentCode ||
      !revokeProgramCode ||
      !revokeGradYear ||
      !revokeRefNumber ||
      !revokeReason
    ) {
      setRevokeStatus(
        "⚠️ Vui lòng nhập đủ thông tin, số hiệu văn bằng và lý do thu hồi."
      );
      return;
    }

    const diplomaTypeLabel =
      DIPLOMA_TYPES.find((t) => t.value === revokeDiplomaType)?.label ||
      revokeDiplomaType;
    const confirmed = window.confirm(
      "Xác nhận THU HỒI văn bằng sau đây?\n\n" +
        `Mã sinh viên: ${revokeStudentCode}\n` +
        `Mã ngành: ${revokeProgramCode}\n` +
        `Năm tốt nghiệp: ${revokeGradYear}\n` +
        `Loại văn bằng: ${diplomaTypeLabel}\n` +
        `Số hiệu văn bằng: ${revokeRefNumber}\n` +
        `Lý do: ${revokeReason}\n\n` +
        "Hành động này sẽ được ghi vĩnh viễn lên Blockchain."
    );
    if (!confirmed) return;

    setRevokeLoading(true);

    try {
      setRevokeStatus(
        "✍️ Đang gửi giao dịch thu hồi. Vui lòng xác nhận trên MetaMask..."
      );

      const diplomaId = diplomaIdFrom(
        revokeStudentCode,
        revokeProgramCode,
        revokeGradYear,
        revokeDiplomaType,
        revokeRefNumber
      );

      const hash = await revokeDiplomaCall(
        diplomaId,
        revokeReason
      );

      setRevokeStatus(
        `✅ Thu hồi thành công!\nTransaction: ${hash}`
      );
    } catch (err) {
      console.error(err);
      setRevokeStatus("❌ " + describeTxError(err));
    } finally {
      setRevokeLoading(false);
    }
  }

  function renderRoleStatus() {
    if (!account) {
      return (
        <div className="wallet-status disconnected">
          <div className="wallet-status-icon">
            <Upload size={17} strokeWidth={2} style={{ transform: "rotate(45deg)" }} />
          </div>

          <div className="wallet-status-content">
            <strong>Chưa kết nối MetaMask</strong>
            <span>
              Kết nối ví có quyền ISSUER_ROLE để phát hành văn bằng.
            </span>
          </div>

          <button
            className="wallet-connect-btn"
            onClick={() => connectWallet().catch((err) => setStatus("❌ " + err.message))}
            disabled={connecting}
          >
            {connecting ? "Đang kết nối..." : "Kết nối"}
          </button>
        </div>
      );
    }

    return (
      <div
        className={`wallet-status ${
          isIssuer ? "authorized" : "unauthorized"
        }`}
      >
        <div className="wallet-status-icon">
          {isIssuer ? (
            <CheckCircle2 size={17} strokeWidth={2} />
          ) : (
            <AlertTriangle size={17} strokeWidth={2} />
          )}
        </div>

        <div className="wallet-status-content">
          <strong>
            {isIssuer
              ? "Ví đã sẵn sàng phát hành"
              : "Ví chưa có quyền phát hành"}
          </strong>

          <span>{shortenAddress(account)}</span>
        </div>

        <div
          className={`issuer-badge ${
            isIssuer ? "issuer-valid" : "issuer-invalid"
          }`}
        >
          {isIssuer ? (
            <>
              <Check size={12} strokeWidth={2.5} /> ISSUER_ROLE
            </>
          ) : (
            <>
              <X size={12} strokeWidth={2.5} /> Không có quyền
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="issue-page">

      {/* Hero */}
      <section className="issue-hero">
        <div>
          <div className="eyebrow">AUTHORIZED ISSUANCE</div>

          <h2>Phát hành văn bằng</h2>

          <p>
            Ghi nhận văn bằng mới lên Blockchain và lưu trữ
            file PDF trên IPFS.
          </p>
        </div>

        <div className="issue-hero-icon">
          📜
        </div>
      </section>

      {/* Wallet */}
      <section className="issue-wallet-section">
        <div className="section-heading">
          <div>
            <h3>Ví phát hành</h3>
            <p>
              Tài khoản cần có quyền ISSUER_ROLE trên Smart Contract.
            </p>
          </div>

          <div className="network-mini-badge">
            <span />
            Polygon Amoy
          </div>
        </div>

        {renderRoleStatus()}
      </section>

      {/* Action navigation */}
      <section className="issue-action-card">

        <div className="issue-action-tabs">
          <button
            className={activeAction === "issue" ? "active" : ""}
            onClick={() => setActiveAction("issue")}
          >
            <span><Plus size={15} strokeWidth={2.3} /></span>
            Phát hành mới
          </button>

          <button
            className={activeAction === "update" ? "active" : ""}
            onClick={() => setActiveAction("update")}
          >
            <span><RefreshCw size={15} strokeWidth={2.3} /></span>
            Cập nhật
          </button>

          <button
            className={activeAction === "revoke" ? "active" : ""}
            onClick={() => setActiveAction("revoke")}
          >
            <span><AlertTriangle size={15} strokeWidth={2.3} /></span>
            Thu hồi
          </button>
        </div>

        {/* Issue */}
        {activeAction === "issue" && (
          <div className="issue-form">

            <div className="action-title">
              <div>
                <h3>Phát hành văn bằng mới</h3>
                <p>
                  Tạo một bản ghi văn bằng mới trên Blockchain.
                </p>
              </div>

              <div className="action-step">01</div>
            </div>

            <div className="form-section-title">
              Thông tin sinh viên
            </div>

            <div className="issue-form-grid">

              <div className="field">
                <label>Mã sinh viên</label>
                <input
                  type="text"
                  placeholder="VD: 2312792"
                  value={studentCode}
                  onChange={(e) =>
                    setStudentCode(e.target.value)
                  }
                />
              </div>

              <div className="field">
                <label>Chương trình / ngành</label>
                <input
                  type="text"
                  placeholder="VD: 7480201 (Công nghệ thông tin)"
                  value={programCode}
                  onChange={(e) =>
                    setProgramCode(e.target.value)
                  }
                />
              </div>

              <div className="field">
                <label>Năm tốt nghiệp</label>
                <input
                  type="number"
                  placeholder="VD: 2026"
                  value={gradYear}
                  onChange={(e) =>
                    setGradYear(e.target.value)
                  }
                />
              </div>

              <div className="field">
                <label>Loại văn bằng</label>
                <select
                  value={diplomaType}
                  onChange={(e) =>
                    setDiplomaType(e.target.value)
                  }
                >
                  {DIPLOMA_TYPES.map((type) => (
                    <option
                      key={type.value}
                      value={type.value}
                    >
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Số hiệu văn bằng / Số vào sổ</label>
                <input
                  type="text"
                  placeholder="VD: DHDL-2026-001234"
                  value={refNumber}
                  onChange={(e) =>
                    setRefNumber(e.target.value)
                  }
                />
              </div>

            </div>

            <div className="form-section-title file-title">
              Văn bằng điện tử
            </div>

            <div className="issue-upload">
              <input
                id="issue-file"
                type="file"
                accept="application/pdf"
                onChange={(e) =>
                  setFile(e.target.files?.[0] || null)
                }
              />

              <label htmlFor="issue-file">
                <div className="issue-upload-icon">
                  {file ? (
                    <Check size={20} strokeWidth={2.5} />
                  ) : (
                    <Upload size={20} strokeWidth={2} />
                  )}
                </div>

                {file ? (
                  <>
                    <strong>{file.name}</strong>
                    <span>
                      {(file.size / 1024 / 1024).toFixed(2)} MB · PDF
                    </span>
                  </>
                ) : (
                  <>
                    <strong>Chọn file PDF văn bằng</strong>
                    <span>
                      File sẽ được hash và lưu lên IPFS.
                    </span>
                  </>
                )}
              </label>
            </div>

            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "14px 0", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={stampQr}
                onChange={(e) => setStampQr(e.target.checked)}
                style={{ marginTop: 4 }}
              />
              <span style={{ fontSize: "0.9rem", lineHeight: 1.45 }}>
                <strong>In mã QR xác minh vào PDF (khuyến nghị)</strong>
                <br />
                <span style={{ opacity: 0.75 }}>
                  Mã QR được in vào góc dưới bên phải trang đầu <em>trước khi</em> băm, để chỉ cần có file PDF là quét
                  được về trang xác minh. Sau khi phát hành, hãy tải và phát cho sinh viên <b>đúng bản PDF có QR này</b>
                  (bản gốc chưa có QR sẽ không khớp mã băm).
                </span>
              </span>
            </label>

            <div className="issue-process-hint">
              <div>
                <span>1</span>
                Tạo hash
              </div>

              <div>
                <span>2</span>
                Upload IPFS
              </div>

              <div>
                <span>3</span>
                Ghi Blockchain
              </div>
            </div>

            <button
              className="issue-submit-btn"
              onClick={handleIssue}
              disabled={loading || !isIssuer}
            >
              {loading
                ? "Đang xử lý..."
                : (
                    <>
                      Phát hành văn bằng <ArrowRight size={16} strokeWidth={2.2} />
                    </>
                  )}
            </button>

            {status === "success" && (
              <div className="issue-success-card">
                <div className="success-icon">
                  <Check size={20} strokeWidth={3} />
                </div>

                <div>
                  <strong>Phát hành thành công</strong>
                  <p>
                    Văn bằng đã được ghi nhận trên Polygon Amoy.
                  </p>
                </div>
              </div>
            )}

            {status === "success" && stampedFile && (
              <div className="history-note-box" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <button type="button" className="outline-action" onClick={() => downloadFile(stampedFile)}>
                  <Download size={14} strokeWidth={2} /> Tải bản PDF đã in QR
                </button>
                <span style={{ fontSize: "0.85rem" }}>
                  Đây là bản phải phát cho sinh viên. Mã băm trên Blockchain là của đúng file này.
                </span>
              </div>
            )}

            {status &&
              status !== "success" &&
              status.startsWith("❌") && (
                <div className="issue-error-card">
                  {status}
                </div>
              )}

            {txHash && (
              <div className="transaction-card">
                <div>
                  <span>Transaction Hash</span>
                  <code>{txHash}</code>
                </div>

                <a
                  href={`https://amoy.polygonscan.com/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Xem Blockchain
                  <ExternalLink size={12} strokeWidth={2} style={{ display: "inline", verticalAlign: "middle", marginLeft: 4 }} />
                </a>
              </div>
            )}

          </div>
        )}

        {/* Update */}
        {activeAction === "update" && (
          <div className="issue-form">

            <div className="action-title">
              <div>
                <h3>Cập nhật văn bằng</h3>
                <p>
                  Thay thế file PDF hoặc metadata của văn bằng đã tồn tại.
                </p>
              </div>

              <div className="action-step">02</div>
            </div>

            <div className="form-section-title">
              Xác định văn bằng
            </div>

            <div className="issue-form-grid">

              <div className="field">
                <label>Mã sinh viên</label>
                <input
                  type="text"
                  placeholder="VD: 2312792"
                  value={updStudentCode}
                  onChange={(e) =>
                    setUpdStudentCode(e.target.value)
                  }
                />
              </div>

              <div className="field">
                <label>Chương trình / ngành</label>
                <input
                  type="text"
                  placeholder="VD: 7480201 (Công nghệ thông tin)"
                  value={updProgramCode}
                  onChange={(e) =>
                    setUpdProgramCode(e.target.value)
                  }
                />
              </div>

              <div className="field">
                <label>Năm tốt nghiệp</label>
                <input
                  type="number"
                  value={updGradYear}
                  onChange={(e) =>
                    setUpdGradYear(e.target.value)
                  }
                />
              </div>

              <div className="field">
                <label>Loại văn bằng</label>
                <select
                  value={updDiplomaType}
                  onChange={(e) =>
                    setUpdDiplomaType(e.target.value)
                  }
                >
                  {DIPLOMA_TYPES.map((type) => (
                    <option
                      key={type.value}
                      value={type.value}
                    >
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Số hiệu văn bằng / Số vào sổ</label>
                <input
                  type="text"
                  placeholder="VD: DHDL-2026-001234"
                  value={updRefNumber}
                  onChange={(e) =>
                    setUpdRefNumber(e.target.value)
                  }
                />
              </div>

            </div>

            <div className="form-section-title file-title">
              File PDF mới
            </div>

            <div className="issue-upload compact">
              <input
                id="update-file"
                type="file"
                accept="application/pdf"
                onChange={(e) =>
                  setUpdFile(e.target.files?.[0] || null)
                }
              />

              <label htmlFor="update-file">
                <div className="issue-upload-icon">
                  {updFile ? (
                    <Check size={20} strokeWidth={2.5} />
                  ) : (
                    <Upload size={20} strokeWidth={2} />
                  )}
                </div>

                {updFile ? (
                  <>
                    <strong>{updFile.name}</strong>
                    <span>
                      {(updFile.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </>
                ) : (
                  <>
                    <strong>Chọn file PDF mới</strong>
                    <span>
                      File cũ sẽ được thay thế bằng bản mới.
                    </span>
                  </>
                )}
              </label>
            </div>

            <label style={{ display: "flex", gap: 10, alignItems: "center", margin: "14px 0", cursor: "pointer", fontSize: "0.9rem" }}>
              <input type="checkbox" checked={stampQr} onChange={(e) => setStampQr(e.target.checked)} />
              <span>In mã QR xác minh vào PDF mới (cùng lựa chọn với tab Phát hành)</span>
            </label>

            <button
              className="issue-submit-btn update-btn"
              onClick={handleUpdate}
              disabled={updLoading || !isIssuer}
            >
              {updLoading
                ? "Đang xử lý..."
                : (
                    <>
                      Cập nhật văn bằng <ArrowRight size={16} strokeWidth={2.2} />
                    </>
                  )}
            </button>

            {updStatus && (
              <div
                className={`action-status ${
                  updStatus.startsWith("✅")
                    ? "success"
                    : updStatus.startsWith("❌")
                      ? "error"
                      : ""
                }`}
              >
                {updStatus}
              </div>
            )}

            {updStampedFile && updStatus.startsWith("✅") && (
              <div className="history-note-box" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <button type="button" className="outline-action" onClick={() => downloadFile(updStampedFile)}>
                  <Download size={14} strokeWidth={2} /> Tải bản PDF mới đã in QR
                </button>
              </div>
            )}

          </div>
        )}

        {/* Revoke */}
        {activeAction === "revoke" && (
          <div className="issue-form">

            <div className="action-title">
              <div>
                <h3>Thu hồi văn bằng</h3>
                <p>
                  Đánh dấu văn bằng không còn hiệu lực trên Blockchain.
                </p>
              </div>

              <div className="action-step danger-step">03</div>
            </div>

            <div className="revoke-warning">
              <span>
                <AlertTriangle size={17} strokeWidth={2} />
              </span>

              <div>
                <strong>Thao tác không nên thực hiện tùy tiện</strong>
                <p>
                  Việc thu hồi sẽ thay đổi trạng thái văn bằng trên
                  Smart Contract.
                </p>
              </div>
            </div>

            <div className="form-section-title">
              Xác định văn bằng
            </div>

            <div className="issue-form-grid">

              <div className="field">
                <label>Mã sinh viên</label>
                <input
                  type="text"
                  placeholder="VD: 2312792"
                  value={revokeStudentCode}
                  onChange={(e) =>
                    setRevokeStudentCode(e.target.value)
                  }
                />
              </div>

              <div className="field">
                <label>Chương trình / ngành</label>
                <input
                  type="text"
                  placeholder="VD: 7480201 (Công nghệ thông tin)"
                  value={revokeProgramCode}
                  onChange={(e) =>
                    setRevokeProgramCode(e.target.value)
                  }
                />
              </div>

              <div className="field">
                <label>Năm tốt nghiệp</label>
                <input
                  type="number"
                  value={revokeGradYear}
                  onChange={(e) =>
                    setRevokeGradYear(e.target.value)
                  }
                />
              </div>

              <div className="field">
                <label>Loại văn bằng</label>
                <select
                  value={revokeDiplomaType}
                  onChange={(e) =>
                    setRevokeDiplomaType(e.target.value)
                  }
                >
                  {DIPLOMA_TYPES.map((type) => (
                    <option
                      key={type.value}
                      value={type.value}
                    >
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Số hiệu văn bằng / Số vào sổ</label>
                <input
                  type="text"
                  placeholder="VD: DHDL-2026-001234"
                  value={revokeRefNumber}
                  onChange={(e) =>
                    setRevokeRefNumber(e.target.value)
                  }
                />
              </div>

            </div>

            <div className="field">
              <label>Lý do thu hồi</label>

              <textarea
                className="revoke-textarea"
                placeholder="VD: Phát hiện gian lận trong hồ sơ..."
                value={revokeReason}
                onChange={(e) =>
                  setRevokeReason(e.target.value)
                }
              />
            </div>

            <button
              className="revoke-submit-btn"
              onClick={handleRevoke}
              disabled={revokeLoading || !isIssuer}
            >
              {revokeLoading
                ? "Đang xử lý..."
                : "Thu hồi văn bằng"}
            </button>

            {revokeStatus && (
              <div
                className={`action-status ${
                  revokeStatus.startsWith("✅")
                    ? "success"
                    : revokeStatus.startsWith("❌")
                      ? "error"
                      : ""
                }`}
              >
                {revokeStatus}
              </div>
            )}

          </div>
        )}

      </section>

      {/* Footer information */}
      <section className="issue-info-grid">

        <div className="issue-info-card">
          <span>
            <Link2 size={18} strokeWidth={2} />
          </span>

          <div>
            <strong>Blockchain</strong>
            <p>
              Giao dịch được ghi nhận trên Polygon Amoy.
            </p>
          </div>
        </div>

        <div className="issue-info-card">
          <span>
            <Package size={18} strokeWidth={2} />
          </span>

          <div>
            <strong>IPFS</strong>
            <p>
              File PDF được lưu trữ phi tập trung.
            </p>
          </div>
        </div>

        <div className="issue-info-card">
          <span>
            <ShieldCheck size={18} strokeWidth={2} />
          </span>

          <div>
            <strong>ISSUER_ROLE</strong>
            <p>
              Chỉ tài khoản được cấp quyền mới thao tác được.
            </p>
          </div>
        </div>

      </section>
    </div>
  );
}