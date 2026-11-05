import { useEffect, useState, useMemo } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

/* =========================================================
   1. STUDENT DASHBOARD VIEW
   ========================================================= */
function StudentDashboard({ user, onNavigate }) {
  const [studentAllotments, setStudentAllotments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const hallTicket = useMemo(() => {
    return (user?.email?.split("@")[0] || "").toUpperCase();
  }, [user]);

  useEffect(() => {
    async function loadStudentSchedule() {
      if (!hallTicket) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");

      try {
        const examsRes = await api.getExams();
        const examsList = Array.isArray(examsRes.exams) ? examsRes.exams : [];

        // Check seat for each exam in parallel
        const results = await Promise.allSettled(
          examsList.map(async (exam) => {
            try {
              const seatRes = await api.getStudentSeat(hallTicket, exam.exam_id);
              return { exam, seat: seatRes.seat, status: "Allotted" };
            } catch {
              return { exam, seat: null, status: "Pending Allocation" };
            }
          })
        );

        const allotments = results.map((r, i) => {
          if (r.status === "fulfilled") return r.value;
          return { exam: examsList[i], seat: null, status: "Pending Allocation" };
        });

        setStudentAllotments(allotments);
      } catch (err) {
        console.error("Student dashboard schedule error:", err);
        setError("Unable to load examination schedule at this time.");
      } finally {
        setLoading(false);
      }
    }

    loadStudentSchedule();
  }, [hallTicket]);

  function formatExamDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  return (
    <div className="student-dashboard">
      <header className="page-header">
        <div>
          <div
            style={{
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "var(--accent-blue, #2563eb)",
              fontWeight: 700,
              marginBottom: "4px",
            }}
          >
            Siddhartha Academy of Higher Education
          </div>
          <h1>Welcome, {user?.full_name}</h1>
          <p>
            Student Examination Portal · Hall Ticket: <strong>{hallTicket}</strong>
          </p>
        </div>
      </header>

      {/* Primary Action Banner */}
      <section className="hero-banner student-banner">
        <div>
          <span className="eyebrow">SEATING INQUIRY</span>
          <h2>Examination Seating Allotments</h2>
          <p>
            Review your assigned examination hall, row, and seat coordinates. Be seated 15 minutes before exam commencement.
          </p>
          <button
            type="button"
            className="banner-action-btn"
            onClick={() => onNavigate("seatsearch")}
          >
            🔍 View Official Allotment Slip
          </button>
        </div>
        <span className="hero-icon">🎓</span>
      </section>

      {error && <div className="error-message">{error}</div>}

      {/* Scheduled Exams & Seating List */}
      <section className="panel">
        <div className="section-heading">
          <div>
            <h3>My Examination Schedule &amp; Assigned Seats</h3>
            <p className="panel-subtitle">
              Your registered examinations and hall seat coordinates retrieved from university records.
            </p>
          </div>
        </div>

        {loading && <p className="status-message">Loading your examination schedule...</p>}

        {!loading && !error && studentAllotments.length === 0 && (
          <div className="empty-state-card">
            <span className="empty-icon">📅</span>
            <h3>No Scheduled Examinations Found</h3>
            <p>You have no examinations currently registered or scheduled in the system.</p>
          </div>
        )}

        {!loading && studentAllotments.length > 0 && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Course Code</th>
                  <th>Subject Name</th>
                  <th>Date</th>
                  <th>Session</th>
                  <th>Assigned Hall</th>
                  <th>Seat Position</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {studentAllotments.map(({ exam, seat }) => (
                  <tr key={exam.exam_id}>
                    <td>
                      <strong className="subject-code-cell">{exam.subject_code}</strong>
                    </td>
                    <td>{exam.subject_name}</td>
                    <td>{formatExamDate(exam.exam_date)}</td>
                    <td>
                      <span className={`session-badge ${exam.session === "FN" ? "forenoon" : "afternoon"}`}>
                        {exam.session === "FN" ? "Forenoon (FN)" : "Afternoon (AN)"}
                      </span>
                    </td>
                    <td>
                      {seat ? (
                        <span className="hall-tag">Hall {seat.hall_name}</span>
                      ) : (
                        <span className="status-badge pending">Not Allocated</span>
                      )}
                    </td>
                    <td>
                      {seat ? (
                        <span className="seat-badge">
                          Row {seat.row_no}, Col {seat.column_no}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="table-action-btn primary"
                        onClick={() => onNavigate("seatsearch")}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* =========================================================
   2. INVIGILATOR DASHBOARD VIEW
   ========================================================= */
function InvigilatorDashboard({ user }) {
  const [duties, setDuties] = useState([]);
  const [facultyInfo, setFacultyInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Decline modal state
  const [declineDuty, setDeclineDuty] = useState(null);
  const [declineReason, setDeclineReason] = useState("");
  const [declineSubmitting, setDeclineSubmitting] = useState(false);

  // Message to admin modal state
  const [messageDuty, setMessageDuty] = useState(null);
  const [adminNote, setAdminNote] = useState("");
  const [messageSubmitting, setMessageSubmitting] = useState(false);

  useEffect(() => {
    loadDuties();
  }, [user]);

  async function loadDuties() {
    setLoading(true);
    setError("");
    try {
      const facRes = await api.getFaculty().catch(() => ({ faculty: [] }));
      const facultyList = facRes.faculty || [];
      const matching = facultyList.find(
        (f) =>
          (user?.faculty_id && f.faculty_id === user.faculty_id) ||
          f.faculty_name?.toLowerCase() === user?.full_name?.toLowerCase() ||
          user?.email?.toLowerCase().includes(f.faculty_name?.toLowerCase().replace(/[^a-z]/g, "")) ||
          f.faculty_name?.toLowerCase().includes(user?.full_name?.toLowerCase())
      );

      setFacultyInfo(matching || null);
      const facultyId = matching ? matching.faculty_id : user?.faculty_id;
      const assignRes = await api.getInvigilatorAssignments(null, facultyId);
      setDuties(assignRes.assignments || []);
    } catch (err) {
      console.error("Invigilator dashboard error:", err);
      setError("Unable to load invigilation duty assignments.");
    } finally {
      setLoading(false);
    }
  }

  // Accept duty
  async function handleAccept(assignmentId) {
    setError("");
    setSuccessMsg("");
    try {
      await api.respondDuty(assignmentId, "accept");
      setSuccessMsg("Invigilation duty accepted and confirmed!");
      loadDuties();
    } catch (err) {
      setError(err.message || "Failed to accept duty.");
    }
  }

  // Submit decline duty
  async function handleSubmitDecline(e) {
    if (e) e.preventDefault();
    if (!declineReason.trim()) {
      setError("Please provide a valid reason for declining this duty.");
      return;
    }

    setDeclineSubmitting(true);
    setError("");
    try {
      await api.respondDuty(declineDuty.assignment_id, "decline", declineReason.trim());
      setSuccessMsg("Duty declined. The examination office has been alerted for replacement.");
      setDeclineDuty(null);
      setDeclineReason("");
      loadDuties();
    } catch (err) {
      setError(err.message || "Failed to decline duty.");
    } finally {
      setDeclineSubmitting(false);
    }
  }

  // Submit message to administrator
  async function handleSubmitMessage(e) {
    if (e) e.preventDefault();
    if (!adminNote.trim()) {
      setError("Please write your message to the administrator.");
      return;
    }

    setMessageSubmitting(true);
    setError("");
    try {
      await api.sendInvigilatorMessage(messageDuty.assignment_id, adminNote.trim());
      setSuccessMsg("Note delivered to the examination administrator.");
      setMessageDuty(null);
      setAdminNote("");
      loadDuties();
    } catch (err) {
      setError(err.message || "Failed to deliver note.");
    } finally {
      setMessageSubmitting(false);
    }
  }

  function formatExamDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  return (
    <div className="invigilator-dashboard">
      <header className="page-header">
        <div>
          <h1>Welcome, {user?.full_name}</h1>
          <p>
            Faculty Invigilator Portal · {facultyInfo?.department ? `Dept of ${facultyInfo.department} · ` : ""}
            <strong>{user?.email}</strong>
          </p>
        </div>
      </header>

      {/* Duty Summary Banner */}
      <section className="hero-banner invigilator-banner">
        <div>
          <span className="eyebrow">FACULTY SUPERVISION</span>
          <h2>Examination Supervision Duties</h2>
          <p>
            You have <strong>{duties.length}</strong> invigilation {duties.length === 1 ? "duty" : "duties"} assigned.
            Please accept your duties in advance and report to the Chief Superintendent office 30 minutes prior to session start.
          </p>
        </div>
        <span className="hero-icon">📋</span>
      </section>

      {error && <div className="error-message" style={{ margin: "16px 0" }}>{error}</div>}
      {successMsg && <div className="allocation-success" style={{ margin: "16px 0" }}>{successMsg}</div>}

      {/* Invigilation Schedule Table */}
      <section className="panel">
        <div className="section-heading">
          <div>
            <h3>My Assigned Invigilation Duties</h3>
            <p className="panel-subtitle">
              Assigned examination sessions, reporting schedules, and duty confirmation status.
            </p>
          </div>
        </div>

        {loading && <p className="status-message">Loading assigned duties...</p>}

        {!loading && !error && duties.length === 0 && (
          <div className="empty-state-card">
            <span className="empty-icon">✓</span>
            <h3>No Active Invigilation Duties</h3>
            <p>You have not been assigned to invigilate any upcoming examinations at this time.</p>
          </div>
        )}

        {!loading && duties.length > 0 && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Course Code &amp; Title</th>
                  <th>Date &amp; Time</th>
                  <th>Session</th>
                  <th>Supervised Room</th>
                  <th>Duty Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {duties.map((duty) => (
                  <tr key={duty.assignment_id}>
                    <td>
                      <strong className="subject-code-cell">{duty.subject_code}</strong>
                      <div style={{ fontSize: "13px", color: "#475569", marginTop: "2px" }}>
                        {duty.exam_name || duty.subject_name}
                      </div>
                    </td>
                    <td>
                      <strong>{formatExamDate(duty.exam_date)}</strong>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        Reporting: <strong>08:45 AM</strong> ({duty.start_time || "09:30 AM"} – {duty.end_time || "12:30 PM"})
                      </div>
                    </td>
                    <td>
                      <span className={`session-badge ${duty.session === "FN" ? "forenoon" : "afternoon"}`}>
                        {duty.session === "FN" ? "Forenoon (FN)" : "Afternoon (AN)"}
                      </span>
                    </td>
                    <td>
                      <span className="hall-tag" style={{ fontSize: "13px", padding: "4px 8px" }}>
                        {duty.room_no ? `Room ${duty.room_no}` : `Hall ${duty.hall_name}`}
                      </span>
                    </td>
                    <td>
                      {duty.status === "accepted" ? (
                        <span className="status-badge success">✓ Accepted</span>
                      ) : duty.status === "declined" ? (
                        <div>
                          <span className="status-badge error">✗ Declined</span>
                          {duty.decline_reason && (
                            <div style={{ fontSize: "11px", color: "#b91c1c", marginTop: "2px", maxWidth: "160px" }}>
                              Reason: {duty.decline_reason}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="status-badge pending">⌛ Awaiting Response</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {duty.status !== "accepted" && duty.status !== "declined" && (
                          <>
                            <button
                              type="button"
                              className="table-action-btn primary"
                              style={{ background: "#16a34a", borderColor: "#16a34a", color: "#fff" }}
                              onClick={() => handleAccept(duty.assignment_id)}
                            >
                              ✓ Accept
                            </button>
                            <button
                              type="button"
                              className="table-action-btn tertiary"
                              style={{ color: "#dc2626" }}
                              onClick={() => {
                                setDeclineDuty(duty);
                                setDeclineReason("");
                              }}
                            >
                              ✗ Decline
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          className="table-action-btn secondary"
                          title="Send a note or query regarding this duty to the exam office"
                          onClick={() => {
                            setMessageDuty(duty);
                            setAdminNote(duty.message_to_admin || "");
                          }}
                        >
                          💬 Note
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Decline Reason Modal */}
      {declineDuty && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "480px" }}>
            <div className="modal-header">
              <h3>Decline Invigilation Duty</h3>
              <button
                type="button"
                className="close-button"
                onClick={() => setDeclineDuty(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmitDecline} className="modal-body">
              <div style={{ background: "#fef2f2", border: "1px solid #fecdd3", borderRadius: "8px", padding: "12px", marginBottom: "16px" }}>
                <strong style={{ display: "block", color: "#991b1b", fontSize: "14px" }}>
                  {declineDuty.subject_code} — {declineDuty.subject_name}
                </strong>
                <span style={{ fontSize: "12px", color: "#7f1d1d" }}>
                  Room: {declineDuty.room_no || declineDuty.hall_name} · Date: {String(declineDuty.exam_date).slice(0, 10)} ({declineDuty.session})
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="decline-reason-input">Reason for Declining (Required) *</label>
                <textarea
                  id="decline-reason-input"
                  rows={3}
                  required
                  placeholder="e.g. Medical emergency, urgent university research duty, medical leave..."
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
                <small style={{ color: "#64748b", marginTop: "4px", display: "block" }}>
                  This reason will be submitted directly to the Chief Superintendent for reassignment.
                </small>
              </div>

              <div className="modal-footer" style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setDeclineDuty(null)}
                  disabled={declineSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="allocate-button"
                  style={{ background: "#dc2626", borderColor: "#dc2626" }}
                  disabled={declineSubmitting || !declineReason.trim()}
                >
                  {declineSubmitting ? "Submitting..." : "Confirm Decline"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Message to Administrator Modal */}
      {messageDuty && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "480px" }}>
            <div className="modal-header">
              <h3>Message to Examination Office</h3>
              <button
                type="button"
                className="close-button"
                onClick={() => setMessageDuty(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmitMessage} className="modal-body">
              <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 12px" }}>
                Send a quick question, relief request, or reporting note to the examination superintendent for {messageDuty.subject_code} in {messageDuty.room_no || messageDuty.hall_name}.
              </p>

              <div className="form-group">
                <label htmlFor="admin-note-input">Your Message *</label>
                <textarea
                  id="admin-note-input"
                  rows={3}
                  required
                  placeholder="e.g. Will report by 08:30 AM. Please keep question packets ready."
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div className="modal-footer" style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setMessageDuty(null)}
                  disabled={messageSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="allocate-btn-primary"
                  disabled={messageSubmitting || !adminNote.trim()}
                >
                  {messageSubmitting ? "Sending..." : "Send Note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   3. HOD DASHBOARD VIEW (DATE SELECTOR & DAY OVERVIEW)
   ========================================================= */
function HodDashboard({ user }) {
  const [selectedDate, setSelectedDate] = useState(() => {
    // Default to today or next exam date format YYYY-MM-DD
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [daySchedule, setDaySchedule] = useState({ examinations: [], total_exams: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadSchedule(selectedDate);
  }, [selectedDate]);

  async function loadSchedule(dateStr) {
    setLoading(true);
    setError("");
    try {
      const res = await api.getHodDailySchedule(dateStr);
      setDaySchedule(res || { examinations: [], total_exams: 0 });
    } catch (err) {
      console.error("HOD daily schedule error:", err);
      setError("Unable to load examination schedule for selected date.");
    } finally {
      setLoading(false);
    }
  }

  function handleDirectPrint() {
    window.print();
  }

  return (
    <div className="hod-dashboard">
      <header className="page-header no-print">
        <div>
          <h1>Department Examination Overview</h1>
          <p>
            Department Head Portal · <strong>{user?.full_name}</strong> (HOD)
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            className="allocate-btn-primary"
            onClick={handleDirectPrint}
          >
            🖨️ Direct Print Day Summary
          </button>
        </div>
      </header>

      {/* Date Selector Control Bar (No Print) */}
      <section className="panel no-print" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <label htmlFor="hod-date-selector" style={{ fontWeight: 600, color: "#1e293b", fontSize: "14px" }}>
              Select Examination Date:
            </label>
            <input
              type="date"
              id="hod-date-selector"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1.5px solid #cbd5e1",
                fontSize: "14px",
                fontWeight: 600,
                color: "#1e293b",
              }}
            />
          </div>

          <span style={{ color: "#64748b", fontSize: "13px" }}>
            Showing scheduled sessions, allocated rooms, candidate seating, and invigilator responses for <strong>{selectedDate}</strong>.
          </span>
        </div>
      </section>

      {error && <div className="error-message no-print">{error}</div>}

      {/* Printable Day Schedule View */}
      <div className="printable-document">
        <div className="print-sheets-container">
          <div className="official-sheet-page">
            {/* Header */}
            <div className="sheet-header">
              <h2>SIDDHARTHA ACADEMY OF HIGHER EDUCATION DEEMED TO BE UNIVERSITY</h2>
              <h3>DEPARTMENT OF COMPUTER SCIENCE &amp; ENGINEERING</h3>
              <div className="sheet-badge-title">
                DAILY EXAMINATION AUDIT &amp; FACULTY SUPERVISION SCHEDULE — {selectedDate}
              </div>
            </div>

            {loading && <p className="status-message no-print">Loading day schedule...</p>}

            {!loading && daySchedule.examinations.length === 0 && (
              <div className="empty-state-card" style={{ padding: "40px" }}>
                <span className="empty-icon">📅</span>
                <h3>No Examinations Scheduled on {selectedDate}</h3>
                <p>Use the date selector above to view examinations scheduled for other dates.</p>
              </div>
            )}

            {!loading && daySchedule.examinations.map((ex) => (
              <div key={ex.exam_id} style={{ marginBottom: "28px", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
                {/* Exam Title Bar */}
                <div style={{ background: "#f8fafc", padding: "12px 16px", borderBottom: "1px solid #cbd5e1", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "16px", color: "#0f172a" }}>
                      {ex.exam_name || ex.subject_name}
                    </h3>
                    <span style={{ fontSize: "13px", color: "#475569" }}>
                      Course: <strong>{ex.subject_code}</strong> · {ex.subject_name}
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className={`session-badge ${ex.session === "FN" ? "forenoon" : "afternoon"}`}>
                      {ex.session === "FN" ? "Forenoon (FN)" : "Afternoon (AN)"}
                    </span>
                    <span style={{ display: "block", fontSize: "12px", color: "#64748b", marginTop: "3px" }}>
                      {ex.start_time} – {ex.end_time}
                    </span>
                  </div>
                </div>

                <div style={{ padding: "16px" }}>
                  {/* Halls & Seating Row */}
                  <div style={{ marginBottom: "16px" }}>
                    <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "#334155" }}>
                      Allocated Rooms &amp; Candidate Seating (Total: {ex.total_seated} candidates)
                    </h4>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      {ex.halls.map((h) => (
                        <div
                          key={h.hall_id}
                          style={{
                            background: "#f0fdf4",
                            border: "1px solid #bbf7d0",
                            borderRadius: "6px",
                            padding: "8px 12px",
                            fontSize: "13px",
                          }}
                        >
                          <strong>{h.room_no ? `Room ${h.room_no}` : h.hall_name}</strong>: {h.allocated_count} / {h.capacity} seats allocated
                        </div>
                      ))}
                      {ex.halls.length === 0 && (
                        <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                          No rooms allocated yet.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Assigned Invigilators Table */}
                  <div>
                    <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "#334155" }}>
                      Assigned Faculty Invigilators &amp; Response Status
                    </h4>
                    <table className="attendance-register-table">
                      <thead>
                        <tr>
                          <th>Faculty Name</th>
                          <th>Department</th>
                          <th>Supervised Room</th>
                          <th>Duty Response Status</th>
                          <th>Remarks / Decline Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ex.invigilators.map((inv) => (
                          <tr key={inv.assignment_id}>
                            <td><strong>{inv.faculty_name}</strong></td>
                            <td>{inv.department}</td>
                            <td><strong>{inv.room_no || inv.hall_name}</strong></td>
                            <td>
                              {inv.status === "accepted" ? (
                                <span className="status-badge success">✓ Accepted</span>
                              ) : inv.status === "declined" ? (
                                <span className="status-badge error">✗ Declined</span>
                              ) : (
                                <span className="status-badge pending">⌛ Pending</span>
                              )}
                            </td>
                            <td>
                              {inv.status === "declined" ? (
                                <strong style={{ color: "#b91c1c", fontSize: "12px" }}>
                                  {inv.decline_reason || "Declined without reason"}
                                </strong>
                              ) : (
                                <span style={{ color: "#94a3b8" }}>—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {ex.invigilators.length === 0 && (
                          <tr>
                            <td colSpan="5" style={{ textAlign: "center", color: "#94a3b8", padding: "12px" }}>
                              No invigilators assigned to this examination yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   4. ADMIN DASHBOARD VIEW
   ========================================================= */
function AdminDashboard({ user, onNavigate }) {
  const [exams, setExams] = useState([]);
  const [halls, setHalls] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Reassignment modal state
  const [reassignTarget, setReassignTarget] = useState(null);
  const [replacementFacultyId, setReplacementFacultyId] = useState("");
  const [reassignSubmitting, setReassignSubmitting] = useState(false);
  const [reassignSuccess, setReassignSuccess] = useState("");

  useEffect(() => {
    loadAdminData();
  }, []);

  async function loadAdminData() {
    setLoading(true);
    setError("");
    try {
      const [examsRes, hallsRes, facRes, studentsRes, notifRes] = await Promise.all([
        api.getExams(),
        api.getHalls().catch(() => ({ halls: [] })),
        api.getFaculty().catch(() => ({ faculty: [] })),
        api.getStudents().catch(() => ({ students: [] })),
        api.getAdminNotifications().catch(() => ({ declined_duties: [] })),
      ]);
      setExams(Array.isArray(examsRes.exams) ? examsRes.exams : []);
      setHalls(Array.isArray(hallsRes.halls) ? hallsRes.halls : []);
      setFaculty(Array.isArray(facRes.faculty) ? facRes.faculty : []);
      setTotalStudents(Array.isArray(studentsRes.students) ? studentsRes.students.length : 0);
      setNotifications(Array.isArray(notifRes.declined_duties) ? notifRes.declined_duties : []);
    } catch (err) {
      console.error("Admin dashboard error:", err);
      setError("Failed to load dashboard statistics. Please verify backend service.");
    } finally {
      setLoading(false);
    }
  }

  // Handle reassigning faculty
  async function handleConfirmReassign(e) {
    if (e) e.preventDefault();
    if (!reassignTarget || !replacementFacultyId) {
      setError("Please select a replacement faculty member.");
      return;
    }

    setReassignSubmitting(true);
    setError("");
    try {
      await api.reassignInvigilator(reassignTarget.assignment_id, replacementFacultyId);
      setReassignSuccess("Faculty successfully reassigned! Duty reset to pending confirmation.");
      setReassignTarget(null);
      setReplacementFacultyId("");
      loadAdminData();
    } catch (err) {
      setError(err.message || "Failed to reassign faculty.");
    } finally {
      setReassignSubmitting(false);
    }
  }

  function formatExamDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  const cards = [
    {
      title: "Examinations",
      value: exams.length,
      description: "Scheduled examination sessions",
      icon: "▣",
      action: "examinations",
      buttonText: "Manage Exams",
    },
    {
      title: "Examination Halls",
      value: halls.length,
      description: "Available examination rooms",
      icon: "🏛️",
      action: "halls",
      buttonText: "Manage Halls",
    },
    {
      title: "Faculty Members",
      value: faculty.length,
      description: "Registered faculty & invigilators",
      icon: "👥",
      action: "faculty",
      buttonText: "Manage Faculty",
    },
    {
      title: "Total Students",
      value: totalStudents,
      description: "Enrolled candidates in system",
      icon: "🎓",
      action: "examinations",
      buttonText: "View Rosters",
    },
  ];

  return (
    <div className="admin-dashboard">
      <header className="page-header">
        <div>
          <h1>Examination Management Dashboard</h1>
          <p>
            Welcome back, <strong>{user?.full_name}</strong> · System Administrator
          </p>
        </div>
      </header>

      {error && <div className="error-message" style={{ margin: "16px 0" }}>{error}</div>}
      {reassignSuccess && <div className="allocation-success" style={{ margin: "16px 0" }}>{reassignSuccess}</div>}

      {/* Action Alert Banner for Declined Invigilation Duties */}
      {notifications.length > 0 && (
        <section
          style={{
            background: "#fff1f2",
            border: "1.5px solid #fecdd3",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <span style={{ fontSize: "20px" }}>⚠️</span>
            <h3 style={{ margin: 0, color: "#991b1b", fontSize: "16px" }}>
              Action Required: {notifications.length} Declined Invigilation {notifications.length === 1 ? "Duty" : "Duties"}
            </h3>
          </div>
          <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#7f1d1d" }}>
            The following faculty members have declined their assigned examination supervision duties. Please assign replacement faculty immediately.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {notifications.map((n) => (
              <div
                key={n.assignment_id}
                style={{
                  background: "#ffffff",
                  border: "1px solid #fca5a5",
                  borderRadius: "6px",
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div>
                  <strong style={{ color: "#991b1b", fontSize: "14px" }}>
                    {n.faculty_name} ({n.department})
                  </strong>
                  <span style={{ color: "#475569", fontSize: "13px", marginLeft: "8px" }}>
                    declined duty for <strong>{n.exam_name}</strong> in <strong>{n.room_no || n.hall_name}</strong> on {String(n.exam_date).slice(0, 10)} ({n.session}).
                  </span>
                  {n.decline_reason && (
                    <div style={{ fontSize: "12px", color: "#b91c1c", marginTop: "4px" }}>
                      Reason: <em>&quot;{n.decline_reason}&quot;</em>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="table-action-btn primary"
                  style={{ background: "#dc2626", borderColor: "#dc2626", color: "#fff" }}
                  onClick={() => {
                    setReassignTarget(n);
                    setReplacementFacultyId("");
                  }}
                >
                  🔁 Reassign Replacement Faculty
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4 Core Summary Metrics */}
      <section className="stats-grid">
        {cards.map((card) => (
          <article className="stat-card" key={card.title}>
            <div className="stat-card-header">
              <span className="stat-icon">{card.icon}</span>
              <span className="stat-title">{card.title}</span>
            </div>
            <h2>{loading ? "..." : card.value}</h2>
            <small>{card.description}</small>
            <div style={{ marginTop: "12px" }}>
              <button
                type="button"
                className="table-action-btn secondary"
                style={{ fontSize: "12px", width: "100%", justifyContent: "center" }}
                onClick={() => onNavigate(card.action)}
              >
                {card.buttonText} →
              </button>
            </div>
          </article>
        ))}
      </section>

      {/* Simple Management Sections Navigator */}
      <section className="panel" style={{ marginTop: "24px" }}>
        <div className="section-heading">
          <div>
            <h3>Quick Access Sections</h3>
            <p className="panel-subtitle">Access the core modules of the Smart Examination System</p>
          </div>
        </div>

        <div className="quick-actions" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <button
            type="button"
            className="action-card"
            onClick={() => onNavigate("examinations")}
          >
            <span style={{ fontSize: "28px" }}>▣</span>
            <strong>Examinations</strong>
            <small>Add, edit &amp; upload student files</small>
          </button>

          <button
            type="button"
            className="action-card"
            onClick={() => onNavigate("halls")}
          >
            <span style={{ fontSize: "28px" }}>🏛️</span>
            <strong>Halls</strong>
            <small>Configure rooms &amp; seating grids</small>
          </button>

          <button
            type="button"
            className="action-card"
            onClick={() => onNavigate("faculty")}
          >
            <span style={{ fontSize: "28px" }}>👥</span>
            <strong>Faculty</strong>
            <small>Teaching subjects &amp; conflict rules</small>
          </button>

          <button
            type="button"
            className="action-card"
            onClick={() => onNavigate("seating")}
          >
            <span style={{ fontSize: "28px" }}>🪑</span>
            <strong>Seat Allocation</strong>
            <small>Auto rooms, seating &amp; reports</small>
          </button>

          <button
            type="button"
            className="action-card"
            onClick={() => onNavigate("reports")}
          >
            <span style={{ fontSize: "28px" }}>📄</span>
            <strong>Reports</strong>
            <small>Seating charts, sheets &amp; seat search</small>
          </button>
        </div>
      </section>

      {/* Upcoming Examination Schedule Table */}
      <section className="panel" style={{ marginTop: "24px" }}>
        <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3>Upcoming Examination Schedule</h3>
            <p className="panel-subtitle">Active examination sessions and candidate registration status</p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: "12px", padding: "6px 12px" }}
            onClick={() => onNavigate("examinations")}
          >
            + Add New Examination
          </button>
        </div>

        {loading && <p className="status-message">Loading scheduled examinations...</p>}

        {!loading && exams.length === 0 && (
          <div className="empty-state-card">
            <span className="empty-icon">▣</span>
            <h3>No Scheduled Examinations</h3>
            <p>Go to the Examinations section to schedule your first examination session.</p>
          </div>
        )}

        {!loading && exams.length > 0 && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Exam Title</th>
                  <th>Course Code</th>
                  <th>Date &amp; Timing</th>
                  <th>Session</th>
                  <th>Candidates</th>
                  <th>Quick Actions</th>
                </tr>
              </thead>
              <tbody>
                {exams.slice(0, 5).map((exam) => (
                  <tr key={exam.exam_id}>
                    <td>
                      <strong style={{ color: "#0f172a" }}>
                        {exam.exam_name || exam.subject_name}
                      </strong>
                    </td>
                    <td>
                      <span className="subject-code-cell">{exam.subject_code}</span>
                    </td>
                    <td>
                      {formatExamDate(exam.exam_date)}{" "}
                      <span className="text-muted" style={{ fontSize: "12px" }}>
                        ({exam.start_time || "09:30 AM"} – {exam.end_time || "12:30 PM"})
                      </span>
                    </td>
                    <td>
                      <span
                        className={`session-badge ${
                          exam.session === "FN" ? "forenoon" : "afternoon"
                        }`}
                      >
                        {exam.session === "FN" ? "Forenoon (FN)" : "Afternoon (AN)"}
                      </span>
                    </td>
                    <td>
                      <span className="capacity-pill">
                        <strong>{exam.student_count || 0}</strong> / {exam.expected_students || "Any"}
                      </span>
                    </td>
                    <td>
                      <div className="table-action-btns">
                        <button
                          type="button"
                          className="table-action-btn primary"
                          onClick={() => onNavigate("seating")}
                        >
                          🪑 Seating
                        </button>
                        <button
                          type="button"
                          className="table-action-btn secondary"
                          onClick={() => onNavigate("reports")}
                        >
                          📄 Reports
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Reassign Faculty Modal */}
      {reassignTarget && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "520px" }}>
            <div className="modal-header">
              <h3>Reassign Invigilation Duty</h3>
              <button
                type="button"
                className="close-button"
                onClick={() => setReassignTarget(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleConfirmReassign} className="modal-body">
              <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "12px", marginBottom: "16px" }}>
                <strong style={{ display: "block", color: "#0f172a", fontSize: "14px" }}>
                  {reassignTarget.exam_name}
                </strong>
                <span style={{ fontSize: "12px", color: "#64748b" }}>
                  Room: <strong>{reassignTarget.room_no || reassignTarget.hall_name}</strong> · Date: {String(reassignTarget.exam_date).slice(0, 10)} ({reassignTarget.session})
                </span>
                <div style={{ marginTop: "6px", fontSize: "12px", color: "#dc2626" }}>
                  Declined by: <strong>{reassignTarget.faculty_name}</strong>
                  {reassignTarget.decline_reason && <span> — Reason: &quot;{reassignTarget.decline_reason}&quot;</span>}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="replacement-faculty-select">Select Replacement Faculty Member *</label>
                <select
                  id="replacement-faculty-select"
                  value={replacementFacultyId}
                  onChange={(e) => setReplacementFacultyId(e.target.value)}
                  required
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1.5px solid #cbd5e1" }}
                >
                  <option value="">Choose replacement faculty</option>
                  {faculty
                    .filter((f) => f.faculty_id !== reassignTarget.faculty_id)
                    .map((f) => {
                      const teachesCourse = f.subjects_taught?.some(
                        (s) => s.subject_name === reassignTarget.exam_name || s.subject_code === reassignTarget.subject_code
                      );
                      return (
                        <option
                          key={f.faculty_id}
                          value={f.faculty_id}
                          disabled={teachesCourse}
                        >
                          {f.faculty_name} ({f.department}) {teachesCourse ? "— [Cannot Assign: Teaches Course]" : ""}
                        </option>
                      );
                    })}
                </select>
                <small style={{ color: "#64748b", marginTop: "4px", display: "block" }}>
                  The system prevents selecting faculty who teach this subject or have overlapping duty times.
                </small>
              </div>

              <div className="modal-footer" style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setReassignTarget(null)}
                  disabled={reassignSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="allocate-btn-primary"
                  disabled={reassignSubmitting || !replacementFacultyId}
                >
                  {reassignSubmitting ? "Reassigning..." : "Confirm Replacement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   MAIN DASHBOARD ROUTER
   ========================================================= */
export default function Dashboard({ onNavigate }) {
  const { user, isHod, isInvigilator, isStudent } = useAuth();

  if (isStudent) {
    return <StudentDashboard user={user} onNavigate={onNavigate} />;
  }

  if (isInvigilator) {
    return <InvigilatorDashboard user={user} onNavigate={onNavigate} />;
  }

  if (isHod) {
    return <HodDashboard user={user} onNavigate={onNavigate} />;
  }

  return <AdminDashboard user={user} onNavigate={onNavigate} />;
}
