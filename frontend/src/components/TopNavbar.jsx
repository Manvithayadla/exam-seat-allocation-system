import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useAcademicCohort } from "../context/AcademicCohortContext";
import api from "../services/api";
import ReassignInvigilatorModal from "./ReassignInvigilatorModal";

export default function TopNavbar({ activePage, pageTitles = {} }) {
  const { user, role, isAdmin, isHod } = useAuth();
  const {
    academicYear,
    setAcademicYear,
    studyYear,
    setStudyYear,
    selectedSemester,
    setSelectedSemester,
    availableSemesters,
    studyYearName,
    STUDY_YEAR_MAP,
    ACADEMIC_YEARS,
  } = useAcademicCohort();

  const [cohortModalOpen, setCohortModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [reassignTarget, setReassignTarget] = useState(null);

  const dropdownRef = useRef(null);
  const title = pageTitles[activePage] || "Dashboard";

  useEffect(() => {
    if (isAdmin || isHod) {
      loadNotifications();
      const interval = setInterval(loadNotifications, 25000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, isHod]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    }
    if (notificationsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [notificationsOpen]);

  async function loadNotifications() {
    try {
      setLoadingNotifs(true);
      const res = await api.getAdminNotifications();
      const list = res.notifications || [];
      setNotifications(list);
      setUnreadCount(res.unread_count ?? list.filter((n) => !n.is_read).length);
    } catch (err) {
      console.warn("Could not load notifications:", err);
    } finally {
      setLoadingNotifs(false);
    }
  }

  async function handleMarkAsRead(notificationId, e) {
    if (e) e.stopPropagation();
    try {
      await api.markNotificationRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.notification_id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark notification read:", err);
    }
  }

  async function handleMarkAllRead() {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all notifications read:", err);
    }
  }

  function handleOpenReassign(item, e) {
    if (e) e.stopPropagation();
    setReassignTarget({
      assignment_id: item.assignment_id || item.related_id,
      faculty_id: item.faculty_id,
      faculty_name: item.faculty_name,
      department: item.department,
      exam_id: item.exam_id,
      exam_name: item.exam_name,
      subject_code: item.subject_code,
      subject_name: item.subject_name,
      exam_date: item.exam_date,
      session: item.session,
      start_time: item.start_time,
      end_time: item.end_time,
      hall_name: item.hall_name,
      room_no: item.room_no,
      decline_reason: item.decline_reason,
      message_to_admin: item.message_to_admin,
      declined_at: item.declined_at,
    });
    setNotificationsOpen(false);
  }

  return (
    <>
      <header
        className="top-navbar"
        style={{
          position: "relative",
          marginBottom: activePage === "seating" || activePage === "data" ? "16px" : undefined,
        }}
      >
        <div className="navbar-breadcrumbs">
          <span className="breadcrumb-home">Portal</span>
          <span>/</span>
          <span className="breadcrumb-current">{title}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {/* Department badge - hidden on seating and data pages */}
          {activePage !== "seating" && activePage !== "data" && (
            <span className="navbar-dept-tag">
              🏢 Department: Computer Science &amp; Engineering (CSE)
            </span>
          )}

          {/* Persistent Academic Cohort Pill - hidden on seating and data pages */}
          {activePage !== "seating" && activePage !== "data" && (
            <div
              onClick={() => setCohortModalOpen(true)}
              title="Click to switch global Academic Cohort (Academic Year, Study Year, Semester)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "linear-gradient(135deg, #eff6ff 0%, #e0f2fe 100%)",
                border: "1.5px solid #93c5fd",
                color: "#1e40af",
                padding: "6px 14px",
                borderRadius: "20px",
                fontSize: "12.5px",
                fontWeight: "600",
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(30, 64, 175, 0.08)",
                userSelect: "none",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#93c5fd")}
            >
              <span style={{ fontSize: "14px" }}>🎓</span>
              <span>
                Cohort: <strong>AY {academicYear}</strong> • <strong>{studyYearName}</strong> ({selectedSemester})
              </span>
              <span
                style={{
                  background: "#2563eb",
                  color: "#ffffff",
                  fontSize: "10.5px",
                  padding: "2px 7px",
                  borderRadius: "10px",
                  marginLeft: "4px",
                  fontWeight: "700",
                }}
              >
                Switch ▾
              </span>
            </div>
          )}

          {/* Admin Notification Bell */}
          {(isAdmin || isHod) && (
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                style={{
                  position: "relative",
                  background: notificationsOpen ? "#e2e8f0" : "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  borderRadius: "50%",
                  width: "40px",
                  height: "40px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                title="System Notifications"
                aria-label="System Notifications"
              >
                🔔
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-4px",
                      right: "-4px",
                      background: "#ef4444",
                      color: "#ffffff",
                      fontSize: "11px",
                      fontWeight: 800,
                      minWidth: "18px",
                      height: "18px",
                      borderRadius: "9px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 4px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Drawer / Popover Dropdown */}
              {notificationsOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "48px",
                    right: "0",
                    width: "420px",
                    maxWidth: "calc(100vw - 32px)",
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "10px",
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                    zIndex: 1000,
                    display: "flex",
                    flexDirection: "column",
                    maxHeight: "540px",
                  }}
                >
                  {/* Dropdown Header */}
                  <div
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #e2e8f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "#f8fafc",
                      borderRadius: "10px 10px 0 0",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: 700, fontSize: "14.5px", color: "var(--primary-navy)" }}>
                        Notifications
                      </span>
                      {unreadCount > 0 && (
                        <span
                          style={{
                            background: "#fee2e2",
                            color: "#b91c1c",
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: "10px",
                          }}
                        >
                          {unreadCount} unread
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#2563eb",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          padding: "4px 8px",
                        }}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  {/* Notifications List */}
                  <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
                    {loadingNotifs && notifications.length === 0 ? (
                      <div style={{ padding: "24px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                        Loading notifications...
                      </div>
                    ) : notifications.length === 0 ? (
                      <div style={{ padding: "32px 16px", textAlign: "center", color: "#64748b" }}>
                        <div style={{ fontSize: "28px", marginBottom: "6px" }}>📭</div>
                        <div style={{ fontWeight: 600, fontSize: "13.5px" }}>No Notifications</div>
                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                          You have no pending system alerts.
                        </div>
                      </div>
                    ) : (
                      notifications.map((item) => {
                        const isDecline = item.notification_type === "duty_declined";
                        const isReassigned = item.reassignment_status === "Reassigned";

                        return (
                          <div
                            key={item.notification_id}
                            style={{
                              padding: "12px 16px",
                              borderBottom: "1px solid #f1f5f9",
                              background: item.is_read ? "#ffffff" : "#f0f9ff",
                              transition: "background 0.15s ease",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                {!item.is_read && (
                                  <span
                                    style={{
                                      width: "7px",
                                      height: "7px",
                                      borderRadius: "50%",
                                      background: "#0284c7",
                                      display: "inline-block",
                                    }}
                                  />
                                )}
                                <span style={{ fontWeight: 700, fontSize: "13px", color: isDecline ? "#991b1b" : "var(--primary-navy)" }}>
                                  {item.title}
                                </span>
                              </div>

                              <span
                                style={{
                                  fontSize: "10.5px",
                                  padding: "2px 7px",
                                  borderRadius: "10px",
                                  fontWeight: 600,
                                  background: isReassigned ? "#dcfce7" : "#fee2e2",
                                  color: isReassigned ? "#15803d" : "#b91c1c",
                                }}
                              >
                                {isReassigned ? "✓ Reassigned" : "● Pending Replacement"}
                              </span>
                            </div>

                            {/* Detailed Metadata for Decline Alerts */}
                            {isDecline ? (
                              <div style={{ fontSize: "12px", color: "#334155", lineHeight: "1.5", marginTop: "4px" }}>
                                <div>
                                  <strong>Faculty:</strong> {item.faculty_name || "Faculty Member"} ({item.department || "CSE"}) [ID: {item.faculty_id}]
                                </div>
                                <div>
                                  <strong>Exam:</strong> {item.exam_name || item.subject_name} ({item.subject_code})
                                </div>
                                <div>
                                  📅 {String(item.exam_date).slice(0, 10)} &bull; ⏰ {item.start_time && item.end_time ? `${item.start_time.slice(0, 5)} - ${item.end_time.slice(0, 5)}` : item.session} &bull; 🏛️ {item.hall_name} (Room {item.room_no || item.hall_name})
                                </div>
                                <div style={{ color: "#b91c1c", marginTop: "2px" }}>
                                  <strong>Reason:</strong> <em>&quot;{item.decline_reason || "Declined without specified reason"}&quot;</em>
                                </div>
                                {item.message_to_admin && (
                                  <div style={{ color: "#475569", fontSize: "11.5px" }}>
                                    <strong>Note:</strong> {item.message_to_admin}
                                  </div>
                                )}
                                {item.declined_at && (
                                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>
                                    Declined: {String(item.declined_at).replace("T", " ").slice(0, 19)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div style={{ fontSize: "12px", color: "#475569", marginTop: "3px" }}>
                                {item.message}
                              </div>
                            )}

                            {/* Actions on notification card */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", paddingTop: "6px", borderTop: "1px dashed #e2e8f0" }}>
                              <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                                {item.created_at ? String(item.created_at).replace("T", " ").slice(0, 16) : ""}
                              </span>

                              <div style={{ display: "flex", gap: "6px" }}>
                                {!item.is_read && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleMarkAsRead(item.notification_id, e)}
                                    style={{
                                      background: "none",
                                      border: "1px solid #cbd5e1",
                                      borderRadius: "4px",
                                      fontSize: "11px",
                                      padding: "2px 6px",
                                      cursor: "pointer",
                                      color: "#475569",
                                    }}
                                  >
                                    Mark read
                                  </button>
                                )}

                                {isDecline && !isReassigned && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleOpenReassign(item, e)}
                                    style={{
                                      background: "#dc2626",
                                      border: "none",
                                      color: "#ffffff",
                                      borderRadius: "4px",
                                      fontSize: "11px",
                                      fontWeight: 600,
                                      padding: "3px 8px",
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "3px",
                                    }}
                                  >
                                    🔄 Reassign Faculty
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Global Reassign Modal invoked from Notifications */}
      <ReassignInvigilatorModal
        isOpen={Boolean(reassignTarget)}
        assignment={reassignTarget}
        onClose={() => setReassignTarget(null)}
        onSuccess={() => {
          setReassignTarget(null);
          loadNotifications();
        }}
      />

      {/* Persistent Academic Cohort Switcher Modal */}
      {cohortModalOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: "520px", borderRadius: "12px", padding: "24px" }}>
            <div className="modal-header" style={{ marginBottom: "16px", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", color: "var(--primary-navy)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🎓</span> Switch Academic Cohort
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                  Changes to the Academic Cohort persist across all pages, sessions, reports, and examination workflows.
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setCohortModalOpen(false)}
                style={{ fontSize: "20px", background: "none", border: "none", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Academic Year Selection */}
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px", color: "#334155" }}>
                  📅 Academic Year
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
                  {ACADEMIC_YEARS.map((ay) => (
                    <button
                      key={ay}
                      type="button"
                      onClick={() => setAcademicYear(ay)}
                      style={{
                        padding: "10px",
                        borderRadius: "8px",
                        border: academicYear === ay ? "2px solid #2563eb" : "1px solid #cbd5e1",
                        background: academicYear === ay ? "#eff6ff" : "#ffffff",
                        color: academicYear === ay ? "#1d4ed8" : "#334155",
                        fontWeight: academicYear === ay ? "700" : "500",
                        fontSize: "13px",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {academicYear === ay ? "✓ " : ""}{ay}
                    </button>
                  ))}
                </div>
              </div>

              {/* Study Year Selection */}
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px", color: "#334155" }}>
                  🏛️ Study Year
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                  {[1, 2, 3, 4].map((yr) => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => setStudyYear(yr)}
                      style={{
                        padding: "10px 4px",
                        borderRadius: "8px",
                        border: studyYear === yr ? "2px solid #2563eb" : "1px solid #cbd5e1",
                        background: studyYear === yr ? "#eff6ff" : "#ffffff",
                        color: studyYear === yr ? "#1d4ed8" : "#334155",
                        fontWeight: studyYear === yr ? "700" : "500",
                        fontSize: "13px",
                        cursor: "pointer",
                        textAlign: "center",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {studyYear === yr ? "✓ " : ""}{STUDY_YEAR_MAP[yr].name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Derived Semesters Selection */}
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px", color: "#334155" }}>
                  📖 Active Semester (Derived from {studyYearName})
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
                  {availableSemesters.map((sem) => (
                    <button
                      key={sem}
                      type="button"
                      onClick={() => setSelectedSemester(sem)}
                      style={{
                        padding: "10px",
                        borderRadius: "8px",
                        border: selectedSemester === sem ? "2px solid #059669" : "1px solid #cbd5e1",
                        background: selectedSemester === sem ? "#ecfdf5" : "#ffffff",
                        color: selectedSemester === sem ? "#047857" : "#334155",
                        fontWeight: selectedSemester === sem ? "700" : "500",
                        fontSize: "13px",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {selectedSemester === sem ? "✓ " : ""}{sem}
                    </button>
                  ))}
                </div>
              </div>

              {/* Current Selection Summary Callout */}
              <div style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "12px 14px",
                fontSize: "12px",
                color: "#475569",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <span style={{ fontSize: "18px" }}>📌</span>
                <div>
                  <strong>Active Cohort:</strong> AY {academicYear} • {studyYearName} ({selectedSemester})<br />
                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                    Shared across Roster Management, Dynamic Sections, Course Catalogue, Seating, and Reports.
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-navy"
                onClick={() => setCohortModalOpen(false)}
                style={{ padding: "8px 20px" }}
              >
                Apply &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
