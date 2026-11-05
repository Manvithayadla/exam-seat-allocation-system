import { useEffect, useState } from "react";
import api from "../services/api";

export default function ConflictDetection({ initialExamId }) {
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(
    initialExamId ? String(initialExamId) : ""
  );
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

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

  useEffect(() => {
    if (initialExamId) {
      setSelectedExamId(String(initialExamId));
    }
  }, [initialExamId]);

  // Auto-run conflict check when exam is selected
  useEffect(() => {
    if (selectedExamId) {
      runConflictCheck(selectedExamId);
    }
  }, [selectedExamId]);

  async function runConflictCheck(examIdToTest) {
    const id = examIdToTest || selectedExamId;
    if (!id) {
      setError("Please select an examination to check.");
      return;
    }

    setChecking(true);
    setError("");
    setReport(null);

    try {
      const data = await api.checkConflicts(id);
      setReport(data);
    } catch (err) {
      setError(
        err.message ||
          "Failed to run conflict detection. Ensure seats and invigilators have been configured."
      );
    } finally {
      setChecking(false);
    }
  }

  const selectedExam = exams.find(
    (e) => String(e.exam_id) === String(selectedExamId)
  );

  const seatingConflicts = report?.seating_conflicts || [];
  const invigilatorConflicts = report?.invigilator_conflicts || [];
  const availabilityConflicts = report?.availability_conflicts || [];
  const totalConflicts = report?.total_conflicts ?? 0;

  return (
    <div className="conflicts-page">
      <header className="page-header">
        <div>
          <h1>Examination Conflict Detection</h1>
          <p>
            Automated verification verifying student department adjacency and invigilator
            supervision integrity.
          </p>
        </div>
      </header>

      {/* Selector & Actions */}
      <section className="panel module-panel">
        <div className="module-form">
          <div className="control-group">
            <label htmlFor="conflict-exam-select">Select Examination Session</label>
            <select
              id="conflict-exam-select"
              value={selectedExamId}
              onChange={(e) => {
                setSelectedExamId(e.target.value);
                setError("");
                setReport(null);
              }}
              disabled={checking}
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
            onClick={() => runConflictCheck(selectedExamId)}
            disabled={!selectedExamId || checking}
          >
            {checking ? "Analyzing Constraints..." : "🔍 Run Integrity Check"}
          </button>
        </div>

        {error && <div className="allocation-error">{error}</div>}
      </section>

      {checking && (
        <p className="status-message">
          Checking same-department adjacency, faculty overlap, and availability...
        </p>
      )}

      {/* Results Banner */}
      {!checking && report && (
        <>
          <div
            className={`conflict-result-banner ${
              totalConflicts === 0 ? "clean" : "has-conflicts"
            }`}
          >
            <span className="banner-status-icon">
              {totalConflicts === 0 ? "✓" : "⚠"}
            </span>
            <div className="banner-status-text">
              <h2>
                {totalConflicts === 0
                  ? "All Constraints Passed — No Conflicts Detected"
                  : `${totalConflicts} Integrity Issue(s) Detected`}
              </h2>
              <p>
                Exam: <strong>{selectedExam?.subject_code} ({selectedExam?.session})</strong> ·{" "}
                {totalConflicts === 0
                  ? "Seating strictly separates peers from the same branch, and all faculty duties are collision-free."
                  : "Review the flagged items below to resolve seating adjacency or invigilator assignment issues."}
              </p>
            </div>
          </div>

          {/* Conflict Categories Grid */}
          <div className="conflict-categories-grid">
            {/* Category 1: Same Department Adjacency */}
            <div className="panel conflict-card">
              <div className="conflict-card-header">
                <span className="cat-icon">👥</span>
                <div>
                  <h4>Same-Department Seating Adjacency</h4>
                  <small>Students from the same branch sitting next to each other</small>
                </div>
                <span
                  className={`conflict-count-badge ${
                    seatingConflicts.length > 0 ? "danger" : "clean"
                  }`}
                >
                  {seatingConflicts.length}
                </span>
              </div>

              {seatingConflicts.length === 0 ? (
                <p className="conflict-card-empty">
                  ✓ Passed: No horizontal, vertical, or diagonal same-branch neighbours.
                </p>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Hall</th>
                        <th>Student 1</th>
                        <th>Student 2</th>
                        <th>Branch</th>
                        <th>Pos 1</th>
                        <th>Pos 2</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seatingConflicts.map((c, i) => (
                        <tr key={i}>
                          <td>{c.hall_name}</td>
                          <td>{c.student_1}</td>
                          <td>{c.student_2}</td>
                          <td>
                            <span className="dept-tag">{c.department}</span>
                          </td>
                          <td>R{c.row_1}-C{c.column_1}</td>
                          <td>R{c.row_2}-C{c.column_2}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Category 2: Invigilator Double-Booking */}
            <div className="panel conflict-card">
              <div className="conflict-card-header">
                <span className="cat-icon">⏱</span>
                <div>
                  <h4>Faculty Schedule Overlap</h4>
                  <small>Faculty assigned to multiple halls simultaneously</small>
                </div>
                <span
                  className={`conflict-count-badge ${
                    invigilatorConflicts.length > 0 ? "danger" : "clean"
                  }`}
                >
                  {invigilatorConflicts.length}
                </span>
              </div>

              {invigilatorConflicts.length === 0 ? (
                <p className="conflict-card-empty">
                  ✓ Passed: Each invigilator is assigned to at most one hall per session.
                </p>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Faculty Name</th>
                        <th>Date</th>
                        <th>Session</th>
                        <th>Assigned Halls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invigilatorConflicts.map((c, i) => (
                        <tr key={i}>
                          <td><strong>{c.faculty_name}</strong></td>
                          <td>{String(c.exam_date).slice(0, 10)}</td>
                          <td>{c.session}</td>
                          <td>
                            <span className="status-badge danger">{c.halls}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Category 3: Availability Conflicts */}
            <div className="panel conflict-card">
              <div className="conflict-card-header">
                <span className="cat-icon">📅</span>
                <div>
                  <h4>Faculty Availability Constraints</h4>
                  <small>Assigned faculty who marked themselves unavailable</small>
                </div>
                <span
                  className={`conflict-count-badge ${
                    availabilityConflicts.length > 0 ? "danger" : "clean"
                  }`}
                >
                  {availabilityConflicts.length}
                </span>
              </div>

              {availabilityConflicts.length === 0 ? (
                <p className="conflict-card-empty">
                  ✓ Passed: All assigned faculty are confirmed available for this session.
                </p>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Faculty Name</th>
                        <th>Hall</th>
                        <th>Date</th>
                        <th>Session</th>
                      </tr>
                    </thead>
                    <tbody>
                      {availabilityConflicts.map((c, i) => (
                        <tr key={i}>
                          <td><strong>{c.faculty_name}</strong></td>
                          <td>{c.hall_name}</td>
                          <td>{String(c.exam_date).slice(0, 10)}</td>
                          <td>{c.session}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
