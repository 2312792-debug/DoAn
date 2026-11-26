import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

/**
 * In ma QR (link xac minh) vao goc duoi ben phai TRANG DAU cua file PDF.
 *
 * VI SAO: chu ky so hien la file .json di kem, khong nam trong PDF. Co QR trong PDF thi chi can
 * cam file PDF la quet duoc, vao thang trang Xac minh cua nha truong (tren do co chu ky so).
 * QR chi la DUONG DAN toi noi kiem tra, KHONG phai chu ky.
 *
 * QUAN TRONG: phai goi ham nay TRUOC khi bam SHA-256 va tai len IPFS, roi bam/tai CHINH file tra ve
 * (khong in lai lan 2). Neu in QR sau khi da ghi hash len chuoi thi byte file doi -> hash khong khop.
 * Ban PDF co QR cung chinh la ban phai phat cho sinh vien va dung de doi chieu luc xac minh.
 *
 * Dia chi trong QR: bien VITE_PUBLIC_URL (dia chi website CHINH THUC cua truong, vd https://xacminh.dlu.edu.vn),
 * neu khong dat thi dung dia chi trang dang mo (chi phu hop luc demo/localhost).
 */
export function buildVerifyUrl(diplomaId) {
  const base = (import.meta.env.VITE_PUBLIC_URL || window.location.origin).trim().replace(/\/+$/, "");
  return `${base}/?verify=${diplomaId}`;
}

export async function stampQrOnPdf(file, diplomaId) {
  const src = new Uint8Array(await file.arrayBuffer());

  let pdf;
  try {
    // updateMetadata:false de khong tu ghi them ngay gio/Producer vao file ngoai phan QR.
    pdf = await PDFDocument.load(src, { updateMetadata: false });
  } catch {
    throw new Error(
      `Không đọc được file "${file.name}" để in mã QR (file có thể bị mã hoá hoặc hỏng). ` +
        "Có thể bỏ chọn \"In mã QR vào PDF\" để dùng nguyên bản."
    );
  }

  const url = buildVerifyUrl(diplomaId);
  const qrDataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 360 });
  const qrImage = await pdf.embedPng(qrDataUrl);
  const font = await pdf.embedFont(StandardFonts.Helvetica); // Helvetica chuan chi co ASCII -> chu thich khong dau

  const page = pdf.getPage(0);
  const box = page.getCropBox(); // vung nhin thay duoc cua trang (mac dinh = MediaBox)
  const MARGIN = 16;
  const QR = 64;
  const PAD = 4;
  const CAPTION = "Scan to verify";
  const CAP_SIZE = 6;

  const boxW = QR + PAD * 2;
  const boxH = QR + PAD * 2 + CAP_SIZE + 3;
  const x = box.x + box.width - MARGIN - boxW;
  const y = box.y + MARGIN;

  // Nen trang de QR luon doc duoc du trang goc co mau/hoa van o goc do.
  page.drawRectangle({ x, y, width: boxW, height: boxH, color: rgb(1, 1, 1), borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
  page.drawImage(qrImage, { x: x + PAD, y: y + PAD + CAP_SIZE + 3, width: QR, height: QR });
  const capW = font.widthOfTextAtSize(CAPTION, CAP_SIZE);
  page.drawText(CAPTION, { x: x + (boxW - capW) / 2, y: y + PAD, size: CAP_SIZE, font, color: rgb(0.3, 0.3, 0.3) });

  const out = await pdf.save();
  return new File([out], file.name, { type: "application/pdf", lastModified: Date.now() });
}

/** Cho nguoi dung tai 1 File ve may (dung de tai ban PDF da in QR de phat cho sinh vien). */
export function downloadFile(file, downloadName) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName || file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const DIPLOMA_ID_RE = /^0x[0-9a-fA-F]{64}$/;

/** Doc diplomaId tu link QR (?verify=0x...). Tra ve "" neu khong co / sai dinh dang. */
export function diplomaIdFromUrl(search = window.location.search) {
  const v = new URLSearchParams(search).get("verify") || "";
  return DIPLOMA_ID_RE.test(v) ? v.toLowerCase() : "";
}
