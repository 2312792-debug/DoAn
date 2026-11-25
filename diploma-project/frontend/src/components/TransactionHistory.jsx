import { useState } from "react";
import { History, Plus, RefreshCw, AlertTriangle, ExternalLink } from "lucide-react";
import { getDiplomaHistory, explorerTxUrl, explorerContractEventsUrl } from "../utils/contract";

const KIND_ICON = {
  issued: Plus,
  updated: RefreshCw,
  revoked: AlertTriangle,
};

export default function TransactionHistory({ diplomaId }) {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState(null);
  const [partial, setPartial] = useState(false);
  const [error, setError] = useState("");

  async function handleLoadHistory() {
    setLoading(true);
    setError("");
    setPartial(false);
    try {
      const result = await getDiplomaHistory(diplomaId);
      const evList = Array.isArray(result)
        ? result
        : Array.isArray(result?.events)
        ? result.events
        : [];
      setEvents(evList);
      setPartial(Boolean(result?.partial));
    } catch (err) {
      console.error(err);
      setError("Không tải được lịch sử giao dịch: " + (err.message || "Không xác định"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      {events === null && (
        <button className="history-trigger-btn" onClick={handleLoadHistory} disabled={loading}>
          <History size={15} strokeWidth={2} />
          {loading ? "Đang tải lịch sử... (có thể mất đến 20s)" : "Xem lịch sử giao dịch (truy vết trên Blockchain)"}
        </button>
      )}

      {error && <div className="history-note-box">{error}</div>}

      {partial && (
        <div className="history-note-box">
          Một số block cũ RPC không phục vụ được — danh sách bên dưới có thể chưa đầy đủ. Xem trọn vẹn trên PolygonScan: <br />
          <a href={explorerContractEventsUrl()} target="_blank" rel="noreferrer">
            Xem toàn bộ lịch sử giao dịch trên PolygonScan
            <ExternalLink size={11} strokeWidth={2} style={{ display: "inline", verticalAlign: "middle", marginLeft: 3 }} />
          </a>
        </div>
      )}

      {Array.isArray(events) && (
        <div className="history-list">
          {events.length === 0 && (
            <div className="history-note-box">Chưa có giao dịch nào cho văn bằng này.</div>
          )}
          {events.map((e, idx) => {
            const Icon = KIND_ICON[e.kind] || Plus;
            return (
              <div key={idx} className={`history-item history-${e.kind}`}>
                <span className="history-item-icon">
                  <Icon size={14} strokeWidth={2.3} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="history-row">
                    <b>{e.label}</b>
                    <span>{e.timestamp}</span>
                  </div>
                  <a
                    href={explorerTxUrl(e.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="history-tx-link"
                  >
                    Xem giao dịch #{e.blockNumber} trên PolygonScan
                    <ExternalLink size={11} strokeWidth={2} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
