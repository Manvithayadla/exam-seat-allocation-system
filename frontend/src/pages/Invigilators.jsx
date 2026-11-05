import { useEffect, useState } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function Invigilators({ initialExamId }) {
  const { user, isAdmin, isHod, isInvigilator } = useAuth();
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(
    initialExamId ? String(initialExamId) : ""
  );
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load exams
  useEffect(() => {
    api
      .getExams()
      .then((data) => {
        const loadedExams = Array.isArray(data.exams) ? data.exams : [];
        setExams(loadedExams);
        if (!selectedExamId && loadedExams.length > 0) {
          setSelectedExamId(String(loadedExams[0].exam_id));
        }
      })
      .catch((err) => console.warn("Could not load exams list:", err));
  }, []);

  // Sync initialExamId
  useEffect(() => {
    if (initialExamId) {
      setSelectedExamId(String(initialExamId));
    }
  }, [initialExamId]);

  // Load assignments
  useEffect(() => {
    loadAssignments();
  }, [selectedExamId, isInvigilator, user]);

  async function loadAssignments() {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (isInvigilator) {
        // Invigilators view their own duties across all exams
        const facultyId = user?.faculty_id;
        const res = await api.getInvigilatorAssignments(null, facultyId);
        setAssignments(res.assignments || []);
      } else {
        // Admins view duties for the selected exam
        if (!selectedExamId) {
          setAssignments([]);
          return;
        }
        const res = await api.getInvigilatorAssignments(selectedExamId);
        setAssignments(res.assignments || []);
      }
    } catch (err) {
      console.warn("Could not load assignments:", err.message);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }

  // Admin assigns invigilators
  async function handleAssign() {
    if (!selectedExamId) {
      setError("Please select an examination first.");
      return;
    }

    setAssigning(true);
    setError("");
    setSuccess("");

    try {
      const res = await api.assignInvigilators(selectedExamId);
      setAssignments(res.assignments || []);
      setSuccess(res.message || "Invigilators assigned successfully.");
    } catch (err) {
      setError(
        err.message ||
          "Failed to assign invigilators. Ensure seats have been allocated for this exam and faculty are available."
      );
    } finally {
      setAssigning(false);
    }
  }

  function formatExamDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  function downloadDutySlip(examId, facultyId) {
    const url = api.getReportUrl("duties", examId, { faculty_id: facultyId });
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const selectedExam = exams.find(
    (e) => String(e.exam_id) === String(selectedExamId)
  );

  return (
    <div className="invigilators-page">
      <header className="page-header">
        <div>
          <h1>Invigilator Assignment & Duty Information</h1>
          <p>
            {isInvigilator
              ? "Your official examination duty assignments and supervisor slips."
              : "Greedy min-heap invigilator scheduling balancing faculty duty workload."}
          </p>
        </div>
      </header>

      {/* Admin / HOD Control Panel */}
      {!isInvigilator && (
        <section className="panel module-panel">
          <div className="section-heading">
            <div>
              <h3>Generate Invigilator Assignments</h3>
              <p className="panel-subtitle">
                Select an examination with allocated seats to assign available faculty.
              </p>
            </div>
          </div>

          <div className="module-form">
            <div className="control-group">
              <label htmlFor="invig-exam-select">Select Examination Session</label>
              <select
                id="invig-exam-select"
                value={selectedExamId}
                onChange={(e) => {
                  setSelectedExamId(e.target.value);
                  setError("");
                  setSuccess("");
                }}
                disabled={assigning || loading}
              >
                <option value="">Choose an examination</option>
                {exams.map((exam) => (
                  <option key={exam.exam_id} value={exam.exam_id}>
                    {exam.subject_code} — {exam.subject_name} ({exam.session})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="allocate-button"
              onClick={handleAssign}
              disabled={!selectedExamId || assigning || loading}
            >
              {assigning ? "Assigning Faculty..." : "⚡ Assign Invigilators"}
            </button>
          </div>

          {error && <div className="allocation-error">{error}</div>}
          {success && <div className="allocation-success">{success}</div>}
        </section>
      )}

      {/* Invigilator Duty View */}
      {isInvigilator && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>My Assigned Examination Duties</h3>
              <p className="panel-subtitle">
                Registered Faculty: <strong>{user?.full_name}</strong> (ID #{user?.faculty_id})
              </p>
            </div>
          </div>

          {loading && <p className="status-message">Loading assigned duties...</p>}

          {!loading && assignments.length === 0 && (
            <div className="empty-state-card">
              <span className="empty-icon">✓</span>
              <h3>No Invigilation Duties Assigned</h3>
              <p>You have not been assigned to any upcoming examination sessions currently.</p>
            </div>
          )}

          {!loading && assignments.length > 0 && (
            <div className="duties-grid">
              {assignments.map((item) => (
                <div key={item.assignment_id} className="duty-card">
                  <div className="duty-card-header">
                    <span className="duty-session-badge">
                      {item.session === "FN" ? "Forenoon (FN)" : "Afternoon (AN)"}
                    </span>
                    <span className="duty-date">{formatExamDate(item.exam_date)}</span>
                  </div>

                  <h3 className="duty-subject">
                    {item.subject_code} — {item.subject_name}
                  </h3>

                  <div className="duty-details-list">
                    <div className="duty-detail-row">
                      <span>Assigned Hall:</span>
                      <strong>Hall {item.hall_name}</strong>
                    </div>
                    <div className="duty-detail-row">
                      <span>Department:</span>
                      <strong>{item.faculty_department}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Admin Assigned Faculty Table */}
      {!isInvigilator && (
        <section className="panel module-panel">
          <div className="section-heading">
            <div>
              <h3>
                Assigned Faculty Roster:{" "}
                {selectedExam ? `${selectedExam.subject_code} (${selectedExam.session})` : ""}
              </h3>
              <p className="panel-subtitle">
                {assignments.length} invigilator assignment(s) recorded in the database.
              </p>
            </div>
            {assignments.length > 0 && selectedExamId && isAdmin && (
              <button
                type="button"
                className="duty-report-btn"
                onClick={() => downloadDutySlip(selectedExamId, "")}
              >
                ▤ Download All Duty Slips PDF
              </button>
            )}
          </div>

          {loading && <p className="status-message">Loading invigilator assignments...</p>}

          {!loading && assignments.length === 0 && (
            <p className="status-message">
              No faculty assigned to this examination yet. Click &quot;Assign Invigilators&quot; above to run duty scheduling.
            </p>
          )}

          {!loading && assignments.length > 0 && (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Faculty ID</th>
                    <th>Faculty Name</th>
                    <th>Department</th>
                    <th>Exam Date</th>
                    <th>Session</th>
                    <th>Supervised Hall</th>
                    <th>Cumulative Duties</th>
                    <th>Duty Slip</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((item, idx) => (
                    <tr key={`${item.faculty_id}-${item.hall_id}-${idx}`}>
                      <td>#{item.faculty_id}</td>
                      <td>
                        <strong>{item.faculty_name}</strong>
                      </td>
                      <td>
                        <span className={`dept-tag ${item.faculty_department?.toLowerCase()}`}>
                          {item.faculty_department || "—"}
                        </span>
                      </td>
                      <td>{formatExamDate(item.exam_date)}</td>
                      <td>
                        <span
                          className={`session-badge ${
                            item.session === "FN" ? "forenoon" : "afternoon"
                          }`}
                        >
                          {item.session === "FN" ? "Forenoon (FN)" : "Afternoon (AN)"}
                        </span>
                      </td>
                      <td>
                        <strong>Hall {item.hall_name}</strong>
                      </td>
                      <td>
                        <span className="duty-count-pill">
                          {item.previous_duty_count ?? 0} duties
                        </span>
                      </td>
                      <td>
                        {isAdmin ? (
                          <button
                            type="button"
                            className="table-action-btn secondary"
                            onClick={() => downloadDutySlip(item.exam_id, item.faculty_id)}
                          >
                            📄 Slip PDF
                          </button>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
