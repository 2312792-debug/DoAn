import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Search,
  FilePlus2,
  Settings,
  Wallet,
  GraduationCap,
  FileStack,
  CheckCircle2,
  XCircle,
  Link2,
  Package,
  ShieldCheck,
  ArrowRight,
  Check,
  X,
  ExternalLink,
  FileSpreadsheet,
} from "lucide-react";
import IssuePortal from "./components/IssuePortal";
import VerifyPortal from "./components/VerifyPortal";
import BulkImportPortal from "./components/BulkImportPortal";
import {
  checkIsIssuer,
  checkIsAdmin,
  grantIssuer as grantIssuerCall,
  revokeIssuer as revokeIssuerCall,
  setAttestationSigner as setAttestationSignerCall,
  getOfficialSigner,
  describeTxError,
  explorerContractEventsUrl,
  getRegistryStats,
  getRegistryStatsOnChain,
  getDiplomasPage,
  getTotalDiplomas,
  STATUS_LABELS,
} from "./utils/contract";
import contractInfo from "./contractInfo.json";
import { diplomaIdFromUrl } from "./utils/stampQr";
import "./styles.css";

// Link tu ma QR in trong PDF: /?verify=0x<diplomaId> -> mo thang trang Xac minh va tu tra cuu.
const QR_DIPLOMA_ID = diplomaIdFromUrl();

const MENU_ITEMS = [
  { id: "dashboard", icon: LayoutDashboard, label: "Tổng quan", access: "public" },
  { id: "verify", icon: Search, label: "Xác minh", access: "public" },
  { id: "issue", icon: FilePlus2, label: "Phát hành", access: "issuer" },
  { id: "bulk", icon: FileSpreadsheet, label: "Nhập hàng loạt", access: "issuer" },
  { id: "admin", icon: Settings, label: "Quản trị", access: "admin" },
];

function shortenAddress(address) {
  if (!address) return "Chưa kết nối";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Nguon trang thai vi DUY NHAT cho toan bo app - dung o day roi truyen prop
 * xuong Dashboard/IssuePortal/AdminPage, thay vi de moi trang tu ket noi rieng.
 * Nho vay khi doi tai khoan/mang trong MetaMask, TOAN BO app (sidebar, cac trang)
 * cap nhat ngay lap tuc, khong can F5.
 */
function useWalletRole() {
  const [account, setAccount] = useState("");
  const [isIssuer, setIsIssuer] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Lang nghe MetaMask: doi tai khoan hoac doi mang deu cap nhat ngay,
  // khong can nguoi dung bam lai nut "Ket noi" hay F5 trang.
  useEffect(() => {
    if (window.ethereum?.selectedAddress) {
      setAccount(window.ethereum.selectedAddress);
    }
    const handleAccountsChanged = (accounts) => setAccount(accounts?.[0] || "");
    const handleChainChanged = () => window.location.reload();

    window.ethereum?.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum?.on?.("chainChanged", handleChainChanged);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  // Moi lan account doi (bao gom lan dau phat hien duoc), tu kiem tra lai quyen -
  // day la READ call, khong can popup MetaMask, nen kiem tra ngam duoc.
  useEffect(() => {
    let cancelled = false;
    if (!account) {
      setIsIssuer(false);
      setIsAdmin(false);
      return;
    }
    setCheckingRole(true);
    Promise.all([checkIsIssuer(account), checkIsAdmin(account)])
      .then(([issuer, admin]) => {
        if (cancelled) return;
        setIsIssuer(issuer);
        setIsAdmin(admin);
      })
      .catch(() => {
        if (cancelled) return;
        setIsIssuer(false);
        setIsAdmin(false);
      })
      .finally(() => {
        if (!cancelled) setCheckingRole(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account]);

  async function connectWallet() {
    if (!window.ethereum) throw new Error("Chưa cài đặt MetaMask.");
    setConnecting(true);
    try {
      const [addr] = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      setAccount(addr || "");
    } finally {
      setConnecting(false);
    }
  }

  return { account, isIssuer, isAdmin, checkingRole, connecting, connectWallet };
}

export default function App() {
  const [page, setPage] = useState(QR_DIPLOMA_ID ? "verify" : "dashboard");
  const { account, isIssuer, isAdmin, checkingRole, connecting, connectWallet } =
    useWalletRole();

  const visibleMenuItems = MENU_ITEMS.filter((item) => {
    if (item.access === "public") return true;
    if (item.access === "issuer") return isIssuer;
    if (item.access === "admin") return isAdmin;
    return false;
  });

  // Neu dang o trang can quyen ma khong con quyen do nua (doi vi/bi thu quyen/
  // hoac bam tat qua Quick Action khi khong du quyen), tu dua ve Tong quan.
  useEffect(() => {
    const target = MENU_ITEMS.find((item) => item.id === page);
    const allowed =
      !target ||
      target.access === "public" ||
      (target.access === "issuer" && isIssuer) ||
      (target.access === "admin" && isAdmin);
    if (!allowed) setPage("dashboard");
  }, [page, isIssuer, isAdmin]);

  const pageInfo = {
    dashboard: {
      title: "Tổng quan",
      subtitle: "Quản lý và xác thực văn bằng trên Blockchain",
    },
    verify: {
      title: "Xác minh văn bằng",
      subtitle: "Kiểm tra tính hợp lệ của văn bằng trên Blockchain",
    },
    issue: {
      title: "Phát hành văn bằng",
      subtitle: "Phát hành và quản lý văn bằng trên hệ thống",
    },
    bulk: {
      title: "Nhập hàng loạt",
      subtitle: "Phát hành nhiều văn bằng cùng lúc từ file Excel/CSV",
    },
    admin: {
      title: "Quản trị hệ thống",
      subtitle: "Quản lý quyền phát hành và cấu hình hệ thống",
    },
  };

  const current = pageInfo[page];

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">DC</div>

          <div>
            <div className="brand-name">DiplomaChain</div>
            <div className="brand-subtitle">Digital Credential System</div>
          </div>
        </div>

        <div className="sidebar-section-title">MENU</div>

        <nav className="sidebar-nav">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => setPage(item.id)}
              >
                <span className="nav-icon">
                  <Icon size={17} strokeWidth={2} />
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="network-card">
            <div className="network-status-dot" />
            <div>
              <div className="network-name">Polygon Amoy</div>
              <div className="network-id">Chain ID 80002</div>
            </div>
          </div>

          <div className="sidebar-footer">
            <span>Smart Contract</span>
            <span className="status-online">● Online</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="main-area">
        {/* Header */}
        <header className="topbar">
          <div>
            <h1>{current.title}</h1>
            <p>{current.subtitle}</p>
          </div>

          <div className="topbar-right">
            <div className="network-badge">
              <span className="network-dot" />
              Polygon Amoy
            </div>

            <button
              type="button"
              className="wallet-badge wallet-badge-btn"
              onClick={account ? undefined : connectWallet}
              disabled={!!account || connecting}
              title={account ? "" : "Bấm để kết nối MetaMask"}
            >
              <div className="wallet-avatar">
                <Wallet size={16} strokeWidth={2} />
              </div>
              <div>
                <div className="wallet-label">
                  {account ? "Ví MetaMask" : connecting ? "Đang kết nối..." : "Chưa kết nối"}
                </div>
                <div className="wallet-address">
                  {account ? shortenAddress(account) : "Bấm để kết nối"}
                </div>
              </div>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="page-content">
          {page === "dashboard" && (
            <Dashboard
              onNavigate={setPage}
              account={account}
              isIssuer={isIssuer}
              isAdmin={isAdmin}
            />
          )}

          {page === "verify" && (
            <section className="portal-wrapper">
              <VerifyPortal qrDiplomaId={QR_DIPLOMA_ID} />
            </section>
          )}

          {page === "issue" && (
            <section className="portal-wrapper">
              <IssuePortal
                account={account}
                isIssuer={isIssuer}
                connecting={connecting}
                connectWallet={connectWallet}
              />
            </section>
          )}

          {page === "bulk" && (
            <section className="portal-wrapper">
              <BulkImportPortal
                account={account}
                isIssuer={isIssuer}
                connecting={connecting}
                connectWallet={connectWallet}
              />
            </section>
          )}

          {page === "admin" && (
            <AdminPage
              account={account}
              isAdmin={isAdmin}
              connecting={connecting}
              connectWallet={connectWallet}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function Dashboard({ onNavigate, account, isIssuer, isAdmin }) {
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsSource, setStatsSource] = useState("events"); // "events" | "onchain-fallback"

  // Danh sach van bang (chi Admin) - doc truc tiep tu on-chain (khong qua event log)
  const [listItems, setListItems] = useState([]);
  const [listTotal, setListTotal] = useState(0);
  const [listOffset, setListOffset] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const LIST_PAGE_SIZE = 10;

  // Doc thang tu danh sach luu on-chain (nhanh, tinh ca van bang phat hanh hang loat) -
  // khong quet event log nua (cham, bi gioi han boi RPC cong khai).
  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    setStatsError("");
    getRegistryStatsOnChain()
      .then((st) => {
        if (!cancelled) {
          setStats(st);
          setStatsSource("onchain-fallback");
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setStatsError("Không tải được số liệu.");
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setListLoading(true);
    setListError("");
    Promise.all([getTotalDiplomas(), getDiplomasPage(listOffset, LIST_PAGE_SIZE)])
      .then(([total, items]) => {
        if (cancelled) return;
        setListTotal(total);
        setListItems(items);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setListError("Không tải được danh sách văn bằng.");
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, listOffset]);

  return (
    <div className="dashboard-page">
      <section className="welcome-section">
        <div>
          <div className="eyebrow">DECENTRALIZED CREDENTIALS</div>
          <h2>Xin chào 👋</h2>
          <p>
            Quản lý, phát hành và xác minh văn bằng một cách minh bạch
            thông qua Blockchain và IPFS.
          </p>
        </div>

        <div className="welcome-icon">
          <GraduationCap size={30} strokeWidth={1.8} />
        </div>
      </section>

      {/* Số liệu tổng quan - tính THẬT từ event log trên chain, không phải số cố định */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon purple">
            <FileStack size={19} strokeWidth={2} />
          </div>
          <div>
            <div className="stat-label">
              {statsSource === "onchain-fallback" ? "Tổng số văn bằng" : "Tổng lượt phát hành"}
            </div>
            <div className="stat-value">
              {statsLoading ? "…" : statsError ? "—" : stats.totalIssueEvents}
            </div>
            <div className="stat-meta">
              {statsSource === "onchain-fallback" ? "Tính trực tiếp từ danh sách on-chain" : "Tính từ event trên Blockchain"}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">
            <CheckCircle2 size={19} strokeWidth={2} />
          </div>
          <div>
            <div className="stat-label">Văn bằng hợp lệ</div>
            <div className="stat-value">
              {statsLoading ? "…" : statsError ? "—" : stats.validCount}
            </div>
            <div className="stat-meta">Đang có hiệu lực</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon red">
            <XCircle size={19} strokeWidth={2} />
          </div>
          <div>
            <div className="stat-label">Đã thu hồi</div>
            <div className="stat-value">
              {statsLoading ? "…" : statsError ? "—" : stats.revokedCount}
            </div>
            <div className="stat-meta">Không còn hiệu lực</div>
          </div>
        </div>
      </section>

      {false && (
        <div className="admin-note" style={{ marginTop: -8, marginBottom: 24 }}>
          <strong>ℹ️ RPC node hiện dùng không còn giữ log cũ.</strong>
          <p>
            Số liệu trên vẫn chính xác - hệ thống đã tự động chuyển sang đọc trực
            tiếp danh sách văn bằng lưu on-chain (không qua event log) thay vì báo lỗi.
          </p>
        </div>
      )}

      {statsError && (
        <div className="admin-note" style={{ marginTop: -8, marginBottom: 24 }}>
          <strong>{statsError}</strong>
          <p>
            <a href={explorerContractEventsUrl()} target="_blank" rel="noreferrer">
              Xem toàn bộ lịch sử trên PolygonScan
              <ExternalLink size={12} strokeWidth={2} style={{ display: "inline", verticalAlign: "middle", marginLeft: 4 }} />
            </a>
          </p>
        </div>
      )}

      {/* Trạng thái ví - chỉ hiện khi đăng nhập đúng ví admin, ẩn với khách công khai */}
      {isAdmin && (
        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon blue">
              <Wallet size={19} strokeWidth={2} />
            </div>
            <div>
              <div className="stat-label">Ví đang kết nối</div>
              <div className="stat-value" style={{ fontSize: 15, fontFamily: "monospace" }}>
                {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Chưa kết nối"}
              </div>
              <div className="stat-meta">Đọc từ MetaMask trên trình duyệt</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon green">
              <Link2 size={19} strokeWidth={2} />
            </div>
            <div>
              <div className="stat-label">Mạng testnet</div>
              <div className="stat-value" style={{ fontSize: 18 }}>Polygon Amoy</div>
              <div className="stat-meta">Chain ID 80002</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon purple">
              <FileStack size={19} strokeWidth={2} />
            </div>
            <div>
              <div className="stat-label">Địa chỉ Smart Contract</div>
              <div className="stat-value" style={{ fontSize: 13, fontFamily: "monospace" }}>
                {contractInfo.address === "0x0000000000000000000000000000000000000000"
                  ? "Chưa deploy"
                  : `${contractInfo.address.slice(0, 8)}...${contractInfo.address.slice(-6)}`}
              </div>
              <div className="stat-meta">DiplomaRegistry.sol</div>
            </div>
          </div>
        </section>
      )}

      {/* Danh sach van bang da phat hanh - chi Admin, doc truc tiep on-chain (khong qua event log) */}
      {isAdmin && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <h3>Danh sách văn bằng đã phát hành</h3>
              <p>Đọc trực tiếp từ danh sách lưu on-chain ({listTotal} văn bằng).</p>
            </div>
          </div>

          {listLoading && <div className="history-note-box">Đang tải danh sách...</div>}
          {listError && <div className="history-note-box">{listError}</div>}

          {!listLoading && !listError && (
            <>
              <div className="history-list">
                {listItems.length === 0 && (
                  <div className="history-note-box">Chưa có văn bằng nào được phát hành.</div>
                )}
                {listItems.map((it) => {
                  const isValid = Number(it.status) === 1;
                  const kindClass = isValid ? "history-issued" : "history-revoked";
                  const Icon = isValid ? CheckCircle2 : XCircle;
                  const issuedDate = it.issuedAt
                    ? new Date(Number(it.issuedAt) * 1000).toLocaleString("vi-VN")
                    : "—";
                  return (
                    <div key={it.diplomaId} className={`history-item ${kindClass}`}>
                      <span className="history-item-icon">
                        <Icon size={14} strokeWidth={2.3} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="history-row">
                          <b
                            className="mono-value"
                            title={it.diplomaId}
                            style={{ fontSize: 13 }}
                          >
                            {it.diplomaId.slice(0, 10)}...{it.diplomaId.slice(-8)}
                          </b>
                          <span>{STATUS_LABELS[Number(it.status)] || "—"}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted, #888)" }}>
                          Phát hành: {issuedDate}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button
                  className="outline-action"
                  disabled={listOffset === 0}
                  onClick={() => setListOffset(Math.max(0, listOffset - LIST_PAGE_SIZE))}
                >
                  ← Trước
                </button>
                <button
                  className="outline-action"
                  disabled={listOffset + LIST_PAGE_SIZE >= listTotal}
                  onClick={() => setListOffset(listOffset + LIST_PAGE_SIZE)}
                >
                  Sau →
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* Quick actions */}
      <section className="section-block">
        <div className="section-heading">
          <div>
            <h3>Thao tác nhanh</h3>
            <p>Truy cập nhanh các chức năng chính của hệ thống.</p>
          </div>
        </div>

        <div className="quick-actions">
          <button className="action-card" onClick={() => onNavigate("verify")}>
            <div className="action-icon blue">
              <Search size={18} strokeWidth={2} />
            </div>
            <div className="action-content">
              <h4>Xác minh văn bằng</h4>
              <p>Kiểm tra văn bằng bằng mã và file PDF.</p>
            </div>
            <span className="action-arrow">
              <ArrowRight size={16} strokeWidth={2} />
            </span>
          </button>

          {isIssuer && (
            <button className="action-card" onClick={() => onNavigate("issue")}>
              <div className="action-icon purple">
                <FilePlus2 size={18} strokeWidth={2} />
              </div>
              <div className="action-content">
                <h4>Phát hành văn bằng</h4>
                <p>Phát hành văn bằng mới lên Blockchain.</p>
              </div>
              <span className="action-arrow">
                <ArrowRight size={16} strokeWidth={2} />
              </span>
            </button>
          )}
        </div>
      </section>

      {/* Technology overview */}
      <section className="section-block">
        <div className="section-heading">
          <div>
            <h3>Kiến trúc hệ thống</h3>
            <p>Các thành phần chính đang được sử dụng.</p>
          </div>
        </div>

        <div className="technology-grid">
          <div className="technology-card">
            <div className="technology-icon">
              <Link2 size={19} strokeWidth={2} />
            </div>
            <div>
              <h4>Blockchain</h4>
              <p>Polygon Amoy</p>
            </div>
            <span className="technology-status">Connected</span>
          </div>

          <div className="technology-card">
            <div className="technology-icon">
              <Package size={19} strokeWidth={2} />
            </div>
            <div>
              <h4>IPFS</h4>
              <p>Lưu trữ văn bằng PDF</p>
            </div>
            <span className="technology-status">Active</span>
          </div>

          <div className="technology-card">
            <div className="technology-icon">
              <ShieldCheck size={19} strokeWidth={2} />
            </div>
            <div>
              <h4>Smart Contract</h4>
              <p>DiplomaRegistry</p>
            </div>
            <span className="technology-status">Active</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function AdminPage({ account, isAdmin, connecting, connectWallet }) {
  const [targetAddress, setTargetAddress] = useState("");
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantStatus, setGrantStatus] = useState("");
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeStatus, setRevokeStatus] = useState("");

  // Dia chi ky so chinh thuc cua nha truong (luu trong Smart Contract)
  const [signerInput, setSignerInput] = useState("");
  const [signerCurrent, setSignerCurrent] = useState(null); // { address, source }
  const [signerLoading, setSignerLoading] = useState(false);
  const [signerStatus, setSignerStatus] = useState("");

  useEffect(() => {
    getOfficialSigner().then(setSignerCurrent).catch(() => setSignerCurrent(null));
  }, []);

  async function handleSetSigner() {
    if (!signerInput) {
      setSignerStatus("⚠️ Vui lòng nhập địa chỉ ký số (0x...).");
      return;
    }
    setSignerLoading(true);
    try {
      setSignerStatus("✍️ Đang gửi giao dịch, vui lòng xác nhận trên MetaMask...");
      const hash = await setAttestationSignerCall(signerInput.trim());
      setSignerStatus(`✅ Đã đặt địa chỉ ký số chính thức. Tx: ${hash}`);
      setSignerCurrent(await getOfficialSigner());
    } catch (err) {
      console.error(err);
      setSignerStatus("❌ " + describeTxError(err));
    } finally {
      setSignerLoading(false);
    }
  }

  async function handleGrant() {
    if (!targetAddress) {
      setGrantStatus("⚠️ Vui lòng nhập địa chỉ ví cần cấp quyền.");
      return;
    }
    setGrantLoading(true);
    try {
      setGrantStatus("✍️ Đang gửi giao dịch, vui lòng xác nhận trên MetaMask...");
      const hash = await grantIssuerCall(targetAddress);
      setGrantStatus(`✅ Đã cấp quyền phát hành cho ${targetAddress}. Tx: ${hash}`);
    } catch (err) {
      console.error(err);
      setGrantStatus("❌ " + describeTxError(err));
    } finally {
      setGrantLoading(false);
    }
  }

  async function handleRevokeIssuer() {
    if (!targetAddress) {
      setRevokeStatus("⚠️ Vui lòng nhập địa chỉ ví cần thu quyền.");
      return;
    }
    const confirmed = window.confirm(
      `Xác nhận THU QUYỀN PHÁT HÀNH của ví sau?\n\n${targetAddress}\n\nVí này sẽ không còn phát hành/cập nhật/thu hồi văn bằng được nữa cho đến khi được cấp lại.`
    );
    if (!confirmed) return;

    setRevokeLoading(true);
    try {
      setRevokeStatus("✍️ Đang gửi giao dịch, vui lòng xác nhận trên MetaMask...");
      const hash = await revokeIssuerCall(targetAddress);
      setRevokeStatus(`✅ Đã thu quyền phát hành của ${targetAddress}. Tx: ${hash}`);
    } catch (err) {
      console.error(err);
      setRevokeStatus("❌ " + describeTxError(err));
    } finally {
      setRevokeLoading(false);
    }
  }

  return (
    <div className="admin-page">
      <section className="admin-card">
        <div className="admin-card-header">
          <div>
            <div className="eyebrow">ACCESS CONTROL</div>
            <h2>Quản lý quyền phát hành</h2>
            <p>Quản lý các tài khoản được phép phát hành văn bằng trên Smart Contract.</p>
          </div>

          <div className="admin-icon">
            <Settings size={20} strokeWidth={2} />
          </div>
        </div>

        {account ? (
          <div className="permission-card">
            <div className="permission-avatar">
              <Wallet size={18} strokeWidth={2} />
            </div>

            <div className="permission-info">
              <div className="permission-label">Tài khoản hiện tại</div>
              <div className="permission-address">{shortenAddress(account)}</div>
            </div>

            <div className={`role-badge ${isAdmin ? "" : "role-badge-off"}`}>
              {isAdmin ? (
                <>
                  <Check size={13} strokeWidth={2.5} /> DEFAULT_ADMIN_ROLE
                </>
              ) : (
                <>
                  <X size={13} strokeWidth={2.5} /> Không có quyền admin
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="permission-card">
            <div className="permission-info">
              <div className="permission-label">Chưa kết nối ví</div>
              <div className="permission-address">Kết nối để xem/quản lý quyền</div>
            </div>
            <button
              className="secondary-btn"
              onClick={() => connectWallet().catch((err) => setGrantStatus("❌ " + err.message))}
              disabled={connecting}
            >
              {connecting ? "Đang kết nối..." : "Kết nối MetaMask"}
            </button>
          </div>
        )}

        <div className="admin-note">
          <strong>Lưu ý</strong>
          <p>
            Chỉ tài khoản có quyền admin (đã deploy contract) mới cấp/thu được{" "}
            <code>ISSUER_ROLE</code> cho tài khoản khác. Chỉ tài khoản có{" "}
            <code>ISSUER_ROLE</code> mới phát hành, cập nhật hoặc thu hồi văn bằng được.
          </p>
        </div>

        <div className="form-section-title" style={{ marginTop: 24 }}>
          Cấp / thu quyền cho tài khoản khác
        </div>

        <div className="field">
          <label>Địa chỉ ví (issuer)</label>
          <input
            type="text"
            placeholder="0x..."
            value={targetAddress}
            onChange={(e) => setTargetAddress(e.target.value)}
          />
        </div>

        <div className="button-row" style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button className="secondary-btn" onClick={handleGrant} disabled={grantLoading} style={{ flex: 1 }}>
            {grantLoading ? "Đang xử lý..." : "Cấp quyền phát hành"}
          </button>
          <button className="danger-btn" onClick={handleRevokeIssuer} disabled={revokeLoading} style={{ flex: 1 }}>
            {revokeLoading ? "Đang xử lý..." : "Thu quyền phát hành"}
          </button>
        </div>

        {grantStatus && <div className="action-status">{grantStatus}</div>}
        {revokeStatus && <div className="action-status">{revokeStatus}</div>}

        <div className="form-section-title" style={{ marginTop: 28 }}>
          Địa chỉ ký số chính thức của nhà trường
        </div>

        <div className="admin-note">
          <strong>Hiện đang dùng</strong>
          <p>
            {signerCurrent?.address ? (
              <>
                <code>{signerCurrent.address}</code> — nguồn:{" "}
                {signerCurrent.source === "contract" ? "Smart Contract" : "cấu hình website (VITE_SIGNER_ADDRESS)"}
              </>
            ) : (
              "Chưa đặt. Trang Xác minh sẽ cảnh báo vàng vì không có địa chỉ chính thức để đối chiếu."
            )}
          </p>
          <p>
            Đây là địa chỉ in ra ở log Backend lúc khởi động. Sau khi đặt, hãy công bố cùng địa chỉ này (và địa chỉ
            Smart Contract) trên website chính thức của trường để bên thứ ba đối chiếu.
          </p>
        </div>

        <div className="field">
          <label>Địa chỉ ký số (0x...)</label>
          <input
            type="text"
            placeholder="0x..."
            value={signerInput}
            onChange={(e) => setSignerInput(e.target.value)}
          />
        </div>

        <div className="button-row" style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button className="secondary-btn" onClick={handleSetSigner} disabled={signerLoading} style={{ flex: 1 }}>
            {signerLoading ? "Đang xử lý..." : "Lưu địa chỉ ký số vào Smart Contract"}
          </button>
        </div>

        {signerStatus && <div className="action-status">{signerStatus}</div>}

        <div className="admin-note" style={{ marginTop: 18 }}>
          <strong>Xem toàn bộ lịch sử phân quyền</strong>
          <p>
            Mọi lần cấp/thu quyền đều phát ra event <code>RoleGranted</code>/<code>RoleRevoked</code>{" "}
            (chuẩn OpenZeppelin AccessControl), xem trực tiếp tại{" "}
            <a href={explorerContractEventsUrl()} target="_blank" rel="noreferrer">
              trang Events trên PolygonScan
              <ExternalLink size={12} strokeWidth={2} style={{ display: "inline", verticalAlign: "middle", marginLeft: 4 }} />
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
