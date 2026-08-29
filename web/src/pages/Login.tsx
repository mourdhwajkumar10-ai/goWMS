import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, Loader2, Lock, ScanLine, User } from "lucide-react";
import api, { setSession } from "../services/api";
import { Button } from "../components/ui/Button";
import { canOpenPath, homePathForSession } from "../utils/roleAccess";

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
  const [showSecret, setShowSecret] = useState(false);

  const goHome = (role: string) => {
    const last = localStorage.getItem("gowms_last_path") || "";
    const next = last.startsWith("/") && canOpenPath(role, last) ? last : homePathForSession(role);
    navigate(next);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "password") {
        const r = await api.login(username, password);
        if (!r.ok || !r.data?.token) {
          setError(r.error || "Login failed");
          return;
        }
        const d = r.data as any;
        setSession(d.token, d.role, username, d.permissions, d.device_policy, d.user?.warehouse_ids);
        goHome(d.role);
        return;
      }
      if (!pin || (!badge && !empNo)) {
        setError("Badge/employee number and PIN required");
        return;
      }
      const r = await api.pinLogin({
        badge_code: badge || undefined,
        employee_number: empNo || undefined,
        pin,
      });
      if (!r.ok || !r.data?.token) {
        setError(r.error || "PIN login failed");
        return;
      }
      const d = r.data as any;
      setSession(d.token, d.role, d.employee_name || badge || empNo, d.permissions, d.device_policy, d.user?.warehouse_ids);
      goHome(d.role);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-shell">
        <aside className="login-hero" aria-hidden="true">
          <div className="login-hero-mark">
            <span className="brand-mark">gW</span>
            <span className="login-hero-name">goWMS</span>
          </div>
          <h2 className="login-hero-title">Warehouse operations, end to end</h2>
          <p className="login-hero-copy">
            Receive, put away, pick, and ship from one desk — with RF scanning for the floor.
          </p>
          <ul className="login-hero-points">
            <li>
              <ScanLine size={16} strokeWidth={1.8} />
              RF scanning for inbound &amp; putaway
            </li>
            <li>
              <Lock size={16} strokeWidth={1.8} />
              Role-based desk and floor access
            </li>
            <li>
              <KeyRound size={16} strokeWidth={1.8} />
              Floor PIN for handheld shift login
            </li>
          </ul>
        </aside>

        <form className="login-card" onSubmit={submit} noValidate>
          <div className="login-brand">
            <span className="brand-mark login-brand-mobile">gW</span>
            <div>
              <h1>Welcome back</h1>
              <p className="sub">Sign in with password or floor PIN</p>
            </div>
          </div>

          <div className="login-mode-toggle" role="tablist" aria-label="Login method">
            <button
              type="button"
              role="tab"
              aria-pressed={mode === "password"}
              onClick={() => { setMode("password"); setError(""); setShowSecret(false); }}
            >
              <Lock size={14} strokeWidth={2} />
              Password
            </button>
            <button
              type="button"
              role="tab"
              aria-pressed={mode === "pin"}
              onClick={() => { setMode("pin"); setError(""); setShowSecret(false); }}
            >
              <KeyRound size={14} strokeWidth={2} />
              Floor PIN
            </button>
          </div>

          {error && (
            <div className="login-alert" role="alert">
              {error}
            </div>
          )}
          {mode === "password" && looksLikeWarehouseScan(username) && (
            <div className="login-alert" role="alert">
              That looks like a box/part barcode ({username.trim()}). This field is your username — log in first, then scan on GRN.
            </div>
          )}
          {mode === "pin" && looksLikeWarehouseScan(badge) && (
            <div className="login-alert" role="alert">
              That looks like a box/part barcode ({badge.trim()}). Log in first, then scan it on GRN — this field is the employee badge only.
            </div>
          )}

          {mode === "password" ? (
            <>
              <div className="login-field">
                <label htmlFor="login-username">Email / Username</label>
                <div className="login-input-wrap">
                  <User className="login-input-icon" size={16} strokeWidth={1.8} />
                  <input
                    id="login-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoFocus
                    required
                    autoComplete="username"
                    placeholder="admin"
                  />
                </div>
              </div>
              <div className="login-field">
                <label htmlFor="login-password">Password</label>
                <div className="login-input-wrap">
                  <Lock className="login-input-icon" size={16} strokeWidth={1.8} />
                  <input
                    id="login-password"
                    type={showSecret ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="login-eye"
                    onClick={() => setShowSecret((v) => !v)}
                    aria-label={showSecret ? "Hide password" : "Show password"}
                  >
                    {showSecret ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="login-field">
                <label htmlFor="login-badge">Employee badge code</label>
                <div className="login-input-wrap">
                  <ScanLine className="login-input-icon" size={16} strokeWidth={1.8} />
                  <input
                    id="login-badge"
                    value={badge}
                    onChange={(e) => setBadge(e.target.value)}
                    placeholder="Scan or type badge — not a box barcode"
                    autoFocus
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="login-field">
                <label htmlFor="login-empno">or Employee number</label>
                <div className="login-input-wrap">
                  <User className="login-input-icon" size={16} strokeWidth={1.8} />
                  <input
                    id="login-empno"
                    value={empNo}
                    onChange={(e) => setEmpNo(e.target.value)}
                    placeholder="Optional if badge is set"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="login-field">
                <label htmlFor="login-pin">PIN</label>
                <div className="login-input-wrap">
                  <KeyRound className="login-input-icon" size={16} strokeWidth={1.8} />
                  <input
                    id="login-pin"
                    type={showSecret ? "text" : "password"}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    required
                    inputMode="numeric"
                    autoComplete="current-password"
                    placeholder="••••"
                  />
                  <button
                    type="button"
                    className="login-eye"
                    onClick={() => setShowSecret((v) => !v)}
                    aria-label={showSecret ? "Hide PIN" : "Show PIN"}
                  >
                    {showSecret ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
                  </button>
                </div>
              </div>
            </>
          )}

          <Button type="submit" className="login-submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} strokeWidth={2} className="login-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
