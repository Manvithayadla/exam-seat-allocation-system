import { useAuth } from "../context/AuthContext";

export default function Sidebar({ activePage, onNavigate }) {
  const { user, role, isAdmin, isHod, isInvigilator, isStudent, logout } = useAuth();

  // Navigation sections strictly according to role
  let navItems = [];

  if (isAdmin) {
    // The administrator must see exactly four main navigation sections:
    // 1. Seating Arrangement
    // 2. Halls Capacity
    // 3. Faculty Data
    // 4. Data
    navItems = [
      { id: "seating", label: "Seating Arrangement", icon: "🪑" },
      { id: "halls", label: "Halls Capacity", icon: "🏛️" },
      { id: "faculty", label: "Faculty Data", icon: "👨‍🏫" },
      { id: "data", label: "Data", icon: "📁" },
      { id: "reports", label: "Reports & Document Generation", icon: "📑" },
    ];
  } else if (isHod) {
    navItems = [
      { id: "hod_overview", label: "Department Overview", icon: "📊" },
      { id: "seating", label: "Seating View", icon: "🪑" },
      { id: "faculty", label: "Faculty Duties", icon: "📋" },
    ];
  } else if (isInvigilator) {
    navItems = [
      { id: "invigilator_schedule", label: "My Duty Schedule", icon: "📋" },
    ];
  } else if (isStudent) {
    navItems = [
      { id: "student_seat", label: "Find My Seat", icon: "🔍" },
    ];
  }

  const roleLabel =
    role === "exam_admin"
      ? "Administrator"
      : role === "hod"
      ? "Department HOD (CSE)"
      : role === "invigilator"
      ? "Faculty Invigilator"
      : "Student";

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-badge">
          <div className="brand-logo-icon">SE</div>
          <span className="brand-title">SmartExam</span>
        </div>
        <p className="brand-subtitle">
          Siddhartha Academy of Higher Education Deemed to be University
        </p>
      </div>

      <div className="sidebar-nav-container">
        <div className="nav-section-title">
          {isAdmin ? "CSE Examination Portal" : "Navigation"}
        </div>
        <nav
          className="sidebar-nav-list"
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            alignItems: "stretch",
          }}
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${activePage === item.id ? "active" : ""}`}
              onClick={() => onNavigate(item.id)}
              style={{
                width: "100%",
                minHeight: "52px",
                height: "52px",
                display: "flex",
                alignItems: "center",
                textAlign: "left",
                boxSizing: "border-box",
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <div className="user-profile-summary">
          <div className="user-avatar-circle">
            {user?.full_name ? user.full_name[0].toUpperCase() : "U"}
          </div>
          <div className="user-details">
            <span className="user-name" title={user?.full_name}>
              {user?.full_name || "User"}
            </span>
            <span className="user-role-badge">{roleLabel}</span>
          </div>
        </div>

        <button
          type="button"
          className="btn-signout"
          onClick={logout}
          title="Sign Out"
        >
          🚪
        </button>
      </div>
    </aside>
  );
}
