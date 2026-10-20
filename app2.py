from flask import Flask, jsonify, request
from flask_cors import CORS
from db import get_db_connection
import pandas as pd
import heapq

app = Flask(__name__)
CORS(app)


# =========================================================
# HOME
# =========================================================


@app.route("/")
def home():
    return jsonify({"message": "Smart Exam System Backend is Running"})


# =========================================================
# TEST DATABASE CONNECTION
# =========================================================


@app.route("/test-db")
def test_db():
    connection = get_db_connection()

    try:
        if connection.is_connected():
            return jsonify({"message": "Database connected successfully"})

        return jsonify({"message": "Database connection failed"}), 500

    finally:
        connection.close()


# =========================================================
# UPLOAD STUDENTS CSV
# =========================================================


@app.route("/upload-students", methods=["POST"])
def upload_students():

    file = request.files.get("file")

    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    connection = None
    cursor = None

    try:
        df = pd.read_csv(file)

        required_columns = ["hall_ticket_no", "name", "department", "year", "section"]

        for column in required_columns:
            if column not in df.columns:
                return jsonify({"error": f"Missing column: {column}"}), 400

        connection = get_db_connection()
        cursor = connection.cursor()

        inserted = 0
        skipped = 0

        for _, row in df.iterrows():
            try:
                cursor.execute(
                    """
                    INSERT INTO students
                    (hall_ticket_no, name, department, year, section)
                    VALUES (%s, %s, %s, %s, %s)
                """,
                    (
                        row["hall_ticket_no"],
                        row["name"],
                        row["department"],
                        row["year"],
                        row["section"],
                    ),
                )

                inserted += 1

            except Exception:
                skipped += 1

        connection.commit()

        return jsonify(
            {
                "message": "Student data processed successfully",
                "inserted": inserted,
                "skipped": skipped,
            }
        )

    except Exception as e:
        if connection and connection.is_connected():
            connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:
        if cursor:
            cursor.close()

        if connection and connection.is_connected():
            connection.close()


# =========================================================
# STEP 6: SMART SEAT ALLOCATION
# =========================================================


@app.route("/allocate-seats", methods=["POST"])
def allocate_seats():

    data = request.get_json(silent=True) or {}
    exam_id = data.get("exam_id")

    if not exam_id:
        return jsonify({"error": "exam_id is required"}), 400

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # 1. Get registered students and subject details
        cursor.execute(
            """
            SELECT
                s.student_id,
                s.hall_ticket_no,
                s.name,
                s.department,
                sub.subject_code,
                sub.subject_name
            FROM students s
            JOIN exam_registrations er
                ON s.student_id = er.student_id
            JOIN exam_sessions es
                ON er.exam_id = es.exam_id
            JOIN subjects sub
                ON es.subject_id = sub.subject_id
            WHERE er.exam_id = %s
            ORDER BY s.student_id
        """,
            (exam_id,),
        )

        students = cursor.fetchall()

        if not students:
            return jsonify({"error": "No students registered for this exam"}), 400

        # 2. Select halls by descending capacity
        cursor.execute("""
            SELECT hall_id, hall_name, capacity
            FROM halls
            ORDER BY capacity DESC, hall_id
        """)

        halls = cursor.fetchall()

        selected_halls = []
        total_capacity = 0

        for hall in halls:
            selected_halls.append(hall)
            total_capacity += hall["capacity"]

            if total_capacity >= len(students):
                break

        if total_capacity < len(students):
            return jsonify({"error": "Not enough hall capacity available"}), 400

        # 3. Get physical seats in selected halls
        hall_ids = [hall["hall_id"] for hall in selected_halls]
        placeholders = ",".join(["%s"] * len(hall_ids))

        cursor.execute(
            f"""
            SELECT seat_id, hall_id, row_no, column_no
            FROM seats
            WHERE hall_id IN ({placeholders})
            ORDER BY hall_id, row_no, column_no
        """,
            tuple(hall_ids),
        )

        seats = cursor.fetchall()

        if len(seats) < len(students):
            return (
                jsonify({"error": "Not enough generated seats in selected halls"}),
                400,
            )

        # 4. Replace previous allocations for this exam
        cursor.execute(
            """
            DELETE FROM seat_allocations
            WHERE exam_id = %s
        """,
            (exam_id,),
        )

        # 5. Group students by department
        groups = {}

        for student in students:
            department = student["department"]

            if department not in groups:
                groups[department] = []

            groups[department].append(student)

        # 6. Largest-group-first heap
        heap = []

        for department, group in groups.items():
            heapq.heappush(heap, (-len(group), department))

        ordered_students = []

        while heap:
            _, department = heapq.heappop(heap)

            student = groups[department].pop(0)
            ordered_students.append(student)

            if groups[department]:
                heapq.heappush(heap, (-len(groups[department]), department))

        # 7. Check neighbouring seats
        def is_safe(seat, department, assigned):

            for previous in assigned:

                if previous["hall_id"] != seat["hall_id"]:
                    continue

                row_difference = abs(previous["row_no"] - seat["row_no"])

                column_difference = abs(previous["column_no"] - seat["column_no"])

                if (
                    row_difference <= 1
                    and column_difference <= 1
                    and previous["department"] == department
                ):
                    return False

            return True

        # 8. Allocate seats
        assigned = []
        allocations = []

        for student in ordered_students:

            selected_seat = None

            for seat in seats:
                if is_safe(seat, student["department"], assigned):
                    selected_seat = seat
                    break

            # Fallback if no safe seat remains
            if selected_seat is None:
                selected_seat = seats[0]

            seats.remove(selected_seat)

            assigned.append(
                {
                    "hall_id": selected_seat["hall_id"],
                    "row_no": selected_seat["row_no"],
                    "column_no": selected_seat["column_no"],
                    "department": student["department"],
                }
            )

            cursor.execute(
                """
                INSERT INTO seat_allocations
                (student_id, exam_id, seat_id)
                VALUES (%s, %s, %s)
            """,
                (student["student_id"], exam_id, selected_seat["seat_id"]),
            )

            hall_name = next(
                hall["hall_name"]
                for hall in selected_halls
                if hall["hall_id"] == selected_seat["hall_id"]
            )

            allocations.append(
                {
                    "hall_name": hall_name,
                    "hall_id": selected_seat["hall_id"],
                    "row": selected_seat["row_no"],
                    "column": selected_seat["column_no"],
                    "hall_ticket_no": student["hall_ticket_no"],
                    "student_name": student["name"],
                    "department": student["department"],
                    "subject_code": student["subject_code"],
                    "subject_name": student["subject_name"],
                }
            )

        connection.commit()

        return jsonify(
            {
                "message": "Smart seats allocated successfully",
                "total_students": len(students),
                "selected_halls": [
                    {"hall_name": hall["hall_name"], "capacity": hall["capacity"]}
                    for hall in selected_halls
                ],
                "allocations": allocations,
            }
        )

    except Exception as e:
        if connection and connection.is_connected():
            connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:
        if cursor:
            cursor.close()

        if connection and connection.is_connected():
            connection.close()


# =========================================================
# STEP 7: INVIGILATOR ASSIGNMENT
# MIN-HEAP GREEDY + AVAILABILITY CONSTRAINTS
# =========================================================


@app.route("/assign-invigilators", methods=["POST"])
def assign_invigilators():

    data = request.get_json(silent=True) or {}
    exam_id = data.get("exam_id")

    if not exam_id:
        return jsonify({"error": "exam_id is required"}), 400

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # 1. Get exam date and session
        cursor.execute(
            """
            SELECT exam_id, exam_date, session
            FROM exam_sessions
            WHERE exam_id = %s
        """,
            (exam_id,),
        )

        exam = cursor.fetchone()

        if not exam:
            return jsonify({"error": "Exam not found"}), 404

        exam_date = exam["exam_date"]
        exam_session = exam["session"]

        # 2. Find halls that have seats allocated for this exam
        cursor.execute(
            """
            SELECT DISTINCT
                h.hall_id,
                h.hall_name,
                h.capacity
            FROM seat_allocations sa
            JOIN seats s
                ON sa.seat_id = s.seat_id
            JOIN halls h
                ON s.hall_id = h.hall_id
            WHERE sa.exam_id = %s
            ORDER BY h.hall_id
        """,
            (exam_id,),
        )

        selected_halls = cursor.fetchall()

        if not selected_halls:
            return (
                jsonify(
                    {
                        "error": "Allocate seats for this exam before assigning invigilators"
                    }
                ),
                400,
            )

        # 3. Remove previous assignments for this exam.
        # They will be restored if the transaction fails.
        cursor.execute(
            """
            DELETE FROM invigilator_assignments
            WHERE exam_id = %s
        """,
            (exam_id,),
        )

        # 4. Get available faculty and their current duty counts.
        # Exclude anyone already assigned to another exam
        # in the same date and session.
        cursor.execute(
            """
            SELECT
                f.faculty_id,
                f.faculty_name,
                f.department,
                COUNT(all_duties.assignment_id) AS duty_count
            FROM faculty f
            JOIN faculty_availability fa
                ON fa.faculty_id = f.faculty_id
            LEFT JOIN invigilator_assignments all_duties
                ON all_duties.faculty_id = f.faculty_id
            WHERE fa.exam_date = %s
              AND fa.session = %s
              AND fa.is_available = TRUE
              AND NOT EXISTS (
                  SELECT 1
                  FROM invigilator_assignments existing
                  JOIN exam_sessions other_exam
                      ON existing.exam_id = other_exam.exam_id
                  WHERE existing.faculty_id = f.faculty_id
                    AND other_exam.exam_date = %s
                    AND other_exam.session = %s
                    AND existing.exam_id <> %s
              )
            GROUP BY
                f.faculty_id,
                f.faculty_name,
                f.department
            ORDER BY f.faculty_id
        """,
            (exam_date, exam_session, exam_date, exam_session, exam_id),
        )

        eligible_faculty = cursor.fetchall()

        if len(eligible_faculty) < len(selected_halls):
            connection.rollback()

            return (
                jsonify(
                    {
                        "error": "Not enough available faculty to supervise all selected halls",
                        "required_invigilators": len(selected_halls),
                        "available_faculty": len(eligible_faculty),
                    }
                ),
                400,
            )

        # 5. Build a min-heap.
        # Lowest duty count is selected first.
        faculty_heap = []

        for faculty in eligible_faculty:
            heapq.heappush(
                faculty_heap, (faculty["duty_count"], faculty["faculty_id"], faculty)
            )

        # 6. Assign one invigilator per hall
        assignments = []

        for hall in selected_halls:

            duty_count, faculty_id, faculty = heapq.heappop(faculty_heap)

            cursor.execute(
                """
                INSERT INTO invigilator_assignments
                    (faculty_id, exam_id, hall_id)
                VALUES (%s, %s, %s)
            """,
                (faculty_id, exam_id, hall["hall_id"]),
            )

            assignments.append(
                {
                    "faculty_id": faculty_id,
                    "faculty_name": faculty["faculty_name"],
                    "faculty_department": faculty["department"],
                    "previous_duty_count": duty_count,
                    "exam_id": exam_id,
                    "exam_date": exam_date.isoformat(),
                    "session": exam_session,
                    "hall_id": hall["hall_id"],
                    "hall_name": hall["hall_name"],
                }
            )

        connection.commit()

        return jsonify(
            {
                "message": "Invigilators assigned successfully",
                "exam_id": exam_id,
                "exam_date": exam_date.isoformat(),
                "session": exam_session,
                "total_halls": len(selected_halls),
                "total_invigilators": len(assignments),
                "assignments": assignments,
            }
        )

    except Exception as e:
        if connection and connection.is_connected():
            connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:
        if cursor:
            cursor.close()

        if connection and connection.is_connected():
            connection.close()


# =========================================================
# RUN APPLICATION
# =========================================================

# =========================================================
# STEP 8: CONFLICT DETECTION
# =========================================================


@app.route("/check-conflicts", methods=["POST"])
def check_conflicts():

    data = request.get_json(silent=True) or {}
    exam_id = data.get("exam_id")

    if not exam_id:
        return jsonify({"error": "exam_id is required"}), 400

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # 1. Detect adjacent students from the same department
        cursor.execute(
            """
            SELECT
                s1.name AS student_1,
                s1.department AS department,
                h.hall_name,
                se1.row_no AS row_1,
                se1.column_no AS column_1,
                s2.name AS student_2,
                se2.row_no AS row_2,
                se2.column_no AS column_2
            FROM seat_allocations sa1
            JOIN seat_allocations sa2
                ON sa1.exam_id = sa2.exam_id
               AND sa1.student_id < sa2.student_id
            JOIN students s1
                ON sa1.student_id = s1.student_id
            JOIN students s2
                ON sa2.student_id = s2.student_id
            JOIN seats se1
                ON sa1.seat_id = se1.seat_id
            JOIN seats se2
                ON sa2.seat_id = se2.seat_id
            JOIN halls h
                ON se1.hall_id = h.hall_id
            WHERE sa1.exam_id = %s
              AND sa2.exam_id = %s
              AND se1.hall_id = se2.hall_id
              AND ABS(se1.row_no - se2.row_no) <= 1
              AND ABS(se1.column_no - se2.column_no) <= 1
              AND (
                  se1.row_no <> se2.row_no
                  OR se1.column_no <> se2.column_no
              )
              AND s1.department = s2.department
        """,
            (exam_id, exam_id),
        )

        seating_conflicts = cursor.fetchall()

        # 2. Detect faculty assigned to multiple halls
        # during the same date and session.
        cursor.execute(
            """
            SELECT
                f.faculty_name,
                es.exam_date,
                es.session,
                COUNT(*) AS hall_count,
                GROUP_CONCAT(
                    DISTINCT h.hall_name
                    ORDER BY h.hall_name
                ) AS halls
            FROM invigilator_assignments ia
            JOIN faculty f
                ON ia.faculty_id = f.faculty_id
            JOIN exam_sessions es
                ON ia.exam_id = es.exam_id
            JOIN halls h
                ON ia.hall_id = h.hall_id
            WHERE es.exam_date = (
                SELECT exam_date
                FROM exam_sessions
                WHERE exam_id = %s
            )
              AND es.session = (
                SELECT session
                FROM exam_sessions
                WHERE exam_id = %s
            )
            GROUP BY
                ia.faculty_id,
                f.faculty_name,
                es.exam_date,
                es.session
            HAVING COUNT(DISTINCT ia.hall_id) > 1
        """,
            (exam_id, exam_id),
        )

        invigilator_conflicts = cursor.fetchall()

        # 3. Detect assignments to unavailable faculty
        cursor.execute(
            """
            SELECT
                f.faculty_name,
                h.hall_name,
                es.exam_date,
                es.session
            FROM invigilator_assignments ia
            JOIN faculty f
                ON ia.faculty_id = f.faculty_id
            JOIN halls h
                ON ia.hall_id = h.hall_id
            JOIN exam_sessions es
                ON ia.exam_id = es.exam_id
            LEFT JOIN faculty_availability fa
                ON fa.faculty_id = ia.faculty_id
               AND fa.exam_date = es.exam_date
               AND fa.session = es.session
            WHERE ia.exam_id = %s
              AND (
                  fa.availability_id IS NULL
                  OR fa.is_available = FALSE
              )
        """,
            (exam_id,),
        )

        availability_conflicts = cursor.fetchall()

        # 4. Build response
        total_conflicts = (
            len(seating_conflicts)
            + len(invigilator_conflicts)
            + len(availability_conflicts)
        )

        return jsonify(
            {
                "exam_id": exam_id,
                "message": (
                    "No conflicts detected"
                    if total_conflicts == 0
                    else "Conflicts detected"
                ),
                "total_conflicts": total_conflicts,
                "seating_conflicts": seating_conflicts,
                "invigilator_conflicts": invigilator_conflicts,
                "availability_conflicts": availability_conflicts,
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        if cursor:
            cursor.close()

        if connection and connection.is_connected():
            connection.close()


if __name__ == "__main__":
    app.run(debug=True)
