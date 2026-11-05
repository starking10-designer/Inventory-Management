import "../workspace-topbar.css";

export default function WorkspaceTopBar({ children }) {
  return (
    <header className="workspace-topbar">
      <div className="workspace-topbar-content">{children}</div>
    </header>
  );
}
