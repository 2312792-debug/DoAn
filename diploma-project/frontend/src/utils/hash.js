/**
 * Tinh mã băm SHA-256 cua 1 file (dung Web Crypto API co san tren trinh duyet),
 * roi tra ve dang bytes32 hex de dua vao smart contract.
 */
export async function computeFileHash(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "0x" + hex;
}
