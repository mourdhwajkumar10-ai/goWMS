import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

export default function NotificationBell() {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () =>
      api
        .notificationList()
        .then((r) => {
          if (active && r.ok) {
            setUnread((r.data || []).filter((n) => !n.is_read).length);
          }
        })
        .catch(() => {
          /* keep last known count */
        });

    load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <button
      type="button"
      className="topbar-icon-btn"
      onClick={() => navigate("/notifications")}
      aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
      title="Notifications"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unread > 0 && <span className="topbar-badge">{unread > 9 ? "9+" : unread}</span>}
    </button>
  );
}
