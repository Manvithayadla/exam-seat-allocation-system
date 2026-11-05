import { useState, useEffect } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function SeatSearch({ initialExamId }) {
  const { user, isStudent } = useAuth();
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState(
    initialExamId ? String(initialExamId) : ""
  );

  // Derive hall ticket if student
  const studentHallTicket = isStudent
    ? (user?.email?.split("@")[0] || "").toUpperCase()
    : "";

  const [hallTicketNo, setHallTicketNo] = useState(studentHallTicket);
  const [loading, setLoading] = useState(false);
  const [seatData, setSeatData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getExams()
      .then((data) => {
        const loadedExams = Array.isArray(data.exams) ? data.exams : [];
        setExams(loadedExams);
        if (!examId && loadedExams.length > 0) {
          setExamId(String(loadedExams[0].exam_id));
        }
      })
      .catch((err) => console.warn("Could not load exams list:", err));
  }, []);

  useEffect(() => {
    if (initialExamId) {
      setExamId(String(initialExamId));
    }
  }, [initialExamId]);

  // Sync hall ticket if student logs in
  useEffect(() => {
    if (isStudent && studentHallTicket) {
      setHallTicketNo(studentHallTicket);
    }
  }, [isStudent, studentHallTicket]);

  // If student and both inputs present, auto search
  useEffect(() => {
    if (isStudent && hallTicketNo && examId) {
      performSearch(hallTicketNo, examId);
    }
  }, [isStudent, hallTicketNo, examId]);

  async function performSearch(ht, ex) {
    const searchHt = (ht || hallTicketNo).trim();
    const searchEx = (ex || examId).trim();

    if (!searchHt) {
      setError("Please enter a valid hall ticket number.");
      return;
    }
    if (!searchEx) {
      setError("Please select an examination.");
      return;
    }

    setLoading(true);
    setError("");
    setSeatData(null);

    try {
      const data = await api.getStudentSeat(searchHt, searchEx);
      setSeatData(data);
    } catch (err) {
      setError(
        err.message ||
          "Seat not found. Ensure the student is registered and seats have been allocated."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    performSearch(hallTicketNo, examId);
  }

  function formatExamDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  return (
    <div className="seat-search-page">
      <header className="page-header">
        <div>
          <div
            style={{
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "var(--accent-blue, #2563eb)",
              fontWeight: 700,
              marginBottom: "4px",
            }}
          >
            Siddhartha Academy of Higher Education
          </div>
          <h1>Student Seat Allotment Search</h1>
          <p>
            {isStudent
              ? "View your verified examination hall and seat allocation details."
              : "Search individual student examination seat coordinates."}
          </p>
        </div>
      </header>

      {/* Search Input Panel */}
      <section className="panel search-panel">
        <form onSubmit={handleFormSubmit} className="search-form-row">
          <div className="control-group">
            <label htmlFor="search-exam-id">Examination Session</label>
            <select
              id="search-exam-id"
              value={examId}
              onChange={(e) => {
                setExamId(e.target.value);
                setError("");
                setSeatData(null);
              }}
              disabled={loading}
              required
            >
              <option value="">Select examination session</option>
              {exams.map((exam) => (
                <option key={exam.exam_id} value={exam.exam_id}>
                  {exam.subject_code} — {exam.subject_name} ({exam.session})
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="search-hallticket">
              Hall Ticket Number {isStudent && <span className="locked-badge">🔒 Locked</span>}
            </label>
            <input
              id="search-hallticket"
              type="text"
              placeholder="e.g. 24EU04263"
              value={hallTicketNo}
              onChange={(e) => {
                if (!isStudent) setHallTicketNo(e.target.value.toUpperCase());
              }}
              disabled={loading || isStudent}
              readOnly={isStudent}
              required
            />
            {isStudent && (
              <small className="field-hint">
                Restricted to your registered student credential ({studentHallTicket}).
              </small>
            )}
          </div>

          <button
            type="submit"
            className="search-btn-primary"
            disabled={loading || !hallTicketNo.trim() || !examId}
          >
            {loading ? "Searching..." : "🔍 Find Allotted Seat"}
          </button>
        </form>

        {error && <div className="allocation-error">{error}</div>}
      </section>

      {/* Official Seat Allotment Card */}
      {seatData && (
        <section className="seat-allotment-result">
          <div className="seat-card">
            <div className="seat-card-top">
              <div>
                <div style={{ fontSize: "11px", letterSpacing: "0.8px", textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>
                  Siddhartha Academy of Higher Education
                </div>
                <div className="seat-card-badge" style={{ marginTop: "2px" }}>🎓 OFFICIAL ALLOTMENT SLIP</div>
              </div>
              <span className="seat-verified-stamp">✓ VERIFIED & ALLOCATED</span>
            </div>

            <div className="seat-card-grid">
              {/* Student Details */}
              <div className="seat-card-col">
                <span className="card-section-title">CANDIDATE INFORMATION</span>
                <div className="card-info-row">
                  <span className="label">Student Name:</span>
                  <strong className="value">{seatData.student?.name}</strong>
                </div>
                <div className="card-info-row">
                  <span className="label">Hall Ticket No:</span>
                  <strong className="value highlight">{seatData.student?.hall_ticket_no}</strong>
                </div>
                <div className="card-info-row">
                  <span className="label">Department:</span>
                  <strong className="value">{seatData.student?.department}</strong>
                </div>
              </div>

              {/* Exam Details */}
              <div className="seat-card-col">
                <span className="card-section-title">EXAMINATION DETAILS</span>
                <div className="card-info-row">
                  <span className="label">Course Code:</span>
                  <strong className="value">{seatData.exam?.subject_code}</strong>
                </div>
                <div className="card-info-row">
                  <span className="label">Subject:</span>
                  <strong className="value">{seatData.exam?.subject_name}</strong>
                </div>
                <div className="card-info-row">
                  <span className="label">Exam Date:</span>
                  <strong className="value">{formatExamDate(seatData.exam?.exam_date)}</strong>
                </div>
                <div className="card-info-row">
                  <span className="label">Session:</span>
                  <strong className="value">
                    {seatData.exam?.session === "FN"
                      ? "Forenoon (FN: 09:30 AM - 12:30 PM)"
                      : "Afternoon (AN: 01:30 PM - 04:30 PM)"}
                  </strong>
                </div>
              </div>

              {/* Seating Location Big Display */}
              <div className="seat-card-col allotment-big-col">
                <span className="card-section-title">ASSIGNED SEAT LOCATION</span>
                <div className="hall-name-display">
                  HALL {seatData.seat?.hall_name}
                </div>
                <div className="seat-coords-badge">
                  <span>Row: <strong>{seatData.seat?.row}</strong></span>
                  <span className="divider">·</span>
                  <span>Column: <strong>{seatData.seat?.column}</strong></span>
                </div>
                <small className="physical-seat-id">
                  Physical Seat ID: #{seatData.seat?.seat_id}
                </small>
              </div>
            </div>

            <div className="seat-card-footer">
              <p>
                ⚠️ Please occupy your allotted seat at least 15 minutes before the examination starts.
                Possession of unauthorized electronic devices or adjacent peer collusion is strictly prohibited.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
