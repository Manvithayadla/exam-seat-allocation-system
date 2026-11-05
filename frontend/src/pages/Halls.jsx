import { useEffect, useState, useMemo } from "react";
import api from "../services/api";

export default function Halls() {
  const [halls, setHalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHall, setEditingHall] = useState(null);
  const [formData, setFormData] = useState({
    hall_name: "",
    room_no: "",
    capacity: 36,
    has_custom_layout: false,
    rows_count: "",
    columns_count: "",
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete confirmation modal state
  const [deletingHall, setDeletingHall] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadHalls();
  }, []);

  async function loadHalls() {
    setLoading(true);
    setError("");
    try {
      const data = await api.getHalls();
      setHalls(data.halls || []);
    } catch (err) {
      setError(err.message || "Failed to load examination halls.");
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    setEditingHall(null);
    setFormData({
      hall_name: "",
      room_no: "",
      capacity: 36,
      has_custom_layout: false,
      rows_count: "",
      columns_count: "",
      is_active: true,
    });
    setFormError("");
    setIsModalOpen(true);
  }

  function openEditModal(hall) {
    setEditingHall(hall);
    const hasLayout = Boolean(hall.rows_count && hall.columns_count);
    setFormData({
      hall_name: hall.hall_name || "",
      room_no: hall.room_no || hall.hall_name || "",
      capacity: hall.capacity || 36,
      has_custom_layout: hasLayout,
      rows_count: hall.rows_count || "",
      columns_count: hall.columns_count || "",
      is_active: hall.is_active !== undefined ? Boolean(hall.is_active) : true,
    });
    setFormError("");
    setIsModalOpen(true);
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    if (!formData.hall_name.trim()) {
      setFormError("Hall name / room identifier is required.");
      return;
    }

    const capNum = Number(formData.capacity);
    if (!capNum || capNum <= 0) {
      setFormError("Seating capacity must be a positive number greater than 0.");
      return;
    }

    setSaving(true);
    setFormError("");

    const payload = {
      hall_name: formData.hall_name.trim().toUpperCase(),
      room_no: (formData.room_no.trim() || formData.hall_name.trim()).toUpperCase(),
      capacity: capNum,
      is_active: formData.is_active,
      rows_count: formData.has_custom_layout && formData.rows_count ? Number(formData.rows_count) : null,
      columns_count: formData.has_custom_layout && formData.columns_count ? Number(formData.columns_count) : null,
    };

    try {
      if (editingHall) {
        await api.updateHall(editingHall.hall_id, payload);
        setSuccess(`Hall '${payload.hall_name}' updated successfully.`);
      } else {
        await api.createHall(payload);
        setSuccess(`Hall '${payload.hall_name}' created and initialized.`);
      }
      setIsModalOpen(false);
      await loadHalls();
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setFormError(err.message || "Failed to save hall details.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteHall() {
    if (!deletingHall) return;
    setDeleting(true);
    try {
      await api.deleteHall(deletingHall.hall_id);
      setSuccess(`Hall '${deletingHall.hall_name}' deleted successfully.`);
      setDeletingHall(null);
      await loadHalls();
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err.message || "Failed to delete hall.");
      setDeletingHall(null);
    } finally {
      setDeleting(false);
    }
  }

  const totalCapacity = useMemo(() => {
    return halls
      .filter((h) => h.is_active !== false)
      .reduce((sum, h) => sum + (h.capacity || 0), 0);
  }, [halls]);

  return (
    <div className="halls-page">
      <header className="page-header">
        <div>
          <h1>Hall Management</h1>
          <p>
            Configure examination rooms, enter manual seating capacities, manage room availability,
            and customize physical seating dimensions.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-primary" onClick={openAddModal}>
            ➕ Add Examination Hall
          </button>
        </div>
      </header>

      {success && <div className="allocation-success">{success}</div>}
      {error && <div className="allocation-error">{error}</div>}

      {/* Summary Metrics */}
      <section className="stats-grid">
        <article className="stat-card">
          <div className="stat-card-header">
            <span className="stat-icon">🏛️</span>
            <span className="stat-title">Total Halls</span>
          </div>
          <h2>{loading ? "..." : halls.length}</h2>
          <small>{halls.filter((h) => h.is_active !== false).length} active examination rooms</small>
        </article>

        <article className="stat-card">
          <div className="stat-card-header">
            <span className="stat-icon">🪑</span>
            <span className="stat-title">Active Capacity</span>
          </div>
          <h2>{loading ? "..." : totalCapacity}</h2>
          <small>Total student seats campus-wide</small>
        </article>

        <article className="stat-card">
          <div className="stat-card-header">
            <span className="stat-icon">📐</span>
            <span className="stat-title">Room Layout Support</span>
          </div>
          <h2 style={{ fontSize: "1.2rem", color: "#166534" }}>Flexible & Custom</h2>
          <small>Simple capacity or row-column grids</small>
        </article>
      </section>

      {/* Halls Inventory Table */}
      <section className="panel">
        <div className="section-heading">
          <div>
            <h3>Campus Hall Inventory</h3>
            <p className="panel-subtitle">Registered examination rooms and room availability for automatic allocation</p>
          </div>
        </div>

        {loading && <p className="status-message">Loading examination halls...</p>}

        {!loading && halls.length === 0 && (
          <div className="empty-state-card">
            <span className="empty-icon">🏛️</span>
            <h3>No Examination Halls Added</h3>
            <p>Click &quot;Add Examination Hall&quot; to configure your first examination room.</p>
          </div>
        )}

        {!loading && halls.length > 0 && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Hall Identifier</th>
                  <th>Room Number</th>
                  <th>Seating Capacity</th>
                  <th>Layout Configuration</th>
                  <th>Availability Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {halls.map((hall) => (
                  <tr key={hall.hall_id}>
                    <td>
                      <strong className="hall-name-cell">{hall.hall_name}</strong>
                    </td>
                    <td>{hall.room_no || hall.hall_name}</td>
                    <td>
                      <span className="capacity-pill" style={{ fontWeight: 700 }}>
                        {hall.capacity} Seats
                      </span>
                    </td>
                    <td>
                      {hall.rows_count && hall.columns_count ? (
                        <span className="dimension-badge">
                          {hall.rows_count} Rows × {hall.columns_count} Cols ({hall.rows_count * hall.columns_count} grid slots)
                        </span>
                      ) : (
                        <span className="text-muted" style={{ fontSize: "12px" }}>
                          Standard 2-student benches ({hall.total_physical_seats || hall.capacity} seats)
                        </span>
                      )}
                    </td>
                    <td>
                      {hall.is_active !== false ? (
                        <span className="status-badge success" style={{ fontSize: "12px" }}>
                          ✓ Available / Active
                        </span>
                      ) : (
                        <span className="warning-badge" style={{ fontSize: "12px" }}>
                          🚫 Inactive / Maintenance
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="table-action-btns">
                        <button
                          type="button"
                          className="table-action-btn secondary"
                          onClick={() => openEditModal(hall)}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          className="table-action-btn danger"
                          style={{ color: "#b91c1c" }}
                          onClick={() => setDeletingHall(hall)}
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
        )}
      </section>

      {/* Add / Edit Hall Modal */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: "540px" }}>
            <div className="modal-header">
              <div>
                <h3>{editingHall ? "Edit Examination Hall" : "Add New Examination Hall"}</h3>
                <p className="modal-subtitle">
                  {editingHall ? `Update configuration for Hall ${editingHall.hall_name}` : "Configure hall capacity and optional bench layout"}
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
                <label htmlFor="hall-name">Hall Name / Identifier *</label>
                <input
                  id="hall-name"
                  type="text"
                  placeholder="e.g. ROOM 304, AUDITORIUM, BLOCK A-101"
                  value={formData.hall_name}
                  onChange={(e) => setFormData({ ...formData, hall_name: e.target.value.toUpperCase() })}
                  required
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="room-no">Room / Block Number</label>
                <input
                  id="room-no"
                  type="text"
                  placeholder="e.g. Room 304, Academic Block 3"
                  value={formData.room_no}
                  onChange={(e) => setFormData({ ...formData, room_no: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="hall-capacity">
                  Total Seating Capacity * (Entered Manually)
                </label>
                <input
                  id="hall-capacity"
                  type="number"
                  min="1"
                  placeholder="e.g. 36"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                  required
                  disabled={saving}
                />
                <small className="field-hint">
                  Enter the actual physical student capacity for this room. Used during automatic room allocation.
                </small>
              </div>

              {/* Optional Custom Layout Toggle */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", background: "#f8fafc" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600, color: "#1e293b", fontSize: "13px" }}>
                  <input
                    type="checkbox"
                    checked={formData.has_custom_layout}
                    onChange={(e) => setFormData({ ...formData, has_custom_layout: e.target.checked })}
                    disabled={saving}
                  />
                  <span>Specify Custom Seating Grid (Optional)</span>
                </label>
                <small className="field-hint" style={{ marginTop: "4px" }}>
                  Optional: If omitted, the room will automatically generate standard 2-student bench pairs up to capacity.
                </small>

                {formData.has_custom_layout && (
                  <div className="form-row" style={{ marginTop: "12px" }}>
                    <div className="form-group">
                      <label htmlFor="rows-count">Number of Rows</label>
                      <input
                        id="rows-count"
                        type="number"
                        min="1"
                        max="50"
                        placeholder="e.g. 6"
                        value={formData.rows_count}
                        onChange={(e) => setFormData({ ...formData, rows_count: e.target.value })}
                        disabled={saving}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="cols-count">Number of Columns / Benches</label>
                      <input
                        id="cols-count"
                        type="number"
                        min="1"
                        max="50"
                        placeholder="e.g. 6"
                        value={formData.columns_count}
                        onChange={(e) => setFormData({ ...formData, columns_count: e.target.value })}
                        disabled={saving}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Active Status */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <input
                  id="hall-active-status"
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  disabled={saving}
                />
                <label htmlFor="hall-active-status" style={{ fontSize: "13px", color: "#334155", cursor: "pointer" }}>
                  <strong>Hall is active and available for examination scheduling</strong>
                </label>
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
                  {saving ? "Saving..." : (editingHall ? "Save Changes" : "Create Hall")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingHall && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: "440px" }}>
            <div className="modal-header">
              <div>
                <h3 style={{ color: "#b91c1c" }}>Confirm Hall Deletion</h3>
                <p className="modal-subtitle">Are you sure you want to remove this examination room?</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDeletingHall(null)}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "16px 24px" }}>
              <p style={{ margin: 0, fontSize: "14px", color: "#334155" }}>
                You are about to delete <strong>Hall {deletingHall.hall_name}</strong> (Capacity: {deletingHall.capacity} seats).
                This action cannot be undone.
              </p>
            </div>
            <div className="modal-actions" style={{ padding: "16px 24px", background: "#f8fafc" }}>
              <button
                type="button"
                className="modal-btn-secondary"
                onClick={() => setDeletingHall(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-btn-primary"
                style={{ background: "#dc2626", borderColor: "#dc2626" }}
                onClick={confirmDeleteHall}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Confirm & Delete Hall"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
