import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { setSession } from "../services/api";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await api.login(username, password);
      if (!r.ok || !r.data) {
        setError(r.error || "Login failed");
        return;
      }
      setSession(r.data.token, r.data.role);
      navigate("/");
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
        <p className="sub">Warehouse Management Desk — same flow as ERPNext, simpler steps</p>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label>Email / Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <button className="btn" disabled={loading}>
          {loading ? "Logging in…" : "Login"}
        </button>
      </form>
    </div>
  );
}
