import { useState, useMemo } from "react";
import api from "../services/api";

export default function ReportsPrintView({
  exam,
  allocations = [],
  utilizedHalls = [],
  allHalls = [],
  assignments = [],
}) {
  const [reportType, setReportType] = useState("seating"); // 'seating' | 'attendance' | 'duty'
  const [selectedHallId, setSelectedHallId] = useState("");

  const examId = exam?.exam_id;
  const examDate = exam?.exam_date ? String(exam.exam_date).slice(0, 10) : "";
  const session = exam?.session || "FN";

  // Available halls for filtering
  const hallsToFilter = useMemo(() => {
    if (utilizedHalls.length > 0) return utilizedHalls;
    if (allHalls.length > 0) return allHalls;
    return [];
  }, [utilizedHalls, allHalls]);

  // Active halls to display in seating / attendance report
  const activeHalls = useMemo(() => {
    if (selectedHallId) {
      return hallsToFilter.filter((h) => String(h.hall_id) === String(selectedHallId));
    }
    return hallsToFilter.length > 0 ? hallsToFilter : [{ hall_id: 0, hall_name: "All Rooms", room_no: "" }];
  }, [hallsToFilter, selectedHallId]);

  // Download PDF from backend ReportLab generator
  function handleDownloadPdf() {
    if (!examId) return;

    if (reportType === "seating") {
      const url = api.getReportUrl("seating", examId, selectedHallId ? { hall_id: selectedHallId } : {});
      window.open(url, "_blank", "noopener,noreferrer");
    } else if (reportType === "attendance") {
      const url = api.getReportUrl("attendance", examId, selectedHallId ? { hall_id: selectedHallId } : {});
      window.open(url, "_blank", "noopener,noreferrer");
    } else if (reportType === "duty") {
      const url = api.getDailyDutyRegisterUrl(examDate, session);
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  // Direct print using browser print dialog
  function handleDirectPrint() {
    window.print();
  }

  return (
    <div className="reports-print-container">
      {/* Control Toolbar (Excluded from print) */}
      <div className="reports-toolbar no-print">
        <div className="toolbar-tabs">
          <button
            type="button"
            className={`toolbar-tab-btn ${reportType === "seating" ? "active" : ""}`}
            onClick={() => setReportType("seating")}
          >
            🪑 Seating Chart
          </button>
          <button
            type="button"
            className={`toolbar-tab-btn ${reportType === "attendance" ? "active" : ""}`}
            onClick={() => setReportType("attendance")}
          >
            📋 Attendance Sheet
          </button>
          <button
            type="button"
            className={`toolbar-tab-btn ${reportType === "duty" ? "active" : ""}`}
            onClick={() => setReportType("duty")}
          >
            📑 Faculty Duty Register
          </button>
        </div>

        <div className="toolbar-actions">
          {reportType !== "duty" && (
            <div className="hall-filter-wrapper">
              <label htmlFor="report-hall-filter">Filter Room:</label>
              <select
                id="report-hall-filter"
                value={selectedHallId}
                onChange={(e) => setSelectedHallId(e.target.value)}
              >
                <option value="">All Utilized Rooms ({hallsToFilter.length})</option>
                {hallsToFilter.map((h) => (
                  <option key={h.hall_id} value={h.hall_id}>
                    {h.room_no ? `Room ${h.room_no} (Hall ${h.hall_name})` : `Hall ${h.hall_name}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            className="action-btn-print"
            onClick={handleDirectPrint}
            title="Open system print dialog"
          >
            🖨️ Direct Print (A4)
          </button>

          <button
            type="button"
            className="action-btn-pdf"
            onClick={handleDownloadPdf}
            title="Download official PDF report"
          >
            📥 Download Official PDF
          </button>
        </div>
      </div>

      {/* Printable Document Sheet (Rendered on screen & captured during print) */}
      <div className="printable-document">
        {/* =========================================================
            FORMAT 1: SEATING CHART (Matching Reference PDF)
           ========================================================= */}
        {reportType === "seating" && (
          <div className="print-sheets-container">
            {activeHalls.map((hall) => {
              const hallStudents = allocations.filter(
                (a) => String(a.hall_id) === String(hall.hall_id)
              );
              const assignedFaculty = assignments.find(
                (asg) => String(asg.hall_id) === String(hall.hall_id)
              );

              // Group students into bench pairs (Left & Right)
              // Each bench has 2 students: col 1 & 2 = Bench 1, col 3 & 4 = Bench 2, etc.
              const benches = [];
              for (let i = 0; i < hallStudents.length; i += 2) {
                benches.push({
                  benchNo: Math.floor(i / 2) + 1,
                  left: hallStudents[i] || null,
                  right: hallStudents[i + 1] || null,
                });
              }

              return (
                <div key={hall.hall_id} className="official-sheet-page">
                  {/* College Header */}
                  <div className="sheet-header">
                    <h2>SIDDHARTHA ACADEMY OF HIGHER EDUCATION DEEMED TO BE UNIVERSITY</h2>
                    <h3>DEPARTMENT OF COMPUTER SCIENCE &amp; ENGINEERING</h3>
                    <div className="sheet-badge-title">
                      EXAMINATION SEATING CHART — {hall.room_no ? `ROOM ${hall.room_no}` : `HALL ${hall.hall_name}`}
                    </div>
                  </div>

                  {/* Metadata Table */}
                  <table className="sheet-meta-table">
                    <tbody>
                      <tr>
                        <td style={{ width: "15%" }}><strong>Examination:</strong></td>
                        <td style={{ width: "45%" }}>{exam?.exam_name || exam?.subject_name}</td>
                        <td style={{ width: "15%" }}><strong>Date:</strong></td>
                        <td style={{ width: "25%" }}>{examDate}</td>
                      </tr>
                      <tr>
                        <td><strong>Course Code:</strong></td>
                        <td>{exam?.subject_code} — {exam?.subject_name}</td>
                        <td><strong>Session:</strong></td>
                        <td>
                          {session === "FN" ? "Forenoon (09:30 AM – 12:30 PM)" : "Afternoon (01:30 PM – 04:30 PM)"}
                        </td>
                      </tr>
                      <tr>
                        <td><strong>Room No:</strong></td>
                        <td>{hall.room_no || hall.hall_name}</td>
                        <td><strong>Total Seated:</strong></td>
                        <td><strong>{hallStudents.length} Candidates</strong> (Capacity: {hall.capacity || "—"})</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* 3-Column Bench Layout (Matching Reference PDF) */}
                  <div className="bench-grid-layout">
                    {benches.length === 0 ? (
                      <p className="no-candidates-msg">No students allocated to this examination hall.</p>
                    ) : (
                      <div className="benches-container">
                        {benches.map((b) => (
                          <div key={b.benchNo} className="bench-card">
                            <div className="bench-header">BENCH #{b.benchNo}</div>
                            <div className="bench-seats">
                              <div className="bench-seat left">
                                <span className="seat-label">L</span>
                                {b.left ? (
                                  <div className="seat-student">
                                    <strong>{b.left.hall_ticket_no}</strong>
                                    <span className="student-dept">{b.left.department}{b.left.section ? ` (Sec ${b.left.section})` : ""}</span>
                                    <small>{b.left.student_name}</small>
                                  </div>
                                ) : (
                                  <span className="empty-seat">Vacant</span>
                                )}
                              </div>
                              <div className="bench-seat right">
                                <span className="seat-label">R</span>
                                {b.right ? (
                                  <div className="seat-student">
                                    <strong>{b.right.hall_ticket_no}</strong>
                                    <span className="student-dept">{b.right.department}{b.right.section ? ` (Sec ${b.right.section})` : ""}</span>
                                    <small>{b.right.student_name}</small>
                                  </div>
                                ) : (
                                  <span className="empty-seat">Vacant</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer Signatures */}
                  <div className="sheet-footer">
                    <div className="footer-summary-box">
                      <span>Total Registered: <strong>{hallStudents.length}</strong></span>
                      <span>Assigned Invigilator: <strong>{assignedFaculty?.faculty_name || "Faculty Assigned"}</strong></span>
                    </div>

                    <div className="signature-blocks">
                      <div className="signature-box">
                        <div className="sig-line"></div>
                        <span>Signature of Invigilator</span>
                        <small>{assignedFaculty?.faculty_name || "Invigilator"}</small>
                      </div>
                      <div className="signature-box">
                        <div className="sig-line"></div>
                        <span>Chief Superintendent / COE</span>
                        <small>Examination Cell</small>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* =========================================================
            FORMAT 2: ATTENDANCE SHEET (Matching Reference PDF)
           ========================================================= */}
        {reportType === "attendance" && (
          <div className="print-sheets-container">
            {activeHalls.map((hall) => {
              const hallStudents = allocations.filter(
                (a) => String(a.hall_id) === String(hall.hall_id)
              );
              const assignedFaculty = assignments.find(
                (asg) => String(asg.hall_id) === String(hall.hall_id)
              );

              return (
                <div key={hall.hall_id} className="official-sheet-page">
                  {/* College Header */}
                  <div className="sheet-header">
                    <h2>SIDDHARTHA ACADEMY OF HIGHER EDUCATION DEEMED TO BE UNIVERSITY</h2>
                    <h3>KANURU, VIJAYAWADA - 520007, ANDHRA PRADESH</h3>
                    <div className="sheet-badge-title">
                      EXAMINATION ATTENDANCE &amp; ANSWER BOOKLET REGISTER
                    </div>
                  </div>

                  {/* Metadata Table */}
                  <table className="sheet-meta-table">
                    <tbody>
                      <tr>
                        <td style={{ width: "15%" }}><strong>Examination:</strong></td>
                        <td style={{ width: "45%" }}>{exam?.exam_name || exam?.subject_name}</td>
                        <td style={{ width: "15%" }}><strong>Date:</strong></td>
                        <td style={{ width: "25%" }}>{examDate}</td>
                      </tr>
                      <tr>
                        <td><strong>Subject:</strong></td>
                        <td>{exam?.subject_code} — {exam?.subject_name}</td>
                        <td><strong>Session:</strong></td>
                        <td>{session === "FN" ? "Forenoon (09:30 AM – 12:30 PM)" : "Afternoon (01:30 PM – 04:30 PM)"}</td>
                      </tr>
                      <tr>
                        <td><strong>Hall / Room:</strong></td>
                        <td>{hall.room_no ? `Room ${hall.room_no} (${hall.hall_name})` : hall.hall_name}</td>
                        <td><strong>Total Allotted:</strong></td>
                        <td><strong>{hallStudents.length} Students</strong></td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Attendance Table */}
                  <table className="attendance-register-table">
                    <thead>
                      <tr>
                        <th style={{ width: "6%" }}>S.No</th>
                        <th style={{ width: "22%" }}>Roll Number / Hall Ticket</th>
                        <th style={{ width: "26%" }}>Student Name</th>
                        <th style={{ width: "10%" }}>Branch</th>
                        <th style={{ width: "18%" }}>Main Booklet No.</th>
                        <th style={{ width: "18%" }}>Student Signature</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hallStudents.map((st, index) => (
                        <tr key={st.allocation_id || index}>
                          <td style={{ textAlign: "center" }}>{index + 1}</td>
                          <td><strong>{st.hall_ticket_no}</strong></td>
                          <td>{st.student_name}</td>
                          <td style={{ textAlign: "center" }}>{st.department}</td>
                          <td style={{ borderBottom: "1px dashed #94a3b8" }}></td>
                          <td style={{ borderBottom: "1px dashed #94a3b8" }}></td>
                        </tr>
                      ))}
                      {hallStudents.length === 0 && (
                        <tr>
                          <td colSpan="6" style={{ textAlign: "center", padding: "16px" }}>
                            No candidates allotted to this examination hall.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Summary & Signatures */}
                  <div className="sheet-footer">
                    <div className="attendance-summary-line">
                      <span>Total Allotted: <strong>{hallStudents.length}</strong></span>
                      <span>Total Present: <strong>________</strong></span>
                      <span>Total Absent: <strong>________</strong></span>
                    </div>

                    <div className="signature-blocks" style={{ marginTop: "24px" }}>
                      <div className="signature-box">
                        <div className="sig-line"></div>
                        <span>Name &amp; Signature of Invigilator</span>
                        <small>{assignedFaculty?.faculty_name || "Faculty Invigilator"}</small>
                      </div>
                      <div className="signature-box">
                        <div className="sig-line"></div>
                        <span>Chief Superintendent</span>
                        <small>Examination Cell Stamp</small>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* =========================================================
            FORMAT 3: FACULTY DUTY REGISTER (Matching Reference PDF)
           ========================================================= */}
        {reportType === "duty" && (
          <div className="print-sheets-container">
            <div className="official-sheet-page">
              {/* College Header */}
              <div className="sheet-header">
                <h2>SIDDHARTHA ACADEMY OF HIGHER EDUCATION DEEMED TO BE UNIVERSITY</h2>
                <h3>EXAMINATION CELL — FACULTY INVIGILATION DUTY REGISTER</h3>
                <div className="sheet-badge-title">
                  DAILY FACULTY ATTENDANCE &amp; DUTY SIGNATURE REGISTER
                </div>
              </div>

              {/* Metadata Table */}
              <table className="sheet-meta-table">
                <tbody>
                  <tr>
                    <td style={{ width: "15%" }}><strong>Date of Exam:</strong></td>
                    <td style={{ width: "35%" }}><strong>{examDate || "All Sessions"}</strong></td>
                    <td style={{ width: "15%" }}><strong>Session:</strong></td>
                    <td style={{ width: "35%" }}>
                      <strong>{session === "FN" ? "Forenoon (09:30 AM – 12:30 PM)" : "Afternoon (01:30 PM – 04:30 PM)"}</strong>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>Reporting Time:</strong></td>
                    <td><strong>08:45 AM (FN) / 12:45 PM (AN)</strong></td>
                    <td><strong>Exam Center:</strong></td>
                    <td>VRSEC Examination Cell / Central Computing Complex</td>
                  </tr>
                </tbody>
              </table>

              {/* Duty Table */}
              <table className="duty-register-table">
                <thead>
                  <tr>
                    <th style={{ width: "6%" }}>S.No</th>
                    <th style={{ width: "28%" }}>Faculty Name &amp; Designation</th>
                    <th style={{ width: "12%" }}>Department</th>
                    <th style={{ width: "14%" }}>Room No.</th>
                    <th style={{ width: "12%" }}>Reporting Time</th>
                    <th style={{ width: "14%" }}>Reporting Sign</th>
                    <th style={{ width: "14%" }}>Relieving Sign</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((asg, idx) => (
                    <tr key={asg.assignment_id || idx}>
                      <td style={{ textAlign: "center" }}>{idx + 1}</td>
                      <td>
                        <strong>{asg.faculty_name}</strong>
                      </td>
                      <td style={{ textAlign: "center" }}>{asg.faculty_department || "CSE"}</td>
                      <td style={{ textAlign: "center" }}>
                        <strong>{asg.room_no || asg.hall_name}</strong>
                      </td>
                      <td style={{ textAlign: "center" }}>08:45 AM</td>
                      <td style={{ borderBottom: "1px dashed #94a3b8" }}></td>
                      <td style={{ borderBottom: "1px dashed #94a3b8" }}></td>
                    </tr>
                  ))}
                  {assignments.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: "center", padding: "16px" }}>
                        No invigilator duty assignments found for this examination session.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Signatures */}
              <div className="sheet-footer" style={{ marginTop: "32px" }}>
                <div className="attendance-summary-line">
                  <span>Total Invigilators on Duty: <strong>{assignments.length}</strong></span>
                  <span>Relievers Deployed: <strong>2</strong></span>
                  <span>Chief Superintendent In-Charge: <strong>Confirmed</strong></span>
                </div>

                <div className="signature-blocks" style={{ marginTop: "32px" }}>
                  <div className="signature-box">
                    <div className="sig-line"></div>
                    <span>Exam Coordinator</span>
                    <small>Faculty In-Charge</small>
                  </div>
                  <div className="signature-box">
                    <div className="sig-line"></div>
                    <span>Chief Superintendent</span>
                    <small>Principal / Dean</small>
                  </div>
                  <div className="signature-box">
                    <div className="sig-line"></div>
                    <span>Controller of Examinations</span>
                    <small>Autonomous Examinations</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
