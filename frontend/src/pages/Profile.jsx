import { useAuth } from "../context/AuthContext";

export default function Profile() {
  const { user, logout, isAdmin, isHod, isInvigilator, isStudent } = useAuth();

  const hallTicket = isStudent
    ? (user?.email?.split("@")[0] || "").toUpperCase()
    : null;

  const roleTitle =
    user?.role === "exam_admin"
      ? "Examination Administrator"
      : user?.role === "hod"
      ? "Department Head (HOD)"
      : user?.role === "invigilator"
      ? "Faculty Invigilator"
      : "Student";

  return (
    <div className="profile-page">
      <header className="page-header">
        <div>
          <h1>My Profile</h1>
          <p>Your university account information and examination credentials.</p>
        </div>
      </header>

      <div className="profile-compact-wrapper">
        <section className="panel profile-card-compact">
          <div className="profile-avatar-circle">
            {user?.full_name ? user.full_name[0].toUpperCase() : "U"}
          </div>

          <h2 className="profile-name">{user?.full_name}</h2>
          <p className="profile-email">{user?.email}</p>

          <span className={`profile-role-pill ${user?.role}`}>{roleTitle}</span>

          <div className="profile-clean-details">
            <div className="clean-detail-row">
              <span className="clean-label">Full Name</span>
              <strong className="clean-val">{user?.full_name}</strong>
            </div>

            <div className="clean-detail-row">
              <span className="clean-label">Official Email</span>
              <strong className="clean-val">{user?.email}</strong>
            </div>

            {/* Student specific: Hall Ticket */}
            {isStudent && (
              <div className="clean-detail-row">
                <span className="clean-label">Hall Ticket Number</span>
                <strong className="clean-val highlight">{hallTicket}</strong>
              </div>
            )}

            {/* Faculty specific: Faculty ID */}
            {isInvigilator && user?.faculty_id && (
              <div className="clean-detail-row">
                <span className="clean-label">Faculty Member ID</span>
                <strong className="clean-val highlight">#{user.faculty_id}</strong>
              </div>
            )}

            {/* HOD specific: Department */}
            {isHod && (
              <div className="clean-detail-row">
                <span className="clean-label">Department</span>
                <strong className="clean-val">Computer Science & Engineering</strong>
              </div>
            )}

            <div className="clean-detail-row">
              <span className="clean-label">Account Role</span>
              <strong className="clean-val">{roleTitle}</strong>
            </div>

            <div className="clean-detail-row">
              <span className="clean-label">Account Status</span>
              <strong className="clean-val text-success">Active</strong>
            </div>
          </div>

          <button type="button" className="profile-logout-btn" onClick={logout}>
            Sign Out of Portal
          </button>
        </section>
      </div>
    </div>
  );
}
