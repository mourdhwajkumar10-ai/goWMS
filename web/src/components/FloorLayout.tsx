import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  Bell,
  Box,
  CheckSquare,
  Eye,
  HeartPulse,
  Menu,
  PackageOpen,
  RefreshCw,
  ScanLine,
  Search,
  Square,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { getRole } from "../services/api";
import { floorLabel, goBackOrHome, homePathForSession } from "../utils/roleAccess";
import { FLOOR_SECTION_ORDER, groupNavBySection, listFloorTiles } from "../utils/navCatalog";
import {
  isSectionOpen,
  readSectionOpenMap,
  toggleSectionOpen,
  type SectionOpenMap,
} from "../utils/navCollapse";
import { getPermissions } from "../utils/permissions";
import CollapsibleNavSection from "./CollapsibleNavSection";
import NotificationBell from "./NotificationBell";
import UserMenu from "./UserMenu";

const FLOOR_ICONS: Record<string, LucideIcon> = {
  "/receiving": PackageOpen,
  "/dock-receiving": Box,
  "/item-verifier": CheckSquare,
  "/box-verification": ScanLine,
  "/putaway-runner": ArrowDownToLine,
  "/pick": CheckSquare,
  "/pack": Square,
  "/dispatch": Truck,
  "/cycle-count": RefreshCw,
  "/quick-count": Search,
  "/stock-scan": ScanLine,
  "/stock-peek": Eye,
  "/qi": HeartPulse,
  "/exceptions": AlertTriangle,
  "/notifications": Bell,
};

export default function FloorLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = getRole();
  const label = floorLabel(role);
  const homePath = homePathForSession(role);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sectionOpen, setSectionOpen] = useState<SectionOpenMap>(() => readSectionOpenMap());

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const pages = listFloorTiles(role, getPermissions());
  const sections = useMemo(
    () => groupNavBySection(pages, FLOOR_SECTION_ORDER),
    [pages],
  );
  const currentPage = pages.find(
    (p) => location.pathname === p.to || location.pathname.startsWith(p.to + "/")
  );
  const onHome = location.pathname === "/floor" || location.pathname === homePath;
  const homeTitle = onHome ? "Floor tasks" : null;

  const onToggleSection = (id: string) => {
    setSectionOpen((prev) => toggleSectionOpen(id, prev));
  };

  return (
    <div className="floor-shell">
      {drawerOpen && (
        <div className="floor-backdrop" onClick={() => setDrawerOpen(false)} />
      )}

      <aside className={`floor-drawer ${drawerOpen ? "open" : ""}`}>
        <button
          type="button"
          className="floor-drawer-head brand-home"
          onClick={() => {
            setDrawerOpen(false);
            navigate(homePath);
          }}
          aria-label="Go to home"
        >
          <span className="brand-mark">gW</span>
          <div className="brand-text">
            <strong>goWMS</strong>
            <small>{label}</small>
          </div>
        </button>
        <nav className="floor-nav">
          {sections.map((section) => (
            <CollapsibleNavSection
              key={section.id}
              id={section.id}
              title={section.title}
              open={isSectionOpen(section.id, sectionOpen)}
              onToggle={() => onToggleSection(section.id)}
            >
              {section.items.map((p) => {
                const Icon = FLOOR_ICONS[p.to];
                return (
                  <NavLink
                    key={p.to}
                    to={p.to}
                    end={p.to !== "/grn"}
                    className={({ isActive }) =>
                      `floor-nav-link ${isActive ? "active" : ""}`
                    }
                  >
                    {Icon ? (
                      <Icon size={16} strokeWidth={1.8} className="floor-nav-icon" />
                    ) : null}
                    <span>{p.label}</span>
                  </NavLink>
                );
              })}
            </CollapsibleNavSection>
          ))}
        </nav>
      </aside>

      <div className="floor-main">
        <header className="floor-topbar">
          <button
            type="button"
            className="floor-hamburger"
            aria-label="Menu"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            <Menu size={18} strokeWidth={1.8} />
          </button>
          {!onHome && (
            <button
              type="button"
              className="floor-topbar-back"
              aria-label="Go back"
              onClick={() => goBackOrHome(navigate, homePath)}
            >
              <ArrowLeft size={18} strokeWidth={1.8} />
            </button>
          )}
          <span className="floor-page-title">
            {homeTitle ?? currentPage?.label ?? "goWMS"}
          </span>
          <div className="floor-topbar-right">
            <NotificationBell />
            <UserMenu />
          </div>
        </header>

        <main className="floor-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
