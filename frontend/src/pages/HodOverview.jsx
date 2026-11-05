import { useState, useEffect, useMemo } from "react";
import api from "../services/api";

export default function HodOverview() {
  const [selectedDate, setSelectedDate] = useState("2026-11-20");
  const [schedule, setSchedule] = useState({ examinations: [], total_exams: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filters State
  const [filterExam, setFilterExam] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterRoom, setFilterRoom] = useState("");

  // Hall Seating Inspector Modal State (Read-only)
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorData, setInspectorData] = useState(null);
  const [loadingInspector, setLoadingInspector] = useState(false);
  const [inspectorError, setInspectorError] = useState("");

  useEffect(() => {
    loadSchedule(selectedDate);
  }, [selectedDate]);

  async function loadSchedule(dateStr) {
    setLoading(true);
    setError("");
    try {
      const res = await api.getHodDailySchedule(dateStr);
      setSchedule(res || { examinations: [], total_exams: 0 });
    } catch (err) {
      console.warn("HOD daily schedule load failed:", err);
      setError("Unable to load examination schedule for selected date.");
    } finally {
      setLoading(false);
    }
  }

  async function openHallInspector(examId, hallId) {
    setInspectorOpen(true);
    setLoadingInspector(true);
    setInspectorError("");
    setInspectorData(null);
    try {
      const res = await api.getHodHallRoster(examId, hallId);
      setInspectorData(res);
    } catch (err) {
      setInspectorError(err.message || "Failed to load hall seating roster.");
    } finally {
      setLoadingInspector(false);
    }
  }

  // Filter examinations based on user selections
  const filteredExaminations = useMemo(() => {
    const list = schedule.examinations || [];
    return list.filter((ex) => {
      if (filterExam && String(ex.exam_id) !== filterExam) return false;
      if (filterSubject && ex.subject_code !== filterSubject) return false;
      if (filterRoom) {
        const hasRoom = (ex.rooms || []).some(
          (rm) => String(rm.hall_id) === filterRoom || rm.room_no === filterRoom || rm.hall_name === filterRoom
        );
        if (!hasRoom) return false;
      }
      return true;
    });
  }, [schedule.examinations, filterExam, filterSubject, filterRoom]);

  // Summary Metrics for Selected Date
  const totalExams = schedule.examinations?.length || 0;
  const totalSeated = (schedule.examinations || []).reduce(
    (sum, ex) => sum + (ex.allocated_students || ex.total_seated || 0),
    0
  );
  const totalRoomsUsed = (schedule.examinations || []).reduce(
    (sum, ex) => sum + (ex.rooms?.length || 0),
    0
  );
  const totalInvigilators = (schedule.examinations || []).reduce(
    (sum, ex) => sum + (ex.invigilators?.length || 0),
    0
  );
  const confirmedInvigilators = (schedule.examinations || []).reduce(
    (sum, ex) => sum + (ex.invigilators?.filter((i) => i.status === "accepted").length || 0),
    0
  );

  // Available unique filter options
  const subjectOptions = useMemo(() => {
    const set = new Set();
    (schedule.examinations || []).forEach((ex) => {
      if (ex.subject_code) set.add(ex.subject_code);
    });
    return Array.from(set);
  }, [schedule.examinations]);

  const roomOptions = useMemo(() => {
    const map = new Map();
    (schedule.examinations || []).forEach((ex) => {
      (ex.rooms || []).forEach((rm) => {
        if (!map.has(rm.hall_id)) {
          map.set(rm.hall_id, rm.room_no || rm.hall_name);
        }
      });
    });
    return Array.from(map.entries());
  }, [schedule.examinations]);

  return (
    <div className="hod-overview-page">
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <h1 className="page-title">HOD Daily Examination Monitoring Dashboard</h1>
            <span className="status-pill active" style={{ fontSize: "12px" }}>
              🔒 Strictly Read-Only Audit
            </span>
          </div>
          <p className="page-subtitle">
            Departmental inspection of examination schedules, room capacities, candidate seating rosters, and invigilation coverage.
          </p>
        </div>

        {/* Date Selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#ffffff", padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--border-color)", boxShadow: "var(--shadow-xs)" }}>
          <label htmlFor="hod-date" style={{ fontWeight: 700, fontSize: "13px", color: "var(--primary-navy)" }}>
            Inspection Date:
          </label>
          <input
            id="hod-date"
            type="date"
            className="form-control"
            style={{ width: "auto", padding: "6px 10px", fontWeight: 600 }}
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setFilterExam("");
              setFilterSubject("");
              setFilterRoom("");
            }}
          />
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: "20px" }}>
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: "22px" }}>
        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: "#eff6ff", color: "#2563eb" }}>
            📅
          </div>
          <div className="stat-data">
            <span className="stat-value">{totalExams}</span>
            <span className="stat-label">Scheduled Exams</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: "#f0fdf4", color: "#16a34a" }}>
            🎓
          </div>
          <div className="stat-data">
            <span className="stat-value">{totalSeated}</span>
            <span className="stat-label">Seated Candidates</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: "#fefce8", color: "#ca8a04" }}>
            🏛️
          </div>
          <div className="stat-data">
            <span className="stat-value">{totalRoomsUsed}</span>
            <span className="stat-label">Rooms Occupied</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: "#faf5ff", color: "#9333ea" }}>
            👨‍🏫
          </div>
          <div className="stat-data">
            <span className="stat-value">{confirmedInvigilators} / {totalInvigilators}</span>
            <span className="stat-label">Invigilators Confirmed</span>
          </div>
        </div>
      </div>

      {/* Interactive Filters Panel */}
      <section className="panel" style={{ marginBottom: "20px", padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "13.5px", color: "var(--primary-navy)" }}>
              🔍 Audit Filters:
            </span>

            {/* Filter by Subject */}
            <select
              className="form-control"
              style={{ width: "auto", minWidth: "150px" }}
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
            >
              <option value="">All Subjects</option>
              {subjectOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>

            {/* Filter by Room */}
            <select
              className="form-control"
              style={{ width: "auto", minWidth: "160px" }}
              value={filterRoom}
              onChange={(e) => setFilterRoom(e.target.value)}
            >
              <option value="">All Examination Rooms</option>
              {roomOptions.map(([id, name]) => (
                <option key={id} value={String(id)}>
                  Room {name}
                </option>
              ))}
            </select>

            {(filterSubject || filterRoom || filterExam) && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  setFilterSubject("");
                  setFilterRoom("");
                  setFilterExam("");
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          <span className="form-helper">
            Showing {filteredExaminations.length} of {totalExams} scheduled examinations
          </span>
        </div>
      </section>

      {/* Examination Schedule View */}
      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-secondary)" }}>
          Loading daily examination schedule for {selectedDate}...
        </div>
      ) : filteredExaminations.length === 0 ? (
        <div className="empty-state" style={{ padding: "40px 20px" }}>
          <span className="empty-icon" style={{ fontSize: "42px" }}>📅</span>
          <h3 style={{ marginTop: "12px", fontSize: "17px", color: "var(--primary-navy)" }}>
            No Scheduled Examinations Found
          </h3>
          <p style={{ maxWidth: "420px", margin: "8px auto 0", color: "var(--text-secondary)", fontSize: "14px" }}>
            No examinations match the selected date ({selectedDate}) and active filter criteria. Select another date using the date selector above.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          {filteredExaminations.map((ex) => (
            <section key={ex.exam_id} className="panel">
              {/* Exam Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid var(--border-color)",
                  paddingBottom: "14px",
                  marginBottom: "16px",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="badge-cse">{ex.subject_code}</span>
                    <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--primary-navy)", margin: 0 }}>
                      {ex.exam_name || ex.subject_name}
                    </h2>
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    Course Title: <strong>{ex.subject_name}</strong>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span className="status-pill info" style={{ fontWeight: 600 }}>
                    ⏰ {ex.start_time && ex.end_time ? `${ex.start_time.slice(0, 5)} – ${ex.end_time.slice(0, 5)}` : ex.session} ({ex.session || "FN"})
                  </span>
                  <span className="status-pill active" style={{ fontWeight: 600 }}>
                    🎓 {ex.allocated_students || ex.total_seated || 0} Candidates Seated
                  </span>
                </div>
              </div>

              {/* Room Occupancy & Invigilator Supervision Table */}
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "10px" }}>
                  Allocated Examination Halls &amp; Assigned Invigilators ({ex.rooms?.length || 0} Rooms)
                </h3>

                {(!ex.rooms || ex.rooms.length === 0) ? (
                  <p className="form-helper">No examination rooms have been allocated for this session yet.</p>
                ) : (
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Hall / Room</th>
                          <th>Occupancy &amp; Usable Capacity</th>
                          <th>Assigned Invigilator</th>
                          <th>Invigilation Status</th>
                          <th style={{ textAlign: "right" }}>Candidate Inspection</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ex.rooms.map((rm, idx) => {
                          const occPct = rm.capacity > 0 ? Math.round((rm.student_count / rm.capacity) * 100) : 0;
                          const isDeclined = rm.response_status === "declined";
                          const isAccepted = rm.response_status === "accepted";

                          return (
                            <tr key={idx}>
                              <td>
                                <strong style={{ fontSize: "14px", color: "var(--primary-navy)" }}>
                                  {rm.hall_name}
                                </strong>
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                  Room {rm.room_no || rm.hall_name}
                                </div>
                              </td>

                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <strong style={{ fontSize: "14px" }}>{rm.student_count}</strong>
                                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                    / {rm.capacity} seats ({occPct}% full)
                                  </span>
                                </div>
                                <div
                                  style={{
                                    width: "120px",
                                    height: "6px",
                                    background: "#e2e8f0",
                                    borderRadius: "3px",
                                    marginTop: "4px",
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${Math.min(occPct, 100)}%`,
                                      height: "100%",
                                      background: occPct > 90 ? "#2563eb" : "#16a34a",
                                    }}
                                  />
                                </div>
                              </td>

                              <td>
                                <div style={{ fontWeight: 600, color: "var(--primary-navy)" }}>
                                  {rm.invigilator_name || "Unassigned"}
                                </div>
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                  {rm.invigilator_department || "CSE Department"}
                                </div>
                              </td>

                              <td>
                                <span className={`status-pill ${isAccepted ? "active" : isDeclined ? "danger" : "warning"}`}>
                                  {isAccepted ? "● Accepted" : isDeclined ? "● Declined" : "○ Pending"}
                                </span>
                              </td>

                              <td style={{ textAlign: "right" }}>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-navy"
                                  onClick={() => openHallInspector(ex.exam_id, rm.hall_id)}
                                >
                                  👁️ Inspect Hall Roster
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* =========================================================
          MODAL: READ-ONLY HALL SEATING ROSTER INSPECTOR
         ========================================================= */}
      {inspectorOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "860px", width: "95%" }}>
            <div className="modal-header">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h3 className="modal-title">Hall Seating Roster Inspector</h3>
                  <span className="status-pill active" style={{ fontSize: "11px" }}>
                    Read-Only
                  </span>
                </div>
                {inspectorData?.exam && (
                  <p className="form-helper" style={{ margin: "2px 0 0" }}>
                    {inspectorData.exam.subject_code} &bull; {inspectorData.exam.subject_name} &bull; {inspectorData.hall?.hall_name} (Room {inspectorData.hall?.room_no})
                  </p>
                )}
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setInspectorOpen(false)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              {loadingInspector ? (
                <div style={{ padding: "30px 0", textAlign: "center", color: "var(--text-secondary)" }}>
                  Loading hall candidate seating coordinates...
                </div>
              ) : inspectorError ? (
                <div className="alert alert-danger">{inspectorError}</div>
              ) : inspectorData ? (
                <div>
                  {/* Hall & Invigilator Metadata Header */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "14px",
                      background: "#f8fafc",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      padding: "14px 18px",
                      marginBottom: "18px",
                      fontSize: "13.5px",
                    }}
                  >
                    <div>
                      <span className="form-helper">Hall Specifications:</span>
                      <div>
                        <strong>{inspectorData.hall?.hall_name}</strong> (Room {inspectorData.hall?.room_no})
                      </div>
                      <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "2px" }}>
                        Capacity: {inspectorData.hall?.capacity} seats ({inspectorData.hall?.rows_count} rows &times; {inspectorData.hall?.columns_count} columns)
                      </div>
                    </div>

                    <div>
                      <span className="form-helper">Assigned Invigilator:</span>
                      <div style={{ fontWeight: 700, color: "var(--primary-navy)" }}>
                        {inspectorData.invigilator?.faculty_name || "Unassigned"}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                        Status:{" "}
                        <span className={`status-pill ${inspectorData.invigilator?.status === "accepted" ? "active" : inspectorData.invigilator?.status === "declined" ? "danger" : "warning"}`}>
                          {inspectorData.invigilator?.status ? `● ${inspectorData.invigilator.status}` : "● Assigned"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Candidates Seating Table */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h4 style={{ fontSize: "14px", fontWeight: 700, margin: 0 }}>
                      Allotted Candidates ({inspectorData.total_candidates} Seated)
                    </h4>
                    <span className="form-helper">Zero-conflict seating arrangement verified</span>
                  </div>

                  <div className="table-wrapper" style={{ maxHeight: "360px", overflowY: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Seat Coordinate</th>
                          <th>Hall Ticket No</th>
                          <th>Student Name</th>
                          <th>Section</th>
                          <th>Department</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inspectorData.candidates?.map((stu, i) => (
                          <tr key={stu.student_id || i}>
                            <td>
                              <span
                                style={{
                                  background: "#f0fdf4",
                                  color: "#166534",
                                  border: "1px solid #bbf7d0",
                                  padding: "3px 8px",
                                  borderRadius: "4px",
                                  fontWeight: 700,
                                  fontSize: "12.5px",
                                }}
                              >
                                Row {stu.row_no}, Col {stu.column_no}
                              </span>
                            </td>
                            <td>
                              <strong style={{ color: "var(--primary-navy)" }}>
                                {stu.hall_ticket_no}
                              </strong>
                            </td>
                            <td>{stu.student_name}</td>
                            <td>Section {stu.section}</td>
                            <td>{stu.department || "CSE"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setInspectorOpen(false)}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
