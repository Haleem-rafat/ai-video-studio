import { api, type Status } from "../api.ts";

export function TopBar({ status }: { status: Status | null }) {
  const credit = status?.credit;
  const left = credit ? credit.limit - credit.used : null;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">▶</span> AI Video Studio
      </div>
      <div className="topbar-right">
        {status?.llm ? (
          <span className="pill ok">● Bonsai ready</span>
        ) : status?.llmStarting ? (
          <span className="pill warn" title={status.llmLog.join("\n")}>
            ◌ Bonsai loading…
          </span>
        ) : (
          <button className="pill off" onClick={() => api.startLlm()}>
            ○ Bonsai off — start
          </button>
        )}
        {left !== null && (
          <span className={`pill ${left < 3000 ? "warn" : ""}`} title="ElevenLabs characters left">
            🎙 {left.toLocaleString()} chars
          </span>
        )}
      </div>
    </header>
  );
}
