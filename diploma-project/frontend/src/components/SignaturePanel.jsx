import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, Download, Copy, Check, ExternalLink } from "lucide-react";
import { getReadOnlyContract, fetchAttestationRecord, checkAttestation } from "../utils/contract";

/** Hien chu ky so cua nha truong cho 1 van bang va tu kiem tra ngay trong trinh duyet. */
export default function SignaturePanel({ diplomaId }) {
  const [state, setState] = useState({ loading: true });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const rec = await fetchAttestationRecord(diplomaId);
        if (!rec || !rec.attestation) {
          if (!cancelled) setState({ loading: false, none: true });
          return;
        }
        const chain = await getReadOnlyContract().getDiploma(diplomaId);
        const chk = checkAttestation(rec.attestation, chain);
        if (!cancelled) setState({ loading: false, rec, chain, chk });
      } catch (e) {
        console.error(e);
        if (!cancelled) setState({ loading: false, none: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [diplomaId]);

  if (state.loading) return <div className="history-note-box">Đang kiểm tra chữ ký số...</div>;
  if (state.none) {
    return (
      <div className="history-note-box">
        Chưa có chữ ký số cho văn bằng này (Backend chưa đồng bộ hoặc không chạy). Việc xác minh bằng Blockchain ở trên vẫn đúng.
      </div>
    );
  }
  const { rec, chk } = state;
  const isRevoked = rec.status === "Revoked" || Number(state.chain?.status) === 2;
  const good = chk.signatureOk && chk.dataOk && chk.officialOk !== false;

  const mycryptoPayload = {
    address: rec.attestation.signer,
    msg: rec.attestation.message,
    sig: rec.attestation.signature,
    version: "2",
  };

  const copyMyCrypto = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(mycryptoPayload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert("Không thể tự động sao chép. Bạn có thể tải file .json bên cạnh.");
    }
  };

  const download = () => {
    const payload = {
      _tieuDe: "CHỨNG NHẬN XÁC THỰC VĂN BẰNG ĐIỆN TỬ (CHỮ KÝ SỐ MẬT MÃ EIP-191)",
      huongDanKiemTraOnline: {
        trangWebTest: "https://app.mycrypto.com/verify-message",
        cachThucHien:
          "Bước 1: Mở link trên -> Bước 2: Sao chép toàn bộ khối 'duLieuDanVaoMyCrypto' ở bên dưới -> Bước 3: Dán vào ô 'Signature' rồi bấm 'Verify Message'.",
        diaChiNhaTruongChinhThuc: rec.attestation.signer,
        ketQuaMongDoi: `${rec.attestation.signer} did sign this message`,
      },
      duLieuDanVaoMyCrypto: mycryptoPayload,
      thongTinChiTiet: {
        diplomaId,
        status: rec.status,
        fileHash: rec.fileHash,
        cid: rec.cid,
        issuer: rec.issuer,
        attestation: rec.attestation,
      },
      kiemTraOfflineBangNodeJS:
        "const { ethers } = require('ethers'); const signer = ethers.verifyMessage(data.thongTinChiTiet.attestation.message, data.thongTinChiTiet.attestation.signature); console.log('Dia chi ky:', signer);",
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "chung-nhan-xac-thuc.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const Icon = !good ? ShieldAlert : isRevoked ? ShieldAlert : ShieldCheck;
  const borderColor = !good ? "#fca5a5" : isRevoked ? "#fdba74" : "#86efac";
  const bgColor = !good ? "#fef2f2" : isRevoked ? "#fff7ed" : "#f0fdf4";

  return (
    <div
      className="admin-note"
      style={{ marginBottom: 20, borderColor, background: bgColor }}
    >
      <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={18} strokeWidth={2.2} color={!good ? "#dc2626" : isRevoked ? "#ea580c" : "#16a34a"} />
        {!good
          ? "Cảnh báo: chữ ký số KHÔNG hợp lệ"
          : isRevoked
          ? "Chữ ký số nhà trường: XÁC THỰC QUYẾT ĐỊNH THU HỒI"
          : "Chữ ký số của nhà trường: HỢP LỆ (Văn bằng đang có hiệu lực)"}
      </strong>
      <p>
        {!good
          ? "Chữ ký không khớp với dữ liệu trên Blockchain hoặc khóa ký không chính chủ."
          : isRevoked
          ? "Chữ ký số mật mã xác nhận: Nhà trường đã chính thức ký quyết định thu hồi văn bằng này. Chữ ký hợp lệ chứng minh việc thu hồi là quyết định thực tế từ chính chủ nhà trường (không phải lỗi hệ thống hay can thiệp trái phép)."
          : "Chữ ký tạo bằng khoá riêng của nhà trường đặt trên máy chủ hệ thống; website khác không có khoá nên không tạo được chữ ký hợp lệ. Trình duyệt tự kiểm tra, không tin Backend."}
      </p>
      <p>
        • Chữ ký đúng với địa chỉ ký: <b>{chk.signatureOk ? "Có" : "Không"}</b> · Khớp dữ liệu trên Blockchain (mã băm, CID,
        người phát hành, trạng thái): <b>{chk.dataOk ? "Có" : "Không"}</b>
        {chk.officialOk === null ? null : (
          <>
            {" "}
            · Đúng địa chỉ chính thức đã công bố: <b>{chk.officialOk ? "Có" : "KHÔNG"}</b>
          </>
        )}
      </p>
      <p>
        Địa chỉ ký: <code>{chk.recovered}</code>
        {chk.officialOk === null && <> — hãy đối chiếu với địa chỉ chính thức do nhà trường công bố.</>}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 10 }}>
        <button className="outline-action" onClick={download}>
          <Download size={14} strokeWidth={2} />
          {isRevoked ? "Tải chứng nhận thu hồi (.json)" : "Tải chứng nhận xác thực (.json)"}
        </button>
        <button className="outline-action" onClick={copyMyCrypto} style={{ background: copied ? "#dcfce7" : undefined }}>
          {copied ? <Check size={14} color="#16a34a" /> : <Copy size={14} strokeWidth={2} />}
          {copied ? "Đã chép mã MyCrypto!" : "Sao chép mã kiểm tra (MyCrypto)"}
        </button>
        <a
          href="https://app.mycrypto.com/verify-message"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: "0.88rem",
            color: "#2563eb",
            fontWeight: 500,
            textDecoration: "underline",
          }}
        >
          <ExternalLink size={13} /> Mở trang MyCrypto để kiểm tra ↗
        </a>
      </div>
    </div>
  );
}
