import { useState, useEffect } from "react";
import api from "../services/api";

export default function HallsCapacity() {
  const [halls, setHalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: "", text: "" });

  // Modal State (Add / Edit)
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Upload & Import Modal State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewHalls, setPreviewHalls] = useState([]);
  const [uploadSummary, setUploadSummary] = useState("");
  const [uploadError, setUploadError] = useState("");

  // Bulk Selection & Deletion State
  const [selectedHallIds, setSelectedHallIds] = useState([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkPreflightData, setBulkPreflightData] = useState(null);
  const [checkingBulkPreflight, setCheckingBulkPreflight] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkModalError, setBulkModalError] = useState("");

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setParsing(true);
    setUploadError("");
    setUploadSummary("");
    try {
      const res = await api.uploadHallsPreview(file);
      setPreviewHalls(res.halls || []);
      setUploadSummary(res.summary || "");
      if (res.invalid_records > 0) {
        setUploadError(`${res.invalid_records} warning(s) or issue(s) detected. You can correct them inline before importing.`);
      }
    } catch (err) {
      setUploadError(err.message || "Failed to parse hall data file.");
    } finally {
      setParsing(false);
    }
  }

  function updatePreviewItem(tempId, field, value) {
    setPreviewHalls((prev) =>
      prev.map((item) => {
        if (item.temp_id !== tempId) return item;
        const updated = { ...item, [field]: value };
        const cap = parseInt(updated.capacity, 10) || 0;
        const rows = parseInt(updated.rows_count, 10) || 6;
        const cols = parseInt(updated.columns_count, 10) || 8;
        let err = null;
        let warn = null;
        if (!updated.hall_name?.trim()) err = "Hall name is required";
        else if (cap <= 0) err = "Capacity must be greater than 0";
        if (cap > 0 && rows * cols < cap) {
          warn = `Grid (${rows}x${cols}=${rows*cols}) smaller than capacity (${cap})`;
        }
        return {
          ...updated,
          capacity: cap,
          rows_count: rows,
          columns_count: cols,
          is_valid: err === null && !item.is_duplicate,
          error: err,
          warning: warn,
        };
      })
    );
  }

  function removePreviewItem(tempId) {
    setPreviewHalls((prev) => prev.filter((item) => item.temp_id !== tempId));
  }

  async function handleConfirmImport() {
    if (previewHalls.length === 0) return;
    const invalidItems = previewHalls.filter((h) => !h.is_valid);
    if (invalidItems.length > 0) {
      setUploadError(`Please fix or remove the ${invalidItems.length} invalid record(s) before importing.`);
      return;
    }

    setImporting(true);
    setUploadError("");
    try {
      const res = await api.bulkImportHalls(previewHalls);
      setStatusMessage({
        type: "success",
        text: res.message || `Successfully processed ${previewHalls.length} examination halls.`,
      });
      setUploadModalOpen(false);
      setPreviewHalls([]);
      loadHalls();
    } catch (err) {
      setUploadError(err.message || "Failed to import halls into database.");
    } finally {
      setImporting(false);
    }
  }
  const [editingHall, setEditingHall] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [hallName, setHallName] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [capacity, setCapacity] = useState("");
  const [rowsCount, setRowsCount] = useState(6);
  const [columnsCount, setColumnsCount] = useState(6);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    loadHalls();
  }, []);

  async function loadHalls() {
    setLoading(true);
    try {
      const res = await api.getHalls();
      setHalls(Array.isArray(res.halls) ? res.halls : []);
    } catch (err) {
      console.warn("Could not load halls:", err);
      setStatusMessage({ type: "danger", text: "Failed to load examination halls." });
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    setEditingHall(null);
    setHallName("");
    setRoomNo("");
    setCapacity("");
    setRowsCount(6);
    setColumnsCount(6);
    setIsActive(true);
    setIsModalOpen(true);
  }

  function openEditModal(hall) {
    setEditingHall(hall);
    setHallName(hall.hall_name || "");
    setRoomNo(hall.room_no || "");
    setCapacity(String(hall.capacity || ""));
    setRowsCount(hall.rows_count || 6);
    setColumnsCount(hall.columns_count || 6);
    setIsActive(Number(hall.is_active) === 1 || hall.is_active === true);
    setIsModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const capNum = parseInt(capacity, 10);
    if (!roomNo.trim() && !hallName.trim()) {
      setStatusMessage({ type: "danger", text: "Please enter a Room Number or Hall Name." });
      return;
    }
    if (isNaN(capNum) || capNum <= 0) {
      setStatusMessage({ type: "danger", text: "Please enter a valid positive usable seating capacity." });
      return;
    }

    setSaving(true);
    setStatusMessage({ type: "", text: "" });

    const payload = {
      hall_name: hallName.trim() || `Room ${roomNo.trim()}`,
      room_no: roomNo.trim() || hallName.trim(),
      capacity: capNum,
      rows_count: parseInt(rowsCount, 10) || 6,
      columns_count: parseInt(columnsCount, 10) || 6,
      is_active: isActive ? 1 : 0,
    };

    try {
      if (editingHall) {
        await api.updateHall(editingHall.hall_id, payload);
        setStatusMessage({ type: "success", text: `Hall ${payload.room_no} updated successfully.` });
      } else {
        await api.createHall(payload);
        setStatusMessage({ type: "success", text: `Hall ${payload.room_no} created successfully.` });
      }
      setIsModalOpen(false);
      loadHalls();
    } catch (err) {
      setStatusMessage({ type: "danger", text: err.message || "Failed to save hall." });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(hall) {
    const newStatus = Number(hall.is_active) === 1 ? 0 : 1;
    try {
      await api.updateHall(hall.hall_id, {
        hall_name: hall.hall_name,
        room_no: hall.room_no,
        capacity: hall.capacity,
        rows_count: hall.rows_count,
        columns_count: hall.columns_count,
        is_active: newStatus,
      });
      setStatusMessage({
        type: "success",
        text: `Room ${hall.room_no || hall.hall_name} ${newStatus ? "activated" : "deactivated"}.`,
      });
      loadHalls();
    } catch (err) {
      setStatusMessage({ type: "danger", text: err.message || "Could not toggle hall status." });
    }
  }

  async function handleDelete(hall) {
    if (!window.confirm(`Permanently remove hall ${hall.room_no || hall.hall_name}? If this hall has completed examinations, all historical seating arrangements, attendance sheets, and supervisor records will be safely preserved.`)) {
      return;
    }

    try {
      const res = await api.deleteHall(hall.hall_id);
      setStatusMessage({ type: "success", text: res.message || `Hall ${hall.room_no || hall.hall_name} permanently removed.` });
      loadHalls();
    } catch (err) {
      setStatusMessage({ type: "danger", text: err.message || "Could not delete hall." });
    }
  }

  async function handleDirectBulkDeactivate() {
    if (selectedHallIds.length === 0) return;
    if (!window.confirm(`Deactivate ${selectedHallIds.length} selected examination hall(s)? They will no longer appear in future exam scheduling pickers, while all historical examination records are kept.`)) {
      return;
    }
    setBulkProcessing(true);
    try {
      const res = await api.bulkDeleteHalls({
        hall_ids: selectedHallIds,
        action: "deactivate",
      });
      setStatusMessage({
        type: "success",
        text: res.message || `Successfully deactivated ${selectedHallIds.length} examination hall(s).`,
      });
      setSelectedHallIds([]);
      loadHalls();
    } catch (err) {
      setStatusMessage({ type: "danger", text: err.message || "Could not deactivate examination halls." });
    } finally {
      setBulkProcessing(false);
    }
  }

  function toggleSelectAllHalls(e) {
    if (e.target.checked) {
      setSelectedHallIds(halls.map((h) => h.hall_id));
    } else {
      setSelectedHallIds([]);
    }
  }

  function toggleSelectHall(hallId) {
    setSelectedHallIds((prev) =>
      prev.includes(hallId) ? prev.filter((id) => id !== hallId) : [...prev, hallId]
    );
  }

  async function openBulkDeleteModal() {
    if (selectedHallIds.length === 0) return;
    setBulkModalError("");
    setCheckingBulkPreflight(true);
    setShowBulkDeleteModal(true);

    try {
      const res = await api.checkHallDeletion({ hall_ids: selectedHallIds });
      setBulkPreflightData(res);
    } catch (err) {
      setBulkModalError(err.message || "Failed to inspect examination hall dependencies.");
    } finally {
      setCheckingBulkPreflight(false);
    }
  }

  async function handleExecuteBulkHalls(action = "delete", safeOnly = false) {
    setBulkProcessing(true);
    setBulkModalError("");

    const idsToProcess = (safeOnly && bulkPreflightData?.removable_hall_ids?.length > 0)
      ? bulkPreflightData.removable_hall_ids
      : (safeOnly && bulkPreflightData?.safe_hall_ids?.length > 0)
      ? bulkPreflightData.safe_hall_ids
      : selectedHallIds;

    try {
      const res = await api.bulkDeleteHalls({
        hall_ids: idsToProcess,
        action: action,
        delete_safe_only: safeOnly,
      });

      setStatusMessage({
        type: "success",
        text: res.message || `Successfully processed ${idsToProcess.length} examination hall(s).`,
      });

      setShowBulkDeleteModal(false);
      setBulkPreflightData(null);
      setSelectedHallIds([]);
      loadHalls();
    } catch (err) {
      setBulkModalError(err.message || "Operation failed.");
    } finally {
      setBulkProcessing(false);
    }
  }

  const totalSeats = halls
    .filter((h) => Number(h.is_active) === 1)
    .reduce((sum, h) => sum + (h.capacity || 0), 0);

  return (
    <div className="halls-capacity-page" style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
      <div
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        <div style={{ flex: "1 1 300px", minWidth: "260px" }}>
          <h1 className="page-title">Halls Capacity &amp; Room Management</h1>
          <p className="page-subtitle">
            Configure examination rooms with manual usable seating capacity and bench layouts.
          </p>
        </div>
        <div
          className="page-actions"
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => {
              setUploadModalOpen(true);
              setUploadFile(null);
              setPreviewHalls([]);
              setUploadSummary("");
              setUploadError("");
            }}
          >
            📥 Upload Hall Capacity Data
          </button>
          <button
            type="button"
            className="btn btn-navy"
            style={{ whiteSpace: "nowrap" }}
            onClick={openAddModal}
          >
            ➕ Add Examination Hall
          </button>
        </div>
      </div>

      {statusMessage.text && (
        <div className={`alert alert-${statusMessage.type}`}>
          <span>{statusMessage.type === "success" ? "✅" : "⚠️"}</span>
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Overview Metric Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper">🏛️</div>
          <div className="stat-data">
            <span className="stat-value">{halls.length}</span>
            <span className="stat-label">Total Rooms</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
            ✅
          </div>
          <div className="stat-data">
            <span className="stat-value">
              {halls.filter((h) => Number(h.is_active) === 1).length}
            </span>
            <span className="stat-label">Active Examination Halls</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: "#fef3c7", color: "#d97706" }}>
            🪑
          </div>
          <div className="stat-data">
            <span className="stat-value">{totalSeats}</span>
            <span className="stat-label">Total Active Seating Capacity</span>
          </div>
        </div>
      </div>

      {/* Halls Table */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Configured Examination Halls</h2>
            <p className="panel-subtitle">
              Rooms available for automated and manual seating distribution.
            </p>
          </div>
        </div>

        {selectedHallIds.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#eff6ff",
              border: "1.5px solid #bfdbfe",
              borderRadius: "8px",
              padding: "10px 16px",
              marginBottom: "14px",
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
                {selectedHallIds.length} selected
              </span>
              <span style={{ fontSize: "13px", color: "var(--primary-navy)", fontWeight: 600 }}>
                {selectedHallIds.length} examination hall(s) selected
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedHallIds([])}
                disabled={bulkProcessing}
              >
                Clear Selection
              </button>
              <button
                type="button"
                className="btn btn-sm"
                style={{ background: "#475569", color: "#ffffff", borderColor: "#334155" }}
                onClick={handleDirectBulkDeactivate}
                disabled={bulkProcessing}
                title="Deactivate selected halls without deleting them"
              >
                ⏸️ Deactivate Selected
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={openBulkDeleteModal}
                disabled={bulkProcessing}
                title="Permanently remove selected halls with historical preservation"
              >
                🗑️ Permanently Remove Selected
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="form-helper" style={{ padding: "20px 0" }}>Loading examination halls...</p>
        ) : halls.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🏛️</span>
            <h3>No Examination Halls Added</h3>
            <p>Click &quot;Add Examination Hall&quot; above to configure your first room.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "36px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      aria-label="Select All Examination Halls"
                      checked={selectedHallIds.length > 0 && selectedHallIds.length === halls.length}
                      onChange={toggleSelectAllHalls}
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                  <th>Room / Hall No</th>
                  <th>Hall Identifier</th>
                  <th>Usable Seating Capacity</th>
                  <th>Bench Grid (Rows × Cols)</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {halls.map((h) => {
                  const active = Number(h.is_active) === 1;
                  const isSelected = selectedHallIds.includes(h.hall_id);
                  return (
                    <tr
                      key={h.hall_id}
                      style={{ backgroundColor: isSelected ? "#eff6ff" : "inherit" }}
                    >
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          aria-label={`Select Room ${h.room_no || h.hall_name}`}
                          checked={isSelected}
                          onChange={() => toggleSelectHall(h.hall_id)}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                      <td>
                        <strong style={{ fontSize: "14px", color: "var(--primary-navy)" }}>
                          Room {h.room_no || h.hall_name}
                        </strong>
                      </td>
                      <td>
                        <span className="form-helper">{h.hall_name}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--accent-blue)" }}>
                          {h.capacity} Seats
                        </span>
                      </td>
                      <td>
                        {h.rows_count || 6} rows × {h.columns_count || 6} cols
                      </td>
                      <td>
                        <span className={`status-pill ${active ? "active" : "inactive"}`}>
                          {active ? "● Active" : "○ Inactive"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px" }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEditModal(h)}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleToggleStatus(h)}
                            style={{ color: active ? "var(--warning)" : "var(--success)" }}
                          >
                            {active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ color: "var(--danger)" }}
                            onClick={() => handleDelete(h)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* =========================================================
          MODAL: PERMANENT EXAMINATION HALL REMOVAL & PRESERVATION
         ========================================================= */}
      {showBulkDeleteModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "720px", width: "95%" }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: "var(--danger)" }}>
                🗑️ Permanent Examination Hall Removal &amp; Preservation
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setShowBulkDeleteModal(false);
                  setBulkPreflightData(null);
                  setBulkModalError("");
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
                  Target: {selectedHallIds.length} Examination Hall(s) Selected
                </div>
                <div style={{ fontSize: "12px", color: "#b91c1c", marginTop: "2px" }}>
                  Selected: <strong>{selectedHallIds.length}</strong> &bull; Total Available Rooms: <strong>{halls.length}</strong>
                </div>
              </div>

              {bulkModalError && (
                <div className="alert alert-danger" style={{ marginBottom: "16px" }}>
                  <span>❌</span>
                  <div>
                    <strong>Operation Failed:</strong>
                    <p style={{ margin: "4px 0 0", fontSize: "12.5px" }}>{bulkModalError}</p>
                  </div>
                </div>
              )}

              {checkingBulkPreflight ? (
                <div style={{ textAlign: "center", padding: "32px 0" }}>
                  <div style={{ fontSize: "28px", marginBottom: "8px" }}>⏳</div>
                  <p style={{ fontSize: "13.5px", color: "var(--text-muted)" }}>
                    Inspecting active examination schedules, seating allocations, supervisor assignments, and historical records...
                  </p>
                </div>
              ) : bulkPreflightData ? (
                <div>
                  {/* Category Summary Cards */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                      gap: "8px",
                      marginBottom: "16px",
                    }}
                  >
                    <div style={{ background: "#f8fafc", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "10px 6px", textAlign: "center" }}>
                      <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--primary-navy)" }}>
                        {bulkPreflightData.total_selected || bulkPreflightData.hall_count}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Total Selected</div>
                    </div>

                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 6px", textAlign: "center" }}>
                      <div style={{ fontSize: "18px", fontWeight: 700, color: "#166534" }}>
                        {bulkPreflightData.safe_count || 0}
                      </div>
                      <div style={{ fontSize: "11px", color: "#166534", marginTop: "2px", fontWeight: 600 }}>Unused (Direct Delete)</div>
                    </div>

                    <div style={{ background: (bulkPreflightData.historical_count > 0) ? "#eff6ff" : "#f8fafc", border: `1px solid ${(bulkPreflightData.historical_count > 0) ? "#bfdbfe" : "var(--border-color)"}`, borderRadius: "8px", padding: "10px 6px", textAlign: "center" }}>
                      <div style={{ fontSize: "18px", fontWeight: 700, color: (bulkPreflightData.historical_count > 0) ? "#1d4ed8" : "var(--text-muted)" }}>
                        {bulkPreflightData.historical_count || 0}
                      </div>
                      <div style={{ fontSize: "11px", color: (bulkPreflightData.historical_count > 0) ? "#1d4ed8" : "var(--text-muted)", marginTop: "2px", fontWeight: 600 }}>Historical Preserved</div>
                    </div>

                    <div style={{ background: (bulkPreflightData.blocked_active_count > 0) ? "#fef2f2" : "#f8fafc", border: `1px solid ${(bulkPreflightData.blocked_active_count > 0) ? "#fecaca" : "var(--border-color)"}`, borderRadius: "8px", padding: "10px 6px", textAlign: "center" }}>
                      <div style={{ fontSize: "18px", fontWeight: 700, color: (bulkPreflightData.blocked_active_count > 0) ? "#dc2626" : "var(--text-muted)" }}>
                        {bulkPreflightData.blocked_active_count || 0}
                      </div>
                      <div style={{ fontSize: "11px", color: (bulkPreflightData.blocked_active_count > 0) ? "#dc2626" : "var(--text-muted)", marginTop: "2px", fontWeight: 600 }}>Active Exam Blocked</div>
                    </div>
                  </div>

                  {/* Active Examination Protection Alert */}
                  {bulkPreflightData.blocked_active_count > 0 && (
                    <div className="alert alert-warning" style={{ marginBottom: "14px" }}>
                      <span>⚠️</span>
                      <div>
                        <strong>Active Examination Safeguard:</strong>
                        <p style={{ margin: "4px 0 0", fontSize: "12.5px" }}>
                          {bulkPreflightData.blocking_reason || `${bulkPreflightData.blocked_active_count} selected hall(s) are assigned to upcoming or in-progress examinations. Conclude or reallocate active examinations first, or use 'Deactivate Selected Halls'.`}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Historical Preservation Guarantee */}
                  {bulkPreflightData.blocked_active_count === 0 && (
                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "12px 14px", marginBottom: "14px" }}>
                      <div style={{ fontWeight: 600, color: "#166534", fontSize: "13px" }}>
                        🛡️ Historical Snapshot Preservation Guarantee
                      </div>
                      <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#14532d", lineHeight: 1.5 }}>
                        Removed halls will permanently disappear from active Examination Hall management and future exam scheduling pickers. All past examination seating arrangements, attendance sheets, and supervisor registers will be safely archived and continue to display original room information.
                      </p>
                    </div>
                  )}

                  {/* Hall Breakdown Table/List */}
                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--primary-navy)", marginBottom: "6px" }}>
                      Selected Examination Halls &amp; Dependency Status:
                    </div>
                    <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "8px", background: "#ffffff" }}>
                      {(bulkPreflightData.halls_preview || []).map((h) => {
                        const isSafe = h.category === "safe";
                        const isHist = h.category === "historical";
                        const isBlocked = h.category === "blocked_active";
                        return (
                          <div
                            key={h.hall_id}
                            style={{
                              padding: "8px 12px",
                              borderBottom: "1px solid #f1f5f9",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "8px",
                              background: isSafe ? "#ffffff" : isHist ? "#f8fafc" : "#fffbfb",
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--primary-navy)" }}>
                                Room {h.room_no || h.hall_name} <span style={{ color: "var(--text-muted)", fontSize: "11.5px", fontWeight: 400 }}>({h.hall_name})</span>
                              </div>
                              <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", marginTop: "2px" }}>
                                Capacity: {h.capacity} seats &bull; Grid: {h.rows_count} rows &times; {h.columns_count} cols
                              </div>
                              {h.blocking_reason && (
                                <div style={{ fontSize: "11.5px", color: "#dc2626", marginTop: "3px" }}>
                                  ⚠️ {h.blocking_reason}
                                </div>
                              )}
                              {h.preservation_info && (
                                <div style={{ fontSize: "11.5px", color: "#1d4ed8", marginTop: "3px" }}>
                                  ℹ️ {h.preservation_info}
                                </div>
                              )}
                            </div>
                            <span
                              style={{
                                fontSize: "11px",
                                padding: "2px 8px",
                                borderRadius: "10px",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                                background: isSafe ? "#dcfce7" : isHist ? "#dbeafe" : "#fee2e2",
                                color: isSafe ? "#15803d" : isHist ? "#1e40af" : "#b91c1c",
                              }}
                            >
                              {h.category_label || (isSafe ? "Safe to Delete" : isHist ? "Historical Preserved" : "Active Blocked")}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="modal-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowBulkDeleteModal(false);
                  setBulkPreflightData(null);
                  setBulkModalError("");
                }}
                disabled={bulkProcessing}
              >
                Cancel
              </button>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ background: "#475569", borderColor: "#334155" }}
                  onClick={() => handleExecuteBulkHalls("deactivate")}
                  disabled={checkingBulkPreflight || bulkProcessing}
                  title="Soft deactivation: keeps halls in database but disables future exam assignments"
                >
                  {bulkProcessing ? "Processing..." : `⏸️ Deactivate Selected Halls (${bulkPreflightData?.total_selected || selectedHallIds.length})`}
                </button>

                {bulkPreflightData?.blocked_active_count > 0 && ((bulkPreflightData.safe_count || 0) + (bulkPreflightData.historical_count || 0) > 0) && (
                  <button
                    type="button"
                    className="btn btn-warning"
                    style={{ background: "#f59e0b", color: "#ffffff", borderColor: "#d97706" }}
                    onClick={() => handleExecuteBulkHalls("delete", true)}
                    disabled={checkingBulkPreflight || bulkProcessing}
                    title="Permanently remove eligible halls without active exams, preserving history"
                  >
                    {bulkProcessing ? "Processing..." : `Remove Eligible Only (${(bulkPreflightData.safe_count || 0) + (bulkPreflightData.historical_count || 0)})`}
                  </button>
                )}

                {bulkPreflightData?.can_permanently_remove && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => handleExecuteBulkHalls("delete")}
                    disabled={checkingBulkPreflight || bulkProcessing}
                  >
                    {bulkProcessing ? "Removing..." : `🗑️ Permanently Remove & Preserve History (${bulkPreflightData.total_selected || selectedHallIds.length})`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: ADD / EDIT EXAMINATION HALL
         ========================================================= */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "560px", width: "95%" }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingHall ? "✏️ Edit Examination Hall" : "➕ Add Examination Hall"}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div className="form-group">
                  <label style={{ fontWeight: 600, fontSize: "13px", color: "var(--primary-navy)", marginBottom: "4px", display: "block" }}>
                    Hall Name / Identifier *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. HALL 101, AUDITORIUM, CSE LAB 1"
                    value={hallName}
                    onChange={(e) => setHallName(e.target.value.toUpperCase())}
                    required
                    disabled={saving}
                  />
                  <small style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "2px", display: "block" }}>
                    Descriptive display name for notifications and schedules.
                  </small>
                </div>

                <div className="form-group">
                  <label style={{ fontWeight: 600, fontSize: "13px", color: "var(--primary-navy)", marginBottom: "4px", display: "block" }}>
                    Hall Code / Room Number *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 101, A-204, LAB-03"
                    value={roomNo}
                    onChange={(e) => setRoomNo(e.target.value)}
                    required
                    disabled={saving}
                  />
                  <small style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "2px", display: "block" }}>
                    Used on student seating charts, door slips, and invigilator sheets.
                  </small>
                </div>

                <div className="form-group">
                  <label style={{ fontWeight: 600, fontSize: "13px", color: "var(--primary-navy)", marginBottom: "4px", display: "block" }}>
                    Total Usable Seating Capacity * (Entered Manually)
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    min="1"
                    max="1000"
                    placeholder="e.g. 48"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    required
                    disabled={saving}
                  />
                  <small style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "2px", display: "block" }}>
                    Actual physical student seating capacity.
                  </small>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label style={{ fontWeight: 600, fontSize: "13px", color: "var(--primary-navy)", marginBottom: "4px", display: "block" }}>
                      Number of Rows
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      min="1"
                      max="50"
                      value={rowsCount}
                      onChange={(e) => setRowsCount(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontWeight: 600, fontSize: "13px", color: "var(--primary-navy)", marginBottom: "4px", display: "block" }}>
                      Number of Columns
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      min="1"
                      max="50"
                      value={columnsCount}
                      onChange={(e) => setColumnsCount(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </div>

                {/* Seating Layout Grid Preview */}
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "10px 12px", fontSize: "12.5px" }}>
                  <span style={{ fontWeight: 600, color: "var(--primary-navy)" }}>📐 Seating Layout Grid: </span>
                  <span style={{ color: "#334155" }}>
                    {rowsCount} rows &times; {columnsCount} columns = <strong>{(parseInt(rowsCount, 10) || 0) * (parseInt(columnsCount, 10) || 0)} grid spots</strong>
                  </span>
                  {parseInt(capacity, 10) > (parseInt(rowsCount, 10) || 0) * (parseInt(columnsCount, 10) || 0) && (
                    <div style={{ color: "#b45309", marginTop: "4px", fontSize: "12px" }}>
                      ⚠️ Note: Specified capacity ({capacity}) exceeds grid capacity ({(parseInt(rowsCount, 10) || 0) * (parseInt(columnsCount, 10) || 0)}). Extra seats will be accommodated dynamically.
                    </div>
                  )}
                </div>

                {/* Active Checkbox */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    id="hall-active-toggle"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    disabled={saving}
                    style={{ cursor: "pointer", accentColor: "var(--primary-navy)" }}
                  />
                  <label htmlFor="hall-active-toggle" style={{ fontSize: "13px", fontWeight: 600, color: "var(--primary-navy)", cursor: "pointer" }}>
                    Active and available for automated examination scheduling
                  </label>
                </div>
              </div>

              <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "14px 20px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-navy" disabled={saving}>
                  {saving ? "Saving..." : (editingHall ? "Save Changes" : "Create Examination Hall")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: UPLOAD & IMPORT HALL CAPACITY DATA
         ========================================================= */}
      {uploadModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "780px", width: "95%" }}>
            <div className="modal-header">
              <h3 className="modal-title">📥 Upload Hall Capacity Data</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setUploadModalOpen(false)}
                disabled={parsing || importing}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div style={{ marginBottom: "16px" }}>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 10px" }}>
                  Upload an Excel (.xlsx/.xls) or CSV file containing Hall Name, Room Number, Usable Capacity, and optional Row/Column counts.
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  disabled={parsing || importing}
                  className="form-control"
                  style={{ padding: "8px" }}
                />
              </div>

              {parsing && (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <p>⏳ Parsing hall data file...</p>
                </div>
              )}

              {uploadError && (
                <div className="alert alert-danger" style={{ marginBottom: "14px" }}>
                  <span>⚠️</span>
                  <span>{uploadError}</span>
                </div>
              )}

              {uploadSummary && (
                <div className="alert alert-info" style={{ marginBottom: "14px" }}>
                  <span>ℹ️</span>
                  <span>{uploadSummary}</span>
                </div>
              )}

              {previewHalls.length > 0 && (
                <div>
                  <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--primary-navy)", marginBottom: "8px" }}>
                    Preview &amp; Validate Halls ({previewHalls.length})
                  </h4>
                  <div style={{ maxHeight: "240px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "6px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc", textAlign: "left", color: "#475569" }}>
                          <th style={{ padding: "6px 10px" }}>Hall Name</th>
                          <th style={{ padding: "6px 10px" }}>Room No</th>
                          <th style={{ padding: "6px 10px" }}>Capacity</th>
                          <th style={{ padding: "6px 10px" }}>Grid (Rows &times; Cols)</th>
                          <th style={{ padding: "6px 10px" }}>Status</th>
                          <th style={{ padding: "6px 10px", textAlign: "right" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewHalls.map((item) => (
                          <tr key={item.temp_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "6px 10px" }}>
                              <input
                                type="text"
                                className="form-control"
                                value={item.hall_name}
                                onChange={(e) => updatePreviewItem(item.temp_id, "hall_name", e.target.value)}
                                style={{ padding: "2px 6px", fontSize: "12px", width: "110px" }}
                              />
                            </td>
                            <td style={{ padding: "6px 10px" }}>
                              <input
                                type="text"
                                className="form-control"
                                value={item.room_no}
                                onChange={(e) => updatePreviewItem(item.temp_id, "room_no", e.target.value)}
                                style={{ padding: "2px 6px", fontSize: "12px", width: "90px" }}
                              />
                            </td>
                            <td style={{ padding: "6px 10px" }}>
                              <input
                                type="number"
                                className="form-control"
                                value={item.capacity}
                                onChange={(e) => updatePreviewItem(item.temp_id, "capacity", e.target.value)}
                                style={{ padding: "2px 6px", fontSize: "12px", width: "70px" }}
                              />
                            </td>
                            <td style={{ padding: "6px 10px" }}>
                              {item.rows_count} &times; {item.columns_count}
                            </td>
                            <td style={{ padding: "6px 10px" }}>
                              {item.is_valid ? (
                                <span style={{ color: "#16a34a", fontWeight: 600 }}>Valid</span>
                              ) : (
                                <span style={{ color: "#dc2626", fontWeight: 600 }}>{item.error || "Invalid"}</span>
                              )}
                            </td>
                            <td style={{ padding: "6px 10px", textAlign: "right" }}>
                              <button
                                type="button"
                                style={{ border: "none", background: "none", color: "#dc2626", cursor: "pointer", fontSize: "14px" }}
                                onClick={() => removePreviewItem(item.temp_id)}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "14px 20px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setUploadModalOpen(false)}
                disabled={importing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-navy"
                onClick={handleConfirmImport}
                disabled={importing || previewHalls.length === 0}
              >
                {importing ? "Importing..." : `Confirm & Import (${previewHalls.length}) Halls`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
