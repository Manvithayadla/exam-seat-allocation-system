import { useState } from "react";
import api from "../services/api";

export default function SupplementaryModal({
  isOpen,
  onClose,
  examId,
  examName,
  onSuccess,
}) {
  const [hallTicketNo, setHallTicketNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!hallTicketNo.trim()) {
      setError("Please enter a valid hall ticket number.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await api.registerSupplementary(examId, hallTicketNo);
      setResult(response);
      setHallTicketNo("");
      if (onSuccess) onSuccess(response);
    } catch (err) {
      setError(err.message || "Failed to allocate supplementary seat.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setHallTicketNo("");
    setError("");
    setResult(null);
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <h3>Register Supplementary Seat</h3>
            <p className="modal-subtitle">
              Exam: <strong>{examName || `#${examId}`}</strong>
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={handleClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <p className="modal-description">
            Safely allocates an unoccupied seat without altering or recalculating the
            seating arrangements of already allocated students. Enforces same-department
            adjacency constraints.
          </p>

          <label htmlFor="suppl-hall-ticket">Student Hall Ticket Number</label>
          <input
            id="suppl-hall-ticket"
            type="text"
            placeholder="e.g. 24EU04263"
            value={hallTicketNo}
            onChange={(e) => {
              setHallTicketNo(e.target.value.toUpperCase());
              setError("");
            }}
            disabled={loading}
            required
            autoFocus
          />

          {error && <div className="modal-alert-error">{error}</div>}

          {result && (
            <div className="modal-alert-success">
              <strong>Seat Successfully Allocated!</strong>
              <div className="suppl-result-details">
                <p>
                  Student: <strong>{result.student?.name}</strong> (
                  {result.student?.hall_ticket_no} - {result.student?.department})
                </p>
                <p>
                  Assigned: <strong>{result.seat?.hall_name}</strong> · Row{" "}
                  <strong>{result.seat?.row}</strong> · Column{" "}
                  <strong>{result.seat?.column}</strong>
                </p>
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="modal-btn-secondary"
              onClick={handleClose}
              disabled={loading}
            >
              {result ? "Done" : "Cancel"}
            </button>
            {!result && (
              <button
                type="submit"
                className="modal-btn-primary"
                disabled={loading || !hallTicketNo.trim()}
              >
                {loading ? "Allocating Seat..." : "Allocate Safe Seat"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
