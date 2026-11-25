// Chu ky so cua nha truong (ECDSA secp256k1, ky chuan EIP-191 bang ethers).
// Khoa ky chi nam o server nay. Chi nguoi giu khoa moi tao duoc chu ky hop le -> website khac khong gia mao duoc.
// Ben xac minh doi chieu "dia chi ky" voi dia chi CHINH THUC ma nha truong cong bo.
const { Wallet, verifyMessage } = require("ethers");
const fs = require("fs");
const path = require("path");

function loadWallet() {
  let key = (process.env.SIGNING_PRIVATE_KEY || "").trim();
  if (!key) {
    const keyFile = path.join(path.dirname(process.env.DB_PATH || path.join(__dirname, "data", "x")), "signer.key");
    if (fs.existsSync(keyFile)) key = fs.readFileSync(keyFile, "utf8").trim();
    else {
      key = Wallet.createRandom().privateKey;
      fs.mkdirSync(path.dirname(keyFile), { recursive: true });
      fs.writeFileSync(keyFile, key, { mode: 0o600 });
      console.warn("[signer] Chua co SIGNING_PRIVATE_KEY -> da tu tao khoa ky moi tai", keyFile, "(hay sao luu file nay!)");
    }
  }
  return new Wallet(key.startsWith("0x") ? key : "0x" + key);
}
const wallet = loadWallet();

const STATUS_TEXT = { 1: "Valid", 2: "Revoked" };

/** Thong diep chuan hoa duoc ky (moi dong 1 truong) - frontend dung lai de doi chieu voi du lieu tren chuoi. */
function buildMessage({ chainId, contract, diplomaId, fileHash, cid, issuer, status, at }) {
  return [
    "DIPLOMA-ATTESTATION v1",
    `chain:${chainId}`,
    `contract:${String(contract).toLowerCase()}`,
    `diplomaId:${String(diplomaId).toLowerCase()}`,
    `fileHash:${String(fileHash).toLowerCase()}`,
    `cid:${cid}`,
    `issuer:${String(issuer).toLowerCase()}`,
    `status:${STATUS_TEXT[status] || "Unknown"}`,
    `at:${at}`,
  ].join("\n");
}
async function signRecord(fields) {
  const message = buildMessage(fields);
  const signature = await wallet.signMessage(message);
  return { message, signature, signer: wallet.address };
}
function verifyAttestation(message, signature, expectedSigner) {
  const recovered = verifyMessage(message, signature);
  return { recovered, valid: !expectedSigner || recovered.toLowerCase() === expectedSigner.toLowerCase() };
}
module.exports = { wallet, signerAddress: wallet.address, buildMessage, signRecord, verifyAttestation };
