import { useEffect, useState, useMemo } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useAcademicCohort } from "../context/AcademicCohortContext";

export default function Students() {
  const { isAdmin, isHod } = useAuth();
  const {
    academicYear,
    studyYear,
    selectedSemester,
    studyYearName,
    cohortLabel,
  } = useAcademicCohort();
  const [cohortFilterActive, setCohortFilterActive] = useState(false);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // CSV Upload state
  const [csvFile, setCsvFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState("");

  // Bulk Selection & Deletion State
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [preflightData, setPreflightData] = useState(null);
  const [checkingPreflight, setCheckingPreflight] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function toggleSelectStudent(id) {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (selectedStudentIds.length === filteredStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(filteredStudents.map((s) => s.student_id));
    }
  }

  async function openBulkDeleteModal() {
    if (selectedStudentIds.length === 0) return;
    setShowDeleteModal(true);
    setCheckingPreflight(true);
    setPreflightData(null);
    setConfirmForce(false);
    try {
      const res = await api.checkStudentDeletion({
        type: "selected",
        student_ids: selectedStudentIds,
      });
      setPreflightData(res);
    } catch (err) {
      setPreflightData({
        student_count: selectedStudentIds.length,
        can_safe_delete: false,
        blocking_reason: err.message || "Failed to inspect foreign-key dependencies.",
      });
    } finally {
      setCheckingPreflight(false);
    }
  }

  async function handleConfirmDelete() {
    if (selectedStudentIds.length === 0) return;
    setDeleting(true);
    try {
      await api.deleteStudents({
        type: "selected",
        student_ids: selectedStudentIds,
        force: confirmForce,
        deleted_by: "admin",
      });
      setShowDeleteModal(false);
      setSelectedStudentIds([]);
      setPreflightData(null);
      await loadStudents();
    } catch (err) {
      alert(err.message || "Deletion failed. Please review dependency constraints.");
    } finally {
      setDeleting(false);
    }
  }


  useEffect(() => {
    loadStudents();
  }, []);

  async function loadStudents() {
    setLoading(true);
    setError("");
    try {
      const data = await api.getStudents();
      setStudents(data.students || []);
    } catch (err) {
      setError(err.message || "Unable to load students list.");
    } finally {
      setLoading(false);
    }
  }

  // Department counts
  const departmentCounts = useMemo(() => {
    const counts = {};
    students.forEach((s) => {
      const dept = (s.department || "OTHER").toUpperCase();
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return counts;
  }, [students]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const matchesDept =
        deptFilter === "ALL" ||
        (s.department || "").toUpperCase() === deptFilter;
      const matchesCohort =
        !cohortFilterActive || Number(s.year) === Number(studyYear);
      const matchesSearch = [
        s.hall_ticket_no,
        s.name,
        s.department,
        s.section,
        s.year,
      ].some((val) =>
        String(val ?? "").toLowerCase().includes(search.toLowerCase())
      );
      return matchesDept && matchesCohort && matchesSearch;
    });
  }, [students, deptFilter, search, cohortFilterActive, studyYear]);

  async function handleCsvUpload(e) {
    e.preventDefault();
    if (!csvFile) {
      setUploadError("Please select a CSV file to upload.");
      return;
    }

    if (!csvFile.name.toLowerCase().endsWith(".csv")) {
      setUploadError("Only CSV (.csv) files are supported by the backend import.");
      return;
    }

    setUploading(true);
    setUploadError("");
    setUploadResult(null);

    try {
      const result = await api.uploadStudentsCsv(csvFile);
      setUploadResult(result);
      setCsvFile(null);
      // Reset file input in DOM
      const input = document.getElementById("csv-file-input");
      if (input) input.value = "";
      // Refresh students table
      await loadStudents();
    } catch (err) {
      setUploadError(
        err.message || "Failed to upload student CSV. Check column headers."
      );
    } finally {
      setUploading(false);
    }
  }

  function downloadSampleCsv() {
    const sampleContent =
      "hall_ticket_no,name,department,year,section\n" +
      "24EU04280,Srinivas,CSE,3,A\n" +
      "24EU04281,Meghana,ECE,3,B\n" +
      "24EU04282,Karthik,EEE,3,A\n";
    const blob = new Blob([sampleContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "sample_students_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="students-page">
      <header className="page-header">
        <div>
          <h1>Student Management & Records</h1>
          <p>View registered student records and import student rosters via CSV.</p>
        </div>
        <div className="student-count-pill">
          Total Students: <strong>{students.length}</strong>
        </div>
      </header>

      {/* CSV Uploader Section (Admin & HOD only) */}
      {(isAdmin || isHod) && (
        <section className="panel upload-panel">
          <div className="section-heading">
            <div>
              <h3>Import Students Data (CSV)</h3>
              <p className="panel-subtitle">
                Upload student rosters for upcoming examination allocations.
              </p>
            </div>
            <button
              type="button"
              className="sample-download-btn"
              onClick={downloadSampleCsv}
            >
              📥 Download Sample CSV Template
            </button>
          </div>

          <form onSubmit={handleCsvUpload} className="csv-upload-form">
            <div className="file-input-wrapper">
              <input
                id="csv-file-input"
                type="file"
                accept=".csv"
                onChange={(e) => {
                  setCsvFile(e.target.files?.[0] || null);
                  setUploadError("");
                  setUploadResult(null);
                }}
                disabled={uploading}
              />
              <span className="file-hint">
                Required Columns: <code>hall_ticket_no, name, department, year, section</code>
              </span>
            </div>

            <button
              type="submit"
              className="upload-btn"
              disabled={uploading || !csvFile}
            >
              {uploading ? "Uploading & Processing..." : "Upload & Import CSV"}
            </button>
          </form>

          {uploadError && <div className="allocation-error">{uploadError}</div>}

          {uploadResult && (
            <div className="allocation-success">
              <strong>{uploadResult.message || "Data imported successfully!"}</strong>
              <div className="upload-stats-row">
                <span>
                  Inserted Records: <strong>{uploadResult.inserted ?? 0}</strong>
                </span>
                <span>
                  Duplicates / Skipped: <strong>{uploadResult.skipped ?? 0}</strong>
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Department Filter Chips */}
      <div className="dept-filter-bar">
        <button
          type="button"
          className={`dept-chip ${cohortFilterActive ? "active" : ""}`}
          onClick={() => setCohortFilterActive(!cohortFilterActive)}
          style={{
            borderColor: cohortFilterActive ? "#2563eb" : undefined,
            background: cohortFilterActive ? "#eff6ff" : undefined,
            color: cohortFilterActive ? "#1d4ed8" : undefined,
            fontWeight: cohortFilterActive ? 700 : undefined,
          }}
          title="Filter roster to students in the currently selected academic cohort"
        >
          🎓 {cohortFilterActive ? "✓ Active Cohort: " : "Filter by Active Cohort: "} {studyYearName} ({academicYear})
        </button>
        <button
          type="button"
          className={`dept-chip ${deptFilter === "ALL" ? "active" : ""}`}
          onClick={() => setDeptFilter("ALL")}
        >
          All Departments ({students.length})
        </button>
        {Object.entries(departmentCounts).map(([dept, count]) => (
          <button
            key={dept}
            type="button"
            className={`dept-chip ${deptFilter === dept ? "active" : ""}`}
            onClick={() => setDeptFilter(dept)}
          >
            {dept} ({count})
          </button>
        ))}
      </div>

      {/* Search and Table */}
      <section className="panel">
        <div className="students-toolbar">
          <input
            type="search"
            placeholder="Search by name, hall ticket no, department, section..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="record-count">
            Showing {filteredStudents.length} of {students.length} students
          </span>
        </div>

        {loading && <p className="status-message">Loading students from database...</p>}
        {error && <p className="error-message">{error}</p>}

        {!loading && !error && (
          <>
            {/* Bulk Action Bar */}
            {selectedStudentIds.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#eff6ff",
              border: "1.5px solid #bfdbfe",
              borderRadius: "8px",
              padding: "10px 16px",
              marginBottom: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  background: "var(--accent-blue)",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "20px",
                }}
              >
                {selectedStudentIds.length} selected
              </span>
              <span style={{ fontSize: "13px", color: "var(--primary-navy)", fontWeight: 600 }}>
                {selectedStudentIds.length} student record(s) selected
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedStudentIds([])}
              >
                Clear Selection
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={openBulkDeleteModal}
              >
                🗑️ Delete Selected ({selectedStudentIds.length})
              </button>
            </div>
          </div>
        )}

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "36px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      aria-label="Select All Students"
                      checked={filteredStudents.length > 0 && selectedStudentIds.length === filteredStudents.length}
                      onChange={toggleSelectAll}
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                  <th>Student ID</th>
                  <th>Hall Ticket No</th>
                  <th>Full Name</th>
                  <th>Department</th>
                  <th>Year</th>
                  <th>Section</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s) => (
                  <tr
                    key={s.student_id}
                    style={{ backgroundColor: selectedStudentIds.includes(s.student_id) ? "#f0fdf4" : "inherit" }}
                  >
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.hall_ticket_no}`}
                        checked={selectedStudentIds.includes(s.student_id)}
                        onChange={() => toggleSelectStudent(s.student_id)}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    <td>#{s.student_id}</td>
                    <td>
                      <strong>{s.hall_ticket_no}</strong>
                    </td>
                    <td>{s.name}</td>
                    <td>
                      <span className={`dept-tag ${s.department?.toLowerCase()}`}>
                        {s.department}
                      </span>
                    </td>
                    <td>Year {s.year}</td>
                    <td>Section {s.section}</td>
                  </tr>
                ))}
                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-table-cell">
                      No matching student records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
      {/* Bulk Delete Modal */}
      {showDeleteModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "600px", width: "95%" }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: "var(--danger)" }}>
                🗑️ Confirm Multiple Student Deletion
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setShowDeleteModal(false);
                  setPreflightData(null);
                }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div
                style={{
                  background: "#fff1f2",
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "14px", color: "#991b1b" }}>
                  Selected Target: {selectedStudentIds.length} Student Record(s)
                </div>
                <div style={{ fontSize: "12px", color: "#b91c1c", marginTop: "2px" }}>
                  Action: Permanent database deletion with transaction rollback and audit logging.
                </div>
              </div>

              {checkingPreflight ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <div style={{ fontSize: "24px", marginBottom: "8px" }}>⏳</div>
                  <p style={{ fontSize: "13.5px", color: "var(--text-muted)" }}>
                    Inspecting foreign-key dependencies across examinations, seating allocations, and registrations...
                  </p>
                </div>
              ) : preflightData ? (
                <div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "10px",
                      marginBottom: "16px",
                    }}
                  >
                    <div style={{ background: "#f8fafc", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--primary-navy)" }}>{preflightData.student_count}</div>
                      <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>Selected Records</div>
                    </div>
                    <div style={{ background: preflightData.exam_registrations_count > 0 ? "#fff7ed" : "#f8fafc", border: `1px solid ${preflightData.exam_registrations_count > 0 ? "#fed7aa" : "var(--border-color)"}`, borderRadius: "8px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "18px", fontWeight: 700, color: preflightData.exam_registrations_count > 0 ? "#ea580c" : "var(--primary-navy)" }}>{preflightData.exam_registrations_count}</div>
                      <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>Exam Registrations</div>
                    </div>
                    <div style={{ background: preflightData.seat_allocations_count > 0 ? "#fef2f2" : "#f8fafc", border: `1px solid ${preflightData.seat_allocations_count > 0 ? "#fecaca" : "var(--border-color)"}`, borderRadius: "8px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "18px", fontWeight: 700, color: preflightData.seat_allocations_count > 0 ? "#dc2626" : "var(--primary-navy)" }}>{preflightData.seat_allocations_count}</div>
                      <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>Allocated Seats</div>
                    </div>
                  </div>

                  {!preflightData.can_safe_delete ? (
                    <div className="alert alert-warning" style={{ marginBottom: "16px" }}>
                      <span>⚠️</span>
                      <div>
                        <strong>Deletion Blocked by Dependency Engine:</strong>
                        <p style={{ margin: "4px 0 0", fontSize: "12.5px" }}>
                          {preflightData.blocking_reason}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="alert alert-success" style={{ marginBottom: "16px" }}>
                      <span>✅</span>
                      <div>
                        <strong>Safe to Remove:</strong>
                        <p style={{ margin: "2px 0 0", fontSize: "12.5px" }}>
                          No examination dependencies exist for these {preflightData.student_count} student(s).
                        </p>
                      </div>
                    </div>
                  )}

                  {!preflightData.can_safe_delete && (
                    <label
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px",
                        padding: "10px",
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "12.5px",
                        color: "#92400e",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={confirmForce}
                        onChange={(e) => setConfirmForce(e.target.checked)}
                        style={{ marginTop: "2px" }}
                      />
                      <span>
                        <strong>Override &amp; Clean Associated Records:</strong> I confirm removing these {preflightData.student_count} students and cleaning up their test examination registrations and seat allocations.
                      </span>
                    </label>
                  )}
                </div>
              ) : null}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowDeleteModal(false);
                  setPreflightData(null);
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmDelete}
                disabled={
                  checkingPreflight ||
                  deleting ||
                  !preflightData ||
                  (!preflightData.can_safe_delete && !confirmForce)
                }
              >
                {deleting ? "Deleting..." : `Confirm Delete (${selectedStudentIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
