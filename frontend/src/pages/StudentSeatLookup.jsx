import { useState, useEffect, useMemo } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function StudentSeatLookup() {
  const { user } = useAuth();
  const [exams, setExams] = useState([]);
  const [studentProfile, setStudentProfile] = useState(null);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [seatDetails, setSeatDetails] = useState(null);
  const [loadingExams, setLoadingExams] = useState(false);
  const [loadingSeat, setLoadingSeat] = useState(false);
  const [error, setError] = useState("");

  const hallTicket = useMemo(() => {
    return (
      studentProfile?.hall_ticket_no ||
      user?.email?.split("@")[0]?.toUpperCase() ||
      "STUDENT"
    );
  }, [studentProfile, user]);

  // 1. Automatically load registered, published exams on mount
  useEffect(() => {
    loadMyRegisteredExams();
  }, []);

  async function loadMyRegisteredExams() {
    setLoadingExams(true);
    setError("");
    try {
      const res = await api.getStudentMyExams();
      const list = Array.isArray(res.exams) ? res.exams : [];
      setExams(list);
      if (res.student) {
        setStudentProfile(res.student);
      }
      if (list.length > 0) {
        setSelectedExamId((prev) => {
          // Keep existing selection if still in list, else select first
          const exists = list.some((e) => String(e.exam_id) === String(prev));
          return exists ? prev : String(list[0].exam_id);
        });
      }
    } catch (err) {
      console.warn("Could not load student registered exams:", err);
      setError(err.message || "Unable to load registered examinations.");
    } finally {
      setLoadingExams(false);
    }
  }

  // 2. Automatically load seat details whenever an exam is selected
  useEffect(() => {
    if (!selectedExamId) {
      setSeatDetails(null);
      return;
    }
    loadSeatForExam(selectedExamId);
  }, [selectedExamId]);

  async function loadSeatForExam(examId) {
    setLoadingSeat(true);
    setError("");
    setSeatDetails(null);
    try {
      const res = await api.getStudentMySeat(examId);
      setSeatDetails(res);
      if (res.student && !studentProfile) {
        setStudentProfile(res.student);
      }
    } catch (err) {
      console.warn("Could not load seat allocation:", err);
      setError(
        err.message || "Could not retrieve seat allocation for the selected examination."
      );
    } finally {
      setLoadingSeat(false);
    }
  }

  const activeExam = useMemo(() => {
    return exams.find((e) => String(e.exam_id) === String(selectedExamId));
  }, [exams, selectedExamId]);

  function formatTime(t) {
    if (!t) return "—";
    const clean = String(t).slice(0, 5);
    const parts = clean.split(":");
    if (parts.length < 2) return clean;
    let h = parseInt(parts[0], 10);
    const m = parts[1];
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${String(h).padStart(2, "0")}:${m} ${ampm}`;
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="student-seat-lookup-page">
      {/* Top Banner / Student Identification Card */}
      <div
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "#2563eb",
              fontWeight: 700,
              marginBottom: "4px",
            }}
          >
            Siddhartha Academy of Higher Education
          </div>
          <h1 className="page-title">My Examination Schedule &amp; Seat Allotment</h1>
          <p className="page-subtitle">
            Official timetable and hall seating allotment for authenticated candidates.
          </p>
        </div>

        {/* Candidate Profile Pill Badge */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid var(--border-color)",
            borderRadius: "10px",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "50%",
              background: "var(--primary-navy, #1e293b)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "16px",
            }}
          >
            {hallTicket.slice(-2)}
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--primary-navy)" }}>
              {studentProfile?.name || user?.full_name}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              HT: <strong style={{ color: "#0284c7" }}>{hallTicket}</strong>
              {studentProfile?.section && (
                <span> · Sec {studentProfile.section}</span>
              )}
              {studentProfile?.department && (
                <span> ({studentProfile.department})</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: "20px" }}>
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid View */}
      {loadingExams ? (
        <div className="panel" style={{ textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: "28px", marginBottom: "12px" }}>⏳</div>
          <h3 style={{ fontSize: "16px", color: "var(--primary-navy)" }}>
            Loading Examination Schedule...
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "13.5px" }}>
            Retrieving published examination sessions and seat allotments for your cohort.
          </p>
        </div>
      ) : exams.length === 0 ? (
        <div className="panel" style={{ textAlign: "center", padding: "48px 24px" }}>
          <span className="empty-icon" style={{ fontSize: "48px" }}>📅</span>
          <h3 style={{ marginTop: "16px", fontSize: "18px", color: "var(--primary-navy)" }}>
            No Published Examinations Found
          </h3>
          <p
            style={{
              maxWidth: "460px",
              margin: "10px auto 20px",
              color: "var(--text-secondary)",
              fontSize: "14px",
              lineHeight: "1.6",
            }}
          >
            There are currently no published examinations scheduled for your enrolled courses.
            Once the examination department finalizes and officially publishes the examination
            schedule and hall seating arrangements, they will appear here automatically.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadMyRegisteredExams}
            style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
          >
            🔄 Refresh Examination Timetable
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
          {/* SECTION 1: Published Examination Timetable List */}
          <section className="panel">
            <div
              className="panel-header"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <div>
                <h2 className="panel-title">Published Examination Schedule</h2>
                <p className="panel-subtitle">
                  Showing {exams.length} published examination{exams.length > 1 ? "s" : ""} for your academic cohort.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: "12.5px", padding: "5px 12px" }}
                onClick={loadMyRegisteredExams}
                title="Refresh schedule from server"
              >
                🔄 Refresh
              </button>
            </div>

            {/* Examination Cards / Table */}
            <div style={{ display: "grid", gap: "12px" }}>
              {exams.map((ex) => {
                const isSelected = String(ex.exam_id) === String(selectedExamId);
                return (
                  <div
                    key={ex.exam_id}
                    onClick={() => setSelectedExamId(String(ex.exam_id))}
                    style={{
                      border: isSelected
                        ? "2px solid #0284c7"
                        : "1px solid var(--border-color)",
                      background: isSelected ? "#f0f9ff" : "#ffffff",
                      borderRadius: "10px",
                      padding: "14px 18px",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "12px",
                      boxShadow: isSelected
                        ? "0 4px 6px -1px rgba(2, 132, 199, 0.1)"
                        : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1, minWidth: "260px" }}>
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "8px",
                          background: isSelected ? "#0284c7" : "#f1f5f9",
                          color: isSelected ? "#ffffff" : "#475569",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "14px",
                        }}
                      >
                        📝
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 800, color: "var(--primary-navy)", fontSize: "15px" }}>
                            {ex.subject_code}
                          </span>
                          <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
                            — {ex.subject_name}
                          </span>
                          <span className="status-pill info" style={{ fontSize: "11.5px" }}>
                            {ex.exam_type || "Exam"}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: "12.5px",
                            color: "var(--text-secondary)",
                            marginTop: "4px",
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            flexWrap: "wrap",
                          }}
                        >
                          <span>📅 <strong>{ex.exam_date}</strong></span>
                          <span>⏰ {formatTime(ex.start_time)} – {formatTime(ex.end_time)}</span>
                          <span
                            className={`status-pill ${
                              ex.status === "Completed"
                                ? "active"
                                : ex.status === "Published"
                                ? "published"
                                : ex.status === "Cancelled"
                                ? "danger"
                                : "warning"
                            }`}
                            style={{ fontSize: "11px", padding: "1px 8px" }}
                          >
                            {ex.status === "Completed"
                              ? "🏁 Completed"
                              : ex.status === "Published"
                              ? "✓ Published"
                              : ex.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Seat status badge */}
                    <div style={{ textAlign: "right" }}>
                      {ex.is_allocated ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                          <span
                            className="status-pill active"
                            style={{ fontSize: "12px", fontWeight: 700 }}
                          >
                            ✓ {ex.hall_name} (Room {ex.room_no})
                          </span>
                          <span style={{ fontSize: "11.5px", color: "#166534", marginTop: "3px" }}>
                            {ex.bench_number || `Row ${ex.row_no}, Col ${ex.column_no}`}
                          </span>
                        </div>
                      ) : (
                        <span
                          className="status-pill warning"
                          style={{ fontSize: "12px", fontWeight: 600 }}
                        >
                          ⏳ Allocation in Progress
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* SECTION 2: Examination Allotment Pass for Selected Exam */}
          <section className="panel" style={{ maxWidth: "800px" }}>
            <div
              className="panel-header"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <div>
                <h2 className="panel-title">Examination Allotment Pass</h2>
                <p className="panel-subtitle">
                  Hall admittance authorization and bench coordinates for the selected exam.
                </p>
              </div>

              {seatDetails?.allocated && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handlePrint}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  🖨️ Print Pass
                </button>
              )}
            </div>

            {loadingSeat ? (
              <div style={{ padding: "36px 0", textAlign: "center", color: "var(--text-secondary)" }}>
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>⏳</div>
                Retrieving your allocated seating coordinates and hall details...
              </div>
            ) : seatDetails ? (
              <div>
                {!seatDetails.allocated ? (
                  /* Examination is Published but Seat Allocation is Still Being Finalized */
                  <div
                    style={{
                      background: "#fffbeb",
                      border: "1px solid #fef3c7",
                      borderRadius: "10px",
                      padding: "24px",
                      marginTop: "10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                      <span style={{ fontSize: "32px", lineHeight: 1 }}>⏳</span>
                      <div>
                        <h3
                          style={{
                            margin: 0,
                            fontSize: "16px",
                            fontWeight: 700,
                            color: "#92400e",
                          }}
                        >
                          Examination Published – Seating Allocation in Progress
                        </h3>
                        <p
                          style={{
                            margin: "8px 0 0",
                            fontSize: "13.5px",
                            color: "#78350f",
                            lineHeight: "1.6",
                          }}
                        >
                          The examination{" "}
                          <strong>
                            {activeExam?.subject_code} - {activeExam?.subject_name}
                          </strong>{" "}
                          is officially scheduled for{" "}
                          <strong>{activeExam?.exam_date}</strong> (
                          {formatTime(activeExam?.start_time)} –{" "}
                          {formatTime(activeExam?.end_time)}).
                        </p>
                        <p
                          style={{
                            margin: "8px 0 0",
                            fontSize: "13px",
                            color: "#92400e",
                            lineHeight: "1.5",
                          }}
                        >
                          {seatDetails.message ||
                            "Hall seating plans and bench coordinates are currently being finalized by the examination cell. Please refresh or check back prior to the examination session."}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Fully Allocated Seating Pass */
                  <div
                    id="examination-admit-pass"
                    style={{
                      background: "#ffffff",
                      border: "2px solid #cbd5e1",
                      borderRadius: "12px",
                      overflow: "hidden",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                    }}
                  >
                    {/* Header */}
                    <div
                      style={{
                        background: "var(--primary-navy, #1e293b)",
                        color: "#ffffff",
                        padding: "18px 24px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: "12px",
                            textTransform: "uppercase",
                            letterSpacing: "0.8px",
                            color: "#94a3b8",
                            fontWeight: 700,
                          }}
                        >
                          Siddhartha Academy of Higher Education
                        </div>
                        <div
                          style={{
                            fontSize: "18px",
                            fontWeight: 800,
                            marginTop: "4px",
                            letterSpacing: "-0.2px",
                          }}
                        >
                          {seatDetails.exam?.subject_code} — {seatDetails.exam?.subject_name}
                        </div>
                        <div style={{ fontSize: "12.5px", color: "#cbd5e1", marginTop: "3px" }}>
                          {seatDetails.exam?.exam_type || "Class Test"} · Status:{" "}
                          <span style={{ color: "#86efac", fontWeight: 700 }}>
                            {seatDetails.exam?.status || "Published"}
                          </span>
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <span
                          style={{
                            background: "rgba(255, 255, 255, 0.15)",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            fontSize: "12.5px",
                            fontWeight: 700,
                            display: "inline-block",
                          }}
                        >
                          {seatDetails.student?.department || "CSE"} Department
                        </span>
                      </div>
                    </div>

                    {/* Body */}
                    <div style={{ padding: "24px" }}>
                      {/* Highlighted Hall & Bench Grid */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                          gap: "16px",
                          background: "#f0fdf4",
                          border: "1.5px solid #86efac",
                          borderRadius: "10px",
                          padding: "18px",
                          marginBottom: "22px",
                          textAlign: "center",
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontSize: "12px",
                              color: "#166534",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                            }}
                          >
                            Assigned Examination Hall
                          </span>
                          <div
                            style={{
                              fontSize: "26px",
                              fontWeight: 800,
                              color: "#15803d",
                              marginTop: "4px",
                            }}
                          >
                            {seatDetails.seat?.hall_name}
                          </div>
                          <div style={{ fontSize: "13px", color: "#166534", fontWeight: 600 }}>
                            Room {seatDetails.seat?.room_no}
                          </div>
                        </div>

                        <div>
                          <span
                            style={{
                              fontSize: "12px",
                              color: "#166534",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                            }}
                          >
                            Allocated Seat &amp; Bench
                          </span>
                          <div
                            style={{
                              fontSize: "26px",
                              fontWeight: 800,
                              color: "#15803d",
                              marginTop: "4px",
                            }}
                          >
                            Row {seatDetails.seat?.row_no}, Col {seatDetails.seat?.column_no}
                          </div>
                          <div style={{ fontSize: "13px", color: "#166534", fontWeight: 600 }}>
                            Bench: {seatDetails.seat?.bench_number || `Row ${seatDetails.seat?.row_no}, Column ${seatDetails.seat?.column_no}`}
                          </div>
                        </div>
                      </div>

                      {/* Candidate & Timing Information */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                          gap: "16px",
                          fontSize: "13.5px",
                          borderBottom: "1px solid #e2e8f0",
                          paddingBottom: "18px",
                          marginBottom: "18px",
                        }}
                      >
                        <div>
                          <span className="form-helper">Candidate Name:</span>
                          <div style={{ fontWeight: 700, color: "var(--primary-navy)", fontSize: "14px" }}>
                            {seatDetails.student?.name || user?.full_name}
                          </div>
                        </div>

                        <div>
                          <span className="form-helper">Official Hall Ticket No:</span>
                          <div style={{ fontWeight: 700, color: "#0284c7", fontSize: "14px" }}>
                            {seatDetails.student?.hall_ticket_no || hallTicket}
                          </div>
                        </div>

                        <div>
                          <span className="form-helper">Cohort &amp; Section:</span>
                          <div style={{ fontWeight: 700 }}>
                            Section {seatDetails.student?.section || "A"} ({seatDetails.student?.department || "CSE"})
                            {seatDetails.student?.study_year ? ` · Year ${seatDetails.student?.study_year}` : ""}
                          </div>
                        </div>

                        <div>
                          <span className="form-helper">Scheduled Timing:</span>
                          <div style={{ fontWeight: 700, color: "#0369a1" }}>
                            📅 {seatDetails.exam?.exam_date}
                            <div style={{ fontSize: "12.5px" }}>
                              ⏰ {formatTime(seatDetails.exam?.start_time)} – {formatTime(seatDetails.exam?.end_time)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Reporting Instructions */}
                      <div>
                        <h4
                          style={{
                            fontSize: "13.5px",
                            fontWeight: 700,
                            color: "#334155",
                            marginBottom: "8px",
                          }}
                        >
                          📋 Mandatory Examination &amp; Hall Instructions:
                        </h4>
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: "20px",
                            fontSize: "13px",
                            lineHeight: "1.7",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {(seatDetails.reporting_instructions || []).map((instruction, idx) => (
                            <li key={idx}>{instruction}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
