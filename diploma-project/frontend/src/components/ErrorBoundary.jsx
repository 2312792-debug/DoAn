import React from "react";

/** Bat loi hien thi: thay vi trang trang tinh, hien thong bao + nut tai lai. */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("UI error:", error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ maxWidth: 560, margin: "80px auto", padding: 24, fontFamily: "sans-serif" }}>
        <h2>Giao diện gặp lỗi hiển thị</h2>
        <p style={{ color: "#555" }}>
          Dữ liệu trên Blockchain không bị ảnh hưởng. Hãy tải lại trang. Nếu lỗi lặp lại, thử tắt chức năng
          tự động dịch trang của trình duyệt cho địa chỉ này.
        </p>
        <pre style={{ whiteSpace: "pre-wrap", background: "#f4f4f4", padding: 12, borderRadius: 8, fontSize: 12 }}>
          {String(this.state.error && (this.state.error.message || this.state.error))}
        </pre>
        <button onClick={() => window.location.reload()} style={{ padding: "8px 16px" }}>Tải lại trang</button>
      </div>
    );
  }
}
