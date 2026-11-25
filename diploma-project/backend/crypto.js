const crypto = require("crypto");

// Ma hoa noi dung PDF truoc khi luu len IPFS (cong khai), de nguoi la khong the
// tai/doc noi dung that neu chi co CID (vd do quet/liet ke event tren chain).
// Muon giai ma phai biet dung diplomaId (5 truong dinh danh van bang - cung dieu
// kien nhu khi goi verify()/getDiploma()), CONG VOI FILE_ENC_MASTER_KEY chi server co.
//
// Key rieng cho tung van bang duoc SUY RA (khong luu DB rieng) bang scrypt tu
// (master secret + diplomaId) -> luon deterministic, decrypt lai duoc bat ky luc nao
// chi can biet diplomaId, khong can luu tru key rieng le cho tung ban ghi.

const MAGIC = Buffer.from("DENC");
const VERSION = 1;
const IV_LEN = 12; // AES-GCM chuan
const TAG_LEN = 16;

function deriveKey(diplomaId) {
  const masterSecret = process.env.FILE_ENC_MASTER_KEY || "";
  if (!masterSecret) {
    throw new Error("FILE_ENC_MASTER_KEY chua duoc cau hinh tren server (.env).");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(diplomaId || "")) {
    throw new Error("diplomaId khong hop le (can dung dinh dang bytes32 0x...64 hex).");
  }
  // scrypt(salt=diplomaId) -> moi van bang co key rieng, nhung deu suy ra tu 1 secret goc.
  return crypto.scryptSync(masterSecret, diplomaId.toLowerCase(), 32);
}

/// Ma hoa 1 buffer PDF goc. Tra ve buffer da dong goi: [MAGIC(4)][version(1)][iv(12)][authTag(16)][ciphertext].
function encryptBuffer(plainBuffer, diplomaId) {
  const key = deriveKey(diplomaId);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), iv, authTag, ciphertext]);
}

/// Giai ma buffer da dong goi boi encryptBuffer. Nem loi neu sai key/du lieu bi hong
/// (AES-GCM tu phat hien sai authTag - khong tra ve rac ma bao loi ro rang).
function decryptBuffer(packedBuffer, diplomaId) {
  const key = deriveKey(diplomaId);
  if (packedBuffer.length < MAGIC.length + 1 + IV_LEN + TAG_LEN) {
    throw new Error("Du lieu ma hoa khong hop le (qua ngan).");
  }
  const magic = packedBuffer.subarray(0, MAGIC.length);
  if (!magic.equals(MAGIC)) {
    throw new Error("Sai dinh dang: khong phai du lieu da ma hoa boi he thong nay.");
  }
  let offset = MAGIC.length;
  const version = packedBuffer[offset];
  offset += 1;
  if (version !== VERSION) {
    throw new Error("Phien ban ma hoa khong duoc ho tro: " + version);
  }
  const iv = packedBuffer.subarray(offset, offset + IV_LEN);
  offset += IV_LEN;
  const authTag = packedBuffer.subarray(offset, offset + TAG_LEN);
  offset += TAG_LEN;
  const ciphertext = packedBuffer.subarray(offset);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  // Neu sai key hoac du lieu bi sua -> final() se throw (GCM tu xac thuc toan ven).
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

module.exports = { encryptBuffer, decryptBuffer, deriveKey };
