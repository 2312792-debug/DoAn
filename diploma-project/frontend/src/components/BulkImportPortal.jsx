import { useState } from "react";
import * as XLSX from "xlsx";
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  PlayCircle,
  ExternalLink,
} from "lucide-react";
import { computeFileHash } from "../utils/hash";
import {
  diplomaIdFrom,
  DIPLOMA_TYPES,
  issueBatch as issueBatchCall,
  describeTxError,
  explorerTxUrl,
  getDiplomaStatus,
} from "../utils/contract";
import { uploadPdfToIpfs, signAndUploadPdfToIpfs } from "../utils/pinataClient";
import { stampQrOnPdf, downloadFile } from "../utils/stampQr";

const VALID_TYPES = new Set(DIPLOMA_TYPES.map((t) => t.value));
const CSV_HEADERS = ["mssv", "ma_nganh", "nam_tot_nghiep", "loai_van_bang", "so_hieu_van_bang"];

function shortenAddress(address) {
  if (!address) return "Chưa kết nối";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Khoa ghep file <-> dong CSV: cung quy uoc nhu diplomaIdFrom nhung dung lam ten file. */
function matchKey(row) {
  return [row.mssv, row.ma_nganh, row.nam_tot_nghiep, row.loai_van_bang, row.so_hieu_van_bang]
    .map((v) => String(v || "").trim().toUpperCase())
    .join("_");
}

function downloadTemplate() {
  const header = CSV_HEADERS.join(",");
  const sample1 = "2312792,CTK47C,2026,CU_NHAN,001";
  const sample2 = "2312793,CTK47C,2026,CU_NHAN,002";
  const csv = [header, sample1, sample2].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mau_nhap_hang_loat.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function BulkImportPortal({ account, isIssuer, connecting, connectWallet }) {
  const [csvRows, setCsvRows] = useState([]);
  const [csvError, setCsvError] = useState("");
  const [csvFileName, setCsvFileName] = useState("");

  const [pdfFiles, setPdfFiles] = useState({}); // key -> File
  const [pdfFileNames, setPdfFileNames] = useState([]);

  // rows: { key, mssv, ma_nganh, nam_tot_nghiep, loai_van_bang, so_hieu_van_bang,
  //         diplomaId, file, status, message, fileHash, cid }
  const [rows, setRows] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [batchTxHash, setBatchTxHash] = useState("");
  const [batchError, setBatchError] = useState("");
  // Ky so X.509 / PKCS#7 nhung truc tiep vao tung PDF TRUOC khi bam/tai len.
  const [embedPdfSig, setEmbedPdfSig] = useState(true);
  // Tuy chon in them QR (link xac minh) vao tung PDF TRUOC khi ky so/bam.
  const [stampQr, setStampQr] = useState(false);

  function handleCsvChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCsvError("");
    setCsvFileName(f.name);
    setBatchTxHash("");
    setBatchError("");

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (raw.length === 0) {
          setCsvError("File rỗng hoặc không đọc được dòng nào.");
          setCsvRows([]);
          return;
        }

        const missingCols = CSV_HEADERS.filter((h) => !(h in raw[0]));
        if (missingCols.length > 0) {
          setCsvError(
            "Thiếu cột bắt buộc: " +
              missingCols.join(", ") +
              ". Hãy tải file mẫu để xem đúng định dạng."
          );
          setCsvRows([]);
          return;
        }

        const parsed = raw.map((r, i) => {
          const row = {
            mssv: String(r.mssv || "").trim(),
            ma_nganh: String(r.ma_nganh || "").trim(),
            nam_tot_nghiep: String(r.nam_tot_nghiep || "").trim(),
            loai_van_bang: String(r.loai_van_bang || "").trim().toUpperCase(),
            so_hieu_van_bang: String(r.so_hieu_van_bang || "").trim(),
            _line: i + 2, // +2: dong 1 la header, du lieu bat dau dong 2
          };
          return row;
        });

        setCsvRows(parsed);
      } catch (err) {
        console.error(err);
        setCsvError("Không đọc được file. Hãy chắc chắn đây là file .csv hoặc .xlsx hợp lệ.");
        setCsvRows([]);
      }
    };
    reader.readAsBinaryString(f);
  }

  function handlePdfChange(e) {
    const list = Array.from(e.target.files || []);
    const map = {};
    for (const f of list) {
      const key = f.name.replace(/\.pdf$/i, "").trim().toUpperCase();
      map[key] = f;
    }
    setPdfFiles(map);
    setPdfFileNames(list.map((f) => f.name));
    setBatchTxHash("");
    setBatchError("");
  }

  // Ghep CSV + file PDF moi khi 1 trong 2 thay doi
  function buildRows() {
    if (csvRows.length === 0) return [];
    return csvRows.map((r) => {
      const key = matchKey(r);
      const file = pdfFiles[key];
      const typeOk = VALID_TYPES.has(r.loai_van_bang);

      let status = "cho_xu_ly";
      let message = "";

      if (!typeOk) {
        status = "loi";
        message = `loai_van_bang "${r.loai_van_bang}" không hợp lệ (phải là: ${[...VALID_TYPES].join(", ")})`;
      } else if (!r.mssv || !r.ma_nganh || !r.nam_tot_nghiep || !r.so_hieu_van_bang) {
        status = "loi";
        message = "Thiếu dữ liệu ở một hoặc nhiều cột bắt buộc.";
      } else if (!file) {
        status = "loi";
        message = `Không tìm thấy file PDF tên "${key}.pdf"`;
      }

      let diplomaId = null;
      try {
        if (typeOk) {
          diplomaId = diplomaIdFrom(r.mssv, r.ma_nganh, r.nam_tot_nghiep, r.loai_van_bang, r.so_hieu_van_bang);
        }
      } catch {
        status = "loi";
        message = "Không tính được diplomaId từ dữ liệu dòng này.";
      }

      return { key, ...r, file, diplomaId, status, message, fileHash: null, cid: null };
    });
  }

  const liveRows = rows.length > 0 ? rows : buildRows();
  const readyCount = liveRows.filter((r) => r.status === "cho_xu_ly" || r.status === "san_sang").length;
  const errorCount = liveRows.filter((r) => r.status === "loi").length;
  const allProcessed =
    rows.length > 0 && rows.every((r) => ["san_sang", "loi", "da_phat_hanh", "bo_qua", "da_ton_tai"].includes(r.status));
  const anyReadyToIssue = rows.some((r) => r.status === "san_sang");

  async function handleProcess() {
    const initial = buildRows();
    setRows(initial);
    setProcessing(true);
    setBatchTxHash("");
    setBatchError("");

    // Kiem tra truoc tren Blockchain: dong nao da Hop le (hoac trung trong file) thi bao ton tai va bo qua,
    // khong ton cong bam/tai len IPFS va khong gui giao dich thua.
    const seen = new Set();
    for (let i = 0; i < initial.length; i++) {
      const r = initial[i];
      if (r.status === "loi" || !r.diplomaId) continue;
      if (seen.has(r.diplomaId)) {
        initial[i] = { ...r, status: "da_ton_tai", message: "Trùng với một dòng phía trên trong cùng file CSV — bỏ qua." };
        continue;
      }
      seen.add(r.diplomaId);
      try {
        const st = await getDiplomaStatus(r.diplomaId);
        if (st === 1) {
          initial[i] = { ...r, status: "da_ton_tai", message: "Văn bằng này đã được phát hành trước đó (đang Hợp lệ) — bỏ qua, không tải lại lên IPFS." };
        } else if (st === 2) {
          initial[i] = { ...r, message: "Đã bị thu hồi trước đó — sẽ được phát hành lại." };
        }
      } catch (e) {
        console.error(e); // khong kiem tra duoc thi cu xu ly, hop dong van tu bo qua dong trung
      }
    }
    setRows([...initial]);

    const updated = [...initial];
    for (let i = 0; i < updated.length; i++) {
      const r = updated[i];
      if (r.status === "loi" || r.status === "da_ton_tai") continue;

      try {
        updated[i] = { ...r, status: "dang_bam" };
        setRows([...updated]);
        // In QR & ky so TRUOC khi bam: hash + file tren IPFS phai la cua CHINH ban PDF cuoi cung.
        let fileToIssue = stampQr ? await stampQrOnPdf(r.file, r.diplomaId) : r.file;
        let fileHash;
        let cid;

        if (embedPdfSig) {
          updated[i] = { ...updated[i], status: "dang_tai_len" };
          setRows([...updated]);
          const signedRes = await signAndUploadPdfToIpfs(fileToIssue, r.diplomaId);
          fileHash = signedRes.fileHash;
          cid = signedRes.cid;
          fileToIssue = signedRes.signedFile;
        } else {
          fileHash = await computeFileHash(fileToIssue);
          updated[i] = { ...updated[i], status: "dang_tai_len", fileHash };
          setRows([...updated]);
          cid = (await uploadPdfToIpfs(fileToIssue, r.diplomaId)).cid;
        }

        updated[i] = {
          ...updated[i],
          status: "san_sang",
          fileHash,
          cid,
          stampedFile: embedPdfSig || stampQr ? fileToIssue : null,
        };
        setRows([...updated]);
      } catch (err) {
        console.error(err);
        updated[i] = { ...updated[i], status: "loi", message: err.message || "Lỗi xử lý file." };
        setRows([...updated]);
      }
    }

    setProcessing(false);
  }

  async function handleIssueBatch() {
    setIssuing(true);
    setBatchError("");
    try {
      const target = rows.filter((r) => r.status === "san_sang");
      const diplomaIds = target.map((r) => r.diplomaId);
      const fileHashes = target.map((r) => r.fileHash);
      const cids = target.map((r) => r.cid);

      const { hash, results } = await issueBatchCall(diplomaIds, fileHashes, cids);
      setBatchTxHash(hash);

      const next = [...rows];
      let ri = 0;
      for (let i = 0; i < next.length; i++) {
        if (next[i].status !== "san_sang") continue;
        const ok = results[ri];
        next[i] = {
          ...next[i],
          status: ok ? "da_phat_hanh" : "bo_qua",
          message: ok ? "" : "diplomaId này đã Hợp lệ từ trước - bị bỏ qua, không ghi đè.",
        };
        ri++;
      }
      setRows(next);
    } catch (err) {
      console.error(err);
      setBatchError(describeTxError(err));
    } finally {
      setIssuing(false);
    }
  }

  const stampedRows = rows.filter((r) => r.stampedFile && (r.status === "san_sang" || r.status === "da_phat_hanh"));

  /** Tai lan luot tung ban PDF da in QR (cach quang giua cac lan tai de trinh duyet khong chan). */
  async function downloadAllStamped() {
    for (const r of stampedRows) {
      downloadFile(r.stampedFile);
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
  }

  function resetAll() {
    setCsvRows([]);
    setCsvError("");
    setCsvFileName("");
    setPdfFiles({});
    setPdfFileNames([]);
    setRows([]);
    setBatchTxHash("");
    setBatchError("");
  }

  const STATUS_META = {
    cho_xu_ly: { label: "Chờ xử lý", cls: "muted" },
    dang_bam: { label: "Đang in QR & băm...", cls: "muted" },
    dang_tai_len: { label: "Đang mã hoá & tải lên...", cls: "muted" },
    san_sang: { label: "Sẵn sàng phát hành", cls: "ok" },
    da_phat_hanh: { label: "Đã phát hành", cls: "ok" },
    bo_qua: { label: "Bỏ qua (đã tồn tại)", cls: "warn" },
    da_ton_tai: { label: "Đã tồn tại — bỏ qua", cls: "warn" },
    loi: { label: "Lỗi", cls: "error" },
  };

  if (!account) {
    return (
      <div className="issue-page">
        <div className="wallet-status disconnected">
          <div className="wallet-status-icon">
            <AlertTriangle size={18} strokeWidth={2} />
          </div>
          <div className="wallet-status-content">
            <strong>Chưa kết nối ví</strong>
            <p>Cần kết nối MetaMask bằng tài khoản có quyền ISSUER_ROLE để nhập hàng loạt.</p>
          </div>
          <button className="wallet-connect-btn" onClick={connectWallet} disabled={connecting}>
            {connecting ? "Đang kết nối..." : "Kết nối ví"}
          </button>
        </div>
      </div>
    );
  }

  if (!isIssuer) {
    return (
      <div className="issue-page">
        <div className="wallet-status disconnected">
          <div className="wallet-status-icon">
            <AlertTriangle size={18} strokeWidth={2} />
          </div>
          <div className="wallet-status-content">
            <strong>Tài khoản {shortenAddress(account)} không có quyền ISSUER_ROLE</strong>
            <p>Liên hệ Admin để được cấp quyền phát hành trước khi nhập hàng loạt.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="issue-page">
      <section className="issue-hero">
        <div>
          <div className="eyebrow">BULK ISSUANCE</div>
          <h2>Nhập văn bằng hàng loạt</h2>
          <p>
            Phát hành nhiều văn bằng cùng lúc từ 1 file Excel/CSV + nhiều file PDF, gộp trong
            1 giao dịch duy nhất (issueBatch) - tiết kiệm gas và thời gian so với phát hành từng cái.
          </p>
        </div>
        <div className="issue-hero-icon">
          <FileSpreadsheet size={28} strokeWidth={1.8} />
        </div>
      </section>

      <section className="issue-action-card">
        <div className="issue-form">
          <div className="action-title">
            <div className="action-step">01</div>
            <div>
              <h3>Tải file CSV/Excel danh sách văn bằng</h3>
              <p>5 cột bắt buộc: mssv, ma_nganh, nam_tot_nghiep, loai_van_bang, so_hieu_van_bang.</p>
            </div>
          </div>

          <button type="button" className="outline-action" onClick={downloadTemplate}>
            <Download size={15} strokeWidth={2} /> Tải file mẫu CSV
          </button>

          <div className="issue-upload compact" style={{ marginTop: 12 }}>
            <input id="bulk-csv-input" type="file" accept=".csv,.xlsx,.xls" onChange={handleCsvChange} />
            <label htmlFor="bulk-csv-input">
              <div className="issue-upload-icon">
                <Upload size={18} strokeWidth={2} />
              </div>
              <strong>{csvFileName || "Chọn file .csv hoặc .xlsx"}</strong>
              <span>{csvRows.length > 0 ? `Đã đọc ${csvRows.length} dòng dữ liệu.` : "Chưa chọn file."}</span>
            </label>
          </div>
          {csvError && (
            <div className="issue-error-card" style={{ marginTop: 10 }}>
              <AlertTriangle size={15} strokeWidth={2} /> {csvError}
            </div>
          )}

          <div className="action-title" style={{ marginTop: 28 }}>
            <div className="action-step">02</div>
            <div>
              <h3>Chọn toàn bộ file PDF tương ứng</h3>
              <p>
                Tên mỗi file PDF phải đúng quy ước:{" "}
                <code>mssv_manganh_namtotnghiep_loaivanbang_sohieu.pdf</code> (không phân biệt hoa
                thường), khớp đúng 1 dòng trong CSV.
              </p>
            </div>
          </div>

          <div className="issue-upload compact">
            <input id="bulk-pdf-input" type="file" accept="application/pdf" multiple onChange={handlePdfChange} />
            <label htmlFor="bulk-pdf-input">
              <div className="issue-upload-icon">
                <Upload size={18} strokeWidth={2} />
              </div>
              <strong>
                {pdfFileNames.length > 0 ? `Đã chọn ${pdfFileNames.length} file PDF` : "Chọn nhiều file PDF"}
              </strong>
              <span>Giữ Ctrl/Cmd để chọn nhiều file cùng lúc.</span>
            </label>
          </div>

          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "14px 0 8px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={embedPdfSig}
              onChange={(e) => setEmbedPdfSig(e.target.checked)}
              disabled={processing || issuing}
              style={{ marginTop: 4 }}
            />
            <span style={{ fontSize: "0.9rem", lineHeight: 1.45 }}>
              <strong>Ký số PDF chuẩn X.509 / PKCS#7 cho từng file (khuyến nghị)</strong>
              <br />
              <span style={{ opacity: 0.75 }}>
                Nhúng chữ ký số vào cấu trúc từng file PDF (mở bằng Foxit/Adobe Reader sẽ hiện <em>Signature Properties</em>)
                trước khi băm và tải lên IPFS.
              </span>
            </span>
          </label>

          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "8px 0 14px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={stampQr}
              onChange={(e) => setStampQr(e.target.checked)}
              disabled={processing || issuing}
              style={{ marginTop: 4 }}
            />
            <span style={{ fontSize: "0.9rem", lineHeight: 1.45 }}>
              <strong>In thêm mã QR tra cứu vào từng PDF (tùy chọn)</strong>
              <br />
              <span style={{ opacity: 0.75 }}>
                Nếu bật, QR được in vào góc dưới bên phải trang đầu <em>trước khi</em> ký số và băm.
              </span>
            </span>
          </label>

          {liveRows.length > 0 && (
            <>
              <div className="action-title" style={{ marginTop: 28 }}>
                <div className="action-step">03</div>
                <div>
                  <h3>Kiểm tra và xử lý</h3>
                  <p>
                    {readyCount} dòng sẵn sàng, {errorCount} dòng lỗi / {liveRows.length} dòng tổng.
                  </p>
                </div>
              </div>

              <div className="history-list" style={{ marginTop: 8 }}>
                {liveRows.map((r) => {
                  const meta = STATUS_META[r.status] || { label: r.status, cls: "muted" };
                  const Icon =
                    r.status === "loi"
                      ? XCircle
                      : r.status === "san_sang" || r.status === "da_phat_hanh"
                      ? CheckCircle2
                      : r.status === "bo_qua" || r.status === "da_ton_tai"
                      ? AlertTriangle
                      : Loader2;
                  return (
                    <div
                      key={r.key + r._line}
                      className={`history-item ${meta.cls === "error" ? "history-revoked" : meta.cls === "ok" ? "history-issued" : "history-updated"}`}
                    >
                      <span className="history-item-icon">
                        <Icon size={14} strokeWidth={2.3} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="history-row">
                          <b>
                            Dòng {r._line}: {r.mssv} · {r.ma_nganh} · {r.nam_tot_nghiep} · {r.loai_van_bang} ·{" "}
                            {r.so_hieu_van_bang}
                          </b>
                          <span>{meta.label}</span>
                        </div>
                        {r.message && (
                          <div style={{ fontSize: 12, color: "var(--text-muted, #888)" }}>{r.message}</div>
                        )}
                        {r.stampedFile && (r.status === "san_sang" || r.status === "da_phat_hanh") && (
                          <button
                            type="button"
                            className="outline-action"
                            style={{ marginTop: 6, padding: "4px 10px", fontSize: 12 }}
                            onClick={() => downloadFile(r.stampedFile)}
                          >
                            <Download size={12} strokeWidth={2} /> {embedPdfSig ? "Tải PDF đã ký số" : "Tải PDF đã in QR"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="issue-submit-btn"
                  disabled={processing || issuing || readyCount === 0}
                  onClick={handleProcess}
                >
                  {processing ? (
                    <>
                      <Loader2 size={16} strokeWidth={2} className="spin" /> Đang băm &amp; tải lên...
                    </>
                  ) : (
                    <>
                      <PlayCircle size={16} strokeWidth={2} /> Băm &amp; tải lên IPFS ({readyCount} dòng)
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="issue-submit-btn"
                  disabled={!anyReadyToIssue || processing || issuing}
                  onClick={handleIssueBatch}
                >
                  {issuing ? (
                    <>
                      <Loader2 size={16} strokeWidth={2} className="spin" /> Đang gửi giao dịch...
                    </>
                  ) : (
                    <>Phát hành hàng loạt lên Blockchain</>
                  )}
                </button>

                {stampedRows.length > 0 && (
                  <button type="button" className="outline-action" onClick={downloadAllStamped} disabled={processing || issuing}>
                    <Download size={14} strokeWidth={2} /> {embedPdfSig ? "Tải tất cả PDF đã ký số" : "Tải tất cả PDF đã in QR"} ({stampedRows.length})
                  </button>
                )}

                <button type="button" className="outline-action" onClick={resetAll} disabled={processing || issuing}>
                  Làm lại từ đầu
                </button>
              </div>

              {allProcessed && !anyReadyToIssue && !batchTxHash && !processing && (
                <div className="history-note-box" style={{ marginTop: 12 }}>
                  Không có văn bằng mới để phát hành (các dòng đã tồn tại hoặc bị lỗi).
                </div>
              )}

              {batchError && (
                <div className="issue-error-card" style={{ marginTop: 14 }}>
                  <AlertTriangle size={15} strokeWidth={2} /> {batchError}
                </div>
              )}

              {batchTxHash && (
                <div className="issue-success-card" style={{ marginTop: 14 }}>
                  <div className="success-icon">
                    <CheckCircle2 size={18} strokeWidth={2} />
                  </div>
                  <div>
                    <strong>Đã gửi giao dịch hàng loạt thành công!</strong>
                    <p>Đã phát hành: {rows.filter((r) => r.status === "da_phat_hanh").length} · Bỏ qua (đã tồn tại): {rows.filter((r) => r.status === "bo_qua" || r.status === "da_ton_tai").length} · Lỗi: {rows.filter((r) => r.status === "loi").length}</p>
                    <p>
                      <a href={explorerTxUrl(batchTxHash)} target="_blank" rel="noreferrer">
                        Xem trên PolygonScan
                        <ExternalLink
                          size={12}
                          strokeWidth={2}
                          style={{ display: "inline", verticalAlign: "middle", marginLeft: 4 }}
                        />
                      </a>
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
