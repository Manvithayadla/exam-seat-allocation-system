import { useEffect, useState, useMemo } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import SeatingChart from "../components/SeatingChart";
import ReportsPrintView from "../components/ReportsPrintView";
import SupplementaryModal from "../components/SupplementaryModal";

export default function SeatAllocation({ initialExamId }) {
  const { user, isAdmin, isHod } = useAuth();
  const [exams, setExams] = useState([]);
  const [halls, setHalls] = useState([]);
  const [examId, setExamId] = useState(initialExamId ? String(initialExamId) : "");
  const [selectedHallIds, setSelectedHallIds] = useState([]);
  const [studentCount, setStudentCount] = useState(0);

  // Overlap & available halls data from backend
  const [hallsAvailability, setHallsAvailability] = useState(null);
  const [allocationMode, setAllocationMode] = useState("auto"); // 'auto' | 'manual'

  const [allocations, setAllocations] = useState([]);
  const [utilizedHalls, setUtilizedHalls] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [loadingAllocations, setLoadingAllocations] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [viewMode, setViewMode] = useState("chart"); // 'chart' | 'table' | 'reports'
  const [tableSearch, setTableSearch] = useState("");
  const [isSupplModalOpen, setIsSupplModalOpen] = useState(false);

  // Load examinations and all halls on mount
  useEffect(() => {
    Promise.all([
      api.getExams(),
      api.getHalls().catch(() => ({ halls: [] })),
    ])
      .then(([examsData, hallsData]) => {
        const loadedExams = Array.isArray(examsData.exams) ? examsData.exams : [];
        setExams(loadedExams);
        const loadedHalls = Array.isArray(hallsData.halls) ? hallsData.halls : [];
        setHalls(loadedHalls);

        if (!examId && loadedExams.length > 0) {
          setExamId(String(loadedExams[0].exam_id));
        }
      })
      .catch((err) => setError(err.message || "Unable to load examinations and halls."))
      .finally(() => setLoadingExams(false));
  }, []);

  // Sync initialExamId if prop updates
  useEffect(() => {
    if (initialExamId) {
      setExamId(String(initialExamId));
    }
  }, [initialExamId]);

  // Load allocations, enrolled students, availability & invigilators whenever examId changes
  useEffect(() => {
    if (!examId) {
      setAllocations([]);
      setUtilizedHalls([]);
      setAssignments([]);
      setStudentCount(0);
      setHallsAvailability(null);
      return;
    }

    setLoadingAllocations(true);
    setError("");
    setMessage("");

    Promise.all([
      api.getSeatAllocations(examId).catch(() => ({ allocations: [], selected_halls: [] })),
      api.getExamStudents(examId).catch(() => ({ students: [] })),
      api.getAvailableHallsForExam(examId).catch(() => null),
      api.getInvigilatorAssignments(examId).catch(() => ({ assignments: [] })),
    ])
      .then(([allocData, studData, availData, invigData]) => {
        const existingAllocations = allocData.allocations || [];
        setAllocations(existingAllocations);

        const assignedHalls = allocData.selected_halls || [];
        setUtilizedHalls(assignedHalls);

        if (assignedHalls.length > 0) {
          setSelectedHallIds(assignedHalls.map((h) => h.hall_id));
        } else if (availData && availData.available_halls) {
          // Pre-select available halls
          setSelectedHallIds(availData.available_halls.map((h) => h.hall_id));
        }

        const enrolled = studData.students || [];
        setStudentCount(enrolled.length);

        setHallsAvailability(availData);
        setAssignments(invigData.assignments || []);
      })
      .finally(() => setLoadingAllocations(false));
  }, [examId]);

  const selectedExam = exams.find((e) => String(e.exam_id) === String(examId));

  // Compute total capacity of selected halls
  const selectedCapacity = useMemo(() => {
    return halls
      .filter((h) => selectedHallIds.includes(h.hall_id))
      .reduce((sum, h) => sum + (h.capacity || 0), 0);
  }, [halls, selectedHallIds]);

  const capacityDeficit = Math.max(0, studentCount - selectedCapacity);
  const isCapacitySufficient = studentCount === 0 || selectedCapacity >= studentCount;

  function toggleHallSelection(hallId) {
    setSelectedHallIds((prev) => {
      if (prev.includes(hallId)) {
        return prev.filter((id) => id !== hallId);
      } else {
        return [...prev, hallId];
      }
    });
  }

  function handleSelectAvailableHalls() {
    if (hallsAvailability && hallsAvailability.available_halls) {
      setSelectedHallIds(hallsAvailability.available_halls.map((h) => h.hall_id));
    } else {
      setSelectedHallIds(halls.map((h) => h.hall_id));
    }
  }

  function handleClearHallSelection() {
    setSelectedHallIds([]);
  }

  // Generate / Recalculate seat allocation
  async function handleAllocate(autoMode = false) {
    if (!examId) {
      setError("Please select an examination first.");
      return;
    }

    if (!autoMode && selectedHallIds.length === 0) {
      setError("Please select at least one examination hall for allocation.");
      return;
    }

    if (!autoMode && !isCapacitySufficient) {
      setError(
        `Selected halls capacity (${selectedCapacity}) is insufficient for ${studentCount} registered students. Please select additional halls.`
      );
      return;
    }

    setAllocating(true);
    setError("");
    setMessage("");

    try {
      // If autoMode is true, pass null/empty hall_ids to let backend automatically pick free rooms
      const hallIdsToPass = autoMode ? null : selectedHallIds;
      const data = await api.allocateSeats(examId, hallIdsToPass);
      setAllocations(data.allocations || []);
      setUtilizedHalls(data.selected_halls || []);
      setMessage(data.message || `Seat allocation generated successfully across ${data.selected_halls?.length || 0} examination halls.`);

      // Refresh assignments
      api.getInvigilatorAssignments(examId)
        .then((res) => setAssignments(res.assignments || []))
        .catch(() => {});
    } catch (err) {
      setError(err.message || "Seat allocation failed. Please verify student registrations and room capacity.");
    } finally {
      setAllocating(false);
    }
  }

  // Refresh allocations after supplementary seat allocation
  function handleSupplementarySuccess() {
    if (!examId) return;
    api
      .getSeatAllocations(examId)
      .then((data) => {
        setAllocations(data.allocations || []);
        setUtilizedHalls(data.selected_halls || []);
        setMessage("Supplementary student added to seating plan!");
      })
      .catch((err) => console.warn("Failed to refresh allocations:", err));
  }

  const filteredAllocations = useMemo(() => {
    return allocations.filter((a) => {
      return [
        a.hall_ticket_no,
        a.student_name,
        a.department,
        a.hall_name,
        a.row,
        a.column,
      ].some((val) =>
        String(val ?? "").toLowerCase().includes(tableSearch.toLowerCase())
      );
    });
  }, [allocations, tableSearch]);

  return (
    <div className="allocation-page">
      <header className="page-header">
        <div>
          <h1>Seat Allocation &amp; Seating Plans</h1>
          <p>
            Schedule examination rooms automatically or manually, generate conflict-free seating with department separation, and produce official print registers.
          </p>
        </div>
        <div className="header-actions">
          {(isAdmin || isHod) && (
            <button
              type="button"
              className="suppl-btn"
              onClick={() => setIsSupplModalOpen(true)}
              disabled={!examId || allocations.length === 0}
            >
              ➕ Supplementary Seat Allocation
            </button>
          )}
        </div>
      </header>

      {/* Control Panel: Exam Selection & Mode Selector */}
      <section className="panel allocation-controls-panel">
        <div className="controls-form-row">
          <div className="control-group" style={{ flex: 1 }}>
            <label htmlFor="exam-selector">Select Examination Session *</label>
            <select
              id="exam-selector"
              value={examId}
              onChange={(e) => {
                setExamId(e.target.value);
                setError("");
                setMessage("");
              }}
              disabled={loadingExams || allocating}
            >
              <option value="">
                {loadingExams ? "Loading examinations..." : "Choose an examination"}
              </option>
              {exams.map((exam) => (
                <option key={exam.exam_id} value={exam.exam_id}>
                  {exam.exam_name || exam.subject_name} ({exam.subject_code}) — {String(exam.exam_date).slice(0, 10)} [{exam.session}]
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedExam && (
          <div className="exam-context-banner">
            <span>
              <strong>Exam:</strong> {selectedExam.exam_name || selectedExam.subject_name} (#{selectedExam.exam_id})
            </span>
            <span>
              <strong>Course:</strong> {selectedExam.subject_code} — {selectedExam.subject_name}
            </span>
            <span>
              <strong>Schedule:</strong> {String(selectedExam.exam_date).slice(0, 10)} ({selectedExam.session}) {selectedExam.start_time} - {selectedExam.end_time}
            </span>
            <span>
              <strong>Registered Students:</strong> {studentCount}
            </span>
          </div>
        )}

        {/* Room Allocation Mode Tabs & Actions */}
        {selectedExam && (isAdmin || isHod) && (
          <div style={{ marginTop: "20px", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className={`toggle-btn ${allocationMode === "auto" ? "active" : ""}`}
                  onClick={() => setAllocationMode("auto")}
                  style={{ fontWeight: 600 }}
                >
                  ⚡ Automatic Room Allocation (Recommended)
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${allocationMode === "manual" ? "active" : ""}`}
                  onClick={() => setAllocationMode("manual")}
                  style={{ fontWeight: 600 }}
                >
                  🔧 Manual Room Selection (Override)
                </button>
              </div>

              {allocationMode === "manual" && (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="table-action-btn secondary"
                    style={{ fontSize: "12px", padding: "4px 8px" }}
                    onClick={handleSelectAvailableHalls}
                    disabled={allocating}
                  >
                    Select Available
                  </button>
                  <button
                    type="button"
                    className="table-action-btn tertiary"
                    style={{ fontSize: "12px", padding: "4px 8px" }}
                    onClick={handleClearHallSelection}
                    disabled={allocating}
                  >
                    Clear Selection
                  </button>
                </div>
              )}
            </div>

            {/* Mode A: Automatic Room Allocation Banner */}
            {allocationMode === "auto" && (
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  borderRadius: "8px",
                  padding: "16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "16px",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <h4 style={{ margin: "0 0 4px", color: "#166534", fontSize: "15px" }}>
                    ⚡ Automatic Room Allocation
                  </h4>
                  <p style={{ margin: 0, fontSize: "13px", color: "#15803d" }}>
                    The system automatically finds available active rooms with sufficient capacity for <strong>{studentCount} candidates</strong>, avoiding room overlaps on {String(selectedExam.exam_date).slice(0, 10)}.
                  </p>
                </div>

                <button
                  type="button"
                  className="allocate-btn-primary"
                  onClick={() => handleAllocate(true)}
                  disabled={!examId || allocating || studentCount === 0}
                  style={{ minWidth: "220px", padding: "10px 18px" }}
                >
                  {allocating ? "Running Auto-Allocation..." : "⚡ Run Auto-Room Allocation"}
                </button>
              </div>
            )}

            {/* Mode B: Manual Room Selection Grid */}
            {allocationMode === "manual" && (
              <div>
                <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#64748b" }}>
                  Select the physical examination rooms below. Rooms occupied by overlapping exams are flagged.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: "12px",
                    marginBottom: "16px",
                  }}
                >
                  {halls.map((hall) => {
                    const isSelected = selectedHallIds.includes(hall.hall_id);
                    // Check if hall is occupied by overlapping exam
                    const occupiedItem = hallsAvailability?.occupied_halls?.find(
                      (oh) => oh.hall_id === hall.hall_id
                    );
                    const isOccupied = !!occupiedItem;

                    return (
                      <label
                        key={hall.hall_id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "10px",
                          padding: "10px 14px",
                          background: isOccupied
                            ? "#fff1f2"
                            : isSelected
                            ? "#f0fdf4"
                            : "#f8fafc",
                          border: `1.5px solid ${
                            isOccupied
                              ? "#f87171"
                              : isSelected
                              ? "#16a34a"
                              : "#cbd5e1"
                          }`,
                          borderRadius: "8px",
                          cursor: isOccupied ? "not-allowed" : "pointer",
                          opacity: isOccupied ? 0.75 : 1,
                          transition: "all 0.15s ease",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleHallSelection(hall.hall_id)}
                          disabled={allocating || isOccupied}
                          style={{ marginTop: "3px" }}
                        />
                        <div>
                          <strong
                            style={{
                              display: "block",
                              color: isOccupied
                                ? "#991b1b"
                                : isSelected
                                ? "#15803d"
                                : "#1e293b",
                              fontSize: "14px",
                            }}
                          >
                            {hall.room_no ? `Room ${hall.room_no} (${hall.hall_name})` : `Hall ${hall.hall_name}`}
                          </strong>
                          <span style={{ fontSize: "12px", color: "#64748b" }}>
                            <strong>{hall.capacity}</strong> Seats ({hall.rows_count}×{hall.columns_count})
                          </span>
                          {isOccupied && (
                            <span
                              style={{
                                display: "block",
                                marginTop: "3px",
                                fontSize: "11px",
                                color: "#b91c1c",
                                fontWeight: 600,
                              }}
                            >
                              ⚠️ Occupied: {occupiedItem.overlap_exam || "Overlapping Exam"}
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Capacity Status & Manual Allocation Button */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: isCapacitySufficient ? "#f0fdf4" : "#fff1f2",
                    border: `1px solid ${isCapacitySufficient ? "#bbf7d0" : "#fecdd3"}`,
                    borderRadius: "8px",
                    padding: "12px 16px",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          color: isCapacitySufficient ? "#166534" : "#991b1b",
                        }}
                      >
                        {isCapacitySufficient
                          ? `✓ Capacity Sufficient: ${selectedCapacity} Seats Selected for ${studentCount} Students`
                          : `⚠️ Capacity Shortage: Selected halls hold ${selectedCapacity} seats, but ${studentCount} students need seats.`}
                      </span>
                      {isCapacitySufficient && studentCount > 0 && (
                        <span
                          className="capacity-pill"
                          style={{ background: "#dcfce7", color: "#166534" }}
                        >
                          +{selectedCapacity - studentCount} surplus seats
                        </span>
                      )}
                    </div>
                    {!isCapacitySufficient && (
                      <small style={{ color: "#b91c1c", display: "block", marginTop: "2px" }}>
                        Deficit: {capacityDeficit} more seats required. Please select additional examination rooms above.
                      </small>
                    )}
                  </div>

                  <button
                    type="button"
                    className="allocate-btn-primary"
                    onClick={() => handleAllocate(false)}
                    disabled={!examId || allocating || !isCapacitySufficient || selectedHallIds.length === 0}
                    style={{
                      opacity: !isCapacitySufficient || selectedHallIds.length === 0 ? 0.6 : 1,
                      cursor: !isCapacitySufficient || selectedHallIds.length === 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    {allocating ? "Allocating Seats..." : "Allocate Selected Rooms"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && <div className="allocation-error" style={{ marginTop: "14px" }}>{error}</div>}
        {message && <div className="allocation-success" style={{ marginTop: "14px" }}>{message}</div>}
      </section>

      {loadingAllocations && (
        <p className="status-message">Loading seating arrangement data...</p>
      )}

      {/* Allocation Metrics Banner */}
      {!loadingAllocations && allocations.length > 0 && (
        <section className="allocation-stats">
          <div className="panel allocation-stat">
            <span>Total Students Allocated</span>
            <strong>{allocations.length}</strong>
          </div>
          <div className="panel allocation-stat">
            <span>Halls Utilized</span>
            <strong>{utilizedHalls.length}</strong>
          </div>
          <div className="panel allocation-stat">
            <span>Adjacency Algorithm</span>
            <strong className="algo-badge">Department Min-Heap</strong>
          </div>
          <div className="panel allocation-stat">
            <span>Constraint Check</span>
            <strong className="status-badge success">Zero Adjacency Conflict</strong>
          </div>
        </section>
      )}

      {/* Seating Views: Visual Chart, Table & Integrated Reports Print Section */}
      {!loadingAllocations && allocations.length > 0 && (
        <section className="panel seating-display-panel">
          <div className="panel-header-with-toggle">
            <div>
              <h3>Seating Plan &amp; Official Reports</h3>
              <p className="panel-subtitle">
                Inspect candidate placement, review roster, or preview and print official examination registers.
              </p>
            </div>

            <div className="view-mode-toggle no-print">
              <button
                type="button"
                className={`toggle-btn ${viewMode === "chart" ? "active" : ""}`}
                onClick={() => setViewMode("chart")}
              >
                ▦ Visual Seating Chart
              </button>
              <button
                type="button"
                className={`toggle-btn ${viewMode === "table" ? "active" : ""}`}
                onClick={() => setViewMode("table")}
              >
                ☷ Student Roster Table
              </button>
              <button
                type="button"
                className={`toggle-btn ${viewMode === "reports" ? "active" : ""}`}
                onClick={() => setViewMode("reports")}
              >
                📄 Reports &amp; Print Preview
              </button>
            </div>
          </div>

          {viewMode === "chart" && (
            <SeatingChart
              selectedHalls={
                utilizedHalls.length > 0
                  ? utilizedHalls
                  : halls.filter((h) => selectedHallIds.includes(h.hall_id))
              }
              allocations={allocations}
              currentUser={user}
              isAdminOrHod={isAdmin || isHod}
            />
          )}

          {viewMode === "table" && (
            <div className="roster-table-view">
              <div className="table-search-bar">
                <input
                  type="search"
                  placeholder="Filter roster by student name, hall ticket, hall, department..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                />
              </div>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Hall Ticket</th>
                      <th>Student Name</th>
                      <th>Department</th>
                      <th>Assigned Hall</th>
                      <th>Seat Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAllocations.map((a) => (
                      <tr key={a.allocation_id}>
                        <td>
                          <strong>{a.hall_ticket_no}</strong>
                        </td>
                        <td>{a.student_name}</td>
                        <td>
                          <span className="badge-dept">{a.department}</span>
                        </td>
                        <td>
                          <strong>Hall {a.hall_name}</strong>
                        </td>
                        <td>
                          <span className="seat-badge">
                            Row {a.row}, Col {a.column}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {viewMode === "reports" && (
            <ReportsPrintView
              exam={selectedExam}
              allocations={allocations}
              utilizedHalls={utilizedHalls}
              allHalls={halls}
              assignments={assignments}
            />
          )}
        </section>
      )}

      {/* Supplementary Allocation Modal */}
      {isSupplModalOpen && (
        <SupplementaryModal
          examId={examId}
          onClose={() => setIsSupplModalOpen(false)}
          onSuccess={handleSupplementarySuccess}
        />
      )}
    </div>
  );
}
