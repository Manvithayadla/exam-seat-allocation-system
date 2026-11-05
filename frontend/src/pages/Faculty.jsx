import { useEffect, useState, useMemo } from "react";
import api from "../services/api";

export default function Faculty() {
  const [facultyList, setFacultyList] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState("ALL");

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFaculty, setEditingFaculty] = useState(null);
  const [formData, setFormData] = useState({
    faculty_name: "",
    department: "CSE",
    subject_ids: [],
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Upload Modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [facData, subjData] = await Promise.all([
        api.getFaculty(),
        api.getSubjects().catch(() => ({ subjects: [] })),
      ]);
      setFacultyList(facData.faculty || []);
      setSubjects(subjData.subjects || []);
    } catch (err) {
      setError(err.message || "Failed to load faculty records.");
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    setEditingFaculty(null);
    setFormData({
      faculty_name: "",
      department: "CSE",
      subject_ids: [],
    });
    setFormError("");
    setIsModalOpen(true);
  }

  function openEditModal(faculty) {
    setEditingFaculty(faculty);
    const existingSubjectIds = (faculty.subjects_taught || []).map((s) => s.subject_id);
    setFormData({
      faculty_name: faculty.faculty_name || "",
      department: faculty.department || "CSE",
      subject_ids: existingSubjectIds,
    });
    setFormError("");
    setIsModalOpen(true);
  }

  function toggleSubjectSelection(subjectId) {
    setFormData((prev) => {
      const exists = prev.subject_ids.includes(subjectId);
      return {
        ...prev,
        subject_ids: exists
          ? prev.subject_ids.filter((id) => id !== subjectId)
          : [...prev.subject_ids, subjectId],
      };
    });
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    if (!formData.faculty_name.trim()) {
      setFormError("Faculty name is required.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      if (editingFaculty) {
        await api.updateFaculty(editingFaculty.faculty_id, formData);
        setSuccess(`Faculty '${formData.faculty_name}' updated successfully.`);
      } else {
        await api.createFaculty(formData);
        setSuccess(`Faculty member '${formData.faculty_name}' added successfully.`);
      }
      setIsModalOpen(false);
      await loadData();
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setFormError(err.message || "Failed to save faculty details.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadSubmit(e) {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError("Please select a CSV or Excel file to upload.");
      return;
    }

    setUploading(true);
    setUploadError("");

    try {
      const res = await api.uploadFaculty(uploadFile);
      setSuccess(res.message || "Faculty list uploaded and processed successfully.");
      setIsUploadOpen(false);
      setUploadFile(null);
      await loadData();
      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      setUploadError(err.message || "Failed to process faculty file.");
    } finally {
      setUploading(false);
    }
  }

  // Filtered list
  const departments = useMemo(() => {
    const set = new Set(facultyList.map((f) => f.department).filter(Boolean));
    return Array.from(set).sort();
  }, [facultyList]);

  const filteredFaculty = useMemo(() => {
    return facultyList.filter((f) => {
      const matchesDept = selectedDept === "ALL" || f.department === selectedDept;
      const matchesSearch = [
        f.faculty_id,
        f.faculty_name,
        f.department,
        ...(f.subjects_taught || []).map((s) => `${s.subject_code} ${s.subject_name}`),
      ].some((val) => String(val ?? "").toLowerCase().includes(search.toLowerCase()));
      return matchesDept && matchesSearch;
    });
  }, [facultyList, selectedDept, search]);

  const totalSubjectsMapped = useMemo(() => {
    return facultyList.reduce((sum, f) => sum + (f.subjects_taught?.length || 0), 0);
  }, [facultyList]);

  return (
    <div className="faculty-page">
      <header className="page-header">
        <div>
          <h1>Faculty & Invigilators</h1>
          <p>
            Manage faculty records and subjects taught. The system strictly excludes faculty
            from invigilating exams for subjects they teach.
          </p>
        </div>
        <div className="header-actions" style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setIsUploadOpen(true);
              setUploadError("");
              setUploadFile(null);
            }}
          >
            📁 Upload Faculty CSV / Excel
          </button>
          <button type="button" className="btn-primary" onClick={openAddModal}>
            ➕ Add Faculty
          </button>
        </div>
      </header>

      {success && <div className="allocation-success">{success}</div>}
      {error && <div className="allocation-error">{error}</div>}

      {/* Summary Metrics */}
      <section className="stats-grid">
        <article className="stat-card">
          <div className="stat-card-header">
            <span className="stat-icon">👥</span>
            <span className="stat-title">Total Faculty</span>
          </div>
          <h2>{loading ? "..." : facultyList.length}</h2>
          <small>Registered academic faculty</small>
        </article>

        <article className="stat-card">
          <div className="stat-card-header">
            <span className="stat-icon">📚</span>
            <span className="stat-title">Subjects Mapped</span>
          </div>
          <h2>{loading ? "..." : totalSubjectsMapped}</h2>
          <small>Total course-teaching assignments</small>
        </article>

        <article className="stat-card">
          <div className="stat-card-header">
            <span className="stat-icon">🛡️</span>
            <span className="stat-title">Conflict Guard</span>
          </div>
          <h2 style={{ fontSize: "1.25rem", color: "#166534" }}>Strictly Enforced</h2>
          <small>Never assigned to their own subject</small>
        </article>
      </section>

      {/* Search and Department Filter */}
      <div className="exam-filter-bar" style={{ marginBottom: "20px" }}>
        <div className="session-filter-group">
          <button
            type="button"
            className={`session-btn ${selectedDept === "ALL" ? "active" : ""}`}
            onClick={() => setSelectedDept("ALL")}
          >
            All Departments ({facultyList.length})
          </button>
          {departments.map((dept) => (
            <button
              key={dept}
              type="button"
              className={`session-btn ${selectedDept === dept ? "active" : ""}`}
              onClick={() => setSelectedDept(dept)}
            >
              {dept}
            </button>
          ))}
        </div>

        <input
          type="search"
          className="exam-search-input"
          placeholder="Search by faculty name, department, or subject..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Faculty Table */}
      <section className="panel">
        <div className="section-heading">
          <div>
            <h3>Faculty Directory & Teaching Profiles</h3>
            <p className="panel-subtitle">
              {filteredFaculty.length} faculty member{filteredFaculty.length === 1 ? "" : "s"} found
            </p>
          </div>
        </div>

        {loading && <p className="status-message">Loading faculty records...</p>}

        {!loading && filteredFaculty.length === 0 && (
          <div className="empty-state-card">
            <span className="empty-icon">👥</span>
            <h3>No Faculty Found</h3>
            <p>Add faculty manually or upload a CSV/Excel roster to populate this list.</p>
          </div>
        )}

        {!loading && filteredFaculty.length > 0 && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Faculty ID</th>
                  <th>Faculty Name</th>
                  <th>Department</th>
                  <th>Subjects Taught (Excluded from Invigilating)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFaculty.map((f) => (
                  <tr key={f.faculty_id}>
                    <td>
                      <span className="exam-id-tag">#{f.faculty_id}</span>
                    </td>
                    <td>
                      <strong style={{ color: "#0f172a", fontSize: "14px" }}>
                        {f.faculty_name}
                      </strong>
                    </td>
                    <td>
                      <span className="badge-dept">{f.department}</span>
                    </td>
                    <td>
                      {f.subjects_taught && f.subjects_taught.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {f.subjects_taught.map((st) => (
                            <span
                              key={st.subject_id}
                              className="subject-pill"
                              title={`${st.subject_code} - ${st.subject_name}`}
                            >
                              <strong>{st.subject_code}</strong>: {st.subject_name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted" style={{ fontStyle: "italic", fontSize: "13px" }}>
                          None mapped (eligible for all exams)
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="table-action-btn secondary"
                        onClick={() => openEditModal(f)}
                      >
                        ✏️ Edit Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add / Edit Faculty Modal */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: "560px" }}>
            <div className="modal-header">
              <div>
                <h3>{editingFaculty ? "Edit Faculty Profile" : "Add New Faculty Member"}</h3>
                <p className="modal-subtitle">
                  Configure faculty department and subject assignments.
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="modal-form">
              {formError && <div className="modal-alert-error">{formError}</div>}

              <div className="form-group">
                <label htmlFor="faculty-name">Faculty Full Name *</label>
                <input
                  id="faculty-name"
                  type="text"
                  placeholder="e.g. Dr. Rajesh Kumar"
                  value={formData.faculty_name}
                  onChange={(e) => setFormData({ ...formData, faculty_name: e.target.value })}
                  required
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="faculty-dept">Department *</label>
                <input
                  id="faculty-dept"
                  type="text"
                  placeholder="e.g. CSE, ECE, MECH"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value.toUpperCase() })}
                  required
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label>
                  Subjects Taught (Conflict Exclusion)
                </label>
                <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 8px 0" }}>
                  Select all courses taught by this faculty member. They will never be assigned to invigilate exams for these subjects.
                </p>

                {subjects.length === 0 ? (
                  <p className="text-muted" style={{ fontSize: "13px" }}>No subjects found. Create subjects in Examinations first.</p>
                ) : (
                  <div
                    style={{
                      maxHeight: "180px",
                      overflowY: "auto",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      padding: "10px",
                      background: "#f8fafc",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {subjects.map((s) => {
                      const isChecked = formData.subject_ids.includes(s.subject_id);
                      return (
                        <label
                          key={s.subject_id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            cursor: "pointer",
                            fontSize: "13px",
                            color: isChecked ? "#1e40af" : "#334155",
                            fontWeight: isChecked ? 600 : 400,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSubjectSelection(s.subject_id)}
                            disabled={saving}
                          />
                          <span>
                            <strong>{s.subject_code}</strong> — {s.subject_name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="modal-btn-primary" disabled={saving}>
                  {saving ? "Saving..." : editingFaculty ? "Save Changes" : "Add Faculty"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload CSV / Excel Modal */}
      {isUploadOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: "520px" }}>
            <div className="modal-header">
              <div>
                <h3>Upload Faculty Roster</h3>
                <p className="modal-subtitle">Upload a CSV or Excel spreadsheet containing faculty members.</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsUploadOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="modal-form">
              {uploadError && <div className="modal-alert-error">{uploadError}</div>}

              <div className="form-group">
                <label>Select CSV or Excel (.xlsx, .xls) File</label>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => setUploadFile(e.target.files[0] || null)}
                  disabled={uploading}
                  required
                />
              </div>

              <div
                style={{
                  background: "#f1f5f9",
                  padding: "12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "#475569",
                  lineHeight: "1.5",
                }}
              >
                <strong>Expected File Columns:</strong>
                <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                  <li><code>faculty_name</code> or <code>name</code> (e.g. Dr. Rajesh Kumar)</li>
                  <li><code>department</code> (e.g. CSE, ECE)</li>
                  <li><code>subjects</code> (optional, comma-separated codes like <code>CS301, CS302</code>)</li>
                </ul>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn-secondary"
                  onClick={() => setIsUploadOpen(false)}
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-btn-primary"
                  disabled={uploading || !uploadFile}
                >
                  {uploading ? "Processing File..." : "Upload & Import"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
