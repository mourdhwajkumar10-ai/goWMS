import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { setSession } from "../services/api";

function looksLikeWarehouseScan(s: string) {
  return /^(BOX|PART|ITEM|INV|PO|GRN)[-_]/i.test((s || "").trim());
}

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"password" | "pin">("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [badge, setBadge] = useState("");
  const [empNo, setEmpNo] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "password") {
        const r = await api.login(username, password);
        if (!r.ok || !r.data) {
          setError(r.error || "Login failed");
          return;
        }
        setSession(r.data.token, r.data.role);
      } else {
        if (!pin || (!badge && !empNo)) {
          setError("Badge/employee number and PIN required");
          return;
        }
        const r = await api.pinLogin({
          badge_code: badge || undefined,
          employee_number: empNo || undefined,
          pin,
        });
        if (!r.ok || !r.data) {
          setError(r.error || "PIN login failed");
          return;
        }
        setSession(r.data.token, r.data.role);
      }
      const next = localStorage.getItem("gowms_last_path") || "/";
      navigate(next.startsWith("/") ? next : "/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-mark">gW</span>
          <div>
            <h1>Login to goWMS</h1>
          </div>
        </div>
        <p className="sub">Warehouse Management Desk — password or floor PIN</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button type="button" className={mode === "password" ? "btn" : "btn btn-ghost"} onClick={() => setMode("password")}>Password</button>
          <button type="button" className={mode === "pin" ? "btn" : "btn btn-ghost"} onClick={() => setMode("pin")}>PIN</button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        {mode === "password" && looksLikeWarehouseScan(username) && (
          <div className="error-banner" role="alert">
            That looks like a box/part barcode ({username.trim()}). This field is your username — log in first, then scan on GRN.
          </div>
        )}
        {mode === "pin" && looksLikeWarehouseScan(badge) && (
          <div className="error-banner" role="alert">
            That looks like a box/part barcode ({badge.trim()}). Log in first, then scan it on GRN — this field is the employee badge only.
          </div>
        )}
        {mode === "password" ? (
          <>
            <div className="field">
              <label>Email / Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required autoComplete="username" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label>Employee badge code</label>
              <input
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                placeholder="Employee badge code — not a box or part barcode"
                autoFocus
                aria-label="Employee badge code"
              />
            </div>
            <div className="field">
              <label>or Employee Number</label>
              <input value={empNo} onChange={(e) => setEmpNo(e.target.value)} />
            </div>
            <div className="field">
              <label>PIN</label>
              <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} required inputMode="numeric" />
            </div>
          </>
        )}
        <button className="btn" disabled={loading}>
          {loading ? "Logging in…" : "Login"}
        </button>
      </form>
    </div>
  );
}
