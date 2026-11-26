import { ethers } from "ethers";
import contractInfo from "../contractInfo.json";

/**
 * Polygon Amoy (tuy RPC node, vd publicnode.com) nhieu luc doi hoi "gas tip cap" toi thieu
 * ~25 gwei, trong khi MetaMask tu uoc luong mac dinh thuong de xuat thap hon nhieu (~1-2 gwei)
 * va bi RPC tu choi voi loi "transaction gas price below minimum". Dat san muc gas du cao o
 * day de tranh loi nay - khong anh huong gi vi day la POL testnet, khong co gia tri thuc.
 */
const TX_OVERRIDES = {
  maxPriorityFeePerGas: ethers.parseUnits("30", "gwei"),
  maxFeePerGas: ethers.parseUnits("60", "gwei"),
};

/**
 * Contract instance CHI DOC (khong can vi) - dung cho trang Xac minh
 * de bat ky ai cung xac minh duoc, khong bat buoc cai MetaMask.
 */
export function getReadOnlyContract() {
  const provider = new ethers.JsonRpcProvider(contractInfo.rpcUrl);
  return new ethers.Contract(contractInfo.address, contractInfo.abi, provider);
}

/**
 * Contract instance CO THE KY GIAO DICH - dung MetaMask cua nguoi dung.
 * Dung cho trang Phat hanh (chi tai khoan co ISSUER_ROLE moi goi thanh cong).
 */
export async function getSignerContract() {
  if (!window.ethereum) {
    throw new Error("Chua cai dat MetaMask. Vui long cai MetaMask de tiep tuc.");
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return new ethers.Contract(contractInfo.address, contractInfo.abi, signer);
}

/**
 * Danh sach loai van bang chuan hoa - dung chung cho moi form (Phat hanh/Cap nhat/Thu hoi/Xac minh)
 * de tranh go tay sai chinh ta lam sai lech diplomaId.
 */
export const DIPLOMA_TYPES = [
  { value: "CU_NHAN", label: "Cử nhân" },
  { value: "KY_SU", label: "Kỹ sư" },
  { value: "THAC_SI", label: "Thạc sĩ" },
  { value: "TIEN_SI", label: "Tiến sĩ" },
  { value: "CHUNG_CHI", label: "Chứng chỉ" },
];

/**
 * Sinh diplomaId (bytes32) tu ma sinh vien + ma chuong trinh + nam tot nghiep + loai van bang
 * + so hieu van bang / so vao so goc.
 *
 * So hieu van bang la truong QUYET DINH tinh duy nhat (giong nhu ngoai doi thuc: moi ban
 * van bang/chung chi luon co 1 so hieu rieng do phong dao tao cap, khong bao gio trung, ke
 * ca cung sinh vien/nganh/nam/loai - vd 1 sinh vien hoan toan co the co 2 chung chi khac nhau
 * cung nam, cung nganh). 4 truong con lai (ma SV, ma nganh, nam, loai) van giu de nguoi dung
 * de nhap/de nho, nhung so hieu moi la thu dam bao khong bao gio trung diplomaId.
 *
 * Luu y ve bao mat: neu so hieu duoc phong dao tao dat NGAU NHIEN (khong tuan tu de doan),
 * no con dong vai tro nhu 1 "salt" giup diplomaId kho bi do quet hon - xem muc "Gioi han ve
 * quyen rieng tu" trong BAO_CAO_KIEM_THU.md.
 *
 * Quy uoc nay phai duoc dung DONG NHAT giua luc Phat hanh, Cap nhat, Thu hoi va Xac minh.
 */
export function diplomaIdFrom(studentCode, programCode, gradYear, diplomaType, refNumber) {
  const normalized = `${studentCode.trim().toUpperCase()}-${programCode.trim().toUpperCase()}-${String(
    gradYear
  ).trim()}-${diplomaType.trim().toUpperCase()}-${String(refNumber).trim().toUpperCase()}`;
  return ethers.keccak256(ethers.toUtf8Bytes(normalized));
}

export const STATUS_LABELS = ["Chưa phát hành", "Hợp lệ", "Đã thu hồi"];

/**
 * Dich cac custom error cua hop dong (va cua OpenZeppelin AccessControl) ra thong bao
 * tieng Viet de hieu. Can thiet vi MetaMask/ethers luc goi qua estimateGas nhieu khi
 * KHONG tu dich duoc custom error (hien "unknown custom error" mu mo) du ABI co du -
 * day la mot loi UX thuong gap, khong phai bug logic. Ham nay tu doc 4 byte dau cua
 * revert data va tra ve loi tuong ung.
 */
const KNOWN_ERROR_SELECTORS = {
  "0x52bf3fc8": "Văn bằng này đang ở trạng thái Hợp lệ (đã phát hành, chưa thu hồi) — không thể phát hành đè lên. Muốn phát hành lại, hãy Thu hồi trước. (AlreadyIssued)",
  "0x99839d70": "Văn bằng này chưa từng được phát hành — kiểm tra lại đúng mã sinh viên/mã ngành/năm tốt nghiệp/loại văn bằng. (NotIssued)",
  "0x90315de1": "Văn bằng này đã bị thu hồi từ trước, không thể thu hồi/cập nhật thêm lần nữa. (AlreadyRevoked)",
  "0xe2517d3f": "Ví đang dùng không có quyền thực hiện thao tác này (thiếu ISSUER_ROLE hoặc quyền admin). (AccessControlUnauthorizedAccount)",
  "0x6697b232": "Thao tác phân quyền không hợp lệ. (AccessControlBadConfirmation)",
  "0x815e1d64": "Địa chỉ ký số không hợp lệ (không được là địa chỉ 0x000…0). (InvalidSigner)",
};

/**
 * Lay thong bao loi de hieu tu 1 loi ethers/MetaMask bat ky. Dung thay cho
 * "err.reason || err.message" o moi noi bat loi giao dich trong UI.
 */
export function describeTxError(err) {
  const rawData = err?.data || err?.info?.error?.data || err?.error?.data || "";
  const hex = typeof rawData === "string" ? rawData : "";
  const selector = hex.slice(0, 10).toLowerCase();

  if (KNOWN_ERROR_SELECTORS[selector]) {
    return KNOWN_ERROR_SELECTORS[selector];
  }
  return err?.reason || err?.shortMessage || err?.message || "Lỗi không xác định";
}

export function explorerTxUrl(txHash) {
  return `${contractInfo.explorerBaseUrl}/tx/${txHash}`;
}

/**
 * Link toi tab "Events" cua contract tren PolygonScan - dung lam phuong an du phong khi
 * RPC node dang dung khong con giu log cu (loi "History has been pruned"). PolygonScan tu
 * chay indexer rieng, luon co day du lich su bat ke RPC node cua nguoi dung co gioi han gi.
 */
export function explorerContractEventsUrl() {
  return `${contractInfo.explorerBaseUrl}/address/${contractInfo.address}#events`;
}

/**
 * Lay toan bo lich su giao dich (phat hanh / cap nhat / thu hoi) cua 1 van bang.
 * Day chinh la phan "truy vet giao dich" trong muc tieu de tai - doc truc tiep
 * tu event log tren Blockchain, khong can luu them database rieng.
 *
 * Mot so RPC cong khai cua Amoy (vd publicnode.com) gioi han moi lan truy van log
 * (eth_getLogs) toi da ~10.000 block - neu quet tu block 0 den hien tai se bi tu choi
 * loi "exceed maximum block range". Nen chia nho truy van theo tung doan <=9000 block,
 * bat dau tu block luc deploy contract (khong the co event truoc do).
 */
const MAX_BLOCK_RANGE = 9000;

/**
 * Chia [fromBlockStart, latestBlock] thanh nhieu doan <=9000 block, dung chung cho moi
 * cho can queryFilter (RPC cong khai gioi han moi lan truy van log toi da ~10.000 block).
 */
async function computeChunkRanges(contract) {
  const provider = contract.runner;
  const fromBlockStart = contractInfo.deployedBlock ?? 0;
  const latestBlock = await provider.getBlockNumber();

  const chunkRanges = [];
  for (let from = fromBlockStart; from <= latestBlock; from += MAX_BLOCK_RANGE + 1) {
    const to = Math.min(from + MAX_BLOCK_RANGE, latestBlock);
    chunkRanges.push([from, to]);
  }
  if (chunkRanges.length === 0) {
    chunkRanges.push([fromBlockStart, latestBlock]);
  }
  return chunkRanges;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const k = next++;
      out[k] = await fn(items[k], k);
    }
  });
  await Promise.all(workers);
  return out;
}

async function withRetry(fn, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 700 * (i + 1))); // RPC cong khai hay bao qua tai: doi roi thu lai
    }
  }
  throw lastErr;
}

const _historyCache = new Map(); // diplomaId -> { at, data }, TTL 30 giay

/**
 * Lich su giao dich cua 1 van bang. Nhanh hon ban cu: 1 truy van/doan block (gop 3 loai event bang
 * topic OR), chay song song toi da 6 doan, chi lay timestamp 1 lan cho moi block.
 */
export async function getDiplomaHistory(diplomaId) {
  const cached = _historyCache.get(diplomaId);
  if (cached && Date.now() - cached.at < 30000) return cached.data;

  // Uu tien doc tu co so du lieu cua Backend (luon con lich su, rat nhanh); loi thi doc truc tiep tu chuoi.
  const viaDb = await fetchHistoryFromDb(diplomaId);
  if (viaDb) {
    _historyCache.set(diplomaId, { at: Date.now(), data: viaDb });
    return viaDb;
  }

  const contract = getReadOnlyContract();
  const provider = contract.runner;
  const ranges = await computeChunkRanges(contract);
  const iface = contract.interface;
  const names = ["DiplomaIssued", "DiplomaUpdated", "DiplomaRevoked"];
  const topic0 = names.map((n) => iface.getEvent(n).topicHash);
  const address = await contract.getAddress();

  const chunks = await mapLimit(ranges, 4, ([fromBlock, toBlock]) =>
    withRetry(() => provider.getLogs({ address, topics: [topic0, diplomaId], fromBlock, toBlock }))
  );
  const logs = chunks.flat().sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

  const tsMap = new Map();
  await mapLimit([...new Set(logs.map((l) => l.blockNumber))], 4, async (bn) => {
    const blk = await withRetry(() => provider.getBlock(bn));
    tsMap.set(bn, blk ? Number(blk.timestamp) : null);
  });

  const labelOf = {
    DiplomaIssued: ["issued", "Phát hành"],
    DiplomaUpdated: ["updated", "Cập nhật"],
    DiplomaRevoked: ["revoked", "Thu hồi"],
  };
  const data = logs.map((l) => {
    const parsed = iface.parseLog(l);
    const [kind, label] = labelOf[parsed && parsed.name] || ["issued", "Giao dịch"];
    const ts = tsMap.get(l.blockNumber);
    return {
      kind,
      label,
      txHash: l.transactionHash,
      blockNumber: l.blockNumber,
      timestamp: ts ? new Date(ts * 1000).toLocaleString("vi-VN") : "—",
    };
  });
  _historyCache.set(diplomaId, { at: Date.now(), data });
  return data;
}

/**
 * Tinh so lieu tong quan THAT cua toan he thong (Tong luot phat hanh / Dang hop le / Da thu hoi),
 * doc truc tiep tu TOAN BO event tren contract (khong loc theo 1 diplomaId nao) - vi contract
 * khong co bien dem san (khong ton kem gas moi lan phat hanh), phai tu tinh o phia client.
 *
 * Cach tinh "Dang hop le" / "Da thu hoi": voi moi diplomaId da tung xuat hien, lay trang thai
 * cua LAN CUOI (block cao nhat) giua DiplomaIssued/DiplomaRevoked cua chinh no - vi 1 diplomaId
 * co the Phat hanh -> Thu hoi -> Phat hanh lai (xem test 9 trong test/DiplomaRegistry.test.js).
 */
export async function getRegistryStats() {
  const contract = getReadOnlyContract();
  const chunkRanges = await computeChunkRanges(contract);

  const issuedLogs = [];
  const revokedLogs = [];

  for (const [fromBlock, toBlock] of chunkRanges) {
    const [issued, revoked] = await Promise.all([
      contract.queryFilter(contract.filters.DiplomaIssued(), fromBlock, toBlock),
      contract.queryFilter(contract.filters.DiplomaRevoked(), fromBlock, toBlock),
    ]);
    issuedLogs.push(...issued);
    revokedLogs.push(...revoked);
  }

  // Voi moi diplomaId, tim block cao nhat giua lan Phat hanh gan nhat va lan Thu hoi gan nhat
  // de biet trang thai HIEN TAI (khong phai cong don tat ca lan tung phat hanh).
  const latestEventOf = new Map(); // diplomaId -> { block, kind }
  for (const log of issuedLogs) {
    const id = log.args.diplomaId;
    const prev = latestEventOf.get(id);
    if (!prev || log.blockNumber > prev.block) {
      latestEventOf.set(id, { block: log.blockNumber, kind: "issued" });
    }
  }
  for (const log of revokedLogs) {
    const id = log.args.diplomaId;
    const prev = latestEventOf.get(id);
    if (!prev || log.blockNumber > prev.block) {
      latestEventOf.set(id, { block: log.blockNumber, kind: "revoked" });
    }
  }

  let validCount = 0;
  let revokedCount = 0;
  for (const { kind } of latestEventOf.values()) {
    if (kind === "issued") validCount += 1;
    else revokedCount += 1;
  }

  return {
    totalIssueEvents: issuedLogs.length, // tong so LUOT phat hanh (co the > so van bang dang hop le, vi tinh ca lan phat hanh lai)
    validCount,
    revokedCount,
  };
}

/**
 * Ban thay the cua getRegistryStats(), KHONG doc eth_getLogs - dung khi RPC node
 * cong khai bao loi "pruned"/khong con giu log cu (xem canh bao trong Dashboard).
 * Doc truc tiep tu _allIds on-chain (totalDiplomas/getDiplomasPage) nen luon dung
 * bat ke RPC node co giu lich su log hay khong.
 * Luu y: "tong" o day la so diplomaId DUY NHAT tung phat hanh, khac voi tong SO LUOT
 * phat hanh cua getRegistryStats() (vd 1 van bang bi thu hoi roi phat hanh lai se
 * tinh la 2 luot nhung chi 1 diplomaId).
 */
export async function getRegistryStatsOnChain() {
  const contract = getReadOnlyContract();
  const total = Number(await contract.totalDiplomas());
  // Neu co so du lieu Backend khop voi tong tren chuoi thi dung luon (nhanh); lech/loi thi tinh tu chuoi.
  await requestSync();
  const dbStats = await apiGet("/api/stats", 5000).catch(() => null);
  if (dbStats && dbStats.total === total) {
    return { totalIssueEvents: total, validCount: dbStats.valid, revokedCount: dbStats.revoked, viaOnChainEnum: true };
  }
  const PAGE = 200;
  const offsets = [];
  for (let o = 0; o < total; o += PAGE) offsets.push(o);
  const pages = await mapLimit(offsets, 4, (o) => contract.getDiplomasPage(o, PAGE));
  let validCount = 0;
  let revokedCount = 0;
  for (const [, items] of pages) {
    for (const it of items) {
      if (Number(it.status) === 1) validCount += 1;
      else if (Number(it.status) === 2) revokedCount += 1;
    }
  }
  return { totalIssueEvents: total, validCount, revokedCount, viaOnChainEnum: true };
}

/** Trang thai hien tai cua 1 diplomaId: 0 = chua phat hanh, 1 = Hop le, 2 = Da thu hoi. */
export async function getDiplomaStatus(diplomaId) {
  const contract = getReadOnlyContract();
  const d = await contract.getDiploma(diplomaId);
  return Number(d.status);
}

/**
 * Phat hanh van bang moi - chi vi co ISSUER_ROLE moi goi thanh cong.
 */
export async function issueDiploma(diplomaId, fileHash, cid) {
  const contract = await getSignerContract();
  const tx = await contract.issueDiploma(diplomaId, fileHash, cid, TX_OVERRIDES);
  const receipt = await tx.wait();
  requestSync();
  return receipt.hash;
}

/**
 * Thu hoi van bang - chi vi co ISSUER_ROLE moi goi thanh cong.
 */
export async function revokeDiploma(diplomaId, reason) {
  const contract = await getSignerContract();
  const tx = await contract.revokeDiploma(diplomaId, reason, TX_OVERRIDES);
  const receipt = await tx.wait();
  requestSync();
  return receipt.hash;
}

/**
 * Cap nhat lai file/CID cua mot van bang da phat hanh (vd: sua loi metadata, thay file moi).
 * Chi vi co ISSUER_ROLE moi goi thanh cong. Ban ghi cu se khong con khop hash nua.
 */
export async function updateDiploma(diplomaId, newFileHash, newCid) {
  const contract = await getSignerContract();
  const tx = await contract.updateDiploma(diplomaId, newFileHash, newCid, TX_OVERRIDES);
  const receipt = await tx.wait();
  requestSync();
  return receipt.hash;
}

/**
 * Kiem tra 1 dia chi vi co dang giu ISSUER_ROLE hay khong (dung de an/hien nut tren UI).
 */
export async function checkIsIssuer(address) {
  const contract = getReadOnlyContract();
  const ISSUER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ISSUER_ROLE"));
  return contract.hasRole(ISSUER_ROLE, address);
}

/**
 * Kiem tra vi co DEFAULT_ADMIN_ROLE khong (quyen cao nhat, cap luc deploy contract -
 * la nguoi duy nhat co the cap/thu ISSUER_ROLE cho nguoi khac). Theo chuan OpenZeppelin
 * AccessControl, DEFAULT_ADMIN_ROLE luon la bytes32(0) - khong can goi len contract de lay.
 */
export async function checkIsAdmin(address) {
  if (!address) return false;
  const contract = getReadOnlyContract();
  return contract.hasRole(ethers.ZeroHash, address);
}

/**
 * Cap ISSUER_ROLE cho mot dia chi khac. Chi tai khoan admin (DEFAULT_ADMIN_ROLE) goi thanh cong.
 */
export async function grantIssuer(address) {
  const contract = await getSignerContract();
  const tx = await contract.grantIssuer(address, TX_OVERRIDES);
  const receipt = await tx.wait();
  requestSync();
  return receipt.hash;
}

/**
 * Thu lai ISSUER_ROLE cua mot dia chi (vd: can bo nghi viec, vi bi lo khoa).
 * Chi tai khoan admin (DEFAULT_ADMIN_ROLE) goi thanh cong.
 */
export async function revokeIssuer(address) {
  const contract = await getSignerContract();
  const tx = await contract.revokeIssuer(address, TX_OVERRIDES);
  const receipt = await tx.wait();
  requestSync();
  return receipt.hash;
}

/**
 * Tra cuu 1 van bang CHI BANG diplomaId - KHONG can co san file trong tay.
 * Dung cho truong hop nguoi xac minh chua co file goc: xem truoc trang thai +
 * lay link tai ban goc that tu IPFS (CID da luu tren chain), roi co the tai ve
 * va dung tiep ham verify() o tren de doi chieu hash cho chac chan.
 */
export async function lookupDiploma(diplomaId) {
  const contract = getReadOnlyContract();
  const d = await contract.getDiploma(diplomaId);
  return {
    fileHash: d.fileHash,
    cid: d.cid,
    issuer: d.issuer,
    issuedAt: d.issuedAt,
    status: d.status,
  };
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

/**
 * Link tai ban goc file PDF. KHONG tro thang ra IPFS gateway cong khai nua - tu khi
 * ap dung ma hoa AES phia server (xem backend/crypto.js), noi dung tren IPFS la ciphertext,
 * chi backend moi giai ma duoc, va CHI giai ma duoc khi biet dung diplomaId (tuc la biet
 * dung 5 truong dinh danh van bang - dieu kien nhu khi goi verify()/getDiploma()).
 */
export function secureFileUrl(diplomaId, cid) {
  return `${BACKEND_URL}/api/diplomas/${diplomaId}/file?cid=${encodeURIComponent(cid)}`;
}

/**
 * Lay 1 trang danh sach van bang tu on-chain (khong doc qua eth_getLogs) - dung cho
 * bang "Danh sach van bang da phat hanh" o Dashboard. Khong phu thuoc lich su log cu
 * con giu tren RPC node (nhieu RPC node cong khai chi giu vai nghin block gan nhat).
 */
export async function getDiplomasPage(offset, limit) {
  const contract = getReadOnlyContract();
  const [ids, items] = await contract.getDiplomasPage(offset, limit);
  return ids.map((id, i) => ({
    diplomaId: id,
    fileHash: items[i].fileHash,
    cid: items[i].cid,
    issuer: items[i].issuer,
    issuedAt: items[i].issuedAt,
    status: items[i].status,
  }));
}

export async function getTotalDiplomas() {
  const contract = getReadOnlyContract();
  return Number(await contract.totalDiplomas());
}

/**
 * Phat hanh nhieu van bang trong 1 giao dich (nhap hang loat tu Excel/CSV).
 * Tra ve mang bool cung thu tu voi diplomaIds: true = da phat hanh, false = bi bo qua
 * (diplomaId do da o trang thai Hop le tu truoc - khong lam hong ca lo).
 */
export async function issueBatch(diplomaIds, fileHashes, cids) {
  const contract = await getSignerContract();
  const results = await contract.issueBatch.staticCall(diplomaIds, fileHashes, cids);
  const tx = await contract.issueBatch(diplomaIds, fileHashes, cids, TX_OVERRIDES);
  const receipt = await tx.wait();
  requestSync();
  return { hash: receipt.hash, results };
}


// ===================== Co so du lieu (Backend) + chu ky so =====================
async function apiGet(path, timeoutMs = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, { signal: ctl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Nho Backend dong bo ngay cac su kien moi tu chuoi vao co so du lieu (loi thi bo qua). */
export async function requestSync() {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    await fetch(`${BACKEND_URL}/api/sync`, { method: "POST", signal: ctl.signal });
    clearTimeout(timer);
  } catch {
    /* Backend tat: bo qua, giao dien van doc duoc truc tiep tu chuoi */
  }
}

const KIND_LABEL = { issued: "Phát hành", updated: "Cập nhật", revoked: "Thu hồi" };
async function fetchHistoryFromDb(diplomaId) {
  try {
    await requestSync();
    const r = await apiGet(`/api/diplomas/${diplomaId}/history`, 8000);
    if (!r || !Array.isArray(r.events) || r.events.length === 0) return null;
    return r.events.map((e) => ({
      kind: e.kind,
      label: KIND_LABEL[e.kind] || "Giao dịch",
      txHash: e.tx_hash,
      blockNumber: e.block_number,
      timestamp: e.ts ? new Date(e.ts * 1000).toLocaleString("vi-VN") : "—",
    }));
  } catch {
    return null;
  }
}

/** Lay ban ghi + chu ky so do Backend luu (null neu Backend khong co). */
export async function fetchAttestationRecord(diplomaId) {
  try {
    return await apiGet(`/api/diplomas/${diplomaId}/record`, 8000);
  } catch {
    return null;
  }
}

/**
 * Dia chi ky so CHINH THUC cua nha truong dung de doi chieu. Thu tu uu tien:
 *  1) Dia chi luu ngay trong Smart Contract (ham attestationSigner(), do admin dat bang setAttestationSigner);
 *  2) Bien VITE_SIGNER_ADDRESS trong frontend/.env (cach cu - chi la cau hinh cua website nay,
 *     website gia mao co the tu dat dia chi cua ho vao day).
 * Hop dong cu (da deploy truoc khi co ham nay) khong co attestationSigner -> tu dong roi ve cach 2.
 * Tra ve { address, source } voi source = "contract" | "env" | "none".
 */
export async function getOfficialSigner() {
  try {
    const onChain = await getReadOnlyContract().attestationSigner();
    if (onChain && onChain !== ethers.ZeroAddress) return { address: onChain, source: "contract" };
  } catch {
    /* hop dong cu chua co ham attestationSigner (hoac RPC loi) -> dung cau hinh .env */
  }
  const fromEnv = (import.meta.env.VITE_SIGNER_ADDRESS || "").trim();
  if (fromEnv) return { address: fromEnv, source: "env" };
  return { address: "", source: "none" };
}

/** Admin dat dia chi ky so chinh thuc vao Smart Contract (chi DEFAULT_ADMIN_ROLE goi thanh cong). */
export async function setAttestationSigner(address) {
  const contract = await getSignerContract();
  const tx = await contract.setAttestationSigner(address, TX_OVERRIDES);
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Kiem tra chu ky NGAY TRONG TRINH DUYET (khong tin Backend): khoi phuc dia chi ky tu chu ky + thong diep.
 * officialInfo = ket qua cua getOfficialSigner(); neu bo trong thi chi dung VITE_SIGNER_ADDRESS (hanh vi cu).
 * officialOk === null nghia la KHONG co dia chi chinh thuc nao de doi chieu (giao dien phai canh bao, khong bao xanh).
 */
export function checkAttestation(att, chainData, officialInfo) {
  const recovered = ethers.verifyMessage(att.message, att.signature);
  const signatureOk = recovered.toLowerCase() === String(att.signer).toLowerCase();
  const official = (officialInfo ? officialInfo.address : import.meta.env.VITE_SIGNER_ADDRESS || "").trim();
  const officialSource = officialInfo ? officialInfo.source : official ? "env" : "none";
  const officialOk = official ? recovered.toLowerCase() === official.toLowerCase() : null;
  const statusText = Number(chainData.status) === 1 ? "Valid" : Number(chainData.status) === 2 ? "Revoked" : "Unknown";
  const lines = att.message.split("\n");
  const has = (l) => lines.includes(l);
  const dataOk =
    has(`fileHash:${String(chainData.fileHash).toLowerCase()}`) &&
    has(`cid:${chainData.cid}`) &&
    has(`issuer:${String(chainData.issuer).toLowerCase()}`) &&
    has(`status:${statusText}`);
  return { recovered, signatureOk, officialOk, officialSource, dataOk, official };
}
