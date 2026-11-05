import { useEffect, useState, useMemo } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useAcademicCohort } from "../context/AcademicCohortContext";

export default function Examinations({ onNavigateWithExam }) {
  const { isAdmin, isHod } = useAuth();
  const {
    academicYear,
    studyYear,
    selectedSemester,
    studyYearName,
    cohortLabel,
  } = useAcademicCohort();
  const [exams, setExams] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [search, setSearch] = useState("");
  const [sessionFilter, setSessionFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Add / Edit Exam Modal state
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState(null);
  const [examFormData, setExamFormData] = useState({
    exam_name: "",
    subject_id: "",
    exam_date: "",
    session: "FN",
    start_time: "09:30 AM",
    end_time: "12:30 PM",
    expected_students: 50,
  });
  const [savingExam, setSavingExam] = useState(false);
  const [examFormError, setExamFormError] = useState("");

  // Delete Exam confirmation modal state
  const [deletingExam, setDeletingExam] = useState(null);
  const [deletingExamState, setDeletingExamState] = useState(false);

  // Subject Management Modal state
  const [isSubjectManagerOpen, setIsSubjectManagerOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [subjFormData, setSubjFormData] = useState({ subject_code: "", subject_name: "" });
  const [savingSubj, setSavingSubj] = useState(false);
  const [subjError, setSubjError] = useState("");
  const [deletingSubject, setDeletingSubject] = useState(null);
  const [deletingSubjState, setDeletingSubjState] = useState(false);

  // Upload Students Modal state
  const [uploadExamTarget, setUploadExamTarget] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadAutoAllocate, setUploadAutoAllocate] = useState(true);

  // Batch Import (Subjects + Students + Auto-Seating) Modal state
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchFile, setBatchFile] = useState(null);
  const [batchExamDate, setBatchExamDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [batchSession, setBatchSession] = useState("FN");
  const [batchDefaultSubCode, setBatchDefaultSubCode] = useState("");
  const [batchDefaultSubName, setBatchDefaultSubName] = useState("");
  const [batchAutoAllocate, setBatchAutoAllocate] = useState(true);
  const [batchPreview, setBatchPreview] = useState(null);
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [batchResult, setBatchResult] = useState(null);

  // View Registered Students Modal state
  const [viewStudentsExam, setViewStudentsExam] = useState(null);
  const [registeredStudents, setRegisteredStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Auto room allocation loading state per exam
  const [autoAllocatingExamId, setAutoAllocatingExamId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [examsRes, subjsRes] = await Promise.all([
        api.getExams(),
        api.getSubjects().catch(() => ({ subjects: [] })),
      ]);
      setExams(Array.isArray(examsRes.exams) ? examsRes.exams : []);
      setSubjects(Array.isArray(subjsRes.subjects) ? subjsRes.subjects : []);
    } catch (err) {
      console.error("Examinations fetch error:", err);
      setError("Failed to load examinations. Please verify the backend is running.");
    } finally {
      setLoading(false);
    }
  }

  function formatExamDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  // --- Add / Edit Exam handlers ---
  function openAddExamModal() {
    setEditingExam(null);
    const defaultSubject = subjects[0] ? subjects[0].subject_id : "";
    setExamFormData({
      exam_name: "",
      subject_id: defaultSubject,
      exam_date: new Date().toISOString().split("T")[0],
      session: "FN",
      start_time: "09:30 AM",
      end_time: "12:30 PM",
      expected_students: 50,
    });
    setExamFormError("");
    setIsExamModalOpen(true);
  }

  function openEditExamModal(exam) {
    setEditingExam(exam);
    let dStr = "";
    if (exam.exam_date) {
      const d = new Date(exam.exam_date);
      if (!Number.isNaN(d.getTime())) {
        dStr = d.toISOString().split("T")[0];
      }
    }
    setExamFormData({
      exam_name: exam.exam_name || exam.subject_name || "",
      subject_id: exam.subject_id || (subjects[0] ? subjects[0].subject_id : ""),
      exam_date: dStr,
      session: exam.session || "FN",
      start_time: exam.start_time || "09:30 AM",
      end_time: exam.end_time || "12:30 PM",
      expected_students: exam.expected_students || 0,
    });
    setExamFormError("");
    setIsExamModalOpen(true);
  }

  async function handleExamFormSubmit(e) {
    e.preventDefault();
    if (!examFormData.subject_id) {
      setExamFormError("Please select a subject.");
      return;
    }

    setSavingExam(true);
    setExamFormError("");

    const payload = {
      subject_id: Number(examFormData.subject_id),
      exam_name: examFormData.exam_name.trim() || undefined,
      exam_date: examFormData.exam_date,
      session: examFormData.session,
      start_time: examFormData.start_time,
      end_time: examFormData.end_time,
      expected_students: Number(examFormData.expected_students) || 0,
      academic_year: editingExam ? (editingExam.academic_year || academicYear) : academicYear,
      study_year: editingExam ? (editingExam.study_year || studyYear) : studyYear,
      semester: editingExam ? (editingExam.semester || selectedSemester) : selectedSemester,
    };

    try {
      if (editingExam) {
        await api.updateExam(editingExam.exam_id, payload);
        setSuccess(`Examination '${examFormData.exam_name || "Exam"}' updated successfully.`);
      } else {
        await api.createExam(payload);
        setSuccess("New examination scheduled successfully.");
      }
      setIsExamModalOpen(false);
      await loadData();
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setExamFormError(err.message || "Failed to save examination.");
    } finally {
      setSavingExam(false);
    }
  }

  async function confirmDeleteExam() {
    if (!deletingExam) return;
    setDeletingExamState(true);
    try {
      await api.deleteExam(deletingExam.exam_id);
      setSuccess(`Examination '${deletingExam.exam_name || "Exam"}' deleted successfully.`);
      setDeletingExam(null);
      await loadData();
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err.message || "Failed to delete examination.");
      setDeletingExam(null);
    } finally {
      setDeletingExamState(false);
    }
  }

  // --- Automatic Room Allocation Handler ---
  async function handleAutoAllocate(exam) {
    if (exam.allocated_count > 0) {
      let confirmMsg = "A seating arrangement already exists. Do you want to generate a new arrangement?";
      if (exam.status === "Published" || exam.is_published) {
        confirmMsg = "Warning: This examination is already Published. Reallocating seats will generate a fresh randomized seating arrangement and update student allotment passes. Do you want to proceed?";
      }
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    setAutoAllocatingExamId(exam.exam_id);
    setError("");
    setSuccess("");
    try {
      const res = await api.allocateSeats(exam.exam_id, null, (exam.allocated_count > 0));
      if (res.requires_confirmation) {
        let confirmMsg = res.message || "A seating arrangement already exists. Do you want to generate a new arrangement?";
        if (exam.status === "Published" || exam.is_published) {
          confirmMsg = "Warning: This examination is already Published. Reallocating seats will generate a fresh randomized seating arrangement and update student allotment passes. Do you want to proceed?";
        }
        if (window.confirm(confirmMsg)) {
          const res2 = await api.allocateSeats(exam.exam_id, null, true);
          const hallNames = (res2.selected_halls || []).map((h) => h.hall_name).join(", ");
          setSuccess(`✓ Automatic room allocation successful: ${res2.total_students || res2.total_allocated} students allocated to room(s): ${hallNames} with 0 section neighbor conflicts.`);
          await loadData();
          setTimeout(() => setSuccess(""), 5000);
          return;
        } else {
          return;
        }
      }
      const hallNames = (res.selected_halls || []).map((h) => h.hall_name).join(", ");
      setSuccess(`✓ Automatic room allocation successful: ${res.total_students || res.total_allocated} students allocated to room(s): ${hallNames} with 0 section neighbor conflicts.`);
      await loadData();
      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      setError(err.message || "Failed to auto-allocate rooms for this examination.");
    } finally {
      setAutoAllocatingExamId(null);
    }
  }

  // --- Subject Management Handlers ---
  function openSubjectManager() {
    setEditingSubject(null);
    setSubjFormData({ subject_code: "", subject_name: "" });
    setSubjError("");
    setIsSubjectManagerOpen(true);
  }

  function startEditSubject(subj) {
    setEditingSubject(subj);
    setSubjFormData({ subject_code: subj.subject_code, subject_name: subj.subject_name });
    setSubjError("");
  }

  async function handleSubjectFormSubmit(e) {
    e.preventDefault();
    if (!subjFormData.subject_code.trim() || !subjFormData.subject_name.trim()) {
      setSubjError("Subject code and course name are required.");
      return;
    }
    setSavingSubj(true);
    setSubjError("");

    try {
      if (editingSubject) {
        await api.updateSubject(editingSubject.subject_id, {
          subject_code: subjFormData.subject_code.trim().toUpperCase(),
          subject_name: subjFormData.subject_name.trim(),
        });
        setSuccess(`Subject '${subjFormData.subject_code}' updated.`);
      } else {
        await api.createSubject({
          subject_code: subjFormData.subject_code.trim().toUpperCase(),
          subject_name: subjFormData.subject_name.trim(),
        });
        setSuccess(`Subject '${subjFormData.subject_code}' created.`);
      }
      setEditingSubject(null);
      setSubjFormData({ subject_code: "", subject_name: "" });
      const updatedSubjs = await api.getSubjects();
      setSubjects(updatedSubjs.subjects || []);
    } catch (err) {
      setSubjError(err.message || "Failed to save subject.");
    } finally {
      setSavingSubj(false);
    }
  }

  async function confirmDeleteSubject() {
    if (!deletingSubject) return;
    setDeletingSubjState(true);
    setSubjError("");
    try {
      await api.deleteSubject(deletingSubject.subject_id);
      setSuccess(`Subject '${deletingSubject.subject_code}' deleted.`);
      setDeletingSubject(null);
      const updatedSubjs = await api.getSubjects();
      setSubjects(updatedSubjs.subjects || []);
    } catch (err) {
      setSubjError(err.message || "Failed to delete subject.");
      setDeletingSubject(null);
    } finally {
      setDeletingSubjState(false);
    }
  }

  // --- Upload & Preview Students handlers ---
  function openUploadModal(exam) {
    setUploadExamTarget(exam);
    setUploadFile(null);
    setPreviewData(null);
    setUploadError("");
    setUploading(false);
  }

  async function handlePreviewFile() {
    if (!uploadFile || !uploadExamTarget) {
      setUploadError("Please select a CSV, Excel, or PDF file first.");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const data = await api.uploadExamStudents(uploadExamTarget.exam_id, uploadFile, true);
      setPreviewData(data);
    } catch (err) {
      setUploadError(err.message || "Failed to parse file. Please verify column format.");
      setPreviewData(null);
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirmSaveStudents() {
    if (!uploadFile || !uploadExamTarget) return;
    setUploading(true);
    setUploadError("");
    try {
      const res = await api.uploadExamStudents(
        uploadExamTarget.exam_id,
        uploadFile,
        false,
        uploadAutoAllocate
      );
      const autoAllocInfo = res.auto_allocation?.success
        ? ` and conflict-free seats automatically allocated across ${res.auto_allocation.selected_halls?.length || 0} rooms!`
        : ".";
      setSuccess(
        `Success: ${res.registrations_added || res.total_processed} students enrolled for ${uploadExamTarget.exam_name || "this examination"}${autoAllocInfo}`
      );
      setUploadExamTarget(null);
      setUploadFile(null);
      setPreviewData(null);
      await loadData();
      setTimeout(() => setSuccess(""), 6000);
    } catch (err) {
      setUploadError(err.message || "Failed to save students to database.");
    } finally {
      setUploading(false);
    }
  }

  // --- Batch Import (Subjects + Students + Auto-Allocation) handlers ---
  function openBatchImportModal() {
    setIsBatchModalOpen(true);
    setBatchFile(null);
    setBatchPreview(null);
    setBatchError("");
    setBatchResult(null);
    setBatchUploading(false);
    setBatchDefaultSubCode("");
    setBatchDefaultSubName("");
    setBatchAutoAllocate(true);
  }

  async function handleBatchPreview() {
    if (!batchFile) {
      setBatchError("Please select a CSV, Excel, or PDF file to preview.");
      return;
    }
    setBatchUploading(true);
    setBatchError("");
    setBatchPreview(null);

    const formData = new FormData();
    formData.append("file", batchFile);
    if (batchDefaultSubCode) formData.append("default_subject_code", batchDefaultSubCode.trim());
    if (batchDefaultSubName) formData.append("default_subject_name", batchDefaultSubName.trim());
    if (batchExamDate) formData.append("exam_date", batchExamDate);
    formData.append("session", batchSession);

    try {
      const data = await api.batchImportRoster(formData, true);
      setBatchPreview(data);
    } catch (err) {
      setBatchError(err.message || "Failed to parse file. Please verify file format.");
    } finally {
      setBatchUploading(false);
    }
  }

  async function handleBatchSubmit() {
    if (!batchFile) {
      setBatchError("Please select a file to import.");
      return;
    }
    setBatchUploading(true);
    setBatchError("");

    const formData = new FormData();
    formData.append("file", batchFile);
    if (batchDefaultSubCode) formData.append("default_subject_code", batchDefaultSubCode.trim());
    if (batchDefaultSubName) formData.append("default_subject_name", batchDefaultSubName.trim());
    if (batchExamDate) formData.append("exam_date", batchExamDate);
    formData.append("session", batchSession);
    formData.append("auto_allocate", batchAutoAllocate ? "true" : "false");

    try {
      const res = await api.batchImportRoster(formData, false);
      setBatchResult(res);
      setSuccess(res.message || "Batch import and seat allocation completed successfully!");
      await loadData();
    } catch (err) {
      setBatchError(err.message || "Failed to import roster.");
    } finally {
      setBatchUploading(false);
    }
  }

  // --- View Registered Students ---
  async function openViewStudentsModal(exam) {
    setViewStudentsExam(exam);
    setLoadingStudents(true);
    try {
      const data = await api.getExamStudents(exam.exam_id);
      setRegisteredStudents(data.students || []);
    } catch (err) {
      console.error(err);
      setRegisteredStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }

  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      const matchesSession = sessionFilter === "ALL" || exam.session === sessionFilter;
      const matchesSearch = [
        exam.exam_id,
        exam.exam_name,
        exam.subject_code,
        exam.subject_name,
        exam.session,
      ].some((val) => String(val ?? "").toLowerCase().includes(search.toLowerCase()));
      return matchesSession && matchesSearch;
    });
  }, [exams, sessionFilter, search]);

  return (
    <div className="examinations-page">
      <header className="page-header">
        <div>
          <h1>Examinations Management</h1>
          <p>
            Schedule examinations, set timing, upload student rosters (CSV, Excel, PDF),
            and automatically allocate available rooms to exams without manual room selection.
          </p>
        </div>
        <div className="header-actions" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {isAdmin && (
            <button
              type="button"
              className="allocate-btn-primary"
              style={{ background: "#059669", borderColor: "#059669", display: "inline-flex", alignItems: "center", gap: "6px" }}
              onClick={openBatchImportModal}
              title="Add subjects and students together from CSV, Excel, or PDF and automatically allocate seating"
            >
              ⚡ Batch Import &amp; Allocate
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className="btn-secondary"
              onClick={openSubjectManager}
            >
              📚 Manage Subjects ({subjects.length})
            </button>
          )}
          {isAdmin && (
            <button type="button" className="btn-primary" onClick={openAddExamModal}>
              ➕ Schedule Examination
            </button>
          )}
        </div>
      </header>

      {success && <div className="allocation-success">{success}</div>}
      {error && <div className="allocation-error">{error}</div>}

      {/* Filter and Search Bar */}
      <div className="exam-filter-bar">
        <div className="session-filter-group">
          <button
            type="button"
            className={`session-btn ${sessionFilter === "ALL" ? "active" : ""}`}
            onClick={() => setSessionFilter("ALL")}
          >
            All Sessions ({exams.length})
          </button>
          <button
            type="button"
            className={`session-btn ${sessionFilter === "FN" ? "active" : ""}`}
            onClick={() => setSessionFilter("FN")}
          >
            Forenoon (FN)
          </button>
          <button
            type="button"
            className={`session-btn ${sessionFilter === "AN" ? "active" : ""}`}
            onClick={() => setSessionFilter("AN")}
          >
            Afternoon (AN)
          </button>
        </div>

        <input
          type="search"
          className="exam-search-input"
          placeholder="Search by exam name, code, subject..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Examinations Table */}
      <section className="panel">
        <div className="section-heading">
          <div>
            <h3>Scheduled Examination Sessions</h3>
            <p className="panel-subtitle">
              {filteredExams.length} examination session{filteredExams.length === 1 ? "" : "s"} found
            </p>
          </div>
        </div>

        {loading && <p className="status-message">Loading examination schedule...</p>}

        {!loading && filteredExams.length === 0 && (
          <div className="empty-state-card">
            <span className="empty-icon">▣</span>
            <h3>No Examinations Found</h3>
            <p>Click &quot;Schedule Examination&quot; above to create your first exam session.</p>
          </div>
        )}

        {!loading && filteredExams.length > 0 && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Exam ID</th>
                  <th>Exam Name & Course</th>
                  <th>Date & Time</th>
                  <th>Session</th>
                  <th>Enrolled Candidates</th>
                  {(isAdmin || isHod) && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredExams.map((exam) => {
                  const actual = exam.student_count || 0;
                  const expected = exam.expected_students || 0;
                  const hasDiscrepancy = expected > 0 && actual !== expected;
                  const isAutoAllocating = autoAllocatingExamId === exam.exam_id;

                  return (
                    <tr key={exam.exam_id}>
                      <td>
                        <span className="exam-id-tag">#{exam.exam_id}</span>
                      </td>
                      <td>
                        <strong style={{ display: "block", color: "#0f172a", fontSize: "14px" }}>
                          {exam.exam_name || exam.subject_name}
                        </strong>
                        <span className="text-muted" style={{ fontSize: "12px" }}>
                          <strong>{exam.subject_code}</strong>: {exam.subject_name}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{formatExamDate(exam.exam_date)}</div>
                        <span className="text-muted" style={{ fontSize: "12px" }}>
                          {exam.start_time || "09:30 AM"} – {exam.end_time || "12:30 PM"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`session-badge ${
                            exam.session === "FN" ? "forenoon" : "afternoon"
                          }`}
                        >
                          {exam.session === "FN"
                            ? "Forenoon (FN)"
                            : exam.session === "AN"
                            ? "Afternoon (AN)"
                            : exam.session}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span
                            className="capacity-pill"
                            style={{
                              background: actual > 0 ? "#eff6ff" : "#f1f5f9",
                              color: actual > 0 ? "#1e40af" : "#64748b",
                            }}
                          >
                            <strong>{actual}</strong> / {expected > 0 ? expected : "Any"}
                          </span>

                          {hasDiscrepancy && (
                            <span
                              className="warning-badge"
                              title={`Actual count (${actual}) differs from expected (${expected})`}
                            >
                              ⚠️ Discrepancy
                            </span>
                          )}

                          <button
                            type="button"
                            className="table-action-btn tertiary"
                            style={{ padding: "3px 7px", fontSize: "11px" }}
                            title="View registered students roster"
                            onClick={() => openViewStudentsModal(exam)}
                          >
                            👥 Roster
                          </button>
                        </div>
                      </td>

                      {(isAdmin || isHod) && (
                        <td>
                          <div className="table-action-btns">
                            {isAdmin && (
                              <>
                                <button
                                  type="button"
                                  className="table-action-btn primary"
                                  style={{ background: "#2563eb", color: "#ffffff" }}
                                  title="Automatically allocate rooms and seats"
                                  onClick={() => handleAutoAllocate(exam)}
                                  disabled={isAutoAllocating || actual === 0}
                                >
                                  {isAutoAllocating ? "Allocating..." : "⚡ Auto-Rooms"}
                                </button>
                                <button
                                  type="button"
                                  className="table-action-btn secondary"
                                  title="Upload students via CSV, Excel, or PDF"
                                  onClick={() => openUploadModal(exam)}
                                >
                                  📁 Upload
                                </button>
                                <button
                                  type="button"
                                  className="table-action-btn secondary"
                                  title="Seat allocation and reports"
                                  onClick={() => onNavigateWithExam("seating", exam.exam_id)}
                                >
                                  🪑 Seating & Print
                                </button>
                                <button
                                  type="button"
                                  className="table-action-btn secondary"
                                  title="Edit examination details"
                                  onClick={() => openEditExamModal(exam)}
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  type="button"
                                  className="table-action-btn danger"
                                  style={{ color: "#b91c1c" }}
                                  title="Delete examination"
                                  onClick={() => setDeletingExam(exam)}
                                >
                                  🗑️
                                </button>
                              </>
                            )}
                            {isHod && (
                              <button
                                type="button"
                                className="table-action-btn tertiary"
                                title="Reports"
                                onClick={() => onNavigateWithExam("reports", exam.exam_id)}
                              >
                                📄 Reports
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add / Edit Exam Modal */}
      {isExamModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: "580px" }}>
            <div className="modal-header">
              <div>
                <h3>{editingExam ? "Edit Examination" : "Schedule New Examination"}</h3>
                <p className="modal-subtitle">
                  Configure examination session, schedule timing, and expected candidate count.
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsExamModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleExamFormSubmit} className="modal-form">
              <div style={{
                background: "#f0fdf4",
                border: "1px solid #86efac",
                borderRadius: "8px",
                padding: "8px 12px",
                marginBottom: "12px",
                fontSize: "12.5px",
                color: "#166534",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <span>🎓</span>
                <span><strong>Active Academic Cohort:</strong> AY {academicYear} • {studyYearName} ({selectedSemester})</span>
              </div>
              {examFormError && <div className="modal-alert-error">{examFormError}</div>}

              <div className="form-group">
                <label htmlFor="exam-name">Exam Name / Title *</label>
                <input
                  id="exam-name"
                  type="text"
                  placeholder="e.g. Database Systems Midterm Examination"
                  value={examFormData.exam_name}
                  onChange={(e) => setExamFormData({ ...examFormData, exam_name: e.target.value })}
                  required
                  disabled={savingExam}
                />
              </div>

              <div className="form-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label htmlFor="subject-select">Subject / Course *</label>
                  <button
                    type="button"
                    style={{ background: "none", border: "none", color: "#1d4ed8", fontSize: "12px", cursor: "pointer", textDecoration: "underline" }}
                    onClick={openSubjectManager}
                  >
                    Manage Subjects
                  </button>
                </div>
                <select
                  id="subject-select"
                  value={examFormData.subject_id}
                  onChange={(e) => setExamFormData({ ...examFormData, subject_id: e.target.value })}
                  required
                  disabled={savingExam}
                >
                  <option value="">-- Select Subject --</option>
                  {subjects.map((s) => (
                    <option key={s.subject_id} value={s.subject_id}>
                      {s.subject_code} - {s.subject_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="exam-date">Examination Date *</label>
                  <input
                    id="exam-date"
                    type="date"
                    value={examFormData.exam_date}
                    onChange={(e) => setExamFormData({ ...examFormData, exam_date: e.target.value })}
                    required
                    disabled={savingExam}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="exam-session">Session</label>
                  <select
                    id="exam-session"
                    value={examFormData.session}
                    onChange={(e) => setExamFormData({ ...examFormData, session: e.target.value })}
                    disabled={savingExam}
                  >
                    <option value="FN">Forenoon (FN)</option>
                    <option value="AN">Afternoon (AN)</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="start-time">Start Time</label>
                  <input
                    id="start-time"
                    type="text"
                    placeholder="09:30 AM"
                    value={examFormData.start_time}
                    onChange={(e) => setExamFormData({ ...examFormData, start_time: e.target.value })}
                    disabled={savingExam}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="end-time">End Time</label>
                  <input
                    id="end-time"
                    type="text"
                    placeholder="12:30 PM"
                    value={examFormData.end_time}
                    onChange={(e) => setExamFormData({ ...examFormData, end_time: e.target.value })}
                    disabled={savingExam}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="expected-students">Expected Number of Students *</label>
                <input
                  id="expected-students"
                  type="number"
                  min="0"
                  placeholder="e.g. 60"
                  value={examFormData.expected_students}
                  onChange={(e) => setExamFormData({ ...examFormData, expected_students: e.target.value })}
                  required
                  disabled={savingExam}
                />
                <small className="field-hint">
                  Auto-updated upon roster file upload. Used during automatic room allocation.
                </small>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn-secondary"
                  onClick={() => setIsExamModalOpen(false)}
                  disabled={savingExam}
                >
                  Cancel
                </button>
                <button type="submit" className="modal-btn-primary" disabled={savingExam}>
                  {savingExam ? "Saving..." : editingExam ? "Save Changes" : "Schedule Exam"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Exam Confirmation Modal */}
      {deletingExam && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: "440px" }}>
            <div className="modal-header">
              <div>
                <h3 style={{ color: "#b91c1c" }}>Confirm Examination Deletion</h3>
                <p className="modal-subtitle">Delete examination and release assigned rooms.</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDeletingExam(null)}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "16px 24px" }}>
              <p style={{ margin: 0, fontSize: "14px", color: "#334155" }}>
                Are you sure you want to delete <strong>{deletingExam.exam_name || deletingExam.subject_name}</strong> (#{deletingExam.exam_id})?
                All student seat allocations and invigilator duties for this examination will be safely released.
              </p>
            </div>
            <div className="modal-actions" style={{ padding: "16px 24px", background: "#f8fafc" }}>
              <button
                type="button"
                className="modal-btn-secondary"
                onClick={() => setDeletingExam(null)}
                disabled={deletingExamState}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-btn-primary"
                style={{ background: "#dc2626", borderColor: "#dc2626" }}
                onClick={confirmDeleteExam}
                disabled={deletingExamState}
              >
                {deletingExamState ? "Deleting..." : "Confirm & Delete Exam"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subject Management Modal (Add, Edit, Delete with Confirmation) */}
      {isSubjectManagerOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: "680px", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="modal-header">
              <div>
                <h3>Subject & Course Management</h3>
                <p className="modal-subtitle">Add, edit, and safely delete course subjects.</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsSubjectManagerOpen(false)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "16px 24px" }}>
              {subjError && <div className="modal-alert-error" style={{ marginBottom: "12px" }}>{subjError}</div>}

              {/* Add / Edit Subject Form */}
              <form onSubmit={handleSubjectFormSubmit} style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#1e293b" }}>
                  {editingSubject ? `Edit Subject: ${editingSubject.subject_code}` : "Add New Subject"}
                </h4>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Subject Code *</label>
                    <input
                      type="text"
                      placeholder="e.g. CS401"
                      value={subjFormData.subject_code}
                      onChange={(e) => setSubjFormData({ ...subjFormData, subject_code: e.target.value })}
                      required
                      disabled={savingSubj}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>Course Title *</label>
                    <input
                      type="text"
                      placeholder="e.g. Artificial Intelligence"
                      value={subjFormData.subject_name}
                      onChange={(e) => setSubjFormData({ ...subjFormData, subject_name: e.target.value })}
                      required
                      disabled={savingSubj}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
                  {editingSubject && (
                    <button
                      type="button"
                      className="modal-btn-secondary"
                      onClick={() => {
                        setEditingSubject(null);
                        setSubjFormData({ subject_code: "", subject_name: "" });
                      }}
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button type="submit" className="modal-btn-primary" disabled={savingSubj}>
                    {savingSubj ? "Saving..." : (editingSubject ? "Update Subject" : "➕ Add Subject")}
                  </button>
                </div>
              </form>

              {/* Subjects Table */}
              <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#1e293b" }}>Course Catalog ({subjects.length})</h4>
              <div style={{ maxHeight: "280px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
                <table style={{ margin: 0, fontSize: "13px" }}>
                  <thead style={{ background: "#f1f5f9", position: "sticky", top: 0 }}>
                    <tr>
                      <th>Subject Code</th>
                      <th>Course Title</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((s) => (
                      <tr key={s.subject_id}>
                        <td><strong>{s.subject_code}</strong></td>
                        <td>{s.subject_name}</td>
                        <td>
                          <div className="table-action-btns">
                            <button
                              type="button"
                              className="table-action-btn secondary"
                              style={{ padding: "3px 8px" }}
                              onClick={() => startEditSubject(s)}
                            >
                              ✏️ Edit
                            </button>
                            <button
                              type="button"
                              className="table-action-btn danger"
                              style={{ padding: "3px 8px", color: "#b91c1c" }}
                              onClick={() => setDeletingSubject(s)}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-actions" style={{ padding: "12px 24px", background: "#f8fafc" }}>
              <button
                type="button"
                className="modal-btn-secondary"
                onClick={() => setIsSubjectManagerOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Subject Confirmation Modal */}
      {deletingSubject && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: "440px" }}>
            <div className="modal-header">
              <div>
                <h3 style={{ color: "#b91c1c" }}>Confirm Subject Deletion</h3>
                <p className="modal-subtitle">Confirm removal of this course.</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDeletingSubject(null)}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "16px 24px" }}>
              <p style={{ margin: 0, fontSize: "14px", color: "#334155" }}>
                Are you sure you want to delete <strong>{deletingSubject.subject_code} - {deletingSubject.subject_name}</strong>?
                The system will check that no scheduled examinations are using this subject before deletion.
              </p>
            </div>
            <div className="modal-actions" style={{ padding: "16px 24px", background: "#f8fafc" }}>
              <button
                type="button"
                className="modal-btn-secondary"
                onClick={() => setDeletingSubject(null)}
                disabled={deletingSubjState}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-btn-primary"
                style={{ background: "#dc2626", borderColor: "#dc2626" }}
                onClick={confirmDeleteSubject}
                disabled={deletingSubjState}
              >
                {deletingSubjState ? "Deleting..." : "Confirm & Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Students with Preview Modal */}
      {uploadExamTarget && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: "720px", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="modal-header">
              <div>
                <h3>Upload Student Roster — {uploadExamTarget.exam_name || uploadExamTarget.subject_name}</h3>
                <p className="modal-subtitle">
                  Supports CSV, Excel (.xlsx, .xls), and PDF documents with instant preview validation.
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setUploadExamTarget(null)}
              >
                ✕
              </button>
            </div>

            {uploadError && <div className="modal-alert-error">{uploadError}</div>}

            <div className="form-group" style={{ margin: "16px 0" }}>
              <label>Select File (CSV, Excel .xlsx/.xls, or PDF)</label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.pdf"
                onChange={(e) => {
                  setUploadFile(e.target.files[0] || null);
                  setPreviewData(null);
                  setUploadError("");
                }}
                disabled={uploading}
              />
              <small className="field-hint">
                Accepted columns in CSV/Excel or tables in PDF: Hall Ticket No (Roll No), Student Name, Department, Year, Section.
              </small>
            </div>

            <div style={{ margin: "14px 0", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "10px 14px", borderRadius: "6px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600, color: "#166534", fontSize: "13px" }}>
                <input
                  type="checkbox"
                  checked={uploadAutoAllocate}
                  onChange={(e) => setUploadAutoAllocate(e.target.checked)}
                  disabled={uploading}
                />
                ⚡ Automatically allocate available rooms and seats upon saving
              </label>
            </div>

            <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={handlePreviewFile}
                disabled={uploading || !uploadFile}
              >
                {uploading && !previewData ? "Inspecting File..." : "🔍 Validate & Preview File"}
              </button>
            </div>

            {/* Preview Section */}
            {previewData && (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h4 style={{ margin: 0, color: "#1e293b" }}>File Validation Summary</h4>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <span className="capacity-pill" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
                      Actual Students: <strong>{previewData.total_count}</strong>
                    </span>
                    <span className="capacity-pill" style={{ background: "#f1f5f9", color: "#475569" }}>
                      Expected Count: <strong>{previewData.expected_count || "Not set"}</strong>
                    </span>
                  </div>
                </div>

                {previewData.warning ? (
                  <div className="modal-alert-warning" style={{ marginBottom: "14px" }}>
                    <strong>⚠️ Student Count Discrepancy:</strong> {previewData.warning}
                  </div>
                ) : (
                  <div className="modal-alert-success" style={{ marginBottom: "14px" }}>
                    ✓ Count validation passed: Uploaded roster matches expected student numbers.
                  </div>
                )}

                <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 8px 0" }}>
                  Previewing first {previewData.students?.length || 0} extracted records:
                </p>

                <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #cbd5e1", borderRadius: "6px" }}>
                  <table style={{ margin: 0, fontSize: "12px" }}>
                    <thead style={{ background: "#f1f5f9", position: "sticky", top: 0 }}>
                      <tr>
                        <th>#</th>
                        <th>Hall Ticket</th>
                        <th>Student Name</th>
                        <th>Dept</th>
                        <th>Year</th>
                        <th>Sec</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(previewData.students || []).map((s, idx) => (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                          <td><strong>{s.hall_ticket_no}</strong></td>
                          <td>{s.name}</td>
                          <td><span className="badge-dept">{s.department}</span></td>
                          <td>{s.year || 1}</td>
                          <td>{s.section || "A"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn-secondary"
                onClick={() => setUploadExamTarget(null)}
                disabled={uploading}
              >
                Cancel
              </button>

              {previewData && (
                <button
                  type="button"
                  className="modal-btn-primary"
                  onClick={handleConfirmSaveStudents}
                  disabled={uploading}
                >
                  {uploading ? "Saving Roster..." : `Confirm & Save ${previewData.total_count} Students`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Master Batch Import (Subjects + Students + Auto-Allocation) Modal */}
      {isBatchModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: "780px", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="modal-header">
              <div>
                <h3>⚡ Batch Import Subjects &amp; Students</h3>
                <p className="modal-subtitle">
                  Upload a PDF, Excel (.xlsx/.xls), or CSV file with subject details and candidate rosters. The system creates subjects, schedules exams, and automatically assigns seating!
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsBatchModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "16px 24px" }}>
              {batchError && <div className="modal-alert-error" style={{ marginBottom: "14px" }}>{batchError}</div>}

              {/* Success Result View */}
              {batchResult && (
                <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "20px" }}>🎉</span>
                    <h4 style={{ margin: 0, color: "#166534", fontSize: "16px" }}>
                      Import &amp; Seat Allocation Completed!
                    </h4>
                  </div>
                  <p style={{ margin: "0 0 12px", color: "#15803d", fontSize: "13px" }}>
                    Successfully imported <strong>{batchResult.total_students}</strong> candidate(s) across <strong>{batchResult.affected_exams?.length || 0}</strong> examination session(s).
                  </p>

                  {/* List of Affected Exams */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                    {(batchResult.affected_exams || []).map((ex) => (
                      <div
                        key={ex.exam_id}
                        style={{
                          background: "#ffffff",
                          border: "1px solid #bbf7d0",
                          borderRadius: "6px",
                          padding: "10px 14px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "8px"
                        }}
                      >
                        <div>
                          <strong style={{ color: "#0f172a", fontSize: "14px" }}>
                            {ex.subject_code}: {ex.subject_name}
                          </strong>
                          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                            {ex.exam_date} ({ex.session}) · <strong>{ex.registered_candidates}</strong> candidates
                          </div>
                        </div>

                        {ex.allocation?.success ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span className="status-badge success">
                              ✓ {ex.allocation.allocations_count} Seats Allocated
                            </span>
                            <button
                              type="button"
                              className="table-action-btn primary"
                              onClick={() => {
                                setIsBatchModalOpen(false);
                                onNavigateWithExam("seating", ex.exam_id);
                              }}
                            >
                              🪑 View Seating Plan &amp; Print
                            </button>
                          </div>
                        ) : (
                          <span className="status-badge pending">Saved without seating</span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="modal-btn-secondary"
                      onClick={() => setIsBatchModalOpen(false)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              {/* Upload Form View */}
              {!batchResult && (
                <>
                  <div className="form-group" style={{ marginBottom: "16px" }}>
                    <label>Select Master Roster File (PDF, Excel, or CSV) *</label>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls,.pdf"
                      onChange={(e) => {
                        setBatchFile(e.target.files[0] || null);
                        setBatchPreview(null);
                        setBatchError("");
                      }}
                      disabled={batchUploading}
                    />
                    <small className="field-hint">
                      File can contain: Hall Ticket (Roll No), Student Name, Department, Subject Code, Subject Name. If subject is in the PDF header or document title, it will be automatically extracted!
                    </small>
                  </div>

                  {/* Fallback Subject & Exam Schedule */}
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
                    <h5 style={{ margin: "0 0 10px", fontSize: "13px", color: "#334155" }}>
                      Examination Schedule &amp; Fallback Subject (Used if file does not specify per-student subjects)
                    </h5>

                    <div className="form-row">
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Exam Date *</label>
                        <input
                          type="date"
                          value={batchExamDate}
                          onChange={(e) => setBatchExamDate(e.target.value)}
                          disabled={batchUploading}
                          required
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Session *</label>
                        <select
                          value={batchSession}
                          onChange={(e) => setBatchSession(e.target.value)}
                          disabled={batchUploading}
                        >
                          <option value="FN">Forenoon (FN: 09:30 AM – 12:30 PM)</option>
                          <option value="AN">Afternoon (AN: 01:30 PM – 04:30 PM)</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-row" style={{ marginTop: "10px" }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Default Course Code (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. 20CS3401 or CS301"
                          value={batchDefaultSubCode}
                          onChange={(e) => setBatchDefaultSubCode(e.target.value)}
                          disabled={batchUploading}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 2 }}>
                        <label>Default Course Title (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. Operating Systems"
                          value={batchDefaultSubName}
                          onChange={(e) => setBatchDefaultSubName(e.target.value)}
                          disabled={batchUploading}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Auto-Allocation Checkbox */}
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "12px 14px", borderRadius: "6px", marginBottom: "16px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600, color: "#166534", fontSize: "13px" }}>
                      <input
                        type="checkbox"
                        checked={batchAutoAllocate}
                        onChange={(e) => setBatchAutoAllocate(e.target.checked)}
                        disabled={batchUploading}
                      />
                      ⚡ Automatically allocate available examination halls &amp; seats immediately
                    </label>
                    <small style={{ color: "#15803d", display: "block", marginTop: "4px", marginLeft: "24px" }}>
                      Finds available rooms fitting student capacity without overlaps and generates conflict-free seating with department separation.
                    </small>
                  </div>

                  {/* Preview Button */}
                  <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleBatchPreview}
                      disabled={batchUploading || !batchFile}
                    >
                      {batchUploading && !batchPreview ? "Inspecting File..." : "🔍 Preview Subjects & Students"}
                    </button>
                  </div>

                  {/* Preview Section */}
                  {batchPreview && (
                    <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                        <h4 style={{ margin: 0, color: "#1e293b", fontSize: "14px" }}>
                          Roster Inspection Preview
                        </h4>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <span className="capacity-pill" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
                            Candidates: <strong>{batchPreview.total_students}</strong>
                          </span>
                          <span className="capacity-pill" style={{ background: "#f0fdf4", color: "#15803d" }}>
                            Subjects: <strong>{batchPreview.detected_subjects?.length || 1}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Detected Subjects Badges */}
                      <div style={{ marginBottom: "12px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "4px" }}>
                          Detected Subjects / Courses:
                        </span>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {(batchPreview.detected_subjects || []).map((s, idx) => (
                            <span key={idx} style={{ background: "#e0e7ff", border: "1px solid #c7d2fe", color: "#3730a3", fontSize: "12px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px" }}>
                              📚 {s.subject_code}: {s.subject_name}
                            </span>
                          ))}
                        </div>
                      </div>

                      <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 8px 0" }}>
                        Previewing first {batchPreview.preview_students?.length || 0} extracted candidate rows:
                      </p>

                      <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #cbd5e1", borderRadius: "6px" }}>
                        <table style={{ margin: 0, fontSize: "12px" }}>
                          <thead style={{ background: "#f1f5f9", position: "sticky", top: 0 }}>
                            <tr>
                              <th>#</th>
                              <th>Hall Ticket</th>
                              <th>Student Name</th>
                              <th>Dept</th>
                              <th>Subject Code</th>
                              <th>Course Title</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(batchPreview.preview_students || []).map((s, idx) => (
                              <tr key={idx}>
                                <td>{idx + 1}</td>
                                <td><strong>{s.hall_ticket_no}</strong></td>
                                <td>{s.name}</td>
                                <td><span className="badge-dept">{s.department}</span></td>
                                <td><strong style={{ color: "#1d4ed8" }}>{s.subject_code}</strong></td>
                                <td>{s.subject_name}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="modal-actions" style={{ padding: "12px 0 0", borderTop: "1px solid #e2e8f0" }}>
                    <button
                      type="button"
                      className="modal-btn-secondary"
                      onClick={() => setIsBatchModalOpen(false)}
                      disabled={batchUploading}
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      className="allocate-btn-primary"
                      onClick={handleBatchSubmit}
                      disabled={batchUploading || !batchFile}
                    >
                      {batchUploading ? "Importing & Allocating..." : "⚡ Confirm Import & Assign Seating"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {viewStudentsExam && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: "680px", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="modal-header">
              <div>
                <h3>Registered Students — {viewStudentsExam.exam_name || viewStudentsExam.subject_name}</h3>
                <p className="modal-subtitle">
                  {registeredStudents.length} candidate{registeredStudents.length === 1 ? "" : "s"} enrolled for this examination session.
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setViewStudentsExam(null)}
              >
                ✕
              </button>
            </div>

            {loadingStudents ? (
              <p className="status-message">Loading enrolled student list...</p>
            ) : registeredStudents.length === 0 ? (
              <div className="empty-state-card" style={{ padding: "24px" }}>
                <span className="empty-icon">👥</span>
                <h4>No Students Registered</h4>
                <p>Upload student information using CSV, Excel, or PDF to enroll candidates.</p>
              </div>
            ) : (
              <div style={{ maxHeight: "360px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
                <table style={{ margin: 0, fontSize: "13px" }}>
                  <thead style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                    <tr>
                      <th>#</th>
                      <th>Hall Ticket</th>
                      <th>Name</th>
                      <th>Department</th>
                      <th>Year</th>
                      <th>Section</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registeredStudents.map((st, i) => (
                      <tr key={st.student_id || i}>
                        <td>{i + 1}</td>
                        <td><strong>{st.hall_ticket_no}</strong></td>
                        <td>{st.name}</td>
                        <td><span className="badge-dept">{st.department}</span></td>
                        <td>{st.year}</td>
                        <td>{st.section}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: "16px" }}>
              <button
                type="button"
                className="modal-btn-secondary"
                onClick={() => setViewStudentsExam(null)}
              >
                Close
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className="modal-btn-primary"
                  onClick={() => {
                    const ex = viewStudentsExam;
                    setViewStudentsExam(null);
                    openUploadModal(ex);
                  }}
                >
                  📁 Upload / Update Roster
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
