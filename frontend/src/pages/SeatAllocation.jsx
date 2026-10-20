
import { useEffect, useState } from "react";

const API_URL = "http://127.0.0.1:5000";

export default function SeatAllocation() {
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");
  const [allocations, setAllocations] = useState([]);
  const [selectedHalls, setSelectedHalls] = useState([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [allocating, setAllocating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/exams`)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load examinations.");
        return response.json();
      })
      .then((data) => setExams(data.exams || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingExams(false));
  }, []);

  async function handleAllocate(event) {
    event.preventDefault();
    if (!examId) {
      setError("Please select an examination.");
      return;
    }

    setAllocating(true);
    setError("");
    setMessage("");
    setAllocations([]);
    setSelectedHalls([]);

    try {
      const response = await fetch(`${API_URL}/allocate-seats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam_id: Number(examId) }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Seat allocation failed.");
      }

      setAllocations(data.allocations || []);
      setSelectedHalls(data.selected_halls || []);
      setMessage(data.message || "Seat allocation completed successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setAllocating(false);
    }
  }

  const selectedExam = exams.find(
    (exam) => String(exam.exam_id) === String(examId)
  );

  return (
    <div className="allocation-page">
      <header className="allocation-header">
        <div>
          <h1>Seat Allocation</h1>
          <p>Generate and review examination seating arrangements.</p>
        </div>
      </header>

      <section className="panel allocation-form-panel">
        <h3>Generate Seating Plan</h3>
        <p className="panel-subtitle">
          Select an examination to allocate seats to registered students.
        </p>

        <form className="allocation-form" onSubmit={handleAllocate}>
          <label htmlFor="exam-select">Select Examination</label>
          <select
            id="exam-select"
            value={examId}
            onChange={(event) => {
              setExamId(event.target.value);
              setAllocations([]);
              setSelectedHalls([]);
              setMessage("");
              setError("");
            }}
            disabled={loadingExams || allocating}
            required
          >
            <option value="">
              {loadingExams ? "Loading examinations..." : "Choose an exam"}
            </option>
            {exams.map((exam) => (
              <option key={exam.exam_id} value={exam.exam_id}>
                {exam.subject_code} — {exam.subject_name} (
                {exam.session})
              </option>
            ))}
          </select>

          {selectedExam && (
            <p className="selected-exam-info">
              Exam ID: {selectedExam.exam_id} · Date:{" "}
              {String(selectedExam.exam_date).slice(0, 10)} · Session:{" "}
              {selectedExam.session}
            </p>
          )}

          <button
            className="allocate-button"
            type="submit"
            disabled={!examId || allocating || loadingExams}
          >
            {allocating ? "Allocating Seats..." : "Generate Seat Allocation"}
          </button>
        </form>

        {error && <div className="allocation-error">{error}</div>}
        {message && <div className="allocation-success">{message}</div>}
      </section>

      {allocations.length > 0 && (
        <>
          <section className="allocation-stats">
            <div className="panel allocation-stat">
              <span>Total Allocated</span>
              <strong>{allocations.length}</strong>
            </div>
            <div className="panel allocation-stat">
              <span>Halls Selected</span>
              <strong>{selectedHalls.length}</strong>
            </div>
            <div className="panel allocation-stat">
              <span>Examination</span>
              <strong>{selectedExam?.subject_code || `#${examId}`}</strong>
            </div>
          </section>

          <section className="panel allocation-results">
            <h3>Selected Halls</h3>
            <div className="hall-chips">
              {selectedHalls.map((hall) => (
                <span key={hall.hall_name} className="hall-chip">
                  {hall.hall_name} · Capacity {hall.capacity}
                </span>
              ))}
            </div>

            <h3 className="allocation-table-title">Student Seating Plan</h3>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Hall Ticket</th>
                    <th>Student Name</th>
                    <th>Department</th>
                    <th>Hall</th>
                    <th>Row</th>
                    <th>Column</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((student, index) => (
                    <tr
                      key={`${student.hall_ticket_no}-${index}`}
                    >
                      <td>{student.hall_ticket_no}</td>
                      <td>{student.student_name}</td>
                      <td>{student.department}</td>
                      <td>{student.hall_name}</td>
                      <td>{student.row}</td>
                      <td>{student.column}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
