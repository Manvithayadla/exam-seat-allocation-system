from flask import Flask, jsonify, request



from flask_cors import CORS



from db import get_db_connection



import pandas as pd



import heapq



from auth_routes import auth_bp



from admin_routes import admin_bp







app = Flask(__name__)



app.register_blueprint(auth_bp)



app.register_blueprint(admin_bp)



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
    from auth_routes import get_authenticated_user
    auth_user = get_authenticated_user()
    if not auth_user:
        return jsonify({"error": "Authentication required"}), 401
    if auth_user.get("role") not in ("exam_admin", "admin"):
        return jsonify({"error": "Administrative permissions required"}), 403

    data = request.get_json(silent=True) or {}
    exam_id = data.get("exam_id")
    if not exam_id:
        return jsonify({"error": "exam_id is required"}), 400

    reallocate_all = bool(data.get("reallocate_all", False))
    chosen_hall_ids = data.get("hall_ids")

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        from admin_routes import run_incremental_seat_allocation
        res = run_incremental_seat_allocation(
            cursor, connection, exam_id,
            chosen_hall_ids=chosen_hall_ids,
            reallocate_all=reallocate_all
        )

        if not res.get("success"):
            return jsonify({"error": res.get("error", "Allocation failed")}), res.get("status_code", 400)

        return jsonify(res), 200

    except Exception as e:
        if connection and connection.is_connected():
            connection.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor: cursor.close()
        if connection and connection.is_connected(): connection.close()


# =========================================================
# STEP 6B: GET EXISTING SEAT ALLOCATIONS
# =========================================================
@app.route("/seat-allocations", methods=["GET"])



def get_seat_allocations():



    exam_id = request.args.get("exam_id", "").strip()







    if not exam_id:



        return jsonify({"error": "exam_id query parameter is required"}), 400







    connection = None



    cursor = None







    try:



        connection = get_db_connection()



        cursor = connection.cursor(dictionary=True)







        cursor.execute(



            """



            SELECT exam_id, exam_name, exam_date, session, start_time, end_time



            FROM exam_sessions



            WHERE exam_id = %s



            """,



            (exam_id,),



        )



        exam = cursor.fetchone()







        if not exam:



            return jsonify({"error": "Exam not found"}), 404







        cursor.execute(



            """



            SELECT DISTINCT



                h.hall_id,



                h.hall_name,



                h.rows_count,



                h.columns_count,



                h.capacity



            FROM seat_allocations sa



            JOIN seats se ON se.seat_id = sa.seat_id



            JOIN halls h ON h.hall_id = se.hall_id



            WHERE sa.exam_id = %s



            ORDER BY h.hall_id



            """,



            (exam_id,),



        )



        selected_halls = cursor.fetchall()







        cursor.execute(



            """



            SELECT



                h.hall_name,



                h.hall_id,



                se.row_no AS `row`,



                se.column_no AS `column`,



                s.hall_ticket_no,



                s.name AS student_name,



                s.department,

                s.section,

                sub.subject_code,



                sub.subject_name



            FROM seat_allocations sa



            JOIN students s ON s.student_id = sa.student_id



            JOIN seats se ON se.seat_id = sa.seat_id



            JOIN halls h ON h.hall_id = se.hall_id



            JOIN exam_sessions es ON es.exam_id = sa.exam_id



            JOIN subjects sub ON sub.subject_id = es.subject_id



            WHERE sa.exam_id = %s



            ORDER BY h.hall_id, se.row_no, se.column_no



            """,



            (exam_id,),



        )



        allocations = cursor.fetchall()







        return (



            jsonify(



                {



                    "message": "Seat allocations retrieved successfully",



                    "exam_id": exam_id,



                    "total_students": len(allocations),



                    "selected_halls": selected_halls,



                    "allocations": allocations,



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



# STEP 7: INVIGILATOR ASSIGNMENT



# MIN-HEAP GREEDY + AVAILABILITY CONSTRAINTS



# =========================================================











@app.route("/assign-invigilators", methods=["POST"])
def assign_invigilators():
    """
    Automated Invigilator Allocation Algorithm:
    1. Mandatory Subject-Teaching Restriction:
       An invigilator must NEVER be assigned to supervise an examination for a subject/course that they teach.
       Checks faculty_subjects by subject_id and subject_code.
    2. Respects faculty availability (leaves / unavailable records).
    3. Excludes inactive faculty (is_active = 0).
    4. Enforces no overlapping examination duties.
    5. Fair workload balancing via min-heap ordered by lowest duty count.
    6. Double validation before saving.
    """
    from auth_routes import get_authenticated_user
    auth_user = get_authenticated_user()
    if not auth_user:
        return jsonify({"error": "Authentication required"}), 401
    if auth_user.get("role") not in ("exam_admin", "admin"):
        return jsonify({"error": "Administrative permissions required"}), 403

    data = request.get_json(silent=True) or {}
    exam_id = data.get("exam_id")
    if not exam_id:
        return jsonify({"error": "exam_id is required"}), 400

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # 1. Get exam details with subject info
        cursor.execute("""
            SELECT es.exam_id, es.exam_name, es.subject_id, es.exam_date, es.session,
                   es.start_time, es.end_time, es.status, es.exam_type,
                   es.academic_year, es.semester,
                   s.subject_code, s.subject_name
            FROM exam_sessions es
            JOIN subjects s ON es.subject_id = s.subject_id
            WHERE es.exam_id = %s
        """, (exam_id,))
        exam = cursor.fetchone()
        if not exam:
            return jsonify({"error": "Exam not found"}), 404
        if exam.get("status") == "Completed":
            return jsonify({"error": "Cannot assign invigilators: This examination has already been conducted and marked as Completed."}), 400
        if exam.get("status") == "Cancelled":
            return jsonify({"error": "Cannot assign invigilators: This examination has been cancelled."}), 400

        exam_date = exam["exam_date"]
        exam_session = exam["session"]
        exam_start = str(exam["start_time"]) if exam.get("start_time") else ("09:30:00" if exam_session == "FN" else "13:30:00")
        if len(exam_start) == 7 and exam_start[1] == ':':
            exam_start = '0' + exam_start
        exam_end = str(exam["end_time"]) if exam.get("end_time") else ("12:30:00" if exam_session == "FN" else "16:30:00")
        if len(exam_end) == 7 and exam_end[1] == ':':
            exam_end = '0' + exam_end

        # 2. Find halls that have seats allocated for this exam
        cursor.execute("""
            SELECT DISTINCT h.hall_id, h.hall_name, h.capacity
            FROM seat_allocations sa
            JOIN seats s ON sa.seat_id = s.seat_id
            JOIN halls h ON s.hall_id = h.hall_id
            WHERE sa.exam_id = %s
            ORDER BY h.hall_id
        """, (exam_id,))
        selected_halls = cursor.fetchall()
        if not selected_halls:
            return jsonify({"error": "Allocate seats for this exam before assigning invigilators"}), 400

        # 3. Identify all verified faculty teaching this subject in this specific academic year and semester
        exam_ay = (exam.get("academic_year") or "").strip()
        exam_sem = (exam.get("semester") or "").strip()
        exam_sem_num = ''.join(c for c in exam_sem if c.isdigit())
        exam_subj_id = exam["subject_id"]
        exam_subj_code = (exam.get("subject_code") or "").strip()

        cursor.execute("""
            SELECT DISTINCT fs.faculty_id, f.faculty_name, f.department, s.subject_code, s.subject_name
            FROM faculty_subjects fs
            JOIN faculty f ON fs.faculty_id = f.faculty_id
            JOIN subjects s ON fs.subject_id = s.subject_id
            WHERE (fs.subject_id = %s OR UPPER(TRIM(s.subject_code)) = UPPER(TRIM(%s)))
              AND (fs.is_verified = 1 OR fs.is_verified IS NULL)
              AND (%s = '' OR fs.academic_year IS NULL OR TRIM(fs.academic_year) = %s)
              AND (%s = '' OR fs.semester IS NULL OR TRIM(fs.semester) = %s OR REGEXP_REPLACE(fs.semester, '[^0-9]', '') = %s)
        """, (
            exam_subj_id, exam_subj_code,
            exam_ay, exam_ay,
            exam_sem_num, exam_sem, exam_sem_num
        ))
        teaching_rows = cursor.fetchall()
        teaching_faculty_ids = {r["faculty_id"] for r in teaching_rows}
        is_mapping_missing = (len(teaching_faculty_ids) == 0)

        # 4. Remove previous assignments for this exam
        cursor.execute("DELETE FROM invigilator_assignments WHERE exam_id = %s", (exam_id,))

        # 5. Get available, active faculty (excluding unavailabilities and overlaps)
        cursor.execute("""
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
            WHERE (f.is_active = 1 OR f.is_active IS NULL OR f.is_active IS TRUE)
              AND NOT EXISTS (
                  SELECT 1
                  FROM faculty_availability fa
                  WHERE fa.faculty_id = f.faculty_id
                    AND fa.exam_date = %s
                    AND (fa.session = %s OR fa.session = 'ALL')
                    AND fa.is_available = 0
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM invigilator_assignments existing
                  JOIN exam_sessions other_exam ON existing.exam_id = other_exam.exam_id
                  WHERE existing.faculty_id = f.faculty_id
                    AND other_exam.exam_date = %s
                    AND existing.exam_id <> %s
                    AND existing.status IN ('pending', 'accepted')
                    AND (other_exam.status IS NULL OR other_exam.status <> 'Cancelled')
                    AND (
                        COALESCE(other_exam.start_time, IF(other_exam.session='AN', '13:30:00', '09:30:00')) < %s
                        AND %s < COALESCE(other_exam.end_time, IF(other_exam.session='AN', '16:30:00', '12:30:00'))
                    )
              )
            ORDER BY f.faculty_id
        """, (
            exam_date, exam_session,
            exam_date, exam_id, exam_end, exam_start
        ))
        all_active_faculty = cursor.fetchall()
        # Enforce subject teaching restriction: exclude faculty who teach this subject in this term
        eligible_faculty = [f for f in all_active_faculty if f["faculty_id"] not in teaching_faculty_ids]

        if len(eligible_faculty) < len(selected_halls):
            connection.rollback()
            excluded_count = len(teaching_faculty_ids)
            msg = (
                f"Not enough available faculty to supervise all selected halls. {len(selected_halls)} required, "
                f"but only {len(eligible_faculty)} available ({excluded_count} subject teacher(s) excluded: "
                f"{', '.join(r['faculty_name'] for r in teaching_rows)})."
            )
            return jsonify({
                "error": msg,
                "required_invigilators": len(selected_halls),
                "available_faculty": len(eligible_faculty),
                "excluded_subject_teachers": [
                    {"faculty_id": r["faculty_id"], "faculty_name": r["faculty_name"], "reason": f"Teaches examination course {exam['subject_code']}"}
                    for r in teaching_rows
                ],
                "total_invigilators": 0,
                "assigned_count": 0,
            }), 400

        # 6. Fair Workload Balancing via Min-Heap
        import heapq
        faculty_heap = []
        for fac in eligible_faculty:
            heapq.heappush(faculty_heap, (fac["duty_count"], fac["faculty_id"], fac))

        assignments = []
        for hall in selected_halls:
            duty_count, faculty_id, faculty = heapq.heappop(faculty_heap)

            # Strict double verification
            if faculty_id in teaching_faculty_ids:
                connection.rollback()
                return jsonify({
                    "error": f"Integrity violation: Faculty member {faculty['faculty_name']} teaches {exam['subject_code']} and cannot invigilate it."
                }), 400

            cursor.execute("""
                INSERT INTO invigilator_assignments (faculty_id, exam_id, hall_id, status)
                VALUES (%s, %s, %s, 'pending')
            """, (faculty_id, exam_id, hall["hall_id"]))
            asg_id = cursor.lastrowid

            assignments.append({
                "assignment_id": asg_id,
                "faculty_id": faculty_id,
                "faculty_name": faculty["faculty_name"],
                "faculty_department": faculty["department"],
                "previous_duty_count": duty_count,
                "exam_id": exam_id,
                "exam_date": str(exam_date),
                "session": exam_session,
                "hall_id": hall["hall_id"],
                "hall_name": hall["hall_name"],
                "subject_code": exam["subject_code"],
                "subject_name": exam["subject_name"],
            })

        connection.commit()

        resp_payload = {
            "success": True,
            "message": f"Successfully assigned {len(assignments)} invigilators across {len(selected_halls)} halls with subject-teaching restrictions enforced.",
            "exam_id": exam_id,
            "exam_date": str(exam_date),
            "session": exam_session,
            "total_halls": len(selected_halls),
            "total_invigilators": len(assignments),
            "assigned_count": len(assignments),
            "assignments": assignments,
            "excluded_subject_teachers": [
                {"faculty_id": r["faculty_id"], "faculty_name": r["faculty_name"], "reason": f"Teaches course {exam['subject_code']} - {exam['subject_name']}"}
                for r in teaching_rows
            ],
            "teaching_mapping_status": "unverified" if is_mapping_missing else "verified"
        }
        if is_mapping_missing:
            resp_payload["warning"] = f"Notice: No faculty members are currently recorded as teaching course {exam['subject_code']} in MySQL. Please verify faculty teaching allocations in Faculty Data."

        return jsonify(resp_payload), 200

    except Exception as e:
        if connection and connection.is_connected():
            connection.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor: cursor.close()
        if connection and connection.is_connected(): connection.close()


@app.route("/invigilator-assignments", methods=["GET"])



def get_invigilator_assignments():



    exam_id = request.args.get("exam_id", "").strip()



    faculty_id = request.args.get("faculty_id", "").strip()







    connection = None



    cursor = None







    try:



        connection = get_db_connection()



        cursor = connection.cursor(dictionary=True)







        query = """



            SELECT
                ia.assignment_id,
                ia.exam_id,
                ia.hall_id,
                COALESCE(ia.faculty_id, ia.original_faculty_id) AS faculty_id,
                COALESCE(f.faculty_name, ia.faculty_name, 'Invigilator') AS faculty_name,
                COALESCE(f.department, ia.department, 'CSE') AS faculty_department,
                COALESCE(f.email, ia.faculty_email) AS faculty_email,
                COALESCE(f.designation, ia.designation) AS designation,
                COALESCE(h.hall_name, ia.hall_name, hh.hall_name, 'Hall N/A') AS hall_name,
                COALESCE(h.room_no, ia.room_no, hh.room_no, h.hall_name, ia.hall_name, 'N/A') AS room_no,
                es.exam_name,
                es.exam_date,
                es.session,
                es.start_time,
                es.end_time,
                sub.subject_code,
                sub.subject_name,
                ia.status,
                ia.decline_reason,
                ia.accepted_at,
                ia.declined_at,
                ia.message_to_admin,
                (
                    SELECT COUNT(*)
                    FROM invigilator_assignments all_duties
                    WHERE (all_duties.faculty_id = ia.faculty_id AND ia.faculty_id IS NOT NULL)
                       OR (all_duties.original_faculty_id = ia.original_faculty_id AND ia.original_faculty_id IS NOT NULL)
                ) AS previous_duty_count,
                EXISTS (
                    SELECT 1
                    FROM faculty_subjects fs
                    JOIN subjects fs_sub ON fs.subject_id = fs_sub.subject_id
                    WHERE fs.faculty_id = ia.faculty_id
                      AND ia.faculty_id IS NOT NULL
                      AND (fs.subject_id = es.subject_id OR UPPER(TRIM(fs_sub.subject_code)) = UPPER(TRIM(sub.subject_code)))
                ) AS is_teaching_conflict
            FROM invigilator_assignments ia
            LEFT JOIN faculty f ON f.faculty_id = ia.faculty_id
            LEFT JOIN halls h ON h.hall_id = ia.hall_id
            LEFT JOIN historical_halls hh ON hh.historical_hall_id = ia.historical_hall_id
            JOIN exam_sessions es ON es.exam_id = ia.exam_id
            JOIN subjects sub ON sub.subject_id = es.subject_id
            WHERE 1=1
        """
        params = []

        if exam_id:
            query += " AND ia.exam_id = %s"
            params.append(exam_id)

        if faculty_id:
            query += " AND (ia.faculty_id = %s OR ia.original_faculty_id = %s)"
            params.extend([faculty_id, faculty_id])

        query += " ORDER BY es.exam_date, es.session, h.hall_name"







        cursor.execute(query, tuple(params))



        assignments = cursor.fetchall()







        for a in assignments:



            if a.get("exam_date"):



                a["exam_date"] = a["exam_date"].isoformat()







        return (



            jsonify(



                {



                    "message": "Invigilator assignments retrieved successfully",



                    "total_assignments": len(assignments),



                    "assignments": assignments,



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







        # 0. Check for HARD CONFLICT: Duplicate physical seat allocations for this exam



        cursor.execute(



            """



            SELECT



                sa1.seat_id,



                h.hall_name,



                se.row_no,



                se.column_no,



                s1.hall_ticket_no,



                s1.hall_ticket_no AS student_1_ht,



                s1.name AS student_1,



                s2.hall_ticket_no AS student_2_ht,



                s2.name AS student_2



            FROM seat_allocations sa1



            JOIN seat_allocations sa2



                ON sa1.seat_id = sa2.seat_id



               AND sa1.exam_id = sa2.exam_id



               AND sa1.student_id < sa2.student_id



            JOIN seats se ON sa1.seat_id = se.seat_id



            JOIN halls h ON se.hall_id = h.hall_id



            JOIN students s1 ON sa1.student_id = s1.student_id



            JOIN students s2 ON sa2.student_id = s2.student_id



            WHERE sa1.exam_id = %s



        """,



            (exam_id,),



        )



        duplicate_seats = cursor.fetchall()







        # 0B. Check for HARD CONFLICT: Student scheduled for simultaneous overlapping exams



        cursor.execute(



            """



            SELECT



                s.hall_ticket_no,



                s.name AS student_name,



                es1.exam_name AS exam_1,



                es2.exam_name AS exam_2,



                es1.exam_date,



                es1.session



            FROM seat_allocations sa1



            JOIN seat_allocations sa2



                ON sa1.student_id = sa2.student_id



               AND sa1.exam_id < sa2.exam_id



            JOIN exam_sessions es1 ON sa1.exam_id = es1.exam_id



            JOIN exam_sessions es2 ON sa2.exam_id = es2.exam_id



            JOIN students s ON sa1.student_id = s.student_id



            WHERE (sa1.exam_id = %s OR sa2.exam_id = %s)



              AND es1.exam_date = es2.exam_date



              AND es1.session = es2.session



        """,



            (exam_id, exam_id),



        )



        student_overlaps = cursor.fetchall()







        # 1. Detect adjacent students (interleaving-aware)



        # First inspect department and section counts in this exam



        cursor.execute(



            """



            SELECT



                COUNT(DISTINCT s.department) AS dept_count,



                COUNT(DISTINCT COALESCE(s.section, 'A')) AS sec_count



            FROM seat_allocations sa



            JOIN students s ON sa.student_id = s.student_id



            WHERE sa.exam_id = %s



        """,



            (exam_id,),



        )



        cohort_counts = cursor.fetchone() or {"dept_count": 1, "sec_count": 1}



        dept_count = cohort_counts.get("dept_count", 1)



        sec_count = cohort_counts.get("sec_count", 1)







        # Multi-dept: conflict if same department. Single-dept multi-section: conflict if same section.



        if dept_count > 1:



            match_clause = "AND s1.department = s2.department"



            conflict_type = "department_adjacency"



        elif sec_count > 1:



            match_clause = "AND COALESCE(s1.section, 'A') = COALESCE(s2.section, 'A')"



            conflict_type = "section_adjacency"



        else:



            match_clause = "AND 1=1"



            conflict_type = "cohort_density_adjacency"







        query_seating = f"""



            SELECT



                s1.hall_ticket_no,



                s1.hall_ticket_no AS student_1_ht,



                s1.name AS student_1,



                s1.department AS department,



                COALESCE(s1.section, 'A') AS section_1,



                s2.hall_ticket_no AS student_2_ht,



                s2.name AS student_2,



                COALESCE(s2.section, 'A') AS section_2,



                h.hall_name,



                se1.row_no AS row_1,



                se1.column_no AS column_1,



                se2.row_no AS row_2,



                se2.column_no AS column_2,



                '{conflict_type}' AS conflict_type,



                'warning' AS severity



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



              {match_clause}



        """







        # If single-dept and single-section, check whether room had >= 2x capacity



        if dept_count <= 1 and sec_count <= 1:



            cursor.execute(



                """



                SELECT COUNT(*) as st_count, COALESCE(SUM(h.capacity), 0) as total_cap



                FROM (



                    SELECT DISTINCT s.hall_id, h.capacity



                    FROM seat_allocations sa



                    JOIN seats s ON sa.seat_id = s.seat_id



                    JOIN halls h ON s.hall_id = h.hall_id



                    WHERE sa.exam_id = %s



                ) h



                CROSS JOIN (



                    SELECT COUNT(*) as c FROM seat_allocations WHERE exam_id = %s



                ) cnt



            """,



                (exam_id, exam_id),



            )



            cap_info = cursor.fetchone()



            total_cap = cap_info.get("total_cap", 0) if cap_info else 0



            st_count = cap_info.get("st_count", 0) if cap_info else 0



            if total_cap < (st_count * 2):



                seating_conflicts = []



            else:



                cursor.execute(query_seating, (exam_id, exam_id))



                seating_conflicts = cursor.fetchall()



        else:



            cursor.execute(query_seating, (exam_id, exam_id))



            seating_conflicts = cursor.fetchall()







        # 2. Detect faculty assigned to multiple halls



        # during the same date and session.



        cursor.execute(



            """



            SELECT
                COALESCE(f.faculty_name, ia.faculty_name, 'Invigilator') AS faculty_name,
                es.exam_date,
                es.session,
                COUNT(*) AS hall_count,
                GROUP_CONCAT(
                    DISTINCT h.hall_name
                    ORDER BY h.hall_name
                ) AS halls
            FROM invigilator_assignments ia
            LEFT JOIN faculty f
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
                COALESCE(f.faculty_name, ia.faculty_name, 'Invigilator') AS faculty_name,
                h.hall_name,
                es.exam_date,
                es.session
            FROM invigilator_assignments ia
            LEFT JOIN faculty f
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







        # 4. Detect faculty assigned to an exam for a subject they teach



        cursor.execute(



            """



            SELECT



                ia.assignment_id,



                f.faculty_id,



                sub.subject_code,



                f.faculty_name,



                sub.subject_name,



                h.hall_name,



                es.exam_date,



                es.session



            FROM invigilator_assignments ia



            JOIN faculty f ON ia.faculty_id = f.faculty_id



            JOIN exam_sessions es ON ia.exam_id = es.exam_id



            JOIN subjects sub ON es.subject_id = sub.subject_id
            JOIN halls h ON ia.hall_id = h.hall_id



            JOIN faculty_subjects fs ON fs.faculty_id = f.faculty_id
            JOIN subjects fs_sub ON fs.subject_id = fs_sub.subject_id
            WHERE ia.exam_id = %s
              AND (fs.subject_id = es.subject_id OR UPPER(TRIM(fs_sub.subject_code)) = UPPER(TRIM(sub.subject_code)))



        """,



            (exam_id,),



        )



        teaching_conflicts = cursor.fetchall()







        # 5. Build response: distinguish hard conflicts from soft warnings



        total_hard_conflicts = (



            len(duplicate_seats)



            + len(invigilator_conflicts)



            + len(teaching_conflicts)



            + len(student_overlaps)



        )



        total_soft_warnings = (



            len(seating_conflicts)



            + len(availability_conflicts)



        )



        total_conflicts = total_hard_conflicts + len(seating_conflicts)







        return jsonify(



            {



                "exam_id": exam_id,



                "message": (



                    "No conflicts detected"



                    if total_conflicts == 0



                    else "Conflicts detected"



                ),



                "total_conflicts": total_conflicts,



                "total_hard_conflicts": total_hard_conflicts,



                "total_soft_warnings": total_soft_warnings,



                "duplicate_seats": duplicate_seats,



                "seating_conflicts": seating_conflicts,



                "invigilator_conflicts": invigilator_conflicts,



                "availability_conflicts": availability_conflicts,



                "teaching_conflicts": teaching_conflicts,



                "student_overlaps": student_overlaps,



                "hard_conflicts": [



                    *duplicate_seats,



                    *invigilator_conflicts,



                    *teaching_conflicts,



                    *student_overlaps,



                ],



                "soft_warnings": [



                    *seating_conflicts,



                    *availability_conflicts,



                ],



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



            SELECT exam_id, exam_date, session, start_time, end_time FROM exam_sessions WHERE exam_id = %s



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







        # Confirm that the exam exists and verify published status.



        cursor.execute(



            """



            SELECT



                es.exam_id,



                es.exam_name,



                es.exam_date,



                es.session,



                es.status,



                es.is_published,



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







        # Role-based privacy & publication enforcement



        from auth_routes import get_authenticated_user



        auth_user = get_authenticated_user()



        if auth_user and auth_user.get("role") == "student":



            if auth_user.get("student_id") and auth_user["student_id"] != student["student_id"]:



                return jsonify({"error": "Unauthorized: You can only view your own examination seat allocation"}), 403







        is_published = (exam.get("is_published") == 1 or str(exam.get("status", "")).lower() == "published")



        is_staff = auth_user and auth_user.get("role") in ("exam_admin", "admin", "hod", "invigilator")



        if not is_published and not is_staff:



            return jsonify({"error": "Seating arrangement for this examination has not been published yet"}), 403







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



                        "row_no": seat["row_no"],



                        "column_no": seat["column_no"],



                        "seat_number": f"R{seat['row_no']}C{seat['column_no']}", 



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











# ---------------------------------------------------------
# REPORT STUDY YEAR & SEMESTER MAPPING & VALIDATION
# ---------------------------------------------------------
REPORT_STUDY_YEAR_SEMESTERS = {
    1: ["Semester 1", "Semester 2"],
    2: ["Semester 3", "Semester 4"],
    3: ["Semester 5", "Semester 6"],
    4: ["Semester 7", "Semester 8"],
}

def validate_study_year_and_semester(study_year, semester):
    """
    Validates study year and semester mapping:
    1st Year -> Semester 1, Semester 2
    2nd Year -> Semester 3, Semester 4
    3rd Year -> Semester 5, Semester 6
    4th Year -> Semester 7, Semester 8
    Returns (is_valid, error_message, parsed_year)
    """
    if not study_year and not semester:
        return True, None, None

    parsed_year = None
    if study_year:
        try:
            parsed_year = int(study_year)
            if parsed_year not in REPORT_STUDY_YEAR_SEMESTERS:
                return False, f"Invalid study year '{study_year}'. Expected 1, 2, 3, or 4.", None
        except (ValueError, TypeError):
            cleaned = "".join([c for c in str(study_year) if c.isdigit()])
            if cleaned and int(cleaned) in REPORT_STUDY_YEAR_SEMESTERS:
                parsed_year = int(cleaned)
            else:
                return False, f"Invalid study year '{study_year}'. Expected 1, 2, 3, or 4.", None

    if semester:
        sem_str = str(semester).strip()
        if sem_str.isdigit():
            sem_str = f"Semester {sem_str}"

        if parsed_year is not None:
            allowed = REPORT_STUDY_YEAR_SEMESTERS[parsed_year]
            if sem_str not in allowed and semester not in allowed:
                return False, f"Invalid semester '{semester}' for study year {parsed_year}. Allowed semesters: {', '.join(allowed)}.", parsed_year
        else:
            all_allowed = [f"Semester {i}" for i in range(1, 9)]
            if sem_str not in all_allowed and semester not in all_allowed:
                return False, f"Invalid semester '{semester}'. Allowed values are Semester 1 to Semester 8.", None

    return True, None, parsed_year


@app.route("/reports/seating-chart", methods=["GET"])
def download_seating_chart():
    exam_id = request.args.get("exam_id", "").strip()
    hall_id = request.args.get("hall_id", "").strip()
    study_year = request.args.get("study_year", "").strip()
    semester = request.args.get("semester", "").strip()

    is_valid, err_msg, _ = validate_study_year_and_semester(study_year, semester)
    if not is_valid:
        return jsonify({"error": err_msg}), 400

    if not exam_id:
        return jsonify({"error": "exam_id query parameter is required"}), 400

    try:
        from flask import send_file
        from report_generator import (
            generate_seating_chart_pdf,
            get_exam_details,
            get_exam_title_slug,
            format_room_number,
        )
        pdf_buffer = generate_seating_chart_pdf(exam_id, hall_id=hall_id if hall_id else None)
        if not pdf_buffer:
            return jsonify({"error": "No seating allocations found for the selected examination"}), 404

        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        exam = get_exam_details(cur, exam_id)
        slug = get_exam_title_slug(exam) if exam else "Class_Test_1"

        room_str = ""
        if hall_id:
            cur.execute("SELECT room_no, hall_name FROM halls WHERE hall_id = %s", (hall_id,))
            hall_row = cur.fetchone()
            if hall_row:
                room_str = format_room_number(hall_row.get("room_no") or hall_row.get("hall_name"))
        cur.close()
        conn.close()

        if room_str and room_str != "—":
            filename = f"{slug}_Seating_Room_{room_str}.pdf"
        else:
            filename = f"{slug}_Seating_All_Rooms.pdf"

        return send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/reports/attendance-sheet", methods=["GET"])
def download_attendance_sheet():
    exam_id = request.args.get("exam_id", "").strip()
    hall_id = request.args.get("hall_id", "").strip()
    study_year = request.args.get("study_year", "").strip()
    semester = request.args.get("semester", "").strip()

    is_valid, err_msg, _ = validate_study_year_and_semester(study_year, semester)
    if not is_valid:
        return jsonify({"error": err_msg}), 400

    if not exam_id:
        return jsonify({"error": "exam_id query parameter is required"}), 400

    try:
        from flask import send_file
        from report_generator import (
            generate_attendance_sheet_pdf,
            get_exam_details,
            get_exam_title_slug,
            format_room_number,
        )
        pdf_buffer = generate_attendance_sheet_pdf(exam_id, hall_id=hall_id if hall_id else None)
        if not pdf_buffer:
            return jsonify({"error": "No seating allocations found for the selected examination"}), 404

        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        exam = get_exam_details(cur, exam_id)
        slug = get_exam_title_slug(exam) if exam else "Class_Test_1"

        room_str = ""
        if hall_id:
            cur.execute("SELECT room_no, hall_name FROM halls WHERE hall_id = %s", (hall_id,))
            hall_row = cur.fetchone()
            if hall_row:
                room_str = format_room_number(hall_row.get("room_no") or hall_row.get("hall_name"))
        cur.close()
        conn.close()

        if room_str and room_str != "—":
            filename = f"{slug}_Attendance_Room_{room_str}.pdf"
        else:
            filename = f"{slug}_Attendance_All_Rooms.pdf"

        return send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/reports/daily-duty-register", methods=["GET"])
def download_daily_duty_register():
    date_str = request.args.get("date", "").strip()
    session = request.args.get("session", "").strip()
    exam_id = request.args.get("exam_id", "").strip()
    study_year = request.args.get("study_year", "").strip()
    semester = request.args.get("semester", "").strip()

    is_valid, err_msg, _ = validate_study_year_and_semester(study_year, semester)
    if not is_valid:
        return jsonify({"error": err_msg}), 400

    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)

    if not date_str and exam_id:
        cur.execute("SELECT exam_date, session FROM exam_sessions WHERE exam_id = %s", (exam_id,))
        ex = cur.fetchone()
        if ex:
            date_str = str(ex["exam_date"])
            if not session:
                session = ex["session"]

    if not date_str:
        cur.close()
        conn.close()
        return jsonify({"error": "date or exam_id query parameter is required"}), 400

    try:
        from flask import send_file
        from report_generator import (
            generate_daily_duty_register_pdf,
            get_exam_details,
            get_exam_title_slug,
        )

        exam = None
        if exam_id:
            exam = get_exam_details(cur, exam_id)
        if not exam:
            query = """
                SELECT es.exam_id, es.exam_name, es.exam_date, es.session, es.start_time, es.end_time,
                       es.study_year, es.semester, es.academic_year, es.target_branch, es.target_sections,
                       es.exam_type, s.subject_code, s.subject_name
                FROM exam_sessions es
                JOIN subjects s ON es.subject_id = s.subject_id
                WHERE es.exam_date = %s
            """
            p_list = [date_str]
            if session:
                query += " AND es.session = %s"
                p_list.append(session)
            query += " ORDER BY es.exam_id DESC LIMIT 1"
            cur.execute(query, tuple(p_list))
            exam = cur.fetchone()

        slug = get_exam_title_slug(exam) if exam else "Class_Test_2"
        cur.close()
        conn.close()

        pdf_buffer = generate_daily_duty_register_pdf(
            date_str,
            session if session else None,
            exam_id=exam_id if exam_id else None
        )
        if not pdf_buffer:
            return jsonify({"error": "Could not generate duty register"}), 500

        filename = f"{slug}_Faculty_Duty_Register.pdf"
        return send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        if cur and not cur.closed:
            cur.close()
        if conn and conn.is_connected():
            conn.close()
        return jsonify({"error": str(e)}), 500


@app.route("/reports/combined-pdf", methods=["GET"])
def download_combined_pdf():
    exam_id = request.args.get("exam_id", "").strip()
    study_year = request.args.get("study_year", "").strip()
    semester = request.args.get("semester", "").strip()

    is_valid, err_msg, _ = validate_study_year_and_semester(study_year, semester)
    if not is_valid:
        return jsonify({"error": err_msg}), 400

    if not exam_id:
        return jsonify({"error": "exam_id query parameter is required"}), 400

    try:
        from flask import send_file
        from report_generator import generate_combined_reports_pdf, get_exam_details, get_exam_title_slug
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        exam = get_exam_details(cur, exam_id)
        slug = get_exam_title_slug(exam) if exam else "Complete"
        cur.close()
        conn.close()

        pdf_buffer = generate_combined_reports_pdf(exam_id)
        if not pdf_buffer:
            return jsonify({"error": "Could not generate combined report"}), 404

        filename = f"{slug}_Complete_Examination_Reports.pdf"
        return send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/reports/export-zip", methods=["GET"])
def download_reports_zip():
    exam_id = request.args.get("exam_id", "").strip()
    study_year = request.args.get("study_year", "").strip()
    semester = request.args.get("semester", "").strip()

    is_valid, err_msg, _ = validate_study_year_and_semester(study_year, semester)
    if not is_valid:
        return jsonify({"error": err_msg}), 400

    if not exam_id:
        return jsonify({"error": "exam_id query parameter is required"}), 400

    try:
        from flask import send_file
        from report_generator import generate_reports_zip, get_exam_details, get_exam_title_slug
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        exam = get_exam_details(cur, exam_id)
        slug = get_exam_title_slug(exam) if exam else "Examination"
        cur.close()
        conn.close()

        zip_buffer = generate_reports_zip(exam_id)
        if not zip_buffer:
            return jsonify({"error": "Could not generate reports zip"}), 404

        filename = f"{slug}_Examination_Reports.zip"
        return send_file(
            zip_buffer,
            mimetype="application/zip",
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/reports/preview-data", methods=["GET"])
def get_report_preview_api():
    exam_id = request.args.get("exam_id", "").strip()
    hall_id = request.args.get("hall_id", "").strip()
    study_year = request.args.get("study_year", "").strip()
    semester = request.args.get("semester", "").strip()

    if not exam_id:
        return jsonify({"error": "exam_id query parameter is required"}), 400

    is_valid, err_msg, parsed_year = validate_study_year_and_semester(study_year, semester)
    if not is_valid:
        return jsonify({"error": err_msg}), 400

    try:
        from report_generator import get_report_preview_data
        data = get_report_preview_data(exam_id, hall_id=hall_id if hall_id else None)
        if not data:
            return jsonify({"error": "Examination or seating records not found"}), 404

        exam_sy = data.get("exam", {}).get("study_year")
        exam_sem = data.get("exam", {}).get("semester")
        if parsed_year is not None and exam_sy and int(exam_sy) != parsed_year:
            return jsonify({"error": f"Examination does not belong to study year {parsed_year}"}), 400
        if semester and exam_sem and exam_sem != semester:
            return jsonify({"error": f"Examination does not belong to {semester}"}), 400

        return jsonify(data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/reports/filter-options", methods=["GET"])
def get_report_filter_options():
    try:
        academic_year = request.args.get("academic_year", "").strip()
        study_year = request.args.get("study_year", "").strip()
        semester = request.args.get("semester", "").strip()
        department = request.args.get("department", "").strip()

        is_valid, err_msg, parsed_year = validate_study_year_and_semester(study_year, semester)
        if not is_valid:
            return jsonify({"error": err_msg}), 400

        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)

        cur.execute("SELECT DISTINCT academic_year FROM exam_sessions WHERE academic_year IS NOT NULL AND academic_year != '' ORDER BY academic_year DESC")
        academic_years = [r["academic_year"] for r in cur.fetchall()]
        if not academic_years:
            academic_years = ["2026-2027"]

        query = """
            SELECT es.exam_id, es.exam_name, es.exam_date, es.session, es.start_time, es.end_time,
                   es.study_year, es.semester, es.academic_year, es.target_branch, es.target_sections,
                   s.subject_code, s.subject_name,
                   (SELECT COUNT(*) FROM seat_allocations sa WHERE sa.exam_id = es.exam_id) as allocated_count,
                   (SELECT COUNT(*) FROM invigilator_assignments ia WHERE ia.exam_id = es.exam_id) as invig_count
            FROM exam_sessions es
            JOIN subjects s ON es.subject_id = s.subject_id
            WHERE 1=1
        """
        params = []
        if academic_year:
            query += " AND es.academic_year = %s"
            params.append(academic_year)
        if parsed_year is not None:
            query += " AND es.study_year = %s"
            params.append(parsed_year)
        if semester:
            query += " AND es.semester = %s"
            params.append(semester)
        if department:
            query += " AND (es.target_branch = %s OR es.target_branch = 'All' OR es.target_branch IS NULL OR es.target_branch LIKE %s)"
            params.append(department)
            params.append(f"%{department}%")

        query += " ORDER BY es.exam_date DESC, es.exam_id DESC"
        cur.execute(query, tuple(params))
        exams = cur.fetchall()
        cur.close()
        conn.close()

        # Format dates as string for JSON serialization
        for e in exams:
            if e.get("exam_date"):
                e["exam_date"] = str(e["exam_date"])
            if e.get("start_time"):
                e["start_time"] = str(e["start_time"])
            if e.get("end_time"):
                e["end_time"] = str(e["end_time"])

        if parsed_year in REPORT_STUDY_YEAR_SEMESTERS:
            available_semesters = REPORT_STUDY_YEAR_SEMESTERS[parsed_year]
        else:
            available_semesters = [f"Semester {i}" for i in range(1, 9)]

        return jsonify({
            "academic_years": academic_years,
            "study_years": [1, 2, 3, 4],
            "semesters": available_semesters,
            "study_year_mapping": {
                "1": ["Semester 1", "Semester 2"],
                "2": ["Semester 3", "Semester 4"],
                "3": ["Semester 5", "Semester 6"],
                "4": ["Semester 7", "Semester 8"],
            },
            "exams": exams
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500



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



            SELECT COALESCE(ia.faculty_id, ia.original_faculty_id) AS faculty_id,
                   COALESCE(f.faculty_name, ia.faculty_name, 'Invigilator') AS faculty_name,
                   COALESCE(f.department, ia.department, 'CSE') AS department,
                   h.hall_id, h.hall_name
            FROM invigilator_assignments ia
            LEFT JOIN faculty f ON f.faculty_id = ia.faculty_id
            JOIN halls h ON h.hall_id = ia.hall_id
            WHERE ia.exam_id = %s
        """
        params = [exam_id]

        if faculty_id:
            sql += " AND (ia.faculty_id = %s OR ia.original_faculty_id = %s)"
            params.extend([faculty_id, faculty_id])

        sql += " ORDER BY COALESCE(f.faculty_name, ia.faculty_name), h.hall_name"



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











SEMESTER_TO_YEAR_MAP = {
    "Semester 1": 1, "Semester 2": 1,
    "Semester 3": 2, "Semester 4": 2,
    "Semester 5": 3, "Semester 6": 3,
    "Semester 7": 4, "Semester 8": 4,
    "1": 1, "2": 1, "3": 2, "4": 2,
    "5": 3, "6": 3, "7": 4, "8": 4,
}

YEAR_TO_SEMESTERS_MAP = {
    1: ["Semester 1", "Semester 2"],
    2: ["Semester 3", "Semester 4"],
    3: ["Semester 5", "Semester 6"],
    4: ["Semester 7", "Semester 8"],
}

@app.route("/students", methods=["GET"])
def get_students():
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        where_clauses = ["1=1"]
        params = []

        sec = request.args.get("section")
        sem = request.args.get("semester")
        sy = request.args.get("study_year")
        ay = request.args.get("academic_year")
        dept = request.args.get("department")

        target_year = None
        if sy and sy != "ALL":
            try:
                target_year = int(sy)
            except Exception:
                target_year = None
        elif sem and sem != "ALL":
            target_year = SEMESTER_TO_YEAR_MAP.get(sem.strip())

        # Student Master Roster is shared across both semesters of an academic year
        if target_year:
            where_clauses.append("(study_year = %s OR year = %s)")
            params.extend([target_year, target_year])
        elif sem and sem != "ALL":
            where_clauses.append("semester = %s")
            params.append(sem.strip())

        if sec and sec != "ALL":
            where_clauses.append("section = %s")
            params.append(sec.strip().upper())
        if ay and ay != "ALL":
            where_clauses.append("academic_year = %s")
            params.append(ay.strip())
        if dept and dept != "ALL":
            where_clauses.append("(department = %s OR branch = %s)")
            params.extend([dept.strip().upper(), dept.strip().upper()])

        where_str = " AND ".join(where_clauses)
        cursor.execute(f"""
            SELECT
                student_id,
                hall_ticket_no,
                name,
                department,
                COALESCE(study_year, year, 3) AS study_year,
                COALESCE(year, study_year, 3) AS year,
                semester,
                section,
                academic_year,
                is_active
            FROM students
            WHERE {where_str}
            ORDER BY section, hall_ticket_no
        """, tuple(params))

        students = cursor.fetchall()

        # If active master students not found for past academic year, check historical archive
        if not students and ay and ay != "ALL":
            hist_where = ["academic_year = %s"]
            hist_params = [ay.strip()]
            if target_year:
                hist_where.append("study_year = %s")
                hist_params.append(target_year)
            if sec and sec != "ALL":
                hist_where.append("section = %s")
                hist_params.append(sec.strip().upper())
            if dept and dept != "ALL":
                hist_where.append("department = %s")
                hist_params.append(dept.strip().upper())
            cursor.execute(f"""
                SELECT
                    history_id as student_id,
                    hall_ticket_no,
                    name,
                    department,
                    study_year,
                    study_year as year,
                    semester,
                    section,
                    academic_year,
                    1 as is_active,
                    1 as is_historical_archive
                FROM student_roster_history
                WHERE {" AND ".join(hist_where)}
                ORDER BY section, hall_ticket_no
            """, tuple(hist_params))
            students = cursor.fetchall()

        # Attach shared semester mapping to all candidate records
        for st in students:
            curr_sy = st.get("study_year") or target_year or 3
            st["shared_semesters"] = YEAR_TO_SEMESTERS_MAP.get(curr_sy, ["Semester 1", "Semester 2"])
            if sem and sem != "ALL":
                st["semester"] = sem.strip()

        return jsonify({
            "message": "Students retrieved successfully",
            "total_students": len(students),
            "students": students,
        }), 200







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

        # Automatic date-based status synchronization before fetching
        from admin_routes import sync_examination_statuses
        sync_examination_statuses(cursor, connection)

        query = """
            SELECT
                e.exam_id,
                e.subject_id,
                COALESCE(e.exam_name, s.subject_name) AS exam_name,
                s.subject_code,
                s.subject_name,
                e.exam_date,
                e.session,
                e.start_time,
                e.end_time,
                COALESCE(e.expected_students, 0) AS expected_students,
                COALESCE(e.is_published, 0) AS is_published,
                COALESCE(e.exam_type, 'Class Test 1') AS exam_type,
                COALESCE(e.status, 'Scheduled') AS status,
                COALESCE(e.academic_year, '2026-2027') AS academic_year,
                COALESCE(e.study_year, 3) AS study_year,
                COALESCE(e.semester, 'Semester 5') AS semester,
                COALESCE(e.target_branch, 'CSE') AS target_branch,
                COALESCE(e.target_sections, 'ALL') AS target_sections,
                e.cancellation_reason,
                e.cancelled_at,
                e.cancelled_by,
                e.rescheduled_from,
                e.rescheduled_to,
                COALESCE(e.is_archived, 0) AS is_archived,
                e.archived_at,
                e.archived_by,
                COALESCE(e.is_retention_locked, 0) AS is_retention_locked,
                e.retention_reason,
                (SELECT COUNT(*) FROM exam_registrations er WHERE er.exam_id = e.exam_id) AS student_count,
                (SELECT COUNT(*) FROM seat_allocations sa WHERE sa.exam_id = e.exam_id) AS seat_allocation_count,
                (SELECT COUNT(*) FROM invigilator_assignments ia WHERE ia.exam_id = e.exam_id) AS invigilator_count,
                (SELECT COUNT(*) FROM exam_halls eh WHERE eh.exam_id = e.exam_id) AS hall_count,
                (SELECT COALESCE(SUM(h.capacity), 0) FROM exam_halls eh JOIN halls h ON eh.hall_id = h.hall_id WHERE eh.exam_id = e.exam_id) AS hall_capacity
            FROM exam_sessions e
            JOIN subjects s ON e.subject_id = s.subject_id
            ORDER BY e.exam_date, e.start_time, e.exam_id
        """







        cursor.execute(query)



        exams = cursor.fetchall()

        from admin_routes import sync_and_get_exam_students
        for ex in exams:
            # Normalize status
            cur_status = ex.get("status")
            if cur_status == "published":
                ex["status"] = "Published"
            elif cur_status == "draft" or not cur_status:
                ex["status"] = "Scheduled"
            elif cur_status in ("Completed", "Cancelled", "In Progress", "Published", "Scheduled"):
                pass
            else:
                ex["status"] = "Scheduled"

            if ex.get("exam_date"):
                ex["exam_date"] = str(ex["exam_date"])
            if ex.get("cancelled_at"):
                ex["cancelled_at"] = str(ex["cancelled_at"])
            if ex.get("archived_at"):
                ex["archived_at"] = str(ex["archived_at"])

            if ex.get("student_count", 0) == 0:
                st_list, _ = sync_and_get_exam_students(cursor, connection, ex["exam_id"])
                ex["student_count"] = len(st_list)
                ex["expected_students"] = len(st_list)

        
        from auth_routes import get_authenticated_user
        auth_user = get_authenticated_user()
        if auth_user and auth_user.get("role") == "hod":
            # HOD must only see examinations whose plans have been published by Admin,
            # completed examinations for historical viewing, or cancelled examinations.
            # Draft and unpublished scheduled examinations are strictly hidden.
            exams = [
                ex for ex in exams
                if ex.get("is_published") in (1, True, "1")
                or ex.get("status") in ("Published", "Completed", "Cancelled", "In-Progress", "In Progress")
            ]
            for ex in exams:
                # If seating is not published or exam is cancelled/draft, hide unpublished allocations
                if not ex.get("is_published") and ex.get("status") not in ("Published", "Completed"):
                    ex["seat_allocation_count"] = 0

        return {




            "message": "Examinations retrieved successfully",



            "total_exams": len(exams),



            "exams": exams,



        }, 200







    except Exception as error:



        print("Error retrieving examinations:", error)



        return {"error": "Failed to retrieve examinations"}, 500







    finally:



        if cursor is not None:



            cursor.close()



        if connection is not None and connection.is_connected():



            connection.close()













# =========================================================
# FEATURE ENHANCEMENT: STUDENT REGISTERED EXAMS & AUTOMATIC SEAT
# =========================================================
def _resolve_authenticated_student(auth_user, cursor, connection=None):
    """
    Resolves the authenticated student's student_id and full student profile from the database.
    If student_id is missing from auth_user, securely resolves it via hall_ticket_no
    (email prefix) or name, and auto-links the user record.
    """
    student_id = auth_user.get("student_id")
    if not student_id:
        email = (auth_user.get("email") or "").strip()
        ht_candidate = email.split("@")[0].upper() if "@" in email else email.upper()
        cursor.execute("SELECT student_id FROM students WHERE hall_ticket_no = %s LIMIT 1", (ht_candidate,))
        row = cursor.fetchone()
        if not row and auth_user.get("full_name"):
            cursor.execute("SELECT student_id FROM students WHERE UPPER(name) = %s LIMIT 1", (auth_user["full_name"].strip().upper(),))
            row = cursor.fetchone()
        if row:
            student_id = row["student_id"]
            if connection and auth_user.get("user_id"):
                try:
                    cursor.execute("UPDATE users SET student_id = %s WHERE user_id = %s", (student_id, auth_user["user_id"]))
                    connection.commit()
                except Exception:
                    pass

    if not student_id:
        return None, None

    cursor.execute("""
        SELECT student_id, hall_ticket_no, name, department, branch, study_year, semester,
               COALESCE(section, 'A') AS section, academic_year
        FROM students
        WHERE student_id = %s
    """, (student_id,))
    student_profile = cursor.fetchone()
    return student_id, student_profile


@app.route("/student/my-exams", methods=["GET"])
def get_student_my_exams():
    """
    Returns published examinations relevant to the authenticated student:
    Matched by direct seat allocation, explicit exam registration, or cohort eligibility
    (academic year, study year, semester, branch, section).
    Includes examination status, schedule timings, and seat allocation summary.
    """
    from auth_routes import get_authenticated_user
    auth_user = get_authenticated_user()
    if not auth_user:
        return jsonify({"error": "Authentication required"}), 401
    if auth_user.get("role") != "student":
        return jsonify({"error": "Student access required"}), 403

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        student_id, student = _resolve_authenticated_student(auth_user, cursor, connection)
        if not student_id or not student:
            return jsonify({"error": "Student profile not linked to an active student record"}), 404

        # Sync statuses for date-based auto-completion
        from admin_routes import sync_examination_statuses
        try:
            sync_examination_statuses(cursor, connection)
        except Exception:
            pass

        # Query all published examinations relevant to this student
        # Matches if:
        # 1. Student has a seat allocated in seat_allocations
        # 2. Student is registered in exam_registrations
        # 3. Student matches the examination's target cohort (study_year, semester, branch, section)
        cursor.execute("""
            SELECT DISTINCT
                es.exam_id,
                COALESCE(es.exam_name, sub.subject_name) AS exam_name,
                es.exam_date,
                es.session,
                es.start_time,
                es.end_time,
                COALESCE(es.exam_type, 'Class Test 1') AS exam_type,
                COALESCE(es.status, 'Scheduled') AS status,
                COALESCE(es.is_published, 0) AS is_published,
                sub.subject_code,
                sub.subject_name,
                sa.allocation_id,
                h.hall_id,
                h.hall_name,
                h.room_no,
                se.row_no,
                se.column_no
            FROM exam_sessions es
            JOIN subjects sub ON es.subject_id = sub.subject_id
            LEFT JOIN seat_allocations sa ON sa.exam_id = es.exam_id AND sa.student_id = %s
            LEFT JOIN seats se ON sa.seat_id = se.seat_id
            LEFT JOIN halls h ON se.hall_id = h.hall_id
            WHERE (es.is_published = 1 OR es.status = 'Published' OR es.status = 'Completed')
              AND es.status != 'Cancelled'
              AND (
                  sa.allocation_id IS NOT NULL
                  OR EXISTS (SELECT 1 FROM exam_registrations er WHERE er.exam_id = es.exam_id AND er.student_id = %s)
                  OR (
                      es.study_year = %s
                      AND es.semester = %s
                      AND (es.target_branch IS NULL OR es.target_branch = '' OR es.target_branch = 'ALL' OR es.target_branch = %s OR es.target_branch = %s)
                      AND (es.target_sections IS NULL OR es.target_sections = '' OR FIND_IN_SET(%s, REPLACE(es.target_sections, ' ', '')) > 0)
                  )
              )
            ORDER BY es.exam_date, es.start_time, es.exam_id
        """, (
            student_id,
            student_id,
            student.get("study_year"),
            student.get("semester"),
            student.get("department"),
            student.get("branch") or student.get("department"),
            student.get("section") or "A"
        ))
        rows = cursor.fetchall()

        exams = []
        for r in rows:
            st = str(r["start_time"]) if r.get("start_time") else ("09:30:00" if r["session"] == "FN" else "13:30:00")
            et = str(r["end_time"]) if r.get("end_time") else ("12:30:00" if r["session"] == "FN" else "16:30:00")
            is_alloc = r.get("allocation_id") is not None

            bench_desc = None
            if is_alloc and r.get("row_no") is not None and r.get("column_no") is not None:
                bench_desc = f"Row {r['row_no']}, Column {r['column_no']}"

            exams.append({
                "exam_id": r["exam_id"],
                "exam_name": r["exam_name"],
                "exam_date": str(r["exam_date"]),
                "session": r["session"],
                "start_time": st,
                "end_time": et,
                "exam_type": r["exam_type"],
                "status": r["status"],
                "is_published": int(r["is_published"]),
                "subject_code": r["subject_code"],
                "subject_name": r["subject_name"],
                "is_allocated": is_alloc,
                "hall_name": r["hall_name"] if is_alloc else None,
                "room_no": r["room_no"] if is_alloc else None,
                "row_no": r["row_no"] if is_alloc else None,
                "column_no": r["column_no"] if is_alloc else None,
                "bench_number": bench_desc
            })

        return jsonify({
            "exams": exams,
            "student": student,
            "student_id": student_id,
            "total_registered_published": len(exams)
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor: cursor.close()
        if connection and connection.is_connected(): connection.close()


@app.route("/student/my-seat", methods=["GET"])
def get_student_my_seat():
    """
    Returns the authenticated student's allocated seat details, hall, room,
    timing, and standardized reporting instructions for a specified published exam.
    Enforces security boundary (only access authenticated student's seat).
    """
    from auth_routes import get_authenticated_user
    auth_user = get_authenticated_user()
    if not auth_user:
        return jsonify({"error": "Authentication required"}), 401
    if auth_user.get("role") != "student":
        return jsonify({"error": "Student access required"}), 403

    exam_id = request.args.get("exam_id")
    if not exam_id:
        return jsonify({"error": "exam_id query parameter is required"}), 400

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        student_id, student = _resolve_authenticated_student(auth_user, cursor, connection)
        if not student_id or not student:
            return jsonify({"error": "Student profile not linked to an active student record"}), 404

        # Sync statuses
        from admin_routes import sync_examination_statuses
        try:
            sync_examination_statuses(cursor, connection)
        except Exception:
            pass

        # Verify exam exists
        cursor.execute("""
            SELECT es.exam_id, COALESCE(es.exam_name, sub.subject_name) AS exam_name,
                   es.exam_date, es.session, es.start_time, es.end_time,
                   COALESCE(es.exam_type, 'Class Test 1') AS exam_type,
                   COALESCE(es.status, 'Scheduled') AS status,
                   COALESCE(es.is_published, 0) AS is_published,
                   es.study_year, es.semester, es.target_branch, es.target_sections,
                   sub.subject_code, sub.subject_name
            FROM exam_sessions es
            JOIN subjects sub ON es.subject_id = sub.subject_id
            WHERE es.exam_id = %s
        """, (exam_id,))
        exam = cursor.fetchone()

        if not exam:
            return jsonify({"error": "Examination session not found"}), 404

        if exam["status"] == "Cancelled":
            return jsonify({"error": "This examination session has been cancelled."}), 403

        # Must be published (or completed)
        is_published = (exam["is_published"] == 1 or exam["status"] in ("Published", "Completed"))
        if not is_published:
            return jsonify({"error": "Seating arrangement for this examination has not been published yet."}), 403

        # Verify student eligibility
        # 1) seat_allocations
        cursor.execute("""
            SELECT
                sa.allocation_id,
                h.hall_id,
                h.hall_name,
                h.room_no,
                se.row_no,
                se.column_no
            FROM seat_allocations sa
            JOIN seats se ON sa.seat_id = se.seat_id
            JOIN halls h ON se.hall_id = h.hall_id
            WHERE sa.exam_id = %s AND sa.student_id = %s
        """, (exam_id, student_id))
        seat_alloc = cursor.fetchone()

        # If no seat allocated yet, verify student is eligible (registered or cohort match)
        if not seat_alloc:
            cursor.execute("SELECT registration_id FROM exam_registrations WHERE exam_id = %s AND student_id = %s", (exam_id, student_id))
            reg = cursor.fetchone()

            is_cohort_match = False
            if not reg:
                s_yr = student.get("study_year")
                s_sem = student.get("semester")
                s_dept = student.get("department")
                s_branch = student.get("branch") or s_dept
                s_sec = student.get("section") or "A"

                branch_ok = (not exam["target_branch"] or exam["target_branch"] in ("ALL", "", s_dept, s_branch))
                sec_list = [s.strip() for s in exam["target_sections"].split(",")] if exam["target_sections"] else []
                sec_ok = (not exam["target_sections"] or exam["target_sections"] == "ALL" or s_sec in sec_list)
                yr_ok = (exam["study_year"] == s_yr)
                sem_ok = (exam["semester"] == s_sem)
                is_cohort_match = branch_ok and sec_ok and yr_ok and sem_ok

            if not reg and not is_cohort_match:
                return jsonify({"error": "You are not registered or eligible for this examination session."}), 403

            st_val = str(exam["start_time"]) if exam.get("start_time") else ("09:30:00" if exam["session"] == "FN" else "13:30:00")
            et_val = str(exam["end_time"]) if exam.get("end_time") else ("12:30:00" if exam["session"] == "FN" else "16:30:00")

            return jsonify({
                "allocated": False,
                "student": student,
                "exam": {
                    "exam_id": exam["exam_id"],
                    "exam_name": exam["exam_name"],
                    "exam_date": str(exam["exam_date"]),
                    "session": exam["session"],
                    "start_time": st_val,
                    "end_time": et_val,
                    "exam_type": exam["exam_type"],
                    "status": exam["status"],
                    "subject_code": exam["subject_code"],
                    "subject_name": exam["subject_name"]
                },
                "message": "Examination published – Your seat allocation is currently being finalized by the department. Please check back shortly."
            }), 200

        # Allocated! Build full pass
        st_val = str(exam["start_time"]) if exam.get("start_time") else ("09:30:00" if exam["session"] == "FN" else "13:30:00")
        et_val = str(exam["end_time"]) if exam.get("end_time") else ("12:30:00" if exam["session"] == "FN" else "16:30:00")
        hall_display = seat_alloc["hall_name"]
        room_display = seat_alloc["room_no"] or seat_alloc["hall_name"]

        instructions = [
            f"Report to the assigned examination hall at least 15 minutes prior to the start time ({st_val[:5]}).",
            f"Carry your physical College Identity Card and Official Hall Ticket ({student['hall_ticket_no']}).",
            "Electronic gadgets, mobile phones, smartwatches, and unauthorized materials are strictly prohibited.",
            f"Occupy only your allocated seat at Row {seat_alloc['row_no']}, Column {seat_alloc['column_no']} in {hall_display} (Room {room_display})."
        ]

        return jsonify({
            "allocated": True,
            "student": student,
            "exam": {
                "exam_id": exam["exam_id"],
                "exam_name": exam["exam_name"],
                "exam_date": str(exam["exam_date"]),
                "session": exam["session"],
                "start_time": st_val,
                "end_time": et_val,
                "exam_type": exam["exam_type"],
                "status": exam["status"],
                "subject_code": exam["subject_code"],
                "subject_name": exam["subject_name"]
            },
            "seat": {
                "allocation_id": seat_alloc["allocation_id"],
                "hall_id": seat_alloc["hall_id"],
                "hall_name": hall_display,
                "room_no": room_display,
                "row_no": seat_alloc["row_no"],
                "column_no": seat_alloc["column_no"],
                "bench_number": f"Row {seat_alloc['row_no']}, Column {seat_alloc['column_no']}"
            },
            "reporting_instructions": instructions
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor: cursor.close()
        if connection and connection.is_connected(): connection.close()




if __name__ == "__main__":



    app.run(debug=True)






# =========================================================

# -------------------------------------------------------------
# Background Periodic Examination Status Synchronizer
# -------------------------------------------------------------
def _init_exam_status_syncer():
    import threading, time
    try:
        from admin_routes import sync_examination_statuses
        sync_examination_statuses()
    except Exception as _e_init:
        print("Notice: initial status sync on boot:", _e_init)

    def _sync_loop():
        while True:
            time.sleep(60)
            try:
                from admin_routes import sync_examination_statuses
                sync_examination_statuses()
            except Exception:
                pass

    t = threading.Thread(target=_sync_loop, daemon=True, name="ExamStatusSyncThread")
    t.start()

try:
    _init_exam_status_syncer()
except Exception as _e_thr:
    print("Notice: could not start sync thread:", _e_thr)
