import { useState, useEffect, useRef } from "react";
import api from "../services/api";

export default function ReportPreviewModal({
  isOpen,
  onClose,
  previewData,
  initialType = "all",
  initialHallId = null,
  autoPrint = false,
}) {
  const [currentType, setCurrentType] = useState(initialType); // 'seating' | 'attendance' | 'faculty' | 'all'
  const [selectedHallIndex, setSelectedHallIndex] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [fitMode, setFitMode] = useState("normal"); // 'normal' | 'fit-width' | 'fit-page'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [printOption, setPrintOption] = useState("current"); // 'current' | 'all_seating' | 'all_attendance' | 'faculty' | 'all'
  const [showPrintDropdown, setShowPrintDropdown] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => {
    setCurrentType(initialType);
    if (previewData?.halls && initialHallId) {
      const idx = previewData.halls.findIndex(
        (h) => String(h.hall_id) === String(initialHallId)
      );
      if (idx !== -1) setSelectedHallIndex(idx);
    }
  }, [initialType, initialHallId, previewData]);

  useEffect(() => {
    if (isOpen && autoPrint) {
      const timer = setTimeout(() => {
        executePrint(initialType === "faculty" ? "faculty" : "current");
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoPrint, initialType]);

  if (!isOpen || !previewData) return null;

  const exam = previewData.exam || {};
  const halls = previewData.halls || [];
  const facultyRegister = previewData.faculty_register || { rows: [] };
  const currentHall = halls[selectedHallIndex] || halls[0] || {};

  // Calculate total pages for current mode
  let totalPages = 1;
  let currentPage = 1;
  if (currentType === "seating" || currentType === "attendance") {
    totalPages = Math.max(1, halls.length);
    currentPage = selectedHallIndex + 1;
  } else if (currentType === "faculty") {
    totalPages = 1;
    currentPage = 1;
  } else if (currentType === "all") {
    // seating (N halls) + attendance (N halls) + faculty (1)
    totalPages = halls.length * 2 + 1;
    currentPage = 1;
  }

  const handlePrevPage = () => {
    if (selectedHallIndex > 0) {
      setSelectedHallIndex((prev) => prev - 1);
    }
  };

  const handleNextPage = () => {
    if (selectedHallIndex < halls.length - 1) {
      setSelectedHallIndex((prev) => prev + 1);
    }
  };

  const handleZoomIn = () => {
    setFitMode("normal");
    setZoom((prev) => Math.min(prev + 20, 160));
  };

  const handleZoomOut = () => {
    setFitMode("normal");
    setZoom((prev) => Math.max(prev - 20, 60));
  };

  const handleResetZoom = () => {
    setFitMode("normal");
    setZoom(100);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      modalRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  // Browser print execution
  const executePrint = (mode = printOption) => {
    setShowPrintDropdown(false);
    
    // Tag the container with the print mode so CSS knows which sections to display
    const container = document.querySelector(".report-preview-modal");
    if (container) {
      container.setAttribute("data-print-mode", mode);
    }

    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Direct download handler
  const handleDownloadPdf = () => {
    if (!exam.exam_id) return;
    let url = "";
    if (currentType === "seating") {
      const hid = currentHall.hall_id;
      url = api.getReportUrl("seating", exam.exam_id, hid ? { hall_id: hid } : {});
    } else if (currentType === "attendance") {
      const hid = currentHall.hall_id;
      url = api.getReportUrl("attendance", exam.exam_id, hid ? { hall_id: hid } : {});
    } else if (currentType === "faculty") {
      url = api.getDailyDutyRegisterUrl(exam.exam_date, exam.session, exam.exam_id);
    } else {
      url = api.getCombinedPdfUrl(exam.exam_id);
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Render Seating Arrangement Sheet (Landscape)
  const renderSeatingSheet = (hall, index = 0, isPrintAll = false) => {
    const seatingRows = hall.seating_rows || [];
    return (
      <div
        key={`seating-${hall.hall_id || index}`}
        className={`document-sheet sheet-landscape ${
          isPrintAll ? "print-page print-seating" : ""
        }`}
      >
        <div className="sheet-header">
          <h1 className="navy-heading">{exam.exam_title || "CLASS TEST 1"}</h1>
          <h2 className="navy-subheading">
            ROOM NO: {hall.room_no || hall.hall_name}
          </h2>
          <h3 className="section-title">SEATING ARRANGEMENT</h3>
        </div>

        {/* 3 Bench Columns Layout */}
        <div className="seating-grid-container">
          <table className="seating-benches-table">
            <tbody>
              {seatingRows.map((row) => (
                <tr key={`bench-row-${row.row_no}`}>
                  {/* Block 1 */}
                  <td className="bench-cell left-seat">{row.b1_left || ""}</td>
                  <td className="bench-cell right-seat">{row.b1_right || ""}</td>

                  {/* Aisle 1 */}
                  <td className="aisle-gap"></td>

                  {/* Block 2 */}
                  <td className="bench-cell left-seat">{row.b2_left || ""}</td>
                  <td className="bench-cell right-seat">{row.b2_right || ""}</td>

                  {/* Aisle 2 */}
                  <td className="aisle-gap"></td>

                  {/* Block 3 */}
                  <td className="bench-cell left-seat">{row.b3_left || ""}</td>
                  <td className="bench-cell right-seat">{row.b3_right || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="seating-sheet-footer">
          <div className="footer-col left">
            <strong>Total Seated: {hall.student_count || 0}</strong>
          </div>
          <div className="footer-col center">
            <strong>INVIGILATOR SIGNATURE:</strong>{" "}
            <span className="signature-line">____________________</span>
          </div>
          <div className="footer-col right">
            <strong>DATE:</strong>{" "}
            <span className="signature-line">____________________</span>
          </div>
        </div>
      </div>
    );
  };

  // Render Attendance & Signature Sheet (Portrait)
  const renderAttendanceSheet = (hall, index = 0, isPrintAll = false) => {
    const roster = hall.student_roster || [];
    const totalAllotted = roster.length;
    const half = Math.ceil(totalAllotted / 2);
    const col1 = roster.slice(0, half);
    const col2 = roster.slice(half);
    const maxRows = Math.max(col1.length, col2.length, 18);

    const rows = [];
    for (let i = 0; i < maxRows; i++) {
      const s1 = col1[i];
      const s2 = col2[i];
      rows.push({
        s1_no: s1 ? i + 1 : "",
        s1_roll: s1 ? s1.hall_ticket_no : "",
        s2_no: s2 ? half + i + 1 : "",
        s2_roll: s2 ? s2.hall_ticket_no : "",
      });
    }

    return (
      <div
        key={`attendance-${hall.hall_id || index}`}
        className={`document-sheet sheet-portrait ${
          isPrintAll ? "print-page print-attendance" : ""
        }`}
      >
        <div className="sheet-header">
          <h1 className="navy-heading">{exam.exam_title || "CLASS TEST 1"}</h1>
          <h2 className="dark-subheading">
            STUDENT ATTENDANCE &amp; SIGNATURE SHEET
          </h2>
        </div>

        <div className="attendance-meta-bar">
          <div>
            <strong>ROOM NO:</strong> {hall.room_no || hall.hall_name}
          </div>
          <div>
            <strong>DATE:</strong> {exam.date_formatted || exam.exam_date}
          </div>
          <div>
            <strong>SESSION:</strong> {exam.session || "FN"}
          </div>
          <div>
            <strong>TOTAL ALLOTTED:</strong> {totalAllotted}
          </div>
        </div>

        {/* Dual Side-by-Side Attendance Roster Table */}
        <div className="attendance-table-container">
          <table className="attendance-dual-table">
            <thead>
              <tr>
                <th style={{ width: "8%" }}>S.NO</th>
                <th style={{ width: "24%" }}>ROLL NUMBER</th>
                <th style={{ width: "18%" }}>
                  BOOKLET
                  <br />
                  NO.
                </th>
                <th style={{ width: "22%" }}>STUDENT SIGN</th>
                <th style={{ width: "8%" }}>S.NO</th>
                <th style={{ width: "24%" }}>ROLL NUMBER</th>
                <th style={{ width: "18%" }}>
                  BOOKLET
                  <br />
                  NO.
                </th>
                <th style={{ width: "22%" }}>STUDENT SIGN</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, rIdx) => (
                <tr key={`att-row-${rIdx}`}>
                  <td className="center-cell">{r.s1_no}</td>
                  <td className="center-cell bold-cell">{r.s1_roll}</td>
                  <td className="blank-cell"></td>
                  <td className="blank-cell"></td>
                  <td className="center-cell">{r.s2_no}</td>
                  <td className="center-cell bold-cell">{r.s2_roll}</td>
                  <td className="blank-cell"></td>
                  <td className="blank-cell"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Attendance Footer Box */}
        <div className="attendance-footer-box">
          <div className="footer-box-row">
            <div>
              <strong>Total Present:</strong>{" "}
              <span className="blank-fill">__________</span>
            </div>
            <div>
              <strong>Total Absent:</strong>{" "}
              <span className="blank-fill">__________</span>
            </div>
            <div>
              <strong>Absentee Roll Nos:</strong>{" "}
              <span className="blank-fill">
                ______________________________
              </span>
            </div>
          </div>
          <div className="footer-box-row">
            <div>
              <strong>Invigilator Name:</strong>{" "}
              <span className="blank-fill">____________________</span>
            </div>
            <div>
              <strong>Signature:</strong>{" "}
              <span className="blank-fill">____________________</span>
            </div>
            <div>
              <strong>Date:</strong>{" "}
              <span className="blank-fill">____________________</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render Faculty Invigilation Duty Register (Portrait)
  const renderFacultyRegister = (isPrintAll = false) => {
    const rows = facultyRegister.rows || [];
    return (
      <div
        className={`document-sheet sheet-portrait ${
          isPrintAll ? "print-page print-faculty" : ""
        }`}
      >
        <div className="sheet-header">
          <h3 className="super-title">OFFICE OF THE CONTROLLER OF EXAMINATIONS</h3>
          <h1 className="navy-heading">{exam.exam_title || "CLASS TEST 1"}</h1>
          <h2 className="dark-subheading">
            FACULTY INVIGILATION DUTY ATTENDANCE REGISTER
          </h2>
        </div>

        <div className="faculty-meta-box">
          <div>
            <strong>Date of Exam:</strong> [ {facultyRegister.date_formatted || exam.date_slash || exam.exam_date} ]
          </div>
          <div>
            <strong>Day:</strong> [ {facultyRegister.day || exam.day_name} ]
          </div>
          <div>
            <strong>Session:</strong> {facultyRegister.session_label || exam.session_label || "FORENOON (09:30 AM – 12:30 PM)"}
          </div>
        </div>

        <div className="faculty-table-container">
          <table className="faculty-duty-table">
            <thead>
              <tr>
                <th style={{ width: "8%" }}>S.NO</th>
                <th style={{ width: "34%" }}>FACULTY NAME &amp; DESIGNATION</th>
                <th style={{ width: "15%" }}>DEPARTMENT</th>
                <th style={{ width: "16%" }}>ROOM NO.</th>
                <th style={{ width: "15%" }}>REPORTING TIME</th>
                <th style={{ width: "16%" }}>REPORTING SIGN</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`fac-row-${row.s_no}`}>
                  <td className="center-cell">{row.s_no}</td>
                  <td className="center-cell bold-cell">{row.faculty_name}</td>
                  <td className="center-cell">{row.department}</td>
                  <td className="center-cell room-cell">{row.room_no}</td>
                  <td className="center-cell">{row.reporting_time}</td>
                  <td className="blank-cell"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="report-preview-modal-overlay" ref={modalRef}>
      <div className="report-preview-modal">
        {/* Top Floating Control Bar (No Print) */}
        <header className="preview-topbar no-print">
          <div className="topbar-section left">
            <span className="topbar-title">Document Preview</span>
            <div className="type-pills">
              <button
                type="button"
                className={`type-pill ${currentType === "seating" ? "active" : ""}`}
                onClick={() => setCurrentType("seating")}
              >
                🪑 Seating Arrangements
              </button>
              <button
                type="button"
                className={`type-pill ${currentType === "attendance" ? "active" : ""}`}
                onClick={() => setCurrentType("attendance")}
              >
                📋 Attendance Sheets
              </button>
              <button
                type="button"
                className={`type-pill ${currentType === "faculty" ? "active" : ""}`}
                onClick={() => setCurrentType("faculty")}
              >
                📑 Faculty Register
              </button>
              <button
                type="button"
                className={`type-pill ${currentType === "all" ? "active" : ""}`}
                onClick={() => setCurrentType("all")}
              >
                📚 All Reports
              </button>
            </div>
          </div>

          {/* Room Switcher (for room-wise reports) */}
          {(currentType === "seating" || currentType === "attendance") && (
            <div className="topbar-section room-switcher">
              <label htmlFor="modal-room-select">Switch Room:</label>
              <select
                id="modal-room-select"
                value={selectedHallIndex}
                onChange={(e) => setSelectedHallIndex(Number(e.target.value))}
              >
                {halls.map((h, idx) => (
                  <option key={h.hall_id || idx} value={idx}>
                    Room {h.room_no || h.hall_name} ({h.student_count} seated)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Page Navigation */}
          {currentType !== "all" && currentType !== "faculty" && (
            <div className="topbar-section nav-controls">
              <button
                type="button"
                className="nav-btn"
                disabled={selectedHallIndex === 0}
                onClick={handlePrevPage}
                title="Previous Room"
              >
                ◀ Prev Room
              </button>
              <span className="page-counter">
                Room {selectedHallIndex + 1} of {halls.length}
              </span>
              <button
                type="button"
                className="nav-btn"
                disabled={selectedHallIndex >= halls.length - 1}
                onClick={handleNextPage}
                title="Next Room"
              >
                Next Room ▶
              </button>
            </div>
          )}

          {/* Zoom & Fit Controls */}
          <div className="topbar-section zoom-controls">
            <button
              type="button"
              className="zoom-btn"
              onClick={handleZoomOut}
              title="Zoom Out"
            >
              ➖
            </button>
            <span className="zoom-text" onClick={handleResetZoom} title="Reset Zoom">
              {zoom}%
            </span>
            <button
              type="button"
              className="zoom-btn"
              onClick={handleZoomIn}
              title="Zoom In"
            >
              ➕
            </button>
            <button
              type="button"
              className={`zoom-mode-btn ${fitMode === "fit-width" ? "active" : ""}`}
              onClick={() => setFitMode(fitMode === "fit-width" ? "normal" : "fit-width")}
              title="Fit to Width"
            >
              ↔ Fit Width
            </button>
          </div>

          {/* Print & Download Action Controls */}
          <div className="topbar-section action-controls">
            <div className="print-dropdown-wrapper">
              <button
                type="button"
                className="btn btn-primary-print"
                onClick={() => executePrint(currentType === "all" ? "all" : "current")}
              >
                🖨️ Print
              </button>
              <button
                type="button"
                className="btn-print-caret"
                onClick={() => setShowPrintDropdown((prev) => !prev)}
                title="Print Options"
              >
                ▼
              </button>

              {showPrintDropdown && (
                <div className="print-menu-dropdown">
                  <button
                    type="button"
                    onClick={() => executePrint("current")}
                  >
                    🖨️ Print Current Document (Room {currentHall.room_no || ""})
                  </button>
                  <button
                    type="button"
                    onClick={() => executePrint("all_seating")}
                  >
                    🪑 Print All Seating Arrangements ({halls.length} rooms)
                  </button>
                  <button
                    type="button"
                    onClick={() => executePrint("all_attendance")}
                  >
                    📋 Print All Attendance Sheets ({halls.length} rooms)
                  </button>
                  <button
                    type="button"
                    onClick={() => executePrint("faculty")}
                  >
                    📑 Print Faculty Duty Register
                  </button>
                  <hr style={{ margin: "4px 0", borderColor: "#e2e8f0" }} />
                  <button
                    type="button"
                    onClick={() => executePrint("all")}
                    style={{ fontWeight: "bold", color: "var(--primary-navy)" }}
                  >
                    📚 Print All Reports Together
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn btn-download-modal"
              onClick={handleDownloadPdf}
              title="Download official PDF matching this document"
            >
              📥 Download PDF
            </button>

            <button
              type="button"
              className="btn-icon-fullscreen"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? "🗗" : "⛶"}
            </button>

            <button
              type="button"
              className="btn-modal-close"
              onClick={onClose}
              title="Close Preview"
            >
              ✕
            </button>
          </div>
        </header>

        {/* Viewport Area with Document Sheet Rendering */}
        <div className="preview-viewport-container">
          <div
            className={`preview-scale-wrapper ${
              fitMode === "fit-width" ? "fit-width-mode" : ""
            }`}
            style={{
              transform: fitMode === "normal" ? `scale(${zoom / 100})` : "none",
              transformOrigin: "top center",
            }}
          >
            {/* SCREEN VIEW MODE */}
            <div className="screen-document-view no-print">
              {currentType === "seating" && renderSeatingSheet(currentHall, selectedHallIndex)}
              {currentType === "attendance" && renderAttendanceSheet(currentHall, selectedHallIndex)}
              {currentType === "faculty" && renderFacultyRegister()}
              {currentType === "all" && (
                <div className="all-documents-flow">
                  <div className="doc-section-divider">SEATING ARRANGEMENTS (ALL ROOMS)</div>
                  {halls.map((h, i) => renderSeatingSheet(h, i))}

                  <div className="doc-section-divider">STUDENT ATTENDANCE SHEETS (ALL ROOMS)</div>
                  {halls.map((h, i) => renderAttendanceSheet(h, i))}

                  <div className="doc-section-divider">FACULTY INVIGILATION DUTY REGISTER</div>
                  {renderFacultyRegister()}
                </div>
              )}
            </div>

            {/* PRINT-ONLY VIEW (Hidden on screen, revealed exclusively during window.print()) */}
            <div className="print-exclusive-view only-print">
              {/* Current Document Only */}
              <div className="print-target print-mode-current">
                {currentType === "seating" && renderSeatingSheet(currentHall, selectedHallIndex, true)}
                {currentType === "attendance" && renderAttendanceSheet(currentHall, selectedHallIndex, true)}
                {currentType === "faculty" && renderFacultyRegister(true)}
              </div>

              {/* All Seating Arrangements */}
              <div className="print-target print-mode-all_seating">
                {halls.map((h, i) => renderSeatingSheet(h, i, true))}
              </div>

              {/* All Attendance Sheets */}
              <div className="print-target print-mode-all_attendance">
                {halls.map((h, i) => renderAttendanceSheet(h, i, true))}
              </div>

              {/* Faculty Duty Register */}
              <div className="print-target print-mode-faculty">
                {renderFacultyRegister(true)}
              </div>

              {/* All Reports Together */}
              <div className="print-target print-mode-all">
                {halls.map((h, i) => renderSeatingSheet(h, i, true))}
                {halls.map((h, i) => renderAttendanceSheet(h, i, true))}
                {renderFacultyRegister(true)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
