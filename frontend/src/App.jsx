
import { useEffect, useState } from "react";
import "./App.css";
import Students from "./pages/Students";
import SeatAllocation from "./pages/SeatAllocation";

const API_URL = "http://127.0.0.1:5000";

function App() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePage, setActivePage] = useState("dashboard");
  const [exams, setExams] = useState([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [examsError, setExamsError] = useState("");
  const [examRefresh, setExamRefresh] = useState(0);
  const [moduleExams, setModuleExams] = useState([]);
  const [moduleExamsLoading, setModuleExamsLoading] = useState(false);
  const [moduleExamsError, setModuleExamsError] = useState("");
  const [selectedModuleExam, setSelectedModuleExam] = useState("");
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [assignmentSuccess, setAssignmentSuccess] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [reportMessage, setReportMessage] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/analytics`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch dashboard analytics");
        }
        return response.json();
      })
      .then((data) => {
        setAnalytics(data);
        setError("");
      })
      .catch((err) => {
        console.error("Analytics error:", err);
        setError(
          "Could not connect to the backend. Make sure Flask is running."
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activePage !== "examinations") return;

    setExamsLoading(true);
    setExamsError("");

    fetch(`${API_URL}/exams`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch examinations (${response.status})`);
        }
        return response.json();
      })
      .then((data) => {
        setExams(Array.isArray(data.exams) ? data.exams : []);
      })
      .catch((err) => {
        console.error("Examinations error:", err);
        setExamsError(
          "Could not load examinations. Check that Flask is running and GET /exams works."
        );
      })
      .finally(() => setExamsLoading(false));
  }, [activePage, examRefresh]);

  useEffect(() => {
    if (activePage !== "invigilators" && activePage !== "reports") return;

    setModuleExamsLoading(true);
    setModuleExamsError("");

    fetch(`${API_URL}/exams`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load examinations (${response.status})`);
        }
        return response.json();
      })
      .then((data) => {
        const loadedExams = Array.isArray(data.exams) ? data.exams : [];
        setModuleExams(loadedExams);
        setSelectedModuleExam((current) =>
          current && loadedExams.some((exam) => String(exam.exam_id) === current)
            ? current
            : loadedExams.length
              ? String(loadedExams[0].exam_id)
              : ""
        );
      })
      .catch((err) => {
        console.error("Module examinations error:", err);
        setModuleExamsError("Could not load examinations. Make sure the Flask backend is running.");
      })
      .finally(() => setModuleExamsLoading(false));
  }, [activePage]);

  async function handleAssignInvigilators() {
    if (!selectedModuleExam) {
      setAssignmentError("Please select an examination.");
      return;
    }

    setAssignmentLoading(true);
    setAssignmentError("");
    setAssignmentSuccess("");
    setAssignments([]);

    try {
      const response = await fetch(`${API_URL}/assign-invigilators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam_id: Number(selectedModuleExam) }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Assignment failed (${response.status})`);
      }

      setAssignments(Array.isArray(data.assignments) ? data.assignments : []);
      setAssignmentSuccess(data.message || "Invigilators assigned successfully.");
    } catch (err) {
      console.error("Invigilator assignment error:", err);
      setAssignmentError(err.message || "Could not assign invigilators.");
    } finally {
      setAssignmentLoading(false);
    }
  }

  function openReport(reportType) {
    if (!selectedModuleExam) {
      setReportMessage("Please select an examination first.");
      return;
    }

    const endpoints = {
      seating: "seating-chart",
      attendance: "attendance-sheet",
      duties: "duty-slips",
    };
    const url = `${API_URL}/reports/${endpoints[reportType]}?exam_id=${encodeURIComponent(selectedModuleExam)}`;
    setReportMessage("Opening report PDF in a new tab...");
    window.open(url, "_blank", "noopener,noreferrer");
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

  const overview = analytics?.overview;

  const cards = [
    {
      title: "Total Students",
      value: overview?.total_students,
      description: "Registered student records",
      icon: "♟",
    },
    {
      title: "Total Examinations",
      value: overview?.total_exams,
      description: "Scheduled exams",
      icon: "▣",
    },
    {
      title: "Seat Allocations",
      value: overview?.total_allocations,
      description: "Allocated seats",
      icon: "✓",
    },
    {
      title: "Faculty Members",
      value: overview?.total_faculty,
      description: "Faculty records",
      icon: "♧",
    },
  ];

  const navigation = [
    { id: "dashboard", label: "Dashboard", icon: "▦" },
    { id: "students", label: "Students", icon: "♟" },
    { id: "examinations", label: "Examinations", icon: "▣" },
    { id: "seating", label: "Seat Allocation", icon: "▦" },
    { id: "invigilators", label: "Invigilators", icon: "♧" },
    { id: "reports", label: "Reports", icon: "▤" },
  ];

  function openPage(page) {
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <h2>SmartExam</h2>
          <p>Examination Management</p>
        </div>

        <nav className="navigation">
          {navigation.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`nav-link ${
                activePage === item.id ? "active" : ""
              }`}
              onClick={(event) => {
                event.preventDefault();
                openPage(item.id);
              }}
            >
              {item.icon} {item.label}
            </a>
          ))}
        </nav>

        <div className="sidebar-footer">
          <strong>Admin Portal</strong>
          <p>Smart Examination System</p>
        </div>
      </aside>

      <main className="main-content">
        {activePage === "students" ? (
          <Students />
        ) : activePage === "seating" ? (
          <SeatAllocation />
        ) : activePage === "examinations" ? (
          <>
            <header className="page-header">
              <div>
                <h1>Examinations</h1>
                <p>View scheduled examinations retrieved from the database.</p>
              </div>
              <div className="admin-profile">
                <span className="avatar">A</span>
                <strong>Administrator</strong>
              </div>
            </header>

            <section className="panel">
              <div className="section-heading">
                <div>
                  <h3>Scheduled Examinations</h3>
                  <p className="panel-subtitle">
                    {exams.length} examination{exams.length === 1 ? "" : "s"} found
                  </p>
                </div>
                <button
                  className="back-button"
                  onClick={() => setExamRefresh((value) => value + 1)}
                >
                  ↻ Refresh
                </button>
              </div>

              {examsLoading && (
                <p className="status-message">Loading examinations...</p>
              )}

              {examsError && <p className="error-message">{examsError}</p>}

              {!examsLoading && !examsError && exams.length === 0 && (
                <p className="status-message">No examinations found in the database.</p>
              )}

              {!examsLoading && !examsError && exams.length > 0 && (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Exam ID</th>
                        <th>Subject Code</th>
                        <th>Subject Name</th>
                        <th>Exam Date</th>
                        <th>Session</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exams.map((exam) => (
                        <tr key={exam.exam_id}>
                          <td>{exam.exam_id}</td>
                          <td>{exam.subject_code || "—"}</td>
                          <td>{exam.subject_name || "—"}</td>
                          <td>{formatExamDate(exam.exam_date)}</td>
                          <td>
                            <span className="session-badge">
                              {exam.session === "FN"
                                ? "Forenoon (FN)"
                                : exam.session === "AN"
                                ? "Afternoon (AN)"
                                : exam.session || "—"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : activePage === "dashboard" ? (
          <>
            <header className="page-header">
              <div>
                <h1>Dashboard</h1>
                <p>Welcome to your examination management system.</p>
              </div>
              <div className="admin-profile">
                <span className="avatar">A</span>
                <strong>Administrator</strong>
              </div>
            </header>

            <section className="hero-banner">
              <div>
                <span className="eyebrow">ADMIN OVERVIEW</span>
                <h2>Examinations, organized.</h2>
                <p>
                  Manage student registrations, seating arrangements, and
                  invigilator assignments in one place.
                </p>
              </div>
              <span className="hero-icon">▦</span>
            </section>

            {loading && (
              <p className="status-message">Loading dashboard data...</p>
            )}

            {error && <p className="error-message">{error}</p>}

            {!loading && !error && (
              <section className="stats-grid">
                {cards.map((card) => (
                  <article className="stat-card" key={card.title}>
                    <span className="stat-icon">{card.icon}</span>
                    <p>{card.title}</p>
                    <h2>{card.value ?? 0}</h2>
                    <small>{card.description}</small>
                  </article>
                ))}
              </section>
            )}

            <section className="bottom-grid">
              <div className="panel">
                <h3>Quick Actions</h3>
                <p className="panel-subtitle">Common examination tasks</p>

                <div className="quick-actions">
                  <button
                    className="action-card"
                    onClick={() => openPage("students")}
                  >
                    <span>♟</span>
                    <strong>Manage Students</strong>
                    <small>View student records</small>
                  </button>

                  <button
                    className="action-card"
                    onClick={() => openPage("seating")}
                  >
                    <span>▦</span>
                    <strong>Allocate Seats</strong>
                    <small>Generate seating plans</small>
                  </button>

                  <button
                    className="action-card"
                    onClick={() => openPage("invigilators")}
                  >
                    <span>♧</span>
                    <strong>Assign Invigilators</strong>
                    <small>Manage faculty duties</small>
                  </button>

                  <button
                    className="action-card"
                    onClick={() => openPage("reports")}
                  >
                    <span>▤</span>
                    <strong>View Reports</strong>
                    <small>Access examination PDFs</small>
                  </button>
                </div>
              </div>

              <div className="panel">
                <h3>System Information</h3>
                <p className="panel-subtitle">Your project services</p>

                <div className="service-row">
                  <span className="service-dot green"></span>
                  <div>
                    <strong>React Frontend</strong>
                    <small>Dashboard interface</small>
                  </div>
                  <span className="service-status">Active</span>
                </div>

                <div className="service-row">
                  <span className="service-dot green"></span>
                  <div>
                    <strong>Flask Backend</strong>
                    <small>API integration</small>
                  </div>
                  <span className="service-status">Connected</span>
                </div>

                <div className="service-row">
                  <span className="service-dot green"></span>
                  <div>
                    <strong>MySQL Database</strong>
                    <small>Examination records</small>
                  </div>
                  <span className="service-status">Connected</span>
                </div>
              </div>
            </section>

            {analytics?.hall_statistics && (
              <section className="panel hall-panel">
                <h3>Hall Occupancy</h3>
                <p className="panel-subtitle">
                  Current seating allocation by hall
                </p>

                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Hall</th>
                        <th>Allocated Seats</th>
                        <th>Capacity</th>
                        <th>Occupancy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.hall_statistics.map((hall) => (
                        <tr key={hall.hall_id}>
                          <td>{hall.hall_name}</td>
                          <td>{hall.allocated_seats}</td>
                          <td>{hall.capacity}</td>
                          <td>
                            <div className="occupancy">
                              <div className="occupancy-track">
                                <div
                                  className="occupancy-fill"
                                  style={{
                                    width: `${Math.min(
                                      hall.occupancy_percent,
                                      100
                                    )}%`,
                                  }}
                                />
                              </div>
                              <span>{hall.occupancy_percent}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        ) : activePage === "invigilators" ? (
          <div className="module-page">
            <header className="module-header">
              <div>
                <h1>Invigilator Assignment</h1>
                <p>Assign available faculty members to halls for an examination.</p>
              </div>
            </header>

            <section className="panel module-panel">
              <h3>Generate Invigilator Assignments</h3>
              <p className="panel-subtitle">Select an exam that already has a seating plan.</p>

              {moduleExamsLoading && <p className="status-message">Loading examinations...</p>}
              {moduleExamsError && <p className="error-message">{moduleExamsError}</p>}

              {!moduleExamsLoading && !moduleExamsError && (
                <div className="module-form">
                  <label htmlFor="invigilator-exam">Select Examination</label>
                  <select
                    id="invigilator-exam"
                    value={selectedModuleExam}
                    onChange={(event) => {
                      setSelectedModuleExam(event.target.value);
                      setAssignmentError("");
                      setAssignmentSuccess("");
                      setAssignments([]);
                    }}
                  >
                    {moduleExams.length === 0 && <option value="">No examinations found</option>}
                    {moduleExams.map((exam) => (
                      <option key={exam.exam_id} value={String(exam.exam_id)}>
                        {exam.subject_code} — {exam.subject_name} ({exam.session})
                      </option>
                    ))}
                  </select>
                  <button
                    className="allocate-button"
                    onClick={handleAssignInvigilators}
                    disabled={!selectedModuleExam || assignmentLoading}
                  >
                    {assignmentLoading ? "Assigning..." : "Assign Invigilators"}
                  </button>
                </div>
              )}

              {assignmentError && <p className="allocation-error">{assignmentError}</p>}
              {assignmentSuccess && <p className="allocation-success">{assignmentSuccess}</p>}
            </section>

            {assignments.length > 0 && (
              <section className="panel module-panel">
                <div className="section-heading">
                  <div>
                    <h3>Assigned Faculty</h3>
                    <p className="panel-subtitle">{assignments.length} assignment(s) returned by the backend.</p>
                  </div>
                </div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Faculty ID</th>
                        <th>Faculty Name</th>
                        <th>Department</th>
                        <th>Exam Date</th>
                        <th>Session</th>
                        <th>Hall</th>
                        <th>Previous Duties</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((item, index) => (
                        <tr key={`${item.faculty_id}-${item.hall_id}-${index}`}>
                          <td>{item.faculty_id}</td>
                          <td>{item.faculty_name}</td>
                          <td>{item.faculty_department || "—"}</td>
                          <td>{formatExamDate(item.exam_date)}</td>
                          <td>{item.session || "—"}</td>
                          <td>{item.hall_name || item.hall_id}</td>
                          <td>{item.previous_duty_count ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        ) : activePage === "reports" ? (
          <div className="module-page">
            <header className="module-header">
              <div>
                <h1>Examination Reports</h1>
                <p>Generate and download examination PDFs.</p>
              </div>
            </header>

            <section className="panel module-panel">
              <h3>Select Examination</h3>
              <p className="panel-subtitle">Choose an exam, then open the report you need.</p>

              {moduleExamsLoading && <p className="status-message">Loading examinations...</p>}
              {moduleExamsError && <p className="error-message">{moduleExamsError}</p>}

              {!moduleExamsLoading && !moduleExamsError && (
                <div className="module-form">
                  <label htmlFor="report-exam">Select Examination</label>
                  <select
                    id="report-exam"
                    value={selectedModuleExam}
                    onChange={(event) => {
                      setSelectedModuleExam(event.target.value);
                      setReportMessage("");
                    }}
                  >
                    {moduleExams.length === 0 && <option value="">No examinations found</option>}
                    {moduleExams.map((exam) => (
                      <option key={exam.exam_id} value={String(exam.exam_id)}>
                        {exam.subject_code} — {exam.subject_name} ({exam.session})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {reportMessage && <p className="status-message">{reportMessage}</p>}
            </section>

            <section className="report-cards">
              <article className="panel report-card">
                <span className="report-icon">▦</span>
                <h3>Seating Chart</h3>
                <p>Hall-wise seating arrangement and student seat details.</p>
                <button className="allocate-button" disabled={!selectedModuleExam || moduleExamsLoading} onClick={() => openReport("seating")}>
                  Download Seating Chart PDF
                </button>
              </article>
              <article className="panel report-card">
                <span className="report-icon">☷</span>
                <h3>Attendance Sheet</h3>
                <p>Student list for recording examination attendance.</p>
                <button className="allocate-button" disabled={!selectedModuleExam || moduleExamsLoading} onClick={() => openReport("attendance")}>
                  Download Attendance PDF
                </button>
              </article>
              <article className="panel report-card">
                <span className="report-icon">♧</span>
                <h3>Invigilator Duty Slips</h3>
                <p>Faculty duty and hall assignment details.</p>
                <button className="allocate-button" disabled={!selectedModuleExam || moduleExamsLoading} onClick={() => openReport("duties")}>
                  Download Duty Slips PDF
                </button>
              </article>
            </section>
          </div>
        ) : (
          <section className="panel">
            <h1>
              {navigation.find((item) => item.id === activePage)?.label}
            </h1>
            <p className="panel-subtitle">
              This section will be implemented in the next step.
            </p>
            <button
              className="back-button"
              onClick={() => openPage("dashboard")}
            >
              ← Back to Dashboard
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
