import { useState, useEffect } from "react";
import api from "../services/api";

export default function ReassignInvigilatorModal({
  isOpen,
  assignment,
  onClose,
  onSuccess,
}) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [excludedList, setExcludedList] = useState([]);
  const [selectedFacultyId, setSelectedFacultyId] = useState("");
  const [statusMessage, setStatusMessage] = useState({ type: "", text: "" });
  const [mappingWarning, setMappingWarning] = useState("");

  useEffect(() => {
    if (isOpen && assignment?.assignment_id) {
      loadCandidates();
    } else {
      setCandidates([]);
      setExcludedList([]);
      setSelectedFacultyId("");
      setStatusMessage({ type: "", text: "" });
      setMappingWarning("");
    }
  }, [isOpen, assignment]);

  async function loadCandidates() {
    if (!assignment?.assignment_id) return;
    setLoading(true);
    setStatusMessage({ type: "", text: "" });
    setSelectedFacultyId("");
    try {
      const res = await api.getEligibleReplacements(assignment.assignment_id);
      const eligible = res.eligible_replacements || [];
      const excluded = res.excluded_faculty || [];
      setCandidates(eligible);
      setExcludedList(excluded);
      if (res.warning) {
        setMappingWarning(res.warning);
      } else {
        setMappingWarning("");
      }

      if (eligible.length > 0) {
        setSelectedFacultyId(String(eligible[0].faculty_id));
      }
    } catch (err) {
      console.error("Failed to fetch eligible replacements:", err);
      setStatusMessage({
        type: "danger",
        text: err.message || "Failed to load eligible replacement candidates.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmReassign(e) {
    if (e) e.preventDefault();
    if (!assignment?.assignment_id || !selectedFacultyId) {
      setStatusMessage({
        type: "danger",
        text: "Please select an eligible replacement faculty member.",
      });
      return;
    }

    setSubmitting(true);
    setStatusMessage({ type: "", text: "" });
    try {
      const res = await api.reassignInvigilator(
        assignment.assignment_id,
        parseInt(selectedFacultyId, 10),
        assignment.decline_reason || "Duty declined by faculty"
      );
      setStatusMessage({
        type: "success",
        text: res.message || "Invigilator successfully reassigned.",
      });
      setTimeout(() => {
        if (onSuccess) onSuccess();
        if (onClose) onClose();
      }, 700);
    } catch (err) {
      setStatusMessage({
        type: "danger",
        text: err.message || "Failed to reassign invigilator.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen || !assignment) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ maxWidth: "680px", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>🔄</span>
            <h3 className="modal-title">Reassign Invigilation Duty</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} disabled={submitting}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {statusMessage.text && (
            <div className={`alert alert-${statusMessage.type}`} style={{ marginBottom: "14px" }}>
              <span>{statusMessage.type === "success" ? "✅" : "⚠️"}</span>
              <span>{statusMessage.text}</span>
            </div>
          )}

          {mappingWarning && (
            <div className="alert alert-warning" style={{ fontSize: "12.5px", marginBottom: "14px" }}>
              <span>⚠️</span>
              <div>
                <strong>Faculty-Subject Mapping Notice:</strong>
                <p style={{ margin: "2px 0 0", fontSize: "12px" }}>{mappingWarning}</p>
              </div>
            </div>
          )}

          {/* Exam & Hall Details */}
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "14px",
              marginBottom: "12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--primary-navy)" }}>
                {assignment.exam_name || assignment.subject_name}
              </div>
              <span className="badge-cse" style={{ fontSize: "11px" }}>
                {assignment.subject_code}
              </span>
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
              <div>📅 <strong>Date:</strong> {String(assignment.exam_date).slice(0, 10)} &bull; ⏰ <strong>Time:</strong> {assignment.start_time && assignment.end_time ? `${assignment.start_time.slice(0, 5)} – ${assignment.end_time.slice(0, 5)}` : assignment.session} ({assignment.session})</div>
              <div>🏛️ <strong>Hall:</strong> {assignment.hall_name} (Room {assignment.room_no || assignment.hall_name})</div>
            </div>
          </div>

          {/* Current Invigilator Banner (Declined / Teaching Conflict / Reassignment) */}
          <div
            style={{
              background: assignment.is_teaching_conflict ? "#fee2e2" : assignment.status === "declined" ? "#fff1f2" : "#f1f5f9",
              border: `1px solid ${assignment.is_teaching_conflict ? "#fca5a5" : assignment.status === "declined" ? "#fecdd3" : "#cbd5e1"}`,
              borderRadius: "8px",
              padding: "12px 14px",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", flexWrap: "wrap", gap: "6px" }}>
              <span style={{ fontWeight: 700, color: assignment.is_teaching_conflict ? "#991b1b" : assignment.status === "declined" ? "#991b1b" : "var(--primary-navy)", fontSize: "13.5px" }}>
                {assignment.is_teaching_conflict ? "🚨 Teaching Conflict Detected:" : assignment.status === "declined" ? "Declined by:" : "Current Invigilator:"}{" "}
                {assignment.faculty_name} ({assignment.department || "CSE"})
              </span>
              <span
                style={{
                  fontSize: "11px",
                  color: assignment.is_teaching_conflict ? "#991b1b" : assignment.status === "declined" ? "#b91c1c" : "#475569",
                  background: assignment.is_teaching_conflict ? "#fecdd3" : assignment.status === "declined" ? "#ffe4e6" : "#e2e8f0",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontWeight: 700,
                }}
              >
                {assignment.is_teaching_conflict ? "Course Instructor Conflict" : assignment.status === "declined" ? "Status: Declined" : "Active Assignment"}
              </span>
            </div>
            <div style={{ fontSize: "12.5px", color: assignment.is_teaching_conflict ? "#7f1d1d" : assignment.status === "declined" ? "#7f1d1d" : "#334155" }}>
              {assignment.is_teaching_conflict ? (
                <span>
                  <strong>Mandatory Policy Restriction:</strong> Faculty is mapped as an instructor for <strong>{assignment.subject_code}</strong>. Invigilators are strictly forbidden from supervising exams for subjects they teach.
                </span>
              ) : (
                <span>
                  <strong>Reason:</strong> <em>&quot;{assignment.decline_reason || "Administrative duty reassignment"}&quot;</em>
                </span>
              )}
            </div>
            {assignment.message_to_admin && (
              <div style={{ fontSize: "12px", color: "#991b1b", marginTop: "3px" }}>
                <strong>Note to Admin:</strong> {assignment.message_to_admin}
              </div>
            )}
            {assignment.declined_at && (
              <div style={{ fontSize: "11px", color: "#991b1b", marginTop: "4px" }}>
                Declined At: {String(assignment.declined_at).replace("T", " ").slice(0, 19)}
              </div>
            )}
          </div>

          {/* Header with Refresh Candidates button */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <label className="form-label" style={{ fontWeight: 700, margin: 0 }}>
              Eligible Replacement Faculty:
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ padding: "4px 10px", fontSize: "12px" }}
              onClick={loadCandidates}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "🔄 Refresh Candidates"}
            </button>
          </div>

          <p className="form-helper" style={{ marginBottom: "12px" }}>
            Faculty are ranked by lowest existing invigilation workload. Non-conflicting faculty who are available, active, and <strong>do not teach this subject</strong> are eligible.
          </p>

          {loading ? (
            <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-secondary)" }}>
              <span>⏳ Searching eligible, non-conflicting faculty...</span>
            </div>
          ) : candidates.length === 0 ? (
            <div>
              <div className="alert alert-danger" style={{ marginBottom: "14px" }}>
                <strong>No eligible replacement faculty found without schedule conflicts.</strong>
                <p style={{ margin: "4px 0 0", fontSize: "12.5px" }}>
                  All other faculty members either teach this course ({assignment.subject_code}), have overlapping exam supervision duties, or have marked leave/unavailability.
                </p>
              </div>

              {/* Exclusion Diagnostic Table */}
              {excludedList.length > 0 && (
                <div style={{ border: "1px solid var(--border-color)", borderRadius: "6px", overflow: "hidden" }}>
                  <div style={{ background: "#f8fafc", padding: "8px 12px", borderBottom: "1px solid var(--border-color)", fontWeight: 700, fontSize: "12.5px", color: "var(--primary-navy)" }}>
                    Evaluation Diagnostics ({excludedList.length} Faculty Inspected):
                  </div>
                  <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                    <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                          <th style={{ padding: "6px 10px" }}>Faculty</th>
                          <th style={{ padding: "6px 10px" }}>Dept</th>
                          <th style={{ padding: "6px 10px" }}>Exclusion Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {excludedList.map((fac) => (
                          <tr key={fac.faculty_id} style={{ borderTop: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "6px 10px", fontWeight: 600 }}>{fac.faculty_name}</td>
                            <td style={{ padding: "6px 10px", color: "var(--text-secondary)" }}>{fac.department}</td>
                            <td style={{ padding: "6px 10px" }}>
                              {fac.reason_code === "subject_teaching_conflict" || fac.is_subject_teacher ? (
                                <span style={{ background: "#fee2e2", color: "#b91c1c", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", fontSize: "11px" }}>
                                  🚫 Teaches Subject ({assignment.subject_code})
                                </span>
                              ) : (
                                <span style={{ color: "#dc2626" }}>{fac.exclusion_reason}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "250px", overflowY: "auto", paddingRight: "4px" }}>
                {candidates.map((cand) => {
                  const isSelected = String(selectedFacultyId) === String(cand.faculty_id);
                  return (
                    <label
                      key={cand.faculty_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        border: `2px solid ${isSelected ? "var(--primary-navy)" : "var(--border-color)"}`,
                        borderRadius: "8px",
                        cursor: "pointer",
                        background: isSelected ? "#f0f9ff" : "#ffffff",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <input
                          type="radio"
                          name="replacement_faculty"
                          value={cand.faculty_id}
                          checked={isSelected}
                          onChange={(e) => setSelectedFacultyId(e.target.value)}
                        />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--primary-navy)", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>{cand.faculty_name}</span>
                            <span style={{ fontSize: "10.5px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", padding: "1px 6px", borderRadius: "10px", fontWeight: 600 }}>
                              ✓ Non-Teaching
                            </span>
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                            {cand.department} &bull; {cand.email || "Institutional Account"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {cand.recommendation_rank === 1 ? (
                          <span
                            style={{
                              background: "#dcfce7",
                              color: "#15803d",
                              border: "1px solid #86efac",
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "3px 8px",
                              borderRadius: "12px",
                            }}
                          >
                            ★ Lowest Workload ({cand.duty_count} duties)
                          </span>
                        ) : (
                          <span
                            style={{
                              background: "#f1f5f9",
                              color: "#475569",
                              fontSize: "11.5px",
                              padding: "2px 8px",
                              borderRadius: "12px",
                            }}
                          >
                            Workload: {cand.duty_count} duties
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Collapsible Inspection of Excluded Faculty */}
              {excludedList.length > 0 && (
                <div style={{ marginTop: "12px", border: "1px solid var(--border-color)", borderRadius: "6px", overflow: "hidden" }}>
                  <details style={{ background: "#f8fafc" }}>
                    <summary style={{ padding: "8px 12px", cursor: "pointer", fontWeight: 600, fontSize: "12px", color: "#475569", outline: "none" }}>
                      🔍 View Excluded Faculty ({excludedList.length}) — Subject teachers, busy or unavailable
                    </summary>
                    <div style={{ maxHeight: "160px", overflowY: "auto", background: "#ffffff" }}>
                      <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                            <th style={{ padding: "6px 10px" }}>Faculty</th>
                            <th style={{ padding: "6px 10px" }}>Dept</th>
                            <th style={{ padding: "6px 10px" }}>Exclusion Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {excludedList.map((fac) => (
                            <tr key={fac.faculty_id} style={{ borderTop: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "6px 10px", fontWeight: 600 }}>{fac.faculty_name}</td>
                              <td style={{ padding: "6px 10px", color: "var(--text-secondary)" }}>{fac.department}</td>
                              <td style={{ padding: "6px 10px" }}>
                                {fac.reason_code === "subject_teaching_conflict" || fac.is_subject_teacher ? (
                                  <span style={{ background: "#fee2e2", color: "#b91c1c", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", fontSize: "11px" }}>
                                    🚫 Teaches Subject ({assignment.subject_code})
                                  </span>
                                ) : (
                                  <span style={{ color: "#dc2626" }}>{fac.exclusion_reason}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-navy"
            onClick={handleConfirmReassign}
            disabled={submitting || loading || candidates.length === 0 || !selectedFacultyId}
          >
            {submitting ? "Reassigning..." : "Confirm Reassignment"}
          </button>
        </div>
      </div>
    </div>
  );
}
