import { useState, useMemo } from "react";

const DEPARTMENT_COLORS = {
  CSE: { bg: "#e0e7ff", border: "#6366f1", text: "#3730a3", darkBg: "#4338ca" },
  ECE: { bg: "#ccfbf1", border: "#14b8a6", text: "#115e59", darkBg: "#0f766e" },
  EEE: { bg: "#fef3c7", border: "#f59e0b", text: "#92400e", darkBg: "#b45309" },
  MECH: { bg: "#ffedd5", border: "#f97316", text: "#9a3412", darkBg: "#c2410c" },
  DEFAULT: { bg: "#f1f5f9", border: "#94a3b8", text: "#334155", darkBg: "#475569" },
};

export default function SeatingChart({
  selectedHalls = [],
  allocations = [],
  currentUser,
  isAdminOrHod = false,
}) {
  const [activeHallId, setActiveHallId] = useState(() => {
    return selectedHalls[0]?.hall_id || null;
  });
  const [selectedSeat, setSelectedSeat] = useState(null);

  // Sync active hall if selectedHalls changes
  const activeHall = useMemo(() => {
    if (!selectedHalls.length) return null;
    const found = selectedHalls.find((h) => h.hall_id === activeHallId);
    return found || selectedHalls[0];
  }, [selectedHalls, activeHallId]);

  // Index allocations for quick row/column lookup in active hall
  const hallAllocationsMap = useMemo(() => {
    const map = new Map();
    if (!activeHall) return map;

    allocations
      .filter((a) => a.hall_id === activeHall.hall_id)
      .forEach((alloc) => {
        const key = `${alloc.row}-${alloc.column}`;
        map.set(key, alloc);
      });
    return map;
  }, [allocations, activeHall]);

  // Compute hall statistics
  const hallStats = useMemo(() => {
    if (!activeHall) return { allocated: 0, capacity: 0, free: 0, percent: 0 };
    const allocated = hallAllocationsMap.size;
    const capacity = activeHall.capacity || (activeHall.rows_count * activeHall.columns_count) || 1;
    const free = Math.max(capacity - allocated, 0);
    const percent = Math.min(Math.round((allocated / capacity) * 100), 100);
    return { allocated, capacity, free, percent };
  }, [activeHall, hallAllocationsMap]);

  // Extract unique departments for legend
  const presentDepartments = useMemo(() => {
    const set = new Set();
    allocations.forEach((a) => {
      if (a.department) set.add(a.department.toUpperCase());
    });
    return Array.from(set);
  }, [allocations]);

  if (!selectedHalls.length) {
    return (
      <div className="seating-chart-empty">
        <p>No halls assigned to this seating allocation yet.</p>
      </div>
    );
  }

  const rows = activeHall?.rows_count || 5;
  const cols = activeHall?.columns_count || 6;

  function canViewDetails(alloc) {
    if (isAdminOrHod) return true;
    if (currentUser?.role === "invigilator") return true;
    if (currentUser?.role === "student") {
      // Students can only see their own details
      return (
        currentUser.email?.toLowerCase().includes(alloc.hall_ticket_no?.toLowerCase()) ||
        String(currentUser.student_id) === String(alloc.student_id)
      );
    }
    return false;
  }

  return (
    <div className="seating-chart-container">
      {/* Hall Tabs */}
      <div className="hall-tabs-bar">
        <div className="hall-tabs">
          {selectedHalls.map((hall) => {
            const count = allocations.filter((a) => a.hall_id === hall.hall_id).length;
            const isActive = hall.hall_id === activeHall?.hall_id;
            return (
              <button
                key={hall.hall_id}
                type="button"
                className={`hall-tab-btn ${isActive ? "active" : ""}`}
                onClick={() => {
                  setActiveHallId(hall.hall_id);
                  setSelectedSeat(null);
                }}
              >
                <span className="hall-tab-name">{hall.hall_name}</span>
                <span className="hall-tab-pill">{count} / {hall.capacity}</span>
              </button>
            );
          })}
        </div>

        {activeHall && (
          <div className="hall-summary-pills">
            <span className="summary-chip">
              Rows: <strong>{rows}</strong> × Cols: <strong>{cols}</strong>
            </span>
            <span className="summary-chip">
              Capacity: <strong>{hallStats.capacity}</strong>
            </span>
            <span className="summary-chip highlight">
              Occupied: <strong>{hallStats.allocated}</strong> ({hallStats.percent}%)
            </span>
            <span className="summary-chip success">
              Available: <strong>{hallStats.free}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Department & Status Legend */}
      <div className="chart-legend-bar">
        <div className="legend-group">
          <span className="legend-title">Departments:</span>
          {presentDepartments.map((dept) => {
            const colors = DEPARTMENT_COLORS[dept] || DEPARTMENT_COLORS.DEFAULT;
            return (
              <span
                key={dept}
                className="legend-badge"
                style={{
                  backgroundColor: colors.bg,
                  borderColor: colors.border,
                  color: colors.text,
                }}
              >
                <span
                  className="dept-dot"
                  style={{ backgroundColor: colors.border }}
                />
                {dept}
              </span>
            );
          })}
          {presentDepartments.length === 0 && (
            <span className="legend-text">No departments allocated yet</span>
          )}
        </div>

        <div className="legend-group">
          <span className="legend-title">Seat Status:</span>
          <span className="legend-badge status-occupied">
            <span className="status-dot occupied"></span> Occupied
          </span>
          <span className="legend-badge status-empty">
            <span className="status-dot empty"></span> Unallocated / Empty
          </span>
          <span className="legend-badge status-selected">
            <span className="status-dot selected"></span> Selected
          </span>
        </div>
      </div>

      {/* Seating Grid */}
      <div className="chart-canvas-wrapper">
        <div className="hall-stage-indicator">
          <span>BLACKBOARD / INVIGILATOR DESK (FRONT)</span>
        </div>

        <div
          className="seating-grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(110px, 1fr))`,
          }}
        >
          {Array.from({ length: rows }).map((_, rIdx) => {
            const rowNumber = rIdx + 1;
            return Array.from({ length: cols }).map((_, cIdx) => {
              const colNumber = cIdx + 1;
              const key = `${rowNumber}-${colNumber}`;
              const alloc = hallAllocationsMap.get(key);
              const isOccupied = Boolean(alloc);
              const isSelected =
                selectedSeat &&
                selectedSeat.row === rowNumber &&
                selectedSeat.column === colNumber &&
                selectedSeat.hall_id === activeHall?.hall_id;

              const dept = alloc?.department?.toUpperCase();
              const colors = isOccupied
                ? DEPARTMENT_COLORS[dept] || DEPARTMENT_COLORS.DEFAULT
                : null;

              const isUserSeat =
                isOccupied &&
                currentUser?.role === "student" &&
                canViewDetails(alloc);

              return (
                <div
                  key={key}
                  className={`seat-cell ${isOccupied ? "occupied" : "empty"} ${
                    isSelected ? "selected" : ""
                  } ${isUserSeat ? "user-seat" : ""}`}
                  style={
                    isOccupied
                      ? {
                          backgroundColor: colors.bg,
                          borderColor: isSelected ? "#1e293b" : colors.border,
                          color: colors.text,
                        }
                      : {}
                  }
                  onClick={() => {
                    setSelectedSeat(
                      isOccupied
                        ? { ...alloc, row: rowNumber, column: colNumber, hall_id: activeHall?.hall_id }
                        : {
                            hall_id: activeHall?.hall_id,
                            hall_name: activeHall?.hall_name,
                            row: rowNumber,
                            column: colNumber,
                            empty: true,
                          }
                    );
                  }}
                  role="button"
                  tabIndex={0}
                  title={
                    isOccupied
                      ? `Row ${rowNumber}, Col ${colNumber} — ${
                          canViewDetails(alloc)
                            ? `${alloc.student_name} (${alloc.hall_ticket_no}) - ${alloc.department}`
                            : `Occupied (${alloc.department})`
                        }`
                      : `Row ${rowNumber}, Col ${colNumber} (Available)`
                  }
                >
                  <div className="seat-coord">R{rowNumber}-C{colNumber}</div>

                  {isOccupied ? (
                    <div className="seat-content">
                      <span
                        className="seat-dept-tag"
                        style={{ backgroundColor: colors.border, color: "#fff" }}
                      >
                        {alloc.department}
                      </span>
                      {canViewDetails(alloc) ? (
                        <>
                          <strong className="seat-student-name">
                            {alloc.student_name}
                          </strong>
                          <span className="seat-hall-ticket">
                            {alloc.hall_ticket_no}
                          </span>
                        </>
                      ) : (
                        <span className="seat-occupied-label">Occupied</span>
                      )}
                    </div>
                  ) : (
                    <div className="seat-empty-content">
                      <span className="empty-label">Available</span>
                    </div>
                  )}

                  {isUserSeat && (
                    <span className="user-seat-pill" title="Your Assigned Seat">
                      YOUR SEAT
                    </span>
                  )}
                </div>
              );
            });
          })}
        </div>
      </div>

      {/* Selected Seat Inspector Modal / Panel */}
      {selectedSeat && (
        <div className="seat-details-drawer">
          <div className="drawer-header">
            <h4>
              Seat Details: Hall {activeHall?.hall_name} · Row {selectedSeat.row}, Col {selectedSeat.column}
            </h4>
            <button
              type="button"
              className="drawer-close-btn"
              onClick={() => setSelectedSeat(null)}
            >
              ✕
            </button>
          </div>

          <div className="drawer-body">
            {selectedSeat.empty ? (
              <div className="drawer-empty-notice">
                <span className="icon">✓</span>
                <div>
                  <strong>Seat Unallocated & Available</strong>
                  <p>
                    This physical seat is vacant and available for supplementary or manual allocation.
                  </p>
                </div>
              </div>
            ) : (
              <div className="drawer-seat-info-grid">
                <div className="info-item">
                  <span className="info-label">Student Name</span>
                  <strong className="info-value">
                    {canViewDetails(selectedSeat) ? selectedSeat.student_name : "Restricted (Confidential)"}
                  </strong>
                </div>

                <div className="info-item">
                  <span className="info-label">Hall Ticket No</span>
                  <strong className="info-value">
                    {canViewDetails(selectedSeat) ? selectedSeat.hall_ticket_no : "•••••••••"}
                  </strong>
                </div>

                <div className="info-item">
                  <span className="info-label">Department</span>
                  <strong className="info-value">
                    <span
                      className="dept-tag-badge"
                      style={{
                        backgroundColor:
                          DEPARTMENT_COLORS[selectedSeat.department]?.bg || "#f1f5f9",
                        borderColor:
                          DEPARTMENT_COLORS[selectedSeat.department]?.border || "#cbd5e1",
                        color:
                          DEPARTMENT_COLORS[selectedSeat.department]?.text || "#1e293b",
                      }}
                    >
                      {selectedSeat.department}
                    </span>
                  </strong>
                </div>

                <div className="info-item">
                  <span className="info-label">Hall & Coordinate</span>
                  <strong className="info-value">
                    {activeHall?.hall_name} (Row {selectedSeat.row}, Col {selectedSeat.column})
                  </strong>
                </div>

                {selectedSeat.subject_code && (
                  <div className="info-item full-width">
                    <span className="info-label">Examination Subject</span>
                    <strong className="info-value">
                      {selectedSeat.subject_code} — {selectedSeat.subject_name}
                    </strong>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
