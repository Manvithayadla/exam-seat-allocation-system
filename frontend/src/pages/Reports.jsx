import { useState, useEffect, useMemo } from "react";
import api from "../services/api";
import ReportPreviewModal from "../components/ReportPreviewModal";
import { useAcademicCohort } from "../context/AcademicCohortContext";

const STUDY_YEAR_SEMESTERS = {
  1: ["Semester 1", "Semester 2"],
  2: ["Semester 3", "Semester 4"],
  3: ["Semester 5", "Semester 6"],
  4: ["Semester 7", "Semester 8"],
  "1": ["Semester 1", "Semester 2"],
  "2": ["Semester 3", "Semester 4"],
  "3": ["Semester 5", "Semester 6"],
  "4": ["Semester 7", "Semester 8"],
};

const STUDY_YEAR_OPTIONS = [
  { value: "1", label: "1st Year" },
  { value: "2", label: "2nd Year" },
  { value: "3", label: "3rd Year" },
  { value: "4", label: "4th Year" },
];

export default function Reports() {
  // Cascading Filter States
  const [filterOptions, setFilterOptions] = useState({
    academic_years: ["2026-2027"],
    study_years: [1, 2, 3, 4],
    semesters: [
      "Semester 1", "Semester 2", "Semester 3", "Semester 4",
      "Semester 5", "Semester 6", "Semester 7", "Semester 8"
    ],
    exams: [],
  });

  const {
    academicYear: cohortAy,
    studyYear: cohortSy,
    selectedSemester: cohortSem,
    setAcademicYear: setCohortAy,
    setStudyYear: setCohortSy,
    setSelectedSemester: setCohortSem,
  } = useAcademicCohort();

  const [selectedAcademicYear, setSelectedAcademicYear] = useState(() => cohortAy || "2026-2027");
  const [selectedStudyYear, setSelectedStudyYear] = useState(() => String(cohortSy || 2));
  const [selectedSemester, setSelectedSemester] = useState(() => cohortSem || "Semester 3");

  // Keep in sync with global cohort context
  useEffect(() => {
    if (cohortAy) setSelectedAcademicYear(cohortAy);
    if (cohortSy) setSelectedStudyYear(String(cohortSy));
    if (cohortSem) setSelectedSemester(cohortSem);
  }, [cohortAy, cohortSy, cohortSem]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedHallId, setSelectedHallId] = useState(""); // "" means All Rooms

  // Preview & Modal States
  const [previewData, setPreviewData] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewType, setPreviewType] = useState("all");
  const [previewHallId, setPreviewHallId] = useState(null);
  const [autoPrintMode, setAutoPrintMode] = useState(false);

  // Status & Loading States
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ text: "", type: "" });

  // Derived available semesters for currently selected Study Year
  const availableSemesters = useMemo(() => {
    if (!selectedStudyYear) return [];
    return STUDY_YEAR_SEMESTERS[selectedStudyYear] || [];
  }, [selectedStudyYear]);

  // Handler for Study Year change: resets semester and cascade
  const handleStudyYearChange = (newYear) => {
    setSelectedStudyYear(newYear);
    if (newYear) setCohortSy(Number(newYear));
    setSelectedSemester(""); // Clear previous semester
    setSelectedExamId("");
    setSelectedHallId("");
    setPreviewData(null);
  };

  // Handler for Semester change
  const handleSemesterChange = (newSemester) => {
    setSelectedSemester(newSemester);
    if (newSemester) setCohortSem(newSemester);
    setSelectedExamId("");
    setSelectedHallId("");
    setPreviewData(null);
  };

  // 1. Load Filter Options from MySQL
  useEffect(() => {
    setLoadingFilters(true);
    api
      .getReportFilterOptions({
        academic_year: selectedAcademicYear,
        study_year: selectedStudyYear,
        semester: selectedSemester,
        department: "CSE",
      })
      .then((data) => {
        setFilterOptions(data);
        if (data.academic_years?.length > 0 && !selectedAcademicYear) {
          setSelectedAcademicYear(data.academic_years[0]);
        }
      })
      .catch((err) => {
        console.error("Failed to load report filter options:", err);
        setStatusMessage({
          text: "Could not load examination filter options from database.",
          type: "error",
        });
      })
      .finally(() => setLoadingFilters(false));
  }, []);

  // Fetch updated examinations whenever Academic Year, Study Year, or Semester changes
  useEffect(() => {
    if (!selectedStudyYear || !selectedSemester) {
      return;
    }
    setLoadingFilters(true);
    api
      .getReportFilterOptions({
        academic_year: selectedAcademicYear,
        study_year: selectedStudyYear,
        semester: selectedSemester,
        department: "CSE",
      })
      .then((data) => {
        if (data && data.exams) {
          setFilterOptions((prev) => ({
            ...prev,
            exams: data.exams,
          }));
        }
      })
      .catch((err) => {
        console.error("Failed to fetch filtered exams:", err);
      })
      .finally(() => setLoadingFilters(false));
  }, [selectedAcademicYear, selectedStudyYear, selectedSemester]);

  // 2. Filter exams based on Academic Year, Study Year, Semester, and Department (CSE)
  const filteredExams = useMemo(() => {
    if (!selectedStudyYear || !selectedSemester) {
      return [];
    }
    return (filterOptions.exams || []).filter((ex) => {
      const matchAy =
        !selectedAcademicYear || ex.academic_year === selectedAcademicYear;
      const matchSy =
        String(ex.study_year) === String(selectedStudyYear);
      const matchSem =
        ex.semester === selectedSemester;
      const matchDept =
        !ex.target_branch ||
        ex.target_branch.toUpperCase().includes("CSE") ||
        ex.target_branch.toUpperCase() === "ALL";
      return matchAy && matchSy && matchSem && matchDept;
    });
  }, [filterOptions.exams, selectedAcademicYear, selectedStudyYear, selectedSemester]);

  // 3. Auto-select first exam when filtered list updates
  useEffect(() => {
    if (filteredExams.length > 0) {
      const exists = filteredExams.some(
        (e) => String(e.exam_id) === String(selectedExamId)
      );
      if (!exists) {
        setSelectedExamId(String(filteredExams[0].exam_id));
      }
    } else {
      setSelectedExamId("");
    }
  }, [filteredExams, selectedExamId]);

  const selectedExam = useMemo(() => {
    return (filterOptions.exams || []).find(
      (e) => String(e.exam_id) === String(selectedExamId)
    );
  }, [filterOptions.exams, selectedExamId]);

  // 4. Fetch Live Preview Data whenever Exam or Hall changes
  useEffect(() => {
    if (!selectedExamId) {
      setPreviewData(null);
      return;
    }
    setLoadingPreview(true);
    api
      .getReportPreviewData(selectedExamId, selectedHallId, selectedStudyYear, selectedSemester)
      .then((data) => {
        setPreviewData(data);
        setStatusMessage({ text: "", type: "" });
      })
      .catch((err) => {
        console.warn("Preview data fetch error:", err);
        setPreviewData(null);
        const errorMsg =
          err?.response?.data?.error ||
          err?.message ||
          "Failed to load report preview data from server.";
        setStatusMessage({ text: errorMsg, type: "error" });
      })
      .finally(() => setLoadingPreview(false));
  }, [selectedExamId, selectedHallId]);

  // Validation Checks
  const hasSeating = (selectedExam?.allocated_count || 0) > 0;
  const hasInvigilators = (selectedExam?.invig_count || 0) > 0;
  const isDataComplete = hasSeating;

  // Open Preview Workflow
  const openPreview = async (type = "all", hallId = null, autoPrint = false) => {
    if (!selectedExamId) {
      setStatusMessage({
        text: "Please select an examination first.",
        type: "warning",
      });
      return;
    }

    if (type !== "faculty" && !hasSeating) {
      setStatusMessage({
        text: "Cannot preview reports: Seat allocation has not been performed for this examination yet. Please allocate seats first in Seating Arrangement.",
        type: "error",
      });
      return;
    }

    const targetHallId = hallId || (selectedHallId ? Number(selectedHallId) : null);

    // If previewData is not yet populated or is loading, fetch directly on demand
    if (!previewData) {
      setLoadingPreview(true);
      try {
        const data = await api.getReportPreviewData(
          selectedExamId,
          selectedHallId,
          selectedStudyYear,
          selectedSemester
        );
        setPreviewData(data);
        setStatusMessage({ text: "", type: "" });
        setPreviewType(type);
        setPreviewHallId(targetHallId);
        setAutoPrintMode(autoPrint);
        setIsPreviewOpen(true);
      } catch (err) {
        console.warn("Direct preview fetch error:", err);
        const errorMsg =
          err?.response?.data?.error ||
          err?.message ||
          "Failed to load preview records for the selected examination.";
        setStatusMessage({ text: errorMsg, type: "error" });
      } finally {
        setLoadingPreview(false);
      }
      return;
    }

    setPreviewType(type);
    setPreviewHallId(targetHallId);
    setAutoPrintMode(autoPrint);
    setIsPreviewOpen(true);
  };

  const handlePrintCard = (type) => {
    openPreview(type, null, true);
  };

  // Download Trigger Helpers
  const handleDownloadSeating = (hallId = null) => {
    if (!selectedExamId) return;
    const targetHall = hallId || selectedHallId;
    const url = api.getReportUrl("seating", selectedExamId, {
      hall_id: targetHall,
      study_year: selectedStudyYear,
      semester: selectedSemester,
    });
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDownloadAttendance = (hallId = null) => {
    if (!selectedExamId) return;
    const targetHall = hallId || selectedHallId;
    const url = api.getReportUrl("attendance", selectedExamId, {
      hall_id: targetHall,
      study_year: selectedStudyYear,
      semester: selectedSemester,
    });
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDownloadFacultyRegister = () => {
    if (!selectedExam) return;
    const url = api.getDailyDutyRegisterUrl(
      selectedExam.exam_date,
      selectedExam.session,
      selectedExam.exam_id,
      selectedStudyYear,
      selectedSemester
    );
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDownloadCombined = () => {
    if (!selectedExamId) return;
    const url = api.getCombinedPdfUrl(selectedExamId, selectedStudyYear, selectedSemester);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDownloadZip = () => {
    if (!selectedExamId) return;
    const url = api.getReportsZipUrl(selectedExamId, selectedStudyYear, selectedSemester);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Format schedule date nicely
  const formattedScheduleDate = selectedExam?.exam_date
    ? new Date(selectedExam.exam_date + "T00:00:00").toLocaleDateString("en-IN", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  return (
    <div className="reports-page-wrapper">
      {/* Header */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Reports &amp; Document Generation</h1>
          <p className="page-description">
            Generate and print official examination documents (Room-wise Seating Arrangements,
            Student Attendance &amp; Signature Sheets, and Daily Faculty Invigilation Registers)
            strictly following university formats.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-primary-action"
            disabled={!selectedExamId || !hasSeating}
            onClick={() => openPreview("all")}
          >
            👁️ Preview All Reports
          </button>
          <button
            type="button"
            className="btn btn-navy"
            disabled={!selectedExamId || !hasSeating}
            onClick={handleDownloadCombined}
            title="Download complete examination dossier as a single combined PDF"
          >
            📑 Download Combined PDF
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={!selectedExamId || !hasSeating}
            onClick={handleDownloadZip}
            title="Download ZIP package containing separate room-wise PDFs"
          >
            📦 Download All (ZIP)
          </button>
        </div>
      </header>

      {/* PART 1: Cascading Parameter Selection Panel */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Examination &amp; Schedule Parameters</h2>
            <p className="panel-subtitle">
              Select academic cohort and examination session to generate official documentation.
            </p>
          </div>
        </div>

        {/* First row: 4-column responsive grid */}
        <div className="form-row-4-fixed">
          {/* 1. Academic Year */}
          <div className="form-group">
            <label htmlFor="filter-ay" className="form-label">Academic Year</label>
            <select
              id="filter-ay"
              className="form-control"
              value={selectedAcademicYear}
              onChange={(e) => {
                setSelectedAcademicYear(e.target.value);
                setCohortAy(e.target.value);
              }}
            >
              {filterOptions.academic_years.map((ay) => (
                <option key={ay} value={ay}>
                  {ay}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Study Year */}
          <div className="form-group">
            <label htmlFor="filter-sy" className="form-label">Study Year</label>
            <select
              id="filter-sy"
              className="form-control"
              value={selectedStudyYear}
              onChange={(e) => handleStudyYearChange(e.target.value)}
            >
              <option value="">-- Select Study Year --</option>
              {STUDY_YEAR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Semester */}
          <div className="form-group">
            <label htmlFor="filter-sem" className="form-label">Semester</label>
            <select
              id="filter-sem"
              className="form-control"
              value={selectedSemester}
              onChange={(e) => handleSemesterChange(e.target.value)}
              disabled={!selectedStudyYear}
            >
              <option value="">
                {selectedStudyYear ? "-- Select Semester --" : "-- Select Study Year First --"}
              </option>
              {availableSemesters.map((sem) => (
                <option key={sem} value={sem}>
                  {sem}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Examination Session */}
          <div className="form-group">
            <label htmlFor="filter-exam" className="form-label">
              Examination Session <span className="form-label-required">*</span>
            </label>
            <select
              id="filter-exam"
              className="form-control"
              value={selectedExamId}
              onChange={(e) => {
                setSelectedExamId(e.target.value);
                setSelectedHallId("");
              }}
              disabled={!selectedStudyYear || !selectedSemester || filteredExams.length === 0}
            >
              {!selectedStudyYear ? (
                <option value="">-- Select Study Year First --</option>
              ) : !selectedSemester ? (
                <option value="">-- Select Semester to View Examinations --</option>
              ) : filteredExams.length === 0 ? (
                <option value="">No examinations scheduled for {selectedSemester}</option>
              ) : (
                filteredExams.map((ex) => (
                  <option key={ex.exam_id} value={ex.exam_id}>
                    {ex.subject_code} - {ex.subject_name} ({ex.exam_name}) — {ex.exam_date} [{ex.session}]
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Second row: Room Scope (Optional) */}
        <div className="form-row-4-fixed" style={{ marginTop: "4px" }}>
          <div className="form-group">
            <label htmlFor="filter-hall" className="form-label">Room Scope (Optional)</label>
            <select
              id="filter-hall"
              className="form-control"
              value={selectedHallId}
              onChange={(e) => setSelectedHallId(e.target.value)}
              disabled={!selectedExamId || (previewData?.halls || []).length === 0}
            >
              <option value="">
                {previewData?.halls && previewData.halls.length > 0
                  ? `All Occupied Rooms (${previewData.halls.length})`
                  : "No Occupied Rooms"}
              </option>
              {(previewData?.halls || []).map((h) => (
                <option key={h.hall_id} value={h.hall_id}>
                  Room {h.room_no || h.hall_name} ({h.student_count} seated)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Examination Context Details Banner */}
        {selectedExam && (
          <div className="exam-schedule-banner">
            <div className="banner-item">
              <span className="banner-label">Course:</span>
              <span className="banner-value">
                {selectedExam.subject_code} — {selectedExam.subject_name}
              </span>
            </div>
            <div className="banner-item">
              <span className="banner-label">Date:</span>
              <span className="banner-value">{formattedScheduleDate}</span>
            </div>
            <div className="banner-item">
              <span className="banner-label">Session:</span>
              <span className="banner-value">
                {selectedExam.session === "FN"
                  ? "FORENOON (09:30 AM – 12:30 PM)"
                  : "AFTERNOON (01:30 PM – 04:30 PM)"}
              </span>
            </div>
            <div className="banner-item">
              <span className="banner-label">Seated Students:</span>
              <span className={`banner-value ${hasSeating ? "badge-success" : "badge-warn"}`}>
                {selectedExam.allocated_count} Students
              </span>
            </div>
            <div className="banner-item">
              <span className="banner-label">Occupied Rooms:</span>
              <span className="banner-value">
                {previewData?.halls?.length || 0} Rooms
              </span>
            </div>
          </div>
        )}

        {/* Validation Alert Banner if Seating Allocations Missing */}
        {selectedExam && !hasSeating && (
          <div className="alert-box alert-warning" style={{ marginTop: "14px" }}>
            <span className="alert-icon">⚠️</span>
            <div className="alert-text">
              <strong>Seating Allocations Pending:</strong> This examination has not been allocated
              seats yet. To generate room seating charts and attendance sheets, please navigate to{" "}
              <strong>Seating Arrangement</strong> and click <strong>Allocate Seats</strong>.
            </div>
          </div>
        )}

        {/* Status Notification Message */}
        {statusMessage.text && (
          <div
            className={`alert-box ${
              statusMessage.type === "error"
                ? "alert-error"
                : statusMessage.type === "warning"
                ? "alert-warning"
                : "alert-success"
            }`}
            style={{ marginTop: "14px" }}
          >
            <span>{statusMessage.text}</span>
          </div>
        )}
      </section>

      {/* PART 1, 2, 3: Three Clean Report Generation Cards without descriptions */}
      <section className="report-cards-section">
        {/* CARD 1: Seating Arrangement – Per Room */}
        <div className="panel report-doc-card">
          <div className="card-top">
            <div className="card-icon-badge seating-badge">🪑</div>
            <div className="card-title-group">
              <h3>1. Seating Arrangement</h3>
              <span className="card-tag">Per Room Layout</span>
            </div>
          </div>
          <div className="card-meta">
            <div className="meta-row">
              <span>Standard Format:</span>
              <strong>A4 Landscape (Room 304 Layout)</strong>
            </div>
            <div className="meta-row">
              <span>Target Scope:</span>
              <strong>
                {selectedHallId
                  ? `Single Room (${previewData?.halls?.find((h) => String(h.hall_id) === String(selectedHallId))?.room_no || "Room"})`
                  : `All ${previewData?.halls?.length || 0} Occupied Rooms`}
              </strong>
            </div>
          </div>
          <div className="card-actions">
            <button
              type="button"
              className="btn btn-secondary-preview"
              disabled={!selectedExamId || !hasSeating}
              onClick={() => openPreview("seating")}
            >
              👁️ Preview Seating
            </button>
            <button
              type="button"
              className="btn btn-primary-download"
              disabled={!selectedExamId || !hasSeating}
              onClick={() => handleDownloadSeating()}
            >
              📥 Download PDF
            </button>
            <button
              type="button"
              className="btn btn-card-print"
              disabled={!selectedExamId || !hasSeating}
              onClick={() => handlePrintCard("seating")}
            >
              🖨️ Print
            </button>
          </div>
        </div>

        {/* CARD 2: Student Attendance Sheet – Per Room */}
        <div className="panel report-doc-card">
          <div className="card-top">
            <div className="card-icon-badge attendance-badge">📋</div>
            <div className="card-title-group">
              <h3>2. Student Attendance Sheet</h3>
              <span className="card-tag">Per Room Roster</span>
            </div>
          </div>
          <div className="card-meta">
            <div className="meta-row">
              <span>Standard Format:</span>
              <strong>A4 Portrait (Dual Column Table)</strong>
            </div>
            <div className="meta-row">
              <span>Total Allotted:</span>
              <strong>{selectedExam?.allocated_count || 0} Candidates</strong>
            </div>
          </div>
          <div className="card-actions">
            <button
              type="button"
              className="btn btn-secondary-preview"
              disabled={!selectedExamId || !hasSeating}
              onClick={() => openPreview("attendance")}
            >
              👁️ Preview Attendance
            </button>
            <button
              type="button"
              className="btn btn-primary-download"
              disabled={!selectedExamId || !hasSeating}
              onClick={() => handleDownloadAttendance()}
            >
              📥 Download PDF
            </button>
            <button
              type="button"
              className="btn btn-card-print"
              disabled={!selectedExamId || !hasSeating}
              onClick={() => handlePrintCard("attendance")}
            >
              🖨️ Print
            </button>
          </div>
        </div>

        {/* CARD 3: Faculty Duty Register – Daily Consolidated */}
        <div className="panel report-doc-card">
          <div className="card-top">
            <div className="card-icon-badge faculty-badge">📑</div>
            <div className="card-title-group">
              <h3>3. Faculty Duty Register</h3>
              <span className="card-tag">Daily Consolidated</span>
            </div>
          </div>
          <div className="card-meta">
            <div className="meta-row">
              <span>Standard Format:</span>
              <strong>A4 Portrait (Office of COE)</strong>
            </div>
            <div className="meta-row">
              <span>Assigned Faculty:</span>
              <strong>{previewData?.faculty_register?.total_assigned || 0} Invigilators</strong>
            </div>
          </div>
          <div className="card-actions">
            <button
              type="button"
              className="btn btn-secondary-preview"
              disabled={!selectedExamId}
              onClick={() => openPreview("faculty")}
            >
              👁️ Preview Register
            </button>
            <button
              type="button"
              className="btn btn-primary-download"
              disabled={!selectedExamId}
              onClick={handleDownloadFacultyRegister}
            >
              📥 Download PDF
            </button>
            <button
              type="button"
              className="btn btn-card-print"
              disabled={!selectedExamId}
              onClick={() => handlePrintCard("faculty")}
            >
              🖨️ Print
            </button>
          </div>
        </div>
      </section>

      {/* PART 10: Interactive Preview Modal & Print Viewer */}
      {isPreviewOpen && previewData && (
        <ReportPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => {
            setIsPreviewOpen(false);
            setAutoPrintMode(false);
          }}
          previewData={previewData}
          initialType={previewType}
          initialHallId={previewHallId}
          autoPrint={autoPrintMode}
        />
      )}
    </div>
  );
}
