// Dong bo su kien tu Smart Contract vao SQLite (lich su, CID, ma bam, trang thai) va ky so tung ban ghi.
// Chay luc khoi dong va moi 30 giay; DB chi nhan du lieu tu CHUOI nen khong ai chen du lieu gia vao duoc.
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Interface } = require("ethers");
const { q, db, getMeta, setMeta, reset } = require("./db");
const { signRecord } = require("./signer");

const MAX_RANGE = 9000;
function loadInfo() {
  const candidates = [process.env.CONTRACT_INFO_PATH, path.join(__dirname, "contractInfo.json"), path.join(__dirname, "..", "frontend", "src", "contractInfo.json")].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  return null;
}
const info = loadInfo();
const ZERO = "0x0000000000000000000000000000000000000000";
const enabled = !!info && !!info.address && info.address.toLowerCase() !== ZERO;
let provider, iface, chainId = null, running = null;
if (enabled) {
  provider = new JsonRpcProvider(process.env.RPC_URL || info.rpcUrl);
  iface = new Interface(info.abi);
} else console.warn("[indexer] Khong tim thay contractInfo.json hop le (chua deploy?) -> tat dong bo DB.");

async function retry(fn, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) { try { return await fn(); } catch (e) { err = e; await new Promise((r) => setTimeout(r, 700 * (i + 1))); } }
  throw err;
}
const NAMES = ["DiplomaIssued", "DiplomaUpdated", "DiplomaRevoked"];

async function syncOnce() {
  if (!enabled) return { ok: false, reason: "disabled" };
  if (running) return running;
  running = (async () => {
    try {
      if (chainId === null) chainId = Number((await retry(() => provider.getNetwork())).chainId);
      if ((getMeta("contract") || "").toLowerCase() !== info.address.toLowerCase()) { reset(); setMeta("contract", info.address); }
      const last = getMeta("last_block");
      let from = last === null ? Number(info.deployedBlock || 0) : Number(last) + 1;
      const latest = await retry(() => provider.getBlockNumber());
      const topics = [NAMES.map((n) => iface.getEvent(n).topicHash)];
      const touched = new Set();
      const tsCache = new Map();
      while (from <= latest) {
        const to = Math.min(from + MAX_RANGE, latest);
        const logs = await retry(() => provider.getLogs({ address: info.address, topics, fromBlock: from, toBlock: to }));
        logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
        for (const l of logs) if (!tsCache.has(l.blockNumber)) { const b = await retry(() => provider.getBlock(l.blockNumber)); tsCache.set(l.blockNumber, b ? Number(b.timestamp) : null); }
        db.transaction(() => {
          for (const l of logs) {
            const ev = iface.parseLog(l); const a = ev.args; const ts = tsCache.get(l.blockNumber);
            const id = String(a.diplomaId).toLowerCase();
            const base = { diploma_id: id, tx_hash: l.transactionHash, block_number: l.blockNumber, log_index: l.index, ts, actor: null, file_hash: null, cid: null, reason: null };
            let row;
            if (ev.name === "DiplomaIssued") row = { ...base, kind: "issued", actor: a.issuer, file_hash: a.fileHash, cid: a.cid };
            else if (ev.name === "DiplomaUpdated") row = { ...base, kind: "updated", actor: a.updater, file_hash: a.newFileHash, cid: a.newCid };
            else row = { ...base, kind: "revoked", actor: a.revoker, reason: a.reason };
            if (q.insEvent.run(row).changes === 0) continue;
            touched.add(id);
            const cur = q.getDiploma.get(id) || {};
            if (row.kind === "issued") q.upsertDiploma.run({ diploma_id: id, file_hash: row.file_hash, cid: row.cid, issuer: row.actor, issued_at: ts, updated_at: ts, status: 1 });
            else if (row.kind === "updated") q.upsertDiploma.run({ diploma_id: id, file_hash: row.file_hash, cid: row.cid, issuer: cur.issuer || row.actor, issued_at: cur.issued_at || ts, updated_at: ts, status: 1 });
            else q.upsertDiploma.run({ diploma_id: id, file_hash: cur.file_hash, cid: cur.cid, issuer: cur.issuer || row.actor, issued_at: cur.issued_at, updated_at: ts, status: 2 });
          }
          setMeta("last_block", to);
        })();
        from = to + 1;
      }
      for (const id of touched) {
        const d = q.getDiploma.get(id);
        const sig = await signRecord({ chainId, contract: info.address, diplomaId: id, fileHash: d.file_hash, cid: d.cid, issuer: d.issuer, status: d.status, at: d.updated_at });
        q.setSignature.run(sig.message, sig.signature, Math.floor(Date.now() / 1000), id);
      }
      return { ok: true, lastBlock: Number(getMeta("last_block")), updated: touched.size };
    } catch (e) {
      console.error("[indexer] loi dong bo:", e.message);
      return { ok: false, reason: e.message };
    } finally { running = null; }
  })();
  return running;
}
function start(intervalMs = 30000) {
  if (!enabled) return;
  syncOnce().then((r) => console.log("[indexer] dong bo lan dau:", JSON.stringify(r)));
  setInterval(syncOnce, intervalMs).unref();
}
module.exports = { syncOnce, start, enabled, getChainId: () => chainId, info };
