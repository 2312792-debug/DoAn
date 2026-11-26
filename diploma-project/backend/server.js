require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const { encryptBuffer, decryptBuffer } = require("./crypto");
const mountDbRoutes = require("./routes-db");
const indexer = require("./indexer");

const app = express();
const PORT = process.env.PORT || 4000;
const PINATA_JWT = process.env.PINATA_JWT || "";
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const DIPLOMA_ID_RE = /^0x[0-9a-fA-F]{64}$/;

const allowedOrigins = FRONTEND_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.includes("*")
      ? "*"
      : allowedOrigins.length === 1
      ? allowedOrigins[0]
      : allowedOrigins,
  })
);
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("CHI_CHAP_NHAN_PDF"));
    }
    cb(null, true);
  },
});

// Kiem tra "chu ky" (magic bytes) that cua file PDF, thay vi chi tin vao Content-Type
// do client tu khai bao trong multer.fileFilter (de dang gia mao bang curl/script).
// Moi file PDF hop le luon bat dau bang 5 byte ASCII "%PDF-".
function isRealPdf(buffer) {
  if (!buffer || buffer.length < 5) return false;
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "diploma-backend", time: new Date().toISOString() });
});

// Nhan file PDF tu frontend, MA HOA (AES-256-GCM, khoa suy ra tu diplomaId) roi moi
// chuyen tiep len Pinata bang JWT giu kin o server (khong lo ra frontend). Ly do ma hoa:
// CID tren IPFS la cong khai - ai biet CID (vd do quet event tren chain) cung tai duoc
// noi dung neu khong ma hoa. Sau khi ma hoa, phai biet dung diplomaId moi giai ma duoc.
app.post("/api/upload", (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      const message =
        err.message === "CHI_CHAP_NHAN_PDF"
          ? "Chi chap nhan file PDF."
          : err.code === "LIMIT_FILE_SIZE"
          ? "File vuot qua dung luong cho phep (toi da 15MB)."
          : "File khong hop le: " + err.message;
      return res.status(400).json({ error: message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: "Thieu file PDF." });
      }
      const diplomaId = req.body.diplomaId;
      if (!diplomaId || !DIPLOMA_ID_RE.test(diplomaId)) {
        return res.status(400).json({ error: "Thieu hoac sai dinh dang diplomaId (can bytes32 0x...)." });
      }
      if (!isRealPdf(req.file.buffer)) {
        return res.status(400).json({
          error: "Noi dung file khong phai PDF hop le (sai dinh dang thuc te, du Content-Type khai bao la PDF).",
        });
      }
      if (!PINATA_JWT) {
        return res.status(500).json({ error: "Server chua cau hinh PINATA_JWT." });
      }

      let encrypted;
      try {
        encrypted = encryptBuffer(req.file.buffer, diplomaId);
      } catch (encErr) {
        console.error("Loi ma hoa:", encErr.message);
        return res.status(500).json({ error: "Loi ma hoa file phia server: " + encErr.message });
      }

      const formData = new FormData();
      // Dat ten file .enc + octet-stream vi noi dung gio la ciphertext, khong con la PDF that.
      formData.append("file", encrypted, { filename: diplomaId + ".enc", contentType: "application/octet-stream" });

      const pinataRes = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        formData,
        {
          maxBodyLength: Infinity,
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${PINATA_JWT}`,
          },
        }
      );

      return res.json({ cid: pinataRes.data.IpfsHash });
    } catch (uploadErr) {
      console.error("Loi upload len Pinata:", uploadErr.message);
      return res.status(502).json({ error: "Khong the tai file len IPFS luc nay. Thu lai sau." });
    }
  });
});

// Tai va GIAI MA lai ban goc cho nguoi xac minh: can biet dung diplomaId (tuc la biet
// dung 5 truong dinh danh van bang - dieu kien nhu khi goi verify()/getDiploma() tren
// contract) thi moi giai ma duoc, ke ca khi ho co san CID.
app.get("/api/diplomas/:diplomaId/file", async (req, res) => {
  const { diplomaId } = req.params;
  const { cid } = req.query;

  if (!DIPLOMA_ID_RE.test(diplomaId || "")) {
    return res.status(400).json({ error: "diplomaId khong hop le." });
  }
  if (!cid || typeof cid !== "string") {
    return res.status(400).json({ error: "Thieu tham so cid." });
  }

  try {
    const gatewayRes = await axios.get(`${PINATA_GATEWAY}/${encodeURIComponent(cid)}`, {
      responseType: "arraybuffer",
      timeout: 20000,
    });
    const encrypted = Buffer.from(gatewayRes.data);

    let decrypted;
    try {
      decrypted = decryptBuffer(encrypted, diplomaId);
    } catch (decErr) {
      console.error("Loi giai ma:", decErr.message);
      return res.status(400).json({
        error: "Khong giai ma duoc file - diplomaId va CID co the khong khop, hoac du lieu tren IPFS da bi hong.",
      });
    }

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${diplomaId}.pdf"`,
    });
    return res.send(decrypted);
  } catch (fetchErr) {
    console.error("Loi tai tu IPFS gateway:", fetchErr.message);
    return res.status(502).json({ error: "Khong the tai du lieu tu IPFS gateway luc nay. Thu lai sau." });
  }
});

// Middleware bat loi chung - dam bao server khong bao gio crash vi loi khong luong truoc.
mountDbRoutes(app);

app.use((err, req, res, next) => {
  console.error("Loi khong xu ly:", err);
  res.status(500).json({ error: "Loi server noi bo." });
});

app.listen(PORT, () => {
  console.log(`Backend dang chay tai http://localhost:${PORT}`);
  console.log("Dia chi ky so CHINH THUC cua nha truong:", require("./signer").signerAddress, "(dat vao VITE_SIGNER_ADDRESS cua frontend)");
  indexer.start();
});
