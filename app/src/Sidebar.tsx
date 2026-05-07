const MENU_ITEMS = [
  { key: "home", label: "ホーム", icon: "🏠" },
  { key: "project", label: "プロジェクト", icon: "📁" },
  { key: "preprocess", label: "前処理", icon: "⚙️" },
  { key: "citations", label: "文献確認", icon: "📚" },
  { key: "review", label: "査読チェック", icon: "✓" },
  { key: "results", label: "結果", icon: "📄" },
  { key: "settings", label: "設定", icon: "🔧" },
  { key: "log", label: "ログ", icon: "📋" },
];

interface SidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
}

export default function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">PRA</div>
      <ul className="sidebar-menu">
        {MENU_ITEMS.map((item) => (
          <li
            key={item.key}
            className={`sidebar-item ${activeView === item.key ? "active" : ""}`}
            onClick={() => onNavigate(item.key)}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </li>
        ))}
      </ul>
    </nav>
  );
}
