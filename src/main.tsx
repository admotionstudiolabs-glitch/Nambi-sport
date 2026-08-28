import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

/* si algo revienta, lo mostramos en pantalla en lugar de dejar la página en blanco */
function showError(title: string, detail: string) {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <div style="min-height:100vh;background:#04100a;color:#f2ffe9;font-family:Barlow,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px">
      <div style="max-width:560px;border:1px solid rgba(255,66,87,.5);background:#0a2417;padding:32px">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:2.2rem;letter-spacing:.05em;color:#ff4257;margin-bottom:8px">${title}</div>
        <p style="color:rgba(242,255,233,.75);font-size:.95rem;line-height:1.5;margin:0 0 16px">
          El juego se recuperó del golpe. Recargá la página; tu partida queda guardada igual.
        </p>
        <pre style="background:#04100a;border:1px solid rgba(242,255,233,.15);padding:12px;font-size:.75rem;overflow:auto;max-height:180px;color:#ffc233">${detail}</pre>
      </div>
    </div>`;
}

class BootGuard extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    showError("SE TRABÓ LA PELOTA", `${String(error)}\n\n${info.componentStack ?? ""}`);
  }
  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

window.addEventListener("error", (e) => {
  showError("ERROR EN LA CANCHA", `${e.message}\n\n${e.filename ?? ""}:${e.lineno ?? ""}`);
});
window.addEventListener("unhandledrejection", (e) => {
  showError("ERROR EN LA CANCHA", String(e.reason));
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BootGuard>
    <App />
  </BootGuard>,
);
