import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  Box,
  Boxes,
  Building2,
  CheckSquare,
  ChevronLeft,
  ClipboardList,
  FileText,
  GitBranch,
  HeartPulse,
  Home,
  Layers,
  MapPin,
  Menu,
  PackageCheck,
  PackageOpen,
  PackageX,
  RefreshCw,
  Search,
  Shield,
  ShoppingCart,
  SlidersHorizontal,
  Square,
  Store,
  ScrollText,
  Truck,
  Users,
  Undo2,
  Plus,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { getRole } from "../services/api";
import { deskLabel, canOpenPermissionedPath, goBackOrHome, homePathForSession, isDeskRole } from "../utils/roleAccess";
import { groupNavBySection, listDeskNavItems } from "../utils/navCatalog";
import {
  isSectionOpen,
  readSectionOpenMap,
  readSidebarCollapsed,
  toggleSectionOpen,
  writeSidebarCollapsed,
  type SectionOpenMap,
} from "../utils/navCollapse";
import { getPermissions } from "../utils/permissions";
import CollapsibleNavSection from "./CollapsibleNavSection";
import NotificationBell from "./NotificationBell";
import UserMenu from "./UserMenu";

const ICONS: Record<string, LucideIcon> = {
  "/": Home,
  "/analytics": BarChart3,
  "/receiving-management": PackageOpen,
  "/driver-checkin": Truck,
  "/receiving": Box,
  "/exceptions": AlertTriangle,
  "/follow-up": RefreshCw,
  "/grn-audit": Plus,
  "/putaway": ArrowDownToLine,
  "/putaway/logs": FileText,
  "/pick": CheckSquare,
  "/pack": Square,
  "/dispatch": Truck,
  "/cycle-count": RefreshCw,
  "/stock-scan": SlidersHorizontal,
  "/inventory-health": HeartPulse,
  "/inventory": Warehouse,
  "/transfers": ArrowLeftRight,
  "/stock-entries": ClipboardList,
  "/stock-reconciliations": Archive,
  "/serial": FileText,
  "/batches": Boxes,
  "/qi": Plus,
  "/po": ClipboardList,
  "/purchase-invoices": FileText,
  "/suppliers": PackageCheck,
  "/sales-orders": ShoppingCart,
  "/delivery-notes": FileText,
  "/backorders": RefreshCw,
  "/returns": Undo2,
  "/customers": Users,
  "/counter-sale": Store,
  "/wave": Layers,
  "/shortage-review": PackageX,
  "/items": Box,
  "/warehouses": Building2,
  "/locations": MapPin,
  "/transports": Truck,
  "/employees": Users,
  "/roles": Shield,
  "/workflow": GitBranch,
  "/reports": BarChart3,
  "/audit-logs": ScrollText,
};

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = getRole();
  const brandSub = deskLabel(role);
  const homePath = homePathForSession(role);
  const showAwesomebar = isDeskRole(role);
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed());
  const [sectionOpen, setSectionOpen] = useState<SectionOpenMap>(() => readSectionOpenMap());
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navQuery, setNavQuery] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const deskItems = listDeskNavItems(role, getPermissions());
  const sections = useMemo(() => groupNavBySection(deskItems), [deskItems]);
  const onHome = location.pathname === homePath || (homePath === "/" && location.pathname === "/");

  const visibleItems = useMemo(() => {
    return sections.flatMap((section) =>
      section.items.map((item) => ({ ...item, sectionTitle: section.title })),
    );
  }, [sections]);

  const setSidebarCollapsed = (next: boolean) => {
    setCollapsed(next);
    writeSidebarCollapsed(next);
  };

  const toggleMenu = () => {
    if (window.matchMedia("(max-width: 640px)").matches) {
      setMobileOpen((v) => !v);
      return;
    }
    setSidebarCollapsed(!collapsed);
  };

  const onToggleSection = (id: string) => {
    setSectionOpen((prev) => toggleSectionOpen(id, prev));
  };

  useEffect(() => {
    if (location.pathname && location.pathname !== "/login") {
      localStorage.setItem("gowms_last_path", location.pathname);
    }
    if (!canOpenPermissionedPath(location.pathname)) {
      navigate(homePathForSession(role), { replace: true });
    }
    setMobileOpen(false);
    setNavOpen(false);
    setNavQuery("");
  }, [location.pathname, role, navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        setNavOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searchHits = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    if (!q) return visibleItems.slice(0, 8);
    return visibleItems.filter((item) =>
      `${item.label} ${item.sectionTitle} ${item.to}`.toLowerCase().includes(q),
    ).slice(0, 12);
  }, [navQuery, visibleItems]);

  return (
    <div className="shell">
      {mobileOpen && <div className="nav-backdrop" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
        <button
          type="button"
          className="brand brand-home"
          onClick={() => navigate(homePath)}
          aria-label="Go to home"
        >
          <span className="brand-mark">gW</span>
          <div className="brand-text">
            <strong>goWMS</strong>
            <small>{brandSub}</small>
          </div>
        </button>
        <nav className="nav">
          {sections.map((section) => {
            const open = collapsed || isSectionOpen(section.id, sectionOpen);
            return (
              <CollapsibleNavSection
                key={section.id}
                id={section.id}
                title={section.title}
                open={open}
                onToggle={() => onToggleSection(section.id)}
              >
                {section.items.map((item) => {
                  const Icon = ICONS[item.to];
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to !== "/grn"}
                      title={item.label}
                      className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
                    >
                      {Icon ? <Icon className="nav-icon" size={16} strokeWidth={1.8} /> : null}
                      <span className="nav-link-label">{item.label}</span>
                    </NavLink>
                  );
                })}
              </CollapsibleNavSection>
            );
          })}
        </nav>
        <button
          type="button"
          className="sidebar-rail-toggle"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
          onClick={() => setSidebarCollapsed(!collapsed)}
        >
          <ChevronLeft
            size={16}
            strokeWidth={2}
            className={collapsed ? "sidebar-rail-chevron flipped" : "sidebar-rail-chevron"}
            aria-hidden
          />
        </button>
      </aside>
      <div className="main">
        <header className="topbar">
          <button type="button" className="hamburger" aria-label="Toggle menu" onClick={toggleMenu}>
            <Menu size={18} strokeWidth={1.8} />
          </button>
          {!onHome && (
            <button
              type="button"
              className="topbar-back"
              aria-label="Go back"
              onClick={() => goBackOrHome(navigate, homePath)}
            >
              <ArrowLeft size={18} strokeWidth={1.8} />
            </button>
          )}
          {showAwesomebar ? (
          <div className="awesomebar">
            <Search size={16} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} strokeWidth={1.8} />
            <input
              ref={searchRef}
              value={navQuery}
              onChange={(e) => { setNavQuery(e.target.value); setNavOpen(true); }}
              onFocus={() => setNavOpen(true)}
              onBlur={() => setTimeout(() => setNavOpen(false), 150)}
              placeholder="Search pages…"
              aria-label="Search"
            />
            <kbd>⌘K</kbd>
            {navOpen && (
              <div className="awesomebar-results">
                {searchHits.map((item) => {
                  const Icon = ICONS[item.to];
                  return (
                    <button
                      key={item.to}
                      type="button"
                      onMouseDown={() => navigate(item.to)}
                    >
                      {Icon ? <Icon size={14} strokeWidth={1.8} style={{ flexShrink: 0 }} /> : null}
                      <span>{item.label}</span>
                      <span style={{ marginLeft: "auto", color: "var(--text-dim)", fontSize: 11 }}>{item.sectionTitle}</span>
                    </button>
                  );
                })}
                {searchHits.length === 0 && (
                  <button type="button" disabled>No matching pages</button>
                )}
              </div>
            )}
          </div>
          ) : null}
          <div className="topbar-right">
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main className="content">
          {canOpenPermissionedPath(location.pathname) ? <Outlet /> : <Navigate to={homePathForSession(getRole())} replace />}
        </main>
      </div>
    </div>
  );
}
