import { useState, useEffect } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function InvigilatorSchedule() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: "", text: "" });

  // Decline Modal
  const [decliningItem, setDecliningItem] = useState(null);
  const [declineReason, setDeclineReason] = useState("Personal reasons");
  const [otherExplanation, setOtherExplanation] = useState("");
  const [declineNote, setDeclineNote] = useState("");
  const [declineError, setDeclineError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadMyDuties();
  }, [user]);

  async function loadMyDuties() {
    setLoading(true);
    setStatusMessage({ type: "", text: "" });
    try {
      const facultyId = user?.faculty_id;
      const res = await api.getInvigilatorAssignments(null, facultyId);
      setAssignments(res.assignments || []);
    } catch (err) {
      console.warn("Could not load invigilator duties:", err);
      setStatusMessage({ type: "danger", text: "Failed to load assigned invigilation duties." });
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept(assignmentId) {
    setSubmitting(true);
    try {
      await api.respondDuty(assignmentId, { response: "accepted" });
      setStatusMessage({ type: "success", text: "Duty accepted successfully." });
      loadMyDuties();
    } catch (err) {
      setStatusMessage({ type: "danger", text: err.message || "Failed to submit response." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeclineSubmit(e) {
    e.preventDefault();
    if (!decliningItem) return;
    setDeclineError("");

    if (!declineReason) {
      setDeclineError("Please select a valid reason for declining this invigilation duty.");
      return;
    }

    if (declineReason === "Other" && !otherExplanation.trim()) {
      setDeclineError("Please provide a written explanation when selecting 'Other'.");
      return;
    }

    setSubmitting(true);
    try {
      const finalReason = declineReason === "Other" ? `Other: ${otherExplanation.trim()}` : declineReason;
      await api.respondDuty(decliningItem.assignment_id, {
        action: "decline",
        reason: finalReason,
        explanation: declineReason === "Other" ? otherExplanation.trim() : "",
        message: declineNote.trim(),
      });
      setStatusMessage({
        type: "warning",
        text: "Duty marked as declined. Administration has been notified and will reassign replacement faculty.",
      });
      setDecliningItem(null);
      setDeclineReason("Personal reasons");
      setOtherExplanation("");
      setDeclineNote("");
      setDeclineError("");
      loadMyDuties();
    } catch (err) {
      setDeclineError(err.message || "Failed to decline duty.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="invigilator-schedule-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Invigilation Duties</h1>
          <p className="page-subtitle">
            View scheduled examination supervision duties and respond with acceptance or conflict notice.
          </p>
        </div>
      </div>

      {statusMessage.text && (
        <div className={`alert alert-${statusMessage.type}`}>
          <span>{statusMessage.type === "success" ? "✅" : "⚠️"}</span>
          <span>{statusMessage.text}</span>
        </div>
      )}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Duty Assignments Schedule</h2>
            <p className="panel-subtitle">
              Supervision shifts assigned by examination administration.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="form-helper" style={{ padding: "24px 0" }}>Loading assigned duties...</p>
        ) : assignments.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">☕</span>
            <h3>No Invigilation Duties Assigned</h3>
            <p>You currently have no active examination supervision shifts scheduled.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
            {assignments.map((item) => {
              const status = item.status || "pending";
              return (
                <div
                  key={item.assignment_id}
                  style={{
                    background: "#ffffff",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-lg)",
                    padding: "18px",
                    boxShadow: "var(--shadow-xs)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <span className="badge-cse">CSE Examination</span>
                      <span className={`status-pill ${status === "accepted" ? "active" : status === "declined" ? "danger" : "warning"}`}>
                        {status === "accepted" ? "● Accepted" : status === "declined" ? "● Declined" : "○ Response Required"}
                      </span>
                    </div>

                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--primary-navy)", marginBottom: "4px" }}>
                      {item.exam_name || item.subject_name}
                    </h3>
                    <p className="form-helper" style={{ marginBottom: "12px" }}>
                      Course: <strong>{item.subject_code}</strong>
                    </p>

                    <div style={{ fontSize: "13px", lineHeight: "1.6", color: "var(--text-secondary)" }}>
                      <div>📅 <strong>Date:</strong> {String(item.exam_date).slice(0, 10)}</div>
                      <div>⏰ <strong>Exam Timing:</strong> {item.start_time && item.end_time ? `${item.start_time.slice(0, 5)} – ${item.end_time.slice(0, 5)}` : item.session === "FN" ? "09:30 AM – 12:30 PM" : "01:30 PM – 04:30 PM"} ({item.session})</div>
                      <div>🏛️ <strong>Assigned Room:</strong> {item.hall_name} (Room {item.room_no || item.hall_name})</div>
                      <div>⏱️ <strong>Reporting Time:</strong> 30 minutes before exam commencement</div>
                      {status === "accepted" && (
                        <div style={{ color: "#16a34a", marginTop: "6px", fontWeight: 600 }}>
                          ✓ Confirmed: Attendance accepted
                        </div>
                      )}
                      {status === "declined" && (
                        <div style={{ color: "#dc2626", marginTop: "6px" }}>
                          ✗ Declined: {item.decline_reason || "Prior commitment"}
                        </div>
                      )}
                    </div>
                  </div>

                  {status === "pending" && (
                    <div style={{ display: "flex", gap: "10px", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--border-color)" }}>
                      <button
                        type="button"
                        className="btn btn-success btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => handleAccept(item.assignment_id)}
                        disabled={submitting}
                      >
                        ✅ Accept Duty
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => setDecliningItem(item)}
                        disabled={submitting}
                      >
                        ❌ Decline Duty
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Decline Duty Modal */}
      {decliningItem && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Decline Invigilation Duty</h3>
              <button type="button" className="modal-close-btn" onClick={() => setDecliningItem(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleDeclineSubmit}>
              <div className="modal-body">
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px", marginBottom: "16px" }}>
                  <div style={{ fontWeight: 700, color: "#991b1b", fontSize: "14px", marginBottom: "4px" }}>
                    {decliningItem.exam_name || decliningItem.subject_name} ({decliningItem.subject_code})
                  </div>
                  <div style={{ fontSize: "12.5px", color: "#7f1d1d" }}>
                    🏛️ Hall: <strong>{decliningItem.hall_name}</strong> (Room {decliningItem.room_no || decliningItem.hall_name}) &bull; 📅 Date: <strong>{String(decliningItem.exam_date).slice(0, 10)}</strong> &bull; ⏰ Timing: <strong>{decliningItem.start_time && decliningItem.end_time ? `${decliningItem.start_time.slice(0, 5)} - ${decliningItem.end_time.slice(0, 5)}` : decliningItem.session}</strong>
                  </div>
                </div>

                {declineError && (
                  <div className="alert alert-danger" style={{ marginBottom: "14px", fontSize: "13px" }}>
                    ⚠️ {declineError}
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: "14px" }}>
                  <label className="form-label" style={{ fontWeight: 700 }}>
                    Reason for Declining Duty <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <select
                    className="form-control"
                    value={declineReason}
                    onChange={(e) => {
                      setDeclineReason(e.target.value);
                      setDeclineError("");
                    }}
                    required
                  >
                    <option value="Personal reasons">Personal reasons</option>
                    <option value="Health issues">Health issues</option>
                    <option value="Unavailable on examination date">Unavailable on examination date</option>
                    <option value="Already assigned another academic duty">Already assigned another academic duty</option>
                    <option value="Other">Other</option>
                  </select>
                  <p className="form-helper" style={{ marginTop: "4px" }}>
                    Select the institutional category that best describes your inability to attend.
                  </p>
                </div>

                {declineReason === "Other" && (
                  <div className="form-group" style={{ marginBottom: "14px" }}>
                    <label className="form-label" style={{ fontWeight: 700 }}>
                      Written Explanation <span style={{ color: "#dc2626" }}>* (Required for &quot;Other&quot;)</span>
                    </label>
                    <textarea
                      className="form-control"
                      rows={2}
                      placeholder="Please specify the specific circumstance..."
                      value={otherExplanation}
                      onChange={(e) => {
                        setOtherExplanation(e.target.value);
                        setDeclineError("");
                      }}
                      required
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Additional Comments for Administration (Optional)
                  </label>
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="Any supplemental details or notes for the examination office..."
                    value={declineNote}
                    onChange={(e) => setDeclineNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setDecliningItem(null);
                    setDeclineError("");
                  }}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger" disabled={submitting}>
                  {submitting ? "Submitting Decline..." : "Confirm Decline Duty"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
