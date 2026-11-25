const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

/**
 * Goi backend (giu kin JWT cua Pinata) de MA HOA (AES-256-GCM, xem backend/crypto.js)
 * roi tai file PDF len IPFS. Can truyen dung diplomaId vi khoa ma hoa duoc suy ra tu
 * chinh diplomaId - sai diplomaId se khong giai ma lai duoc ve sau.
 * Khong bao gio goi thang Pinata tu frontend de tranh lo API key.
 */
export async function uploadPdfToIpfs(file, diplomaId) {
  if (!diplomaId) {
    throw new Error("Thieu diplomaId khi tai file (can de ma hoa dung khoa).");
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("diplomaId", diplomaId);

  const res = await fetch(`${BACKEND_URL}/api/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Tai file len IPFS that bai.");
  }

  const data = await res.json();
  return { cid: data.cid };
}
