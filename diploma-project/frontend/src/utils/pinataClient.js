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

function base64ToPdfFile(base64, fileName) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], fileName, { type: "application/pdf", lastModified: Date.now() });
}

/**
 * Ky so X.509 / PKCS#7 nhung vao PDF o backend (mo bang Foxit/Adobe Reader hien
 * Signature Properties), roi tinh SHA-256 + ma hoa AES + day len IPFS.
 * Tra ve { cid, fileHash, signedFile }.
 */
export async function signAndUploadPdfToIpfs(file, diplomaId) {
  if (!diplomaId) {
    throw new Error("Thieu diplomaId khi ky so va tai file.");
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("diplomaId", diplomaId);

  const res = await fetch(`${BACKEND_URL}/api/sign-and-upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Ky so hoac tai file len IPFS that bai.");
  }

  const data = await res.json();
  return {
    cid: data.cid,
    fileHash: data.fileHash,
    signedFile: base64ToPdfFile(data.signedPdfBase64, file.name),
  };
}

/** Kiem tra chu ky so X.509 / PKCS#7 nhung ben trong file PDF (neu backend dang chay). */
export async function verifyPdfEmbeddedSignature(file) {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BACKEND_URL}/api/verify-pdf-signature`, {
      method: "POST",
      body: formData,
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function schoolCertDownloadUrl() {
  return `${BACKEND_URL}/api/pdf-cert`;
}
