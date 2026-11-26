const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

process.env.PDF_CERT_PATH = path.join(os.tmpdir(), `pdfcert-test-${Date.now()}`, "school-cert.p12");

const { signPdfBuffer, inspectPdfSignature, loadOrCreateSchoolCert } = require("../pdfSigner");

async function run() {
  const school = loadOrCreateSchoolCert();
  assert.ok(school.fingerprint && school.fingerprint.length === 64, "Phai tao duoc chung thu X.509 hop le");

  const samplePdf = fs.readFileSync(path.join(__dirname, "..", "..", "samples", "mau-van-bang-2312792-goc.pdf"));
  const diplomaId = "0x" + "ab".repeat(32);

  // 1. File chua ky -> hasSignature: false
  const unsignedInfo = inspectPdfSignature(samplePdf);
  assert.strictEqual(unsignedInfo.hasSignature, false);
  console.log("OK  - file PDF goc chua ky -> hasSignature = false");

  // 2. Ky so PDF -> co chu ky PKCS#7, nguyen ven va khop chung thu nha truong
  const signedPdf = await signPdfBuffer(samplePdf, { diplomaId });
  const verified = inspectPdfSignature(signedPdf);
  assert.strictEqual(verified.hasSignature, true);
  assert.strictEqual(verified.intact, true);
  assert.strictEqual(verified.matchesSchoolCert, true);
  assert.ok(verified.signer.includes("Da Lat"));
  console.log("OK  - ky so PDF -> PKCS#7 nguyen ven (intact = true) va khop chung thu nha truong");

  // 3. Sua 1 byte trong PDF da ky -> phai phat hien mat toan ven (intact = false)
  const tampered = Buffer.from(signedPdf);
  tampered[120] = tampered[120] ^ 0xff;
  const tamperedInfo = inspectPdfSignature(tampered);
  assert.strictEqual(tamperedInfo.hasSignature, true);
  assert.strictEqual(tamperedInfo.intact, false);
  console.log("OK  - sua 1 byte sau khi ky so -> phat hien hong chu ky (intact = false)");

  console.log("=== pdfSigner tests done ===");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});

