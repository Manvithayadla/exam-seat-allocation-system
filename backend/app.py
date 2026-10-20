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

        # 1. Confirm that the exam exists before checking registrations.
        cursor.execute(
            """
            SELECT exam_id
            FROM exam_sessions
            WHERE exam_id = %s
            """,
            (exam_id,),
        )
        exam = cursor.fetchone()

        if not exam:
            return jsonify({"error": "Exam not found"}), 404

        # 2. Get registered students and subject details.
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

            # Never silently violate the same-department adjacency rule.
            # Roll back the entire operation so the previous seating plan,
            # if any, remains unchanged.
            if selected_seat is None:
                connection.rollback()
                return (
                    jsonify(
                        {
                            "error": (
                                "A conflict-free seating plan could not be completed "
                                "with the current greedy algorithm. No changes were saved."
                            ),
                            "exam_id": exam_id,
                            "allocated": False,
                            "hint": (
                                "Try a different seat ordering or improve the allocation "
                                "algorithm before retrying."
                            ),
                        }
                    ),
                    409,
                )

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

        # 4. Get available faculty and count their duties without
        # multiplying counts through joins to availability records.
        # Exclude anyone assigned to another exam in the same date/session.
        cursor.execute(
            """
            SELECT
                f.faculty_id,
                f.faculty_name,
                f.department,
                (
                    SELECT COUNT(*)
                    FROM invigilator_assignments all_duties
                    WHERE all_duties.faculty_id = f.faculty_id
                ) AS duty_count
            FROM faculty f
            WHERE EXISTS (
                SELECT 1
                FROM faculty_availability fa
                WHERE fa.faculty_id = f.faculty_id
                  AND fa.exam_date = %s
                  AND fa.session = %s
                  AND fa.is_available = TRUE
            )
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


# =========================================================
# STEP 9: SUPPLEMENTARY STUDENT REGISTRATION
# SAFE LOCAL SEAT ALLOCATION (PRESERVES EXISTING ALLOCATIONS)
# =========================================================


@app.route("/register-supplementary", methods=["POST"])
def register_supplementary():
    data = request.get_json(silent=True) or {}
    exam_id = data.get("exam_id")
    hall_ticket_no = data.get("hall_ticket_no")

    if not exam_id or not hall_ticket_no:
        return jsonify({"error": "Both exam_id and hall_ticket_no are required"}), 400

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # 1. Confirm the exam exists.
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

        # 2. Find the existing student.
        cursor.execute(
            """
            SELECT student_id, hall_ticket_no, name, department
            FROM students
            WHERE hall_ticket_no = %s
            """,
            (hall_ticket_no,),
        )
        student = cursor.fetchone()

        if not student:
            return (
                jsonify(
                    {
                        "error": "Student not found. Add the student to the students table first."
                    }
                ),
                404,
            )

        # 3. Check for an existing registration.
        cursor.execute(
            """
            SELECT registration_id
            FROM exam_registrations
            WHERE student_id = %s AND exam_id = %s
            """,
            (student["student_id"], exam_id),
        )

        if cursor.fetchone():
            return (
                jsonify({"error": "This student is already registered for this exam"}),
                409,
            )

        # 4. Use only halls already in use for this exam.
        cursor.execute(
            """
            SELECT DISTINCT se.hall_id
            FROM seat_allocations sa
            JOIN seats se ON se.seat_id = sa.seat_id
            WHERE sa.exam_id = %s
            ORDER BY se.hall_id
            """,
            (exam_id,),
        )
        active_halls = cursor.fetchall()

        if not active_halls:
            return (
                jsonify(
                    {
                        "error": "No seating plan exists for this exam. Allocate seats first."
                    }
                ),
                400,
            )

        hall_ids = [row["hall_id"] for row in active_halls]
        placeholders = ",".join(["%s"] * len(hall_ids))

        # 5. Find unoccupied seats in those halls.
        cursor.execute(
            f"""
            SELECT se.seat_id, se.hall_id, h.hall_name, se.row_no, se.column_no
            FROM seats se
            JOIN halls h ON h.hall_id = se.hall_id
            LEFT JOIN seat_allocations occupied
                ON occupied.seat_id = se.seat_id
               AND occupied.exam_id = %s
            WHERE se.hall_id IN ({placeholders})
              AND occupied.allocation_id IS NULL
            ORDER BY se.hall_id, se.row_no, se.column_no
            """,
            tuple([exam_id] + hall_ids),
        )
        free_seats = cursor.fetchall()

        if not free_seats:
            return (
                jsonify(
                    {
                        "error": "No unoccupied seats are available in the halls currently used for this exam",
                        "registered": False,
                        "allocated": False,
                    }
                ),
                409,
            )

        # 6. Check each free seat against already allocated students.
        # Same-department students cannot be horizontal, vertical, or diagonal neighbors.
        safe_seat = None

        for seat in free_seats:
            cursor.execute(
                """
                SELECT COUNT(*) AS conflict_count
                FROM seat_allocations sa
                JOIN students other_student
                    ON other_student.student_id = sa.student_id
                JOIN seats other_seat
                    ON other_seat.seat_id = sa.seat_id
                WHERE sa.exam_id = %s
                  AND other_seat.hall_id = %s
                  AND other_student.department = %s
                  AND ABS(other_seat.row_no - %s) <= 1
                  AND ABS(other_seat.column_no - %s) <= 1
                  AND (
                      other_seat.row_no <> %s
                      OR other_seat.column_no <> %s
                  )
                """,
                (
                    exam_id,
                    seat["hall_id"],
                    student["department"],
                    seat["row_no"],
                    seat["column_no"],
                    seat["row_no"],
                    seat["column_no"],
                ),
            )

            result = cursor.fetchone()
            if result["conflict_count"] == 0:
                safe_seat = seat
                break

        if safe_seat is None:
            connection.rollback()
            return (
                jsonify(
                    {
                        "error": "No safe seat is available in the halls currently used for this exam. No registration or allocation was saved.",
                        "registered": False,
                        "allocated": False,
                    }
                ),
                409,
            )

        # 7. Save registration and seat allocation together.
        cursor.execute(
            """
            INSERT INTO exam_registrations (student_id, exam_id)
            VALUES (%s, %s)
            """,
            (student["student_id"], exam_id),
        )

        cursor.execute(
            """
            INSERT INTO seat_allocations (student_id, exam_id, seat_id)
            VALUES (%s, %s, %s)
            """,
            (student["student_id"], exam_id, safe_seat["seat_id"]),
        )

        connection.commit()

        return (
            jsonify(
                {
                    "message": "Supplementary student registered and safely allocated",
                    "registered": True,
                    "allocated": True,
                    "student": {
                        "student_id": student["student_id"],
                        "hall_ticket_no": student["hall_ticket_no"],
                        "name": student["name"],
                        "department": student["department"],
                    },
                    "exam": {
                        "exam_id": exam_id,
                        "exam_date": exam["exam_date"].isoformat(),
                        "session": exam["session"],
                    },
                    "seat": {
                        "hall_id": safe_seat["hall_id"],
                        "hall_name": safe_seat["hall_name"],
                        "row": safe_seat["row_no"],
                        "column": safe_seat["column_no"],
                    },
                }
            ),
            201,
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
# STEP 10: STUDENT SEAT SEARCH
# =========================================================


@app.route("/student-seat", methods=["GET"])
def student_seat():
    hall_ticket_no = request.args.get("hall_ticket_no", "").strip()
    exam_id = request.args.get("exam_id", "").strip()

    if not hall_ticket_no or not exam_id:
        return (
            jsonify(
                {
                    "error": "Both hall_ticket_no and exam_id query parameters are required"
                }
            ),
            400,
        )

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # Confirm that the student exists.
        cursor.execute(
            """
            SELECT student_id, hall_ticket_no, name, department
            FROM students
            WHERE hall_ticket_no = %s
            """,
            (hall_ticket_no,),
        )
        student = cursor.fetchone()

        if not student:
            return jsonify({"error": "Student not found"}), 404

        # Confirm that the exam exists.
        cursor.execute(
            """
            SELECT
                es.exam_id,
                es.exam_date,
                es.session,
                sub.subject_code,
                sub.subject_name
            FROM exam_sessions es
            JOIN subjects sub ON sub.subject_id = es.subject_id
            WHERE es.exam_id = %s
            """,
            (exam_id,),
        )
        exam = cursor.fetchone()

        if not exam:
            return jsonify({"error": "Exam not found"}), 404

        # Require registration before returning the seat information.
        cursor.execute(
            """
            SELECT registration_id
            FROM exam_registrations
            WHERE student_id = %s AND exam_id = %s
            """,
            (student["student_id"], exam_id),
        )
        registration = cursor.fetchone()

        if not registration:
            return jsonify({"error": "Student is not registered for this exam"}), 404

        # Look up the allocated seat.
        cursor.execute(
            """
            SELECT
                h.hall_id,
                h.hall_name,
                se.seat_id,
                se.row_no,
                se.column_no
            FROM seat_allocations sa
            JOIN seats se ON se.seat_id = sa.seat_id
            JOIN halls h ON h.hall_id = se.hall_id
            WHERE sa.student_id = %s AND sa.exam_id = %s
            """,
            (student["student_id"], exam_id),
        )
        seat = cursor.fetchone()

        if not seat:
            return (
                jsonify(
                    {
                        "error": "Student is registered, but a seat has not been allocated yet"
                    }
                ),
                404,
            )

        return (
            jsonify(
                {
                    "message": "Seat details retrieved successfully",
                    "student": {
                        "hall_ticket_no": student["hall_ticket_no"],
                        "name": student["name"],
                        "department": student["department"],
                    },
                    "exam": {
                        "exam_id": exam["exam_id"],
                        "subject_code": exam["subject_code"],
                        "subject_name": exam["subject_name"],
                        "exam_date": exam["exam_date"].isoformat(),
                        "session": exam["session"],
                    },
                    "seat": {
                        "hall_id": seat["hall_id"],
                        "hall_name": seat["hall_name"],
                        "seat_id": seat["seat_id"],
                        "row": seat["row_no"],
                        "column": seat["column_no"],
                    },
                }
            ),
            200,
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# =========================================================
# STEP 11: PDF SEATING CHART
# GET /reports/seating-chart?exam_id=1
# Optional: &hall_id=1
# =========================================================


@app.route("/reports/seating-chart", methods=["GET"])
def download_seating_chart():
    exam_id = request.args.get("exam_id", "").strip()
    hall_id = request.args.get("hall_id", "").strip()

    if not exam_id:
        return jsonify({"error": "exam_id query parameter is required"}), 400

    connection = None
    cursor = None

    try:
        # ReportLab is required to generate PDF files.
        from io import BytesIO
        from flask import send_file
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            SimpleDocTemplate,
            Paragraph,
            Spacer,
            Table,
            TableStyle,
        )

        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # Confirm the exam and retrieve subject information.
        cursor.execute(
            """
            SELECT es.exam_id, es.exam_date, es.session,
                   sub.subject_code, sub.subject_name
            FROM exam_sessions es
            JOIN subjects sub ON sub.subject_id = es.subject_id
            WHERE es.exam_id = %s
            """,
            (exam_id,),
        )
        exam = cursor.fetchone()

        if not exam:
            return jsonify({"error": "Exam not found"}), 404

        # Retrieve all allocated seats, optionally filtered to one hall.
        sql = """
            SELECT
                h.hall_id, h.hall_name,
                se.row_no, se.column_no,
                s.hall_ticket_no, s.name, s.department
            FROM seat_allocations sa
            JOIN students s ON s.student_id = sa.student_id
            JOIN seats se ON se.seat_id = sa.seat_id
            JOIN halls h ON h.hall_id = se.hall_id
            WHERE sa.exam_id = %s
        """
        params = [exam_id]

        if hall_id:
            sql += " AND h.hall_id = %s"
            params.append(hall_id)

        sql += " ORDER BY h.hall_name, se.row_no, se.column_no"
        cursor.execute(sql, tuple(params))
        rows = cursor.fetchall()

        if not rows:
            return (
                jsonify(
                    {"error": "No seat allocations found for this exam and hall filter"}
                ),
                404,
            )

        # Build a PDF in memory.
        pdf_buffer = BytesIO()
        document = SimpleDocTemplate(
            pdf_buffer,
            pagesize=landscape(A4),
            rightMargin=12 * mm,
            leftMargin=12 * mm,
            topMargin=12 * mm,
            bottomMargin=12 * mm,
        )

        styles = getSampleStyleSheet()
        story = [
            Paragraph("Smart Examination Seat Allocation System", styles["Title"]),
            Spacer(1, 4 * mm),
            Paragraph(
                f"Subject: {exam['subject_code']} - {exam['subject_name']}",
                styles["Normal"],
            ),
            Paragraph(
                f"Exam ID: {exam['exam_id']} | Date: {exam['exam_date'].isoformat()} "
                f"| Session: {exam['session']}",
                styles["Normal"],
            ),
            Spacer(1, 5 * mm),
        ]

        # Separate each hall with its own heading and table.
        halls = {}
        for row in rows:
            halls.setdefault(
                row["hall_id"], {"hall_name": row["hall_name"], "rows": []}
            )["rows"].append(row)

        for index, hall_data in enumerate(halls.values()):
            if index:
                story.append(Spacer(1, 5 * mm))

            story.append(
                Paragraph(f"Hall: {hall_data['hall_name']}", styles["Heading2"])
            )

            table_data = [
                ["Row", "Column", "Hall Ticket Number", "Student Name", "Department"]
            ]

            for row in hall_data["rows"]:
                table_data.append(
                    [
                        str(row["row_no"]),
                        str(row["column_no"]),
                        row["hall_ticket_no"],
                        row["name"],
                        row["department"],
                    ]
                )

            table = Table(
                table_data,
                repeatRows=1,
                colWidths=[18 * mm, 20 * mm, 48 * mm, 75 * mm, 35 * mm],
            )
            table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#243B53")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#BCCCDC")),
                        (
                            "ROWBACKGROUNDS",
                            (0, 1),
                            (-1, -1),
                            [colors.white, colors.HexColor("#F0F4F8")],
                        ),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("FONTSIZE", (0, 0), (-1, -1), 9),
                        ("TOPPADDING", (0, 0), (-1, -1), 5),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ]
                )
            )
            story.append(table)

        document.build(story)
        pdf_buffer.seek(0)

        filename = f"seating_chart_exam_{exam_id}.pdf"
        return send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=filename,
        )

    except ImportError as e:
        return (
            jsonify(
                {
                    "error": "PDF dependency missing. Install it with: pip install reportlab",
                    "details": str(e),
                }
            ),
            500,
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# =========================================================
# STEP 12: ATTENDANCE SHEET PDF
# GET /reports/attendance-sheet?exam_id=1
# Optional: &hall_id=1
# =========================================================


@app.route("/reports/attendance-sheet", methods=["GET"])
def download_attendance_sheet():
    exam_id = request.args.get("exam_id", "").strip()
    hall_id = request.args.get("hall_id", "").strip()

    if not exam_id:
        return jsonify({"error": "exam_id query parameter is required"}), 400

    connection = None
    cursor = None

    try:
        from io import BytesIO
        from flask import send_file
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            SimpleDocTemplate,
            Paragraph,
            Spacer,
            Table,
            TableStyle,
        )

        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT es.exam_id, es.exam_date, es.session,
                   sub.subject_code, sub.subject_name
            FROM exam_sessions es
            JOIN subjects sub ON sub.subject_id = es.subject_id
            WHERE es.exam_id = %s
            """,
            (exam_id,),
        )
        exam = cursor.fetchone()

        if not exam:
            return jsonify({"error": "Exam not found"}), 404

        sql = """
            SELECT h.hall_id, h.hall_name,
                   se.row_no, se.column_no,
                   s.hall_ticket_no, s.name, s.department
            FROM seat_allocations sa
            JOIN students s ON s.student_id = sa.student_id
            JOIN seats se ON se.seat_id = sa.seat_id
            JOIN halls h ON h.hall_id = se.hall_id
            WHERE sa.exam_id = %s
        """
        params = [exam_id]

        if hall_id:
            sql += " AND h.hall_id = %s"
            params.append(hall_id)

        sql += " ORDER BY h.hall_name, se.row_no, se.column_no"
        cursor.execute(sql, tuple(params))
        allocations = cursor.fetchall()

        if not allocations:
            return (
                jsonify(
                    {"error": "No seat allocations found for this exam and hall filter"}
                ),
                404,
            )

        pdf_buffer = BytesIO()
        document = SimpleDocTemplate(
            pdf_buffer,
            pagesize=landscape(A4),
            rightMargin=10 * mm,
            leftMargin=10 * mm,
            topMargin=10 * mm,
            bottomMargin=10 * mm,
        )
        styles = getSampleStyleSheet()
        story = [
            Paragraph("EXAMINATION ATTENDANCE SHEET", styles["Title"]),
            Spacer(1, 3 * mm),
            Paragraph(
                f"Subject: {exam['subject_code']} - {exam['subject_name']}",
                styles["Normal"],
            ),
            Paragraph(
                f"Exam Date: {exam['exam_date'].isoformat()} | "
                f"Session: {exam['session']} | Exam ID: {exam['exam_id']}",
                styles["Normal"],
            ),
            Spacer(1, 4 * mm),
        ]

        grouped_halls = {}
        for allocation in allocations:
            grouped_halls.setdefault(
                allocation["hall_id"],
                {"hall_name": allocation["hall_name"], "students": []},
            )["students"].append(allocation)

        for hall_index, hall_data in enumerate(grouped_halls.values()):
            if hall_index:
                story.append(Spacer(1, 6 * mm))
            story.append(
                Paragraph(f"Hall: {hall_data['hall_name']}", styles["Heading2"])
            )
            story.append(Spacer(1, 2 * mm))
            table_data = [
                [
                    "S.No.",
                    "Hall Ticket Number",
                    "Student Name",
                    "Department",
                    "Row",
                    "Column",
                    "Signature / Attendance",
                ]
            ]
            for index, student in enumerate(hall_data["students"], start=1):
                table_data.append(
                    [
                        str(index),
                        student["hall_ticket_no"],
                        student["name"],
                        student["department"],
                        str(student["row_no"]),
                        str(student["column_no"]),
                        "",
                    ]
                )
            table = Table(
                table_data,
                repeatRows=1,
                colWidths=[
                    14 * mm,
                    38 * mm,
                    48 * mm,
                    25 * mm,
                    15 * mm,
                    18 * mm,
                    55 * mm,
                ],
                rowHeights=[10 * mm] + [12 * mm] * len(hall_data["students"]),
            )
            table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#243B53")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#BCCCDC")),
                        (
                            "ROWBACKGROUNDS",
                            (0, 1),
                            (-1, -1),
                            [colors.white, colors.HexColor("#F0F4F8")],
                        ),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("FONTSIZE", (0, 0), (-1, -1), 8),
                        ("LEFTPADDING", (0, 0), (-1, -1), 4),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ]
                )
            )
            story.append(table)

        document.build(story)
        pdf_buffer.seek(0)
        return send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"attendance_sheet_exam_{exam_id}.pdf",
        )

    except ImportError as e:
        return (
            jsonify(
                {
                    "error": "PDF dependency missing. Install it with: pip install reportlab",
                    "details": str(e),
                }
            ),
            500,
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# =========================================================
# STEP 13: INVIGILATOR DUTY SLIP PDF
# GET /reports/duty-slips?exam_id=1
# Optional: &faculty_id=1
# =========================================================


@app.route("/reports/duty-slips", methods=["GET"])
def download_invigilator_duty_slips():
    exam_id = request.args.get("exam_id", "").strip()
    faculty_id = request.args.get("faculty_id", "").strip()

    if not exam_id:
        return jsonify({"error": "exam_id query parameter is required"}), 400

    connection = None
    cursor = None

    try:
        from io import BytesIO
        from flask import send_file
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            SimpleDocTemplate,
            Paragraph,
            Spacer,
            Table,
            TableStyle,
            PageBreak,
        )

        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT es.exam_id, es.exam_date, es.session,
                   sub.subject_code, sub.subject_name
            FROM exam_sessions es
            JOIN subjects sub ON sub.subject_id = es.subject_id
            WHERE es.exam_id = %s
            """,
            (exam_id,),
        )
        exam = cursor.fetchone()

        if not exam:
            return jsonify({"error": "Exam not found"}), 404

        sql = """
            SELECT ia.faculty_id, f.faculty_name, f.department,
                   h.hall_id, h.hall_name
            FROM invigilator_assignments ia
            JOIN faculty f ON f.faculty_id = ia.faculty_id
            JOIN halls h ON h.hall_id = ia.hall_id
            WHERE ia.exam_id = %s
        """
        params = [exam_id]

        if faculty_id:
            sql += " AND ia.faculty_id = %s"
            params.append(faculty_id)

        sql += " ORDER BY f.faculty_name, h.hall_name"
        cursor.execute(sql, tuple(params))
        assignments = cursor.fetchall()

        if not assignments:
            return (
                jsonify(
                    {
                        "error": "No invigilator assignments found for this exam and filter"
                    }
                ),
                404,
            )

        pdf_buffer = BytesIO()
        document = SimpleDocTemplate(
            pdf_buffer,
            pagesize=A4,
            rightMargin=18 * mm,
            leftMargin=18 * mm,
            topMargin=18 * mm,
            bottomMargin=18 * mm,
        )

        styles = getSampleStyleSheet()
        story = []

        for index, assignment in enumerate(assignments):
            if index:
                story.append(PageBreak())

            story.extend(
                [
                    Paragraph("INVIGILATOR DUTY SLIP", styles["Title"]),
                    Spacer(1, 8 * mm),
                    Paragraph(
                        "Smart Examination Seat Allotment and Invigilator Assignment System",
                        styles["Normal"],
                    ),
                    Spacer(1, 8 * mm),
                ]
            )

            details = [
                ["Invigilator Name", assignment["faculty_name"]],
                ["Faculty ID", str(assignment["faculty_id"])],
                ["Department", assignment["department"] or "—"],
                ["Exam ID", str(exam["exam_id"])],
                ["Subject", f"{exam['subject_code']} - {exam['subject_name']}"],
                ["Exam Date", exam["exam_date"].isoformat()],
                ["Session", exam["session"]],
                ["Assigned Hall", assignment["hall_name"]],
            ]

            table = Table(details, colWidths=[45 * mm, 115 * mm])
            table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EAF0F6")),
                        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#243B53")),
                        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#BCCCDC")),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 8),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                        ("TOPPADDING", (0, 0), (-1, -1), 9),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
                    ]
                )
            )
            story.append(table)
            story.extend(
                [
                    Spacer(1, 12 * mm),
                    Paragraph(
                        "Invigilator Signature: ______________________________",
                        styles["Normal"],
                    ),
                    Spacer(1, 8 * mm),
                    Paragraph(
                        "Exam Coordinator Signature: _________________________",
                        styles["Normal"],
                    ),
                    Spacer(1, 8 * mm),
                    Paragraph(
                        "Please report to the examination section before the session begins.",
                        styles["Italic"],
                    ),
                ]
            )

        document.build(story)
        pdf_buffer.seek(0)

        filename = f"duty_slips_exam_{exam_id}.pdf"
        if faculty_id:
            filename = f"duty_slip_exam_{exam_id}_faculty_{faculty_id}.pdf"

        return send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=filename,
        )

    except ImportError as e:
        return (
            jsonify(
                {
                    "error": "PDF dependency missing. Install it with: pip install reportlab",
                    "details": str(e),
                }
            ),
            500,
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# =========================================================
# STEP 14: ANALYTICS DASHBOARD API
# GET /analytics?exam_id=2 (exam_id is optional)
# =========================================================


@app.route("/analytics", methods=["GET"])
def analytics_dashboard():
    exam_id = request.args.get("exam_id", "").strip()

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # Overall counts.
        cursor.execute("SELECT COUNT(*) AS total_students FROM students")
        total_students = cursor.fetchone()["total_students"]

        cursor.execute("SELECT COUNT(*) AS total_exams FROM exam_sessions")
        total_exams = cursor.fetchone()["total_exams"]

        cursor.execute("SELECT COUNT(*) AS total_halls FROM halls")
        total_halls = cursor.fetchone()["total_halls"]

        cursor.execute("SELECT COUNT(*) AS total_faculty FROM faculty")
        total_faculty = cursor.fetchone()["total_faculty"]

        cursor.execute("SELECT COUNT(*) AS total_registrations FROM exam_registrations")
        total_registrations = cursor.fetchone()["total_registrations"]

        # Allocation count is per student-exam assignment.
        cursor.execute("SELECT COUNT(*) AS total_allocations FROM seat_allocations")
        total_allocations = cursor.fetchone()["total_allocations"]

        cursor.execute(
            "SELECT COUNT(*) AS total_invigilator_assignments "
            "FROM invigilator_assignments"
        )
        total_invigilator_assignments = cursor.fetchone()[
            "total_invigilator_assignments"
        ]

        # Hall capacity and occupancy across the whole system.
        cursor.execute("""
            SELECT
                h.hall_id,
                h.hall_name,
                h.capacity,
                COUNT(DISTINCT sa.allocation_id) AS allocated_seats
            FROM halls h
            LEFT JOIN seats se ON se.hall_id = h.hall_id
            LEFT JOIN seat_allocations sa ON sa.seat_id = se.seat_id
            GROUP BY h.hall_id, h.hall_name, h.capacity
            ORDER BY h.hall_name
            """)
        hall_stats = cursor.fetchall()

        for hall in hall_stats:
            capacity = hall["capacity"] or 0
            allocated = hall["allocated_seats"] or 0
            hall["occupancy_percent"] = (
                round((allocated / capacity) * 100, 2) if capacity else 0
            )

        response = {
            "message": "Analytics retrieved successfully",
            "overview": {
                "total_students": total_students,
                "total_exams": total_exams,
                "total_halls": total_halls,
                "total_faculty": total_faculty,
                "total_registrations": total_registrations,
                "total_allocations": total_allocations,
                "total_invigilator_assignments": total_invigilator_assignments,
            },
            "hall_statistics": hall_stats,
        }

        # Optional exam-specific counts and hall breakdown.
        if exam_id:
            cursor.execute(
                """
                SELECT es.exam_id, es.exam_date, es.session,
                       sub.subject_code, sub.subject_name
                FROM exam_sessions es
                JOIN subjects sub ON sub.subject_id = es.subject_id
                WHERE es.exam_id = %s
                """,
                (exam_id,),
            )
            exam = cursor.fetchone()

            if not exam:
                return jsonify({"error": "Exam not found"}), 404

            cursor.execute(
                """
                SELECT COUNT(*) AS registered_students
                FROM exam_registrations
                WHERE exam_id = %s
                """,
                (exam_id,),
            )
            registered_students = cursor.fetchone()["registered_students"]

            cursor.execute(
                """
                SELECT COUNT(*) AS allocated_students
                FROM seat_allocations
                WHERE exam_id = %s
                """,
                (exam_id,),
            )
            allocated_students = cursor.fetchone()["allocated_students"]

            cursor.execute(
                """
                SELECT COUNT(*) AS assigned_invigilators
                FROM invigilator_assignments
                WHERE exam_id = %s
                """,
                (exam_id,),
            )
            assigned_invigilators = cursor.fetchone()["assigned_invigilators"]

            cursor.execute(
                """
                SELECT h.hall_id, h.hall_name, h.capacity,
                       COUNT(sa.allocation_id) AS allocated_students
                FROM halls h
                JOIN seats se ON se.hall_id = h.hall_id
                JOIN seat_allocations sa ON sa.seat_id = se.seat_id
                    AND sa.exam_id = %s
                GROUP BY h.hall_id, h.hall_name, h.capacity
                ORDER BY h.hall_name
                """,
                (exam_id,),
            )
            exam_halls = cursor.fetchall()

            for hall in exam_halls:
                capacity = hall["capacity"] or 0
                allocated = hall["allocated_students"] or 0
                hall["occupancy_percent"] = (
                    round((allocated / capacity) * 100, 2) if capacity else 0
                )

            response["exam_statistics"] = {
                "exam": {
                    "exam_id": exam["exam_id"],
                    "exam_date": exam["exam_date"].isoformat(),
                    "session": exam["session"],
                    "subject_code": exam["subject_code"],
                    "subject_name": exam["subject_name"],
                },
                "registered_students": registered_students,
                "allocated_students": allocated_students,
                "unallocated_students": max(
                    registered_students - allocated_students, 0
                ),
                "assigned_invigilators": assigned_invigilators,
                "halls_in_use": len(exam_halls),
                "hall_statistics": exam_halls,
            }

        return jsonify(response), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@app.route("/students", methods=["GET"])
def get_students():
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                student_id,
                hall_ticket_no,
                name,
                department,
                year,
                section
            FROM students
            ORDER BY hall_ticket_no
        """)

        students = cursor.fetchall()

        return (
            jsonify(
                {
                    "message": "Students retrieved successfully",
                    "total_students": len(students),
                    "students": students,
                }
            ),
            200,
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

@app.route("/exams", methods=["GET"])
def get_exams():
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        query = """
            SELECT
                e.exam_id,
                e.subject_id,
                s.subject_code,
                s.subject_name,
                e.exam_date,
                e.session
            FROM exam_sessions e
            JOIN subjects s ON e.subject_id = s.subject_id
            ORDER BY e.exam_date, e.session, e.exam_id
        """

        cursor.execute(query)
        exams = cursor.fetchall()

        return {
            "message": "Examinations retrieved successfully",
            "total_exams": len(exams),
            "exams": exams
        }, 200

    except Exception as error:
        print("Error retrieving examinations:", error)
        return {"error": "Failed to retrieve examinations"}, 500

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()


if __name__ == "__main__":
    app.run(debug=True)
