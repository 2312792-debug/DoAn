const { q, getMeta } = require("./db");
const { signerAddress } = require("./signer");
const indexer = require("./indexer");
const ID_RE = /^0x[0-9a-fA-F]{64}$/;
const STATUS = { 1: "Valid", 2: "Revoked" };
let lastSync = 0;

module.exports = function mount(app) {
  app.get("/api/signer", (req, res) => {
    res.json({ address: signerAddress, scheme: "ECDSA secp256k1, EIP-191 (personal_sign)", contract: indexer.info && indexer.info.address, chainId: indexer.getChainId() });
  });
  // dong bo ngay (frontend goi sau khi giao dich xong); toi da 1 lan/2 giay de tranh bi lam dung
  app.post("/api/sync", async (req, res) => {
    if (Date.now() - lastSync < 2000) return res.json({ ok: true, throttled: true });
    lastSync = Date.now();
    res.json(await indexer.syncOnce());
  });
  app.get("/api/stats", (req, res) => {
    const s = q.stats.get();
    res.json({ total: s.total || 0, valid: s.valid || 0, revoked: s.revoked || 0, lastBlock: Number(getMeta("last_block") ?? -1) });
  });
  app.get("/api/diplomas", (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 200);
    const offset = Math.max(parseInt(req.query.offset || "0", 10), 0);
    res.json({ total: q.stats.get().total || 0, items: q.list.all(limit, offset).map((d) => ({ ...d, statusText: STATUS[d.status] })) });
  });
  app.get("/api/diplomas/:id/history", (req, res) => {
    const id = String(req.params.id).toLowerCase();
    if (!ID_RE.test(id)) return res.status(400).json({ error: "diplomaId khong hop le." });
    res.json({ diplomaId: id, events: q.history.all(id) });
  });
  app.get("/api/diplomas/:id/record", (req, res) => {
    const id = String(req.params.id).toLowerCase();
    if (!ID_RE.test(id)) return res.status(400).json({ error: "diplomaId khong hop le." });
    const d = q.getDiploma.get(id);
    if (!d) return res.status(404).json({ error: "Chua co trong co so du lieu (hoac chua phat hanh)." });
    res.json({ diplomaId: id, fileHash: d.file_hash, cid: d.cid, issuer: d.issuer, issuedAt: d.issued_at, updatedAt: d.updated_at,
      status: STATUS[d.status], attestation: d.signature ? { message: d.sign_message, signature: d.signature, signer: signerAddress, signedAt: d.signed_at } : null });
  });
};
