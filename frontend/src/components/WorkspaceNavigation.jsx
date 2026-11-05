import { Link, Outlet, useLocation } from "react-router-dom";
import { Home, FileText, ListOrdered, Scissors, Package, Warehouse, User } from "lucide-react";
import "../workspace-navigation.css";

const items = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "daily-report", label: "Daily Report", icon: FileText },
  { id: "daily-orders", label: "Daily Orders", icon: ListOrdered },
  { id: "label-cropper", label: "Label Cropper", icon: Scissors },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "warehouse", label: "Warehouse", icon: Warehouse },
  { id: "profile", label: "Profile", icon: User },
];

function sectionForPath(pathname) {
  if (pathname === "/daily-report") return "daily-orders";
  if (pathname.startsWith("/sales-analytics-report")) return "warehouse";
  if (pathname === "/sales-reports") return "dashboard";
  return "inventory";
}

export function WorkspacePageLayout() {
  const { pathname } = useLocation();
  return (
    <>
      <div key={pathname} className="workspace-route-content workspace-tab-content"><Outlet /></div>
      <WorkspaceNavigation />
    </>
  );
}

export default function WorkspaceNavigation({ activeTab, onNavigate, alertCount = 0 }) {
  const { pathname } = useLocation();
  const current = activeTab ?? sectionForPath(pathname);

  return (
    <div className="workspace-navigation-position">
      <nav className="workspace-navigation" aria-label="Main navigation"
        style={{ "--navigation-index": Math.max(0, items.findIndex(item => item.id === current)) }}>
        {items.map(({ id, label, icon: Icon }) => (
          <Link
            key={id}
            to={`/#${id}`}
            onClick={onNavigate ? (event) => {
              if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                event.preventDefault();
                onNavigate(id);
              }
            } : undefined}
            title={label}
            aria-label={label}
            aria-current={current === id ? "page" : undefined}
            className={`workspace-navigation-item ${current === id ? "is-active" : ""}`}
          >
            <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
            <span className="workspace-navigation-label">{label}</span>
            {id === "inventory" && alertCount > 0 && (
              <span className="workspace-navigation-badge">{alertCount}</span>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}
