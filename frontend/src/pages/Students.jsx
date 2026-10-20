
import { useEffect, useState } from "react";

const API_URL = "http://127.0.0.1:5000";

export default function Students() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/students`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load students");
        }
        return response.json();
      })
      .then((data) => setStudents(data.students || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredStudents = students.filter((student) =>
    [
      student.hall_ticket_no,
      student.name,
      student.department,
      student.section,
    ].some((value) =>
      String(value ?? "").toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <div className="students-page">
      <div className="students-header">
        <div>
          <h1>Students</h1>
          <p>View and search registered student records.</p>
        </div>
        <div className="student-count">
          Total Students <strong>{students.length}</strong>
        </div>
      </div>

      <div className="students-panel">
        <div className="students-toolbar">
          <input
            type="search"
            placeholder="Search by name, hall ticket, department..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span>{filteredStudents.length} records</span>
        </div>

        {loading && <p>Loading students...</p>}
        {error && <p className="students-error">{error}</p>}

        {!loading && !error && (
          <div className="students-table-wrapper">
            <table className="students-table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Hall Ticket Number</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Year</th>
                  <th>Section</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.student_id}>
                    <td>{student.student_id}</td>
                    <td>{student.hall_ticket_no}</td>
                    <td>{student.name}</td>
                    <td>
                      <span className="department-tag">
                        {student.department}
                      </span>
                    </td>
                    <td>{student.year}</td>
                    <td>{student.section}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredStudents.length === 0 && (
              <p className="students-empty">No matching students found.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
