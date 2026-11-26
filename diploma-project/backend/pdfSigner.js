const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const forge = require("node-forge");
const { PDFDocument } = require("pdf-lib");
const signpdf = require("@signpdf/signpdf").default;
const { pdflibAddPlaceholder } = require("@signpdf/placeholder-pdf-lib");
const { P12Signer } = require("@signpdf/signer-p12");

const DEFAULT_CERT_PATH = path.join(__dirname, "data", "school-cert.p12");
const DEFAULT_CER_PATH = path.join(__dirname, "data", "school-cert.cer");
const CERT_PASSWORD = process.env.PDF_CERT_PASSWORD || "dlu-diploma-2026";
const CERT_PATH = process.env.PDF_CERT_PATH || DEFAULT_CERT_PATH;
const CER_PATH = path.join(path.dirname(CERT_PATH), "school-cert.cer");

let _cached = null;

function certFingerprintSha256(cert) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return crypto.createHash("sha256").update(Buffer.from(der, "binary")).digest("hex");
}

function loadOrCreateSchoolCert() {
  if (_cached) return _cached;

  if (fs.existsSync(CERT_PATH)) {
    const p12Buffer = fs.readFileSync(CERT_PATH);
    const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString("binary"));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, CERT_PASSWORD);
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
    const cert = certBags && certBags[0] ? certBags[0].cert : null;
    if (!cert) throw new Error("Khong doc duoc chung thu X.509 trong file .p12");
    if (!fs.existsSync(CER_PATH)) {
      fs.writeFileSync(CER_PATH, forge.pki.certificateToPem(cert), "utf8");
    }
    _cached = {
      p12Buffer,
      cert,
      certPem: forge.pki.certificateToPem(cert),
      fingerprint: certFingerprintSha256(cert),
    };
    return _cached;
  }

  // Tu tao chung thu so X.509 (RSA 2048-bit) cho nha truong neu chua co.
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01" + crypto.randomBytes(6).toString("hex");
  cert.validity.notBefore = new Date(Date.now() - 60000);
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5);

  const attrs = [
    { name: "commonName", value: "Truong Dai hoc Da Lat (DLU)" },
    { name: "organizationName", value: "Truong Dai hoc Da Lat" },
    { shortName: "OU", value: "Phong Dao tao" },
    { name: "countryName", value: "VN" },
    { name: "emailAddress", value: "daotao@dlu.edu.vn" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, nonRepudiation: true },
    { name: "extKeyUsage", emailProtection: true, codeSigning: true },
    { name: "subjectKeyIdentifier" },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], CERT_PASSWORD, {
    algorithm: "3des",
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  const p12Buffer = Buffer.from(p12Der, "binary");
  const certPem = forge.pki.certificateToPem(cert);

  fs.mkdirSync(path.dirname(CERT_PATH), { recursive: true });
  fs.writeFileSync(CERT_PATH, p12Buffer, { mode: 0o600 });
  fs.writeFileSync(CER_PATH, certPem, "utf8");
  console.log("[pdfSigner] Da tao chung thu so X.509 moi tai", CERT_PATH);

  _cached = {
    p12Buffer,
    cert,
    certPem,
    fingerprint: certFingerprintSha256(cert),
  };
  return _cached;
}

/**
 * Ky so PDF chuan PKCS#7 / X.509 (/adbe.pkcs7.detached) voi vung ky trong suot
 * dat ngay tai khu vuc con dau / chu ky goc phai duoi trang cuoi.
 * Khong ve khung vien hay chu de len van bang (giu 100% giao dien goc), dong thoi
 * khi mo bang Foxit Reader / Adobe Acrobat, bam truc tiep vao con dau / chu ky
 * hoac mo panel Digital Signatures deu hien hop thoai Signature Properties.
 */
async function signPdfBuffer(pdfBuffer, { diplomaId = "", reason, location } = {}) {
  const { p12Buffer } = loadOrCreateSchoolCert();
  const now = new Date();

  const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false });
  const pages = pdfDoc.getPages();
  const targetPage = pages[pages.length - 1];
  const { width, height } = targetPage.getSize();
  const widgetRect = [
    Math.round(width * 0.52),
    Math.round(height * 0.17),
    Math.round(width * 0.88),
    Math.round(height * 0.37),
  ];

  pdflibAddPlaceholder({
    pdfDoc,
    pdfPage: targetPage,
    reason: reason || `Xac thuc van bang dien tu chinh thuc - DLU${diplomaId ? " (" + diplomaId.slice(0, 14) + "...)" : ""}`,
    contactInfo: "daotao@dlu.edu.vn",
    name: "Truong Dai hoc Da Lat (DLU)",
    location: location || "Da Lat, Lam Dong, VN",
    signingTime: now,
    widgetRect,
    appName: "DiplomaChain DLU",
  });

  const pdfWithPlaceholder = await pdfDoc.save({ useObjectStreams: false });
  const signer = new P12Signer(p12Buffer, { passphrase: CERT_PASSWORD });
  return signpdf.sign(Buffer.from(pdfWithPlaceholder), signer);
}

function derSlice(buf) {
  if (!buf || buf.length < 2 || buf[0] !== 0x30) return buf;
  const lenByte = buf[1];
  if ((lenByte & 0x80) === 0) return buf.subarray(0, 2 + lenByte);
  const numBytes = lenByte & 0x7f;
  let len = 0;
  for (let i = 0; i < numBytes; i++) len = (len << 8) | buf[2 + i];
  return buf.subarray(0, 2 + numBytes + len);
}

function getFieldVal(attrs, name) {
  const f = attrs && attrs.getField ? attrs.getField(name) : null;
  return f ? f.value : "";
}

/**
 * Doc va kiem tra chu ky so PKCS#7 / X.509 nhung ben trong 1 file PDF.
 */
function inspectPdfSignature(pdfBuffer) {
  if (!Buffer.isBuffer(pdfBuffer)) return { hasSignature: false };
  const str = pdfBuffer.toString("latin1");
  const brMatch = str.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
  if (!brMatch) {
    return { hasSignature: false };
  }

  const [, s1, l1, s2, l2] = brMatch.map(Number);
  if (s1 + l1 > s2 || s2 + l2 > pdfBuffer.length) {
    return { hasSignature: true, intact: false, error: "ByteRange khong hop le." };
  }

  const contentSlice = str.slice(s1 + l1, s2);
  const hexMatch = contentSlice.match(/<([0-9a-fA-F]+)>/);
  if (!hexMatch) {
    return { hasSignature: true, intact: false, error: "Khong tim thay noi dung chu ky PKCS#7." };
  }

  try {
    const p7Bytes = derSlice(Buffer.from(hexMatch[1], "hex"));
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(p7Bytes));
    const p7 = forge.pkcs7.messageFromAsn1(asn1);

    const signedBytes = Buffer.concat([pdfBuffer.subarray(s1, s1 + l1), pdfBuffer.subarray(s2, s2 + l2)]);
    const digestAlgoOid = forge.asn1.derToOid(p7.rawCapture.digestAlgorithm);
    const algoName = digestAlgoOid === forge.pki.oids.sha256 ? "sha256" : digestAlgoOid === forge.pki.oids.sha1 ? "sha1" : "sha256";
    const dataDigest = crypto.createHash(algoName).update(signedBytes).digest();

    const attrs = p7.rawCapture.authenticatedAttributes;
    let msgDigest = null;
    let signingTime = null;
    if (Array.isArray(attrs)) {
      for (const a of attrs) {
        const oid = forge.asn1.derToOid(a.value[0].value);
        if (oid === forge.pki.oids.messageDigest) {
          msgDigest = Buffer.from(a.value[1].value[0].value, "binary");
        } else if (oid === forge.pki.oids.signingTime) {
          const valNode = a.value[1].value[0];
          signingTime = valNode && valNode.value ? String(valNode.value) : null;
        }
      }
    }

    const cert = p7.certificates && p7.certificates[0];
    if (!cert) {
      return { hasSignature: true, intact: false, error: "Khong tim thay chung thu X.509 trong chu ky." };
    }

    const certPem = forge.pki.certificateToPem(cert);
    const setAsn1 = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrs);
    const setDer = Buffer.from(forge.asn1.toDer(setAsn1).getBytes(), "binary");
    const verifyAlgo = algoName === "sha1" ? "RSA-SHA1" : "RSA-SHA256";
    const rsaOk = crypto.createVerify(verifyAlgo).update(setDer).verify(certPem, Buffer.from(p7.rawCapture.signature, "binary"));
    const digestMatch = Boolean(msgDigest && dataDigest.equals(msgDigest));
    const fullCover = s1 === 0 && s2 + l2 === pdfBuffer.length;
    const intact = fullCover && digestMatch && rsaOk;

    const fingerprint = certFingerprintSha256(cert);
    const school = loadOrCreateSchoolCert();
    const matchesSchoolCert = fingerprint === school.fingerprint;

    const reasonMatch = str.match(/\/Reason\s*\(([^)]*)\)/);
    const locationMatch = str.match(/\/Location\s*\(([^)]*)\)/);

    return {
      hasSignature: true,
      intact,
      fullCover,
      digestMatch,
      rsaOk,
      matchesSchoolCert,
      signer: getFieldVal(cert.subject, "CN") || getFieldVal(cert.subject, "O") || "Unknown",
      organization: getFieldVal(cert.subject, "O") || "",
      email: getFieldVal(cert.subject, "E") || getFieldVal(cert.subject, "emailAddress") || "",
      issuer: getFieldVal(cert.issuer, "CN") || getFieldVal(cert.issuer, "O") || "",
      reason: reasonMatch ? reasonMatch[1] : "",
      location: locationMatch ? locationMatch[1] : "",
      signingTime,
      validFrom: cert.validity.notBefore.toISOString(),
      validTo: cert.validity.notAfter.toISOString(),
      certFingerprint: fingerprint,
    };
  } catch (e) {
    return { hasSignature: true, intact: false, error: "Loi phan tich chu ky PKCS#7: " + e.message };
  }
}

module.exports = {
  loadOrCreateSchoolCert,
  signPdfBuffer,
  inspectPdfSignature,
  CERT_PATH,
  CER_PATH,
};

