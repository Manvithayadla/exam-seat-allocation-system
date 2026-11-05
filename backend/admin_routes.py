from flask import Blueprint, request, jsonify

import json







from db import get_db_connection







from file_parser import parse_student_file, parse_faculty_file, parse_master_roster_file, parse_faculty_subject_file, parse_faculty_directory_file, parse_semester_teaching_file, match_faculty_record, match_subject_record







import re







import heapq







from datetime import datetime, timedelta, time















admin_bp = Blueprint("admin", __name__)























@admin_bp.before_request







def enforce_admin_rbac():







    # Only protect mutation operations (POST, PUT, DELETE)







    if request.method in ("POST", "PUT", "DELETE"):







        # Duty responses and messages by invigilators are permitted







        if "/respond" in request.path or "/message" in request.path or "/notifications" in request.path:







            return None















        from auth_routes import get_authenticated_user







        user = get_authenticated_user()







        if not user:







            return jsonify({"error": "Authentication required"}), 401







        if user.get("role") not in ("exam_admin", "admin", "hod"):







            return jsonify({"error": "Administrative permissions required"}), 403























# =========================================================







# HELPER: TIME OVERLAP CHECK







# =========================================================







def parse_time_to_minutes(time_str):







    if not time_str:







        return None







    time_str = str(time_str).strip().upper()







    m = re.match(r"(\d{1,2}):(\d{2})\s*(AM|PM)?", time_str)







    if not m:







        return None







    hours = int(m.group(1))







    minutes = int(m.group(2))







    period = m.group(3)







    if period == "PM" and hours < 12:







        hours += 12







    elif period == "AM" and hours == 12:







        hours = 0







    return hours * 60 + minutes























def check_exam_overlap(exam_a, exam_b):







    """







    Returns True if exam_a and exam_b have overlapping date and time.







    """







    date_a = str(exam_a.get("exam_date", ""))







    date_b = str(exam_b.get("exam_date", ""))







    if date_a != date_b:







        return False















    start_a = parse_time_to_minutes(exam_a.get("start_time"))







    end_a = parse_time_to_minutes(exam_a.get("end_time"))







    start_b = parse_time_to_minutes(exam_b.get("start_time"))







    end_b = parse_time_to_minutes(exam_b.get("end_time"))















    if start_a is not None and end_a is not None and start_b is not None and end_b is not None:







        return max(start_a, start_b) < min(end_a, end_b)















    # Fallback to session equality (e.g. both 'FN' or both 'AN')







    sess_a = (exam_a.get("session") or "").upper().strip()







    sess_b = (exam_b.get("session") or "").upper().strip()







    return sess_a == sess_b























# =========================================================







# SUBJECTS MANAGEMENT (LIST, ADD, EDIT, DELETE)







# =========================================================















@admin_bp.route("/subjects", methods=["GET"])







def get_subjects():







    connection = None







    cursor = None







    try:







        connection = get_db_connection()







        cursor = connection.cursor(dictionary=True)







        cursor.execute("SELECT subject_id, subject_code, subject_name, department, academic_year, semester, study_year, course_type, category, is_active FROM subjects ORDER BY subject_code")







        subjects = cursor.fetchall()







        return jsonify({"subjects": subjects, "total_subjects": len(subjects)}), 200







    except Exception as e:







        return jsonify({"error": str(e)}), 500







    finally:







        if cursor: cursor.close()







        if connection and connection.is_connected(): connection.close()





























@admin_bp.route("/subjects", methods=["POST"])







def create_subject():







    data = request.get_json(silent=True) or {}







    code = data.get("subject_code", "").strip().upper()



    name = data.get("subject_name", "").strip()



    dept = data.get("department", "CSE").strip().upper() or "CSE"



    sem = data.get("semester", "").strip()



    study_year = data.get("study_year")



    course_type = data.get("course_type", "Theory").strip() or "Theory"



    category = data.get("category", "Core").strip() or "Core"







    if not code or not name:



        return jsonify({"error": "subject_code and subject_name are required"}), 400







    connection = None



    cursor = None



    try:



        connection = get_db_connection()



        cursor = connection.cursor(dictionary=True)



        cursor.execute("SELECT subject_id FROM subjects WHERE subject_code = %s", (code,))



        if cursor.fetchone():



            return jsonify({"error": f"Subject with code '{code}' already exists"}), 409







        ay = data.get("academic_year", "2026-2027").strip() or "2026-2027"

        cursor.execute("""

            INSERT INTO subjects (subject_code, subject_name, department, academic_year, semester, study_year, course_type, category, is_active)

            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 1)

        """, (code, name, dept, ay, sem, study_year, course_type, category))



        connection.commit()



        new_id = cursor.lastrowid



        return jsonify({



            "message": "Subject created successfully",



            "subject_id": new_id,



            "subject_code": code,



            "subject_name": name,



            "department": dept,



            "semester": sem,



            "study_year": study_year,



            "category": category



        }), 201







    except Exception as e:







        if connection and connection.is_connected(): connection.rollback()







        return jsonify({"error": str(e)}), 500







    finally:







        if cursor: cursor.close()







        if connection and connection.is_connected(): connection.close()





























@admin_bp.route("/subjects/<int:subject_id>", methods=["PUT", "PATCH"])

def update_subject(subject_id):

    """Update existing subject record in MySQL while preserving existing exam/student relationships."""

    data = request.get_json(silent=True) or {}



    code = data.get("subject_code", "").strip().upper()

    name = data.get("subject_name", "").strip()

    dept = data.get("department", "CSE").strip().upper() or "CSE"

    ay = data.get("academic_year", "2026-2027").strip() or "2026-2027"

    sem = data.get("semester", "").strip()

    study_year = data.get("study_year")

    category = data.get("category", "Core").strip() or "Core"

    course_type = data.get("course_type", "Theory").strip() or "Theory"



    # Validate mandatory fields

    if not code:

        return jsonify({"error": "Subject code is required."}), 400

    if not name:

        return jsonify({"error": "Course title is required."}), 400

    if not dept:

        return jsonify({"error": "Department is required."}), 400

    if not ay:

        return jsonify({"error": "Academic year is required."}), 400

    if not sem:

        return jsonify({"error": "Semester is required."}), 400

    if study_year is None or str(study_year).strip() == "":

        return jsonify({"error": "Study year is required."}), 400



    try:

        study_year = int(study_year)

        if study_year < 1 or study_year > 4:

            return jsonify({"error": "Study year must be between 1 and 4."}), 400

    except (ValueError, TypeError):

        return jsonify({"error": "Study year must be a valid number (1-4)."}), 400



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        # Check if subject exists

        cursor.execute(

            "SELECT subject_id, subject_code, subject_name, academic_year, department, semester FROM subjects WHERE subject_id = %s",

            (subject_id,)

        )

        existing_subject = cursor.fetchone()

        if not existing_subject:

            return jsonify({"error": "Subject not found."}), 404



        # Check unique code conflict across subjects

        cursor.execute(

            "SELECT subject_id FROM subjects WHERE subject_code = %s AND subject_id != %s",

            (code, subject_id)

        )

        if cursor.fetchone():

            return jsonify({"error": f"Subject code '{code}' is already used by another course."}), 409



        # Prevent duplicate subjects within the same academic year, department, and semester

        cursor.execute("""

            SELECT subject_id, subject_code, subject_name 

            FROM subjects 

            WHERE LOWER(TRIM(subject_name)) = LOWER(TRIM(%s))

              AND academic_year = %s 

              AND department = %s 

              AND semester = %s 

              AND subject_id != %s

        """, (name, ay, dept, sem, subject_id))

        duplicate_course = cursor.fetchone()

        if duplicate_course:

            return jsonify({

                "error": f"A course with title '{name}' already exists in {dept} for {sem} ({ay})."

            }), 409



        # Update existing subject record in MySQL without creating a new record

        cursor.execute("""

            UPDATE subjects

            SET subject_code = %s,

                subject_name = %s,

                department = %s,

                academic_year = %s,

                semester = %s,

                study_year = %s,

                course_type = %s,

                category = %s

            WHERE subject_id = %s

        """, (code, name, dept, ay, sem, study_year, course_type, category, subject_id))



        connection.commit()



        # Audit log if audit_logs table exists

        try:

            from auth_routes import get_authenticated_user

            user = get_authenticated_user()

            performed_by = user.get("email", "admin") if user else "admin"

            cursor.execute("""

                INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                VALUES (%s, %s, %s, %s, %s)

            """, (

                "UPDATE_SUBJECT",

                "subject",

                str(subject_id),

                f"Updated subject #{subject_id}: code='{code}', title='{name}', dept='{dept}', sem='{sem}', ay='{ay}'",

                performed_by

            ))

            connection.commit()

        except Exception:

            pass



        return jsonify({

            "message": "Subject updated successfully",

            "subject": {

                "subject_id": subject_id,

                "subject_code": code,

                "subject_name": name,

                "department": dept,

                "academic_year": ay,

                "semester": sem,

                "study_year": study_year,

                "course_type": course_type,

                "category": category,

                "is_active": 1

            }

        }), 200



    except Exception as e:

        if connection and connection.is_connected():

            connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor:

            cursor.close()

        if connection and connection.is_connected():

            connection.close()





@admin_bp.route("/subjects/<int:subject_id>/dependencies", methods=["GET"])

def get_subject_dependencies(subject_id):

    """Inspects all historical and active relationships for a subject before deletion."""

    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        cursor.execute(

            "SELECT subject_id, subject_code, subject_name, department, semester, academic_year, is_active FROM subjects WHERE subject_id = %s",

            (subject_id,)

        )

        subj = cursor.fetchone()

        if not subj:

            return jsonify({"error": "Subject not found"}), 404



        # Check examinations

        cursor.execute("""

            SELECT exam_id, exam_name, exam_date, session, status

            FROM exam_sessions

            WHERE subject_id = %s

            ORDER BY exam_date DESC

        """, (subject_id,))

        exams = cursor.fetchall()

        for ex in exams:

            if ex.get("exam_date") and hasattr(ex["exam_date"], "isoformat"):

                ex["exam_date"] = ex["exam_date"].isoformat()



        # Check student registrations

        cursor.execute("SELECT COUNT(*) AS count FROM student_course_registrations WHERE subject_id = %s", (subject_id,))

        reg_count = cursor.fetchone()["count"]



        # Check faculty subject assignments

        cursor.execute("SELECT COUNT(*) AS count FROM faculty_subjects WHERE subject_id = %s", (subject_id,))

        fac_count = cursor.fetchone()["count"]



        can_delete = (len(exams) == 0 and reg_count == 0)



        blocking_reasons = []

        if len(exams) > 0:

            blocking_reasons.append(f"Linked to {len(exams)} scheduled or conducted examination session(s).")

        if reg_count > 0:

            blocking_reasons.append(f"Linked to {reg_count} student course registration(s).")



        return jsonify({

            "subject_id": subject_id,

            "subject_code": subj["subject_code"],

            "subject_name": subj["subject_name"],

            "department": subj["department"],

            "semester": subj["semester"],

            "academic_year": subj["academic_year"],

            "is_active": subj["is_active"],

            "can_delete": can_delete,

            "can_archive": True,

            "exam_count": len(exams),

            "exams": exams,

            "registration_count": reg_count,

            "faculty_count": fac_count,

            "blocking_reasons": blocking_reasons,

            "message": "Subject is safe to delete." if can_delete else " ".join(blocking_reasons)

        }), 200

    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/subjects/<int:subject_id>", methods=["DELETE"])

def delete_subject(subject_id):

    """Safely deletes an unused subject from MySQL. Blocks deletion if historical examination or registration records exist."""

    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        cursor.execute("SELECT subject_id, subject_code, subject_name FROM subjects WHERE subject_id = %s", (subject_id,))

        subj = cursor.fetchone()

        if not subj:

            return jsonify({"error": "Subject not found"}), 404



        # Check if subject is associated with any examination sessions

        cursor.execute("""

            SELECT exam_id, exam_name, exam_date, status

            FROM exam_sessions

            WHERE subject_id = %s

        """, (subject_id,))

        linked_exams = cursor.fetchall()

        if linked_exams:

            exam_names = ", ".join([f"#{e['exam_id']} ('{e['exam_name']}')" for e in linked_exams[:3]])

            if len(linked_exams) > 3:

                exam_names += f" and {len(linked_exams) - 3} more"

            return jsonify({

                "error": f"Cannot delete subject '{subj['subject_code']} - {subj['subject_name']}': It is linked to {len(linked_exams)} examination session(s) ({exam_names}). Deleting it would corrupt examination history. Please archive this course instead.",

                "can_archive": True,

                "exam_count": len(linked_exams),

                "exams": [

                    {

                        "exam_id": e["exam_id"],

                        "exam_name": e["exam_name"],

                        "exam_date": e["exam_date"].isoformat() if hasattr(e["exam_date"], "isoformat") else str(e["exam_date"]),

                        "status": e.get("status", "Scheduled")

                    } for e in linked_exams

                ]

            }), 409



        # Check if subject is associated with student course registrations

        cursor.execute("SELECT COUNT(*) AS count FROM student_course_registrations WHERE subject_id = %s", (subject_id,))

        reg_count = cursor.fetchone()["count"]

        if reg_count > 0:

            return jsonify({

                "error": f"Cannot delete subject '{subj['subject_code']}': It is linked to {reg_count} student course registration(s). Please archive this course instead.",

                "can_archive": True,

                "registration_count": reg_count

            }), 409



        # Remove non-critical faculty_subjects links

        cursor.execute("DELETE FROM faculty_subjects WHERE subject_id = %s", (subject_id,))



        # Delete subject record from MySQL

        cursor.execute("DELETE FROM subjects WHERE subject_id = %s", (subject_id,))



        # Record action in audit_logs

        try:

            from auth_routes import get_authenticated_user

            user = get_authenticated_user()

            performed_by = user.get("email", "admin") if user else "admin"

            cursor.execute("""

                INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                VALUES ('DELETE_SUBJECT', 'subject', %s, %s, %s)

            """, (str(subject_id), f"Deleted unused subject #{subject_id} ('{subj['subject_code']} - {subj['subject_name']}')", performed_by))

        except Exception:

            pass



        connection.commit()

        return jsonify({

            "message": f"Subject '{subj['subject_code']} - {subj['subject_name']}' deleted successfully.",

            "subject_id": subject_id

        }), 200



    except Exception as e:

        if connection and connection.is_connected():

            connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/subjects/<int:subject_id>/archive", methods=["POST", "PUT"])

def archive_subject(subject_id):

    """Safely archives a subject (sets is_active=0) to preserve historical examinations without data corruption."""

    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        cursor.execute("SELECT subject_id, subject_code, subject_name FROM subjects WHERE subject_id = %s", (subject_id,))

        subj = cursor.fetchone()

        if not subj:

            return jsonify({"error": "Subject not found"}), 404



        cursor.execute("UPDATE subjects SET is_active = 0 WHERE subject_id = %s", (subject_id,))



        # Audit log

        try:

            from auth_routes import get_authenticated_user

            user = get_authenticated_user()

            performed_by = user.get("email", "admin") if user else "admin"

            cursor.execute("""

                INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                VALUES ('ARCHIVE_SUBJECT', 'subject', %s, %s, %s)

            """, (str(subject_id), f"Archived subject #{subject_id} ('{subj['subject_code']} - {subj['subject_name']}'); examination records preserved.", performed_by))

        except Exception:

            pass



        connection.commit()

        return jsonify({

            "message": f"Subject '{subj['subject_code']}' has been safely archived. Historical examination and seating records remain intact.",

            "subject_id": subject_id,

            "is_active": 0

        }), 200



    except Exception as e:

        if connection and connection.is_connected():

            connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()







@admin_bp.route("/subjects/deletion-check", methods=["POST"])

def check_subjects_deletion():

    """Inspects active & historical dependencies for a batch of subjects before bulk deletion."""

    data = request.get_json(silent=True) or {}

    subject_ids = data.get("subject_ids", [])

    if not subject_ids:

        return jsonify({"error": "No subject IDs specified."}), 400



    sids = [int(sid) for sid in subject_ids if str(sid).isdigit()]

    if not sids:

        return jsonify({"error": "Invalid subject IDs."}), 400



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        cur = conn.cursor(dictionary=True)

        placeholders = ",".join(["%s"] * len(sids))



        cur.execute(f"""

            SELECT s.subject_id, s.subject_code, s.subject_name, s.department, s.semester, s.academic_year, s.is_active,

                   COALESCE((

                       SELECT COUNT(DISTINCT es.exam_id)

                       FROM exam_sessions es

                       WHERE es.subject_id = s.subject_id

                   ), 0) AS exam_count,

                   COALESCE((

                       SELECT COUNT(DISTINCT scr.id)

                       FROM student_course_registrations scr

                       WHERE scr.subject_id = s.subject_id

                   ), 0) AS registration_count,

                   COALESCE((

                       SELECT COUNT(DISTINCT fs.id)

                       FROM faculty_subjects fs

                       WHERE fs.subject_id = s.subject_id

                   ), 0) AS faculty_count

            FROM subjects s

            WHERE s.subject_id IN ({placeholders})

            ORDER BY s.semester, s.subject_code

        """, tuple(sids))

        records = cur.fetchall()



        safe_subjects = []

        protected_subjects = []



        for sub in records:

            blocking_reasons = []

            if sub["exam_count"] > 0:

                blocking_reasons.append(f"Linked to {sub['exam_count']} examination session(s)")

            if sub["registration_count"] > 0:

                blocking_reasons.append(f"Linked to {sub['registration_count']} student registration(s)")



            sub["blocking_reasons"] = blocking_reasons

            sub["can_delete"] = len(blocking_reasons) == 0

            sub["can_archive"] = True



            if len(blocking_reasons) == 0:

                sub["category"] = "safe"

                sub["category_label"] = "Safe to Delete"

                safe_subjects.append(sub)

            else:

                sub["category"] = "protected"

                sub["category_label"] = "Protected by Historical/Active Records"

                protected_subjects.append(sub)



        return jsonify({

            "total_selected": len(records),

            "safe_count": len(safe_subjects),

            "protected_count": len(protected_subjects),

            "safe_subjects": safe_subjects,

            "protected_subjects": protected_subjects,

            "all_records": records

        }), 200



    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/subjects/bulk-delete", methods=["POST"])

def execute_subjects_bulk_delete():

    """Bulk permanently deletes safe subjects and/or archives protected subjects without cascading data loss."""

    data = request.get_json(silent=True) or {}

    subject_ids = data.get("subject_ids", [])

    action = data.get("action", "delete")  # 'delete', 'delete_safe_only', 'delete_safe_and_archive_protected', 'archive_all'

    delete_safe_only = bool(data.get("delete_safe_only", False))

    deleted_by = data.get("deleted_by", "admin")



    sids = [int(sid) for sid in subject_ids if str(sid).isdigit()]

    if not sids:

        return jsonify({"error": "No valid subject IDs provided."}), 400



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        conn.autocommit = False

        cur = conn.cursor(dictionary=True)

        placeholders = ",".join(["%s"] * len(sids))



        # 1. Inspect all requested subjects

        cur.execute(f"""

            SELECT s.subject_id, s.subject_code, s.subject_name, s.department, s.semester, s.is_active,

                   COALESCE((

                       SELECT COUNT(DISTINCT es.exam_id)

                       FROM exam_sessions es

                       WHERE es.subject_id = s.subject_id

                   ), 0) AS exam_count,

                   COALESCE((

                       SELECT COUNT(DISTINCT scr.id)

                       FROM student_course_registrations scr

                       WHERE scr.subject_id = s.subject_id

                   ), 0) AS registration_count

            FROM subjects s

            WHERE s.subject_id IN ({placeholders})

        """, tuple(sids))

        deps = cur.fetchall()



        safe_ids = []

        protected_records = []

        for d in deps:

            if d["exam_count"] > 0 or d["registration_count"] > 0:

                reasons = []

                if d["exam_count"] > 0:

                    reasons.append(f"{d['exam_count']} examination session(s)")

                if d["registration_count"] > 0:

                    reasons.append(f"{d['registration_count']} student registration(s)")

                protected_records.append({

                    "subject_id": d["subject_id"],

                    "subject_code": d["subject_code"],

                    "subject_name": d["subject_name"],

                    "reason": "Linked to " + " and ".join(reasons)

                })

            else:

                safe_ids.append(d["subject_id"])



        protected_ids = [p["subject_id"] for p in protected_records]



        # Handle archive_all action

        if action == "archive_all":

            cur.execute(f"UPDATE subjects SET is_active = 0 WHERE subject_id IN ({placeholders})", tuple(sids))

            try:

                cur.execute("""

                    INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                    VALUES (%s, %s, %s, %s, %s)

                """, ("BULK_ARCHIVE_SUBJECTS", "subject", str(len(sids)), f"Bulk archived {len(sids)} subjects (IDs: {sids})", deleted_by))

            except Exception:

                pass

            conn.commit()

            return jsonify({

                "success": True,

                "action": "archive_all",

                "archived_count": len(sids),

                "deleted_count": 0,

                "message": f"Successfully archived {len(sids)} subject(s). Historical examinations and registrations remain preserved."

            }), 200



        # If action is plain delete and there are protected records and delete_safe_only is False:

        if protected_records and not (delete_safe_only or action in ("delete_safe_only", "delete_safe_and_archive_protected")):

            conn.rollback()

            return jsonify({

                "error": f"Cannot permanently delete {len(protected_records)} protected subject(s) because they have active or historical examination or registration records.",

                "total_selected": len(sids),

                "safe_count": len(safe_ids),

                "protected_count": len(protected_records),

                "protected_subjects": protected_records,

                "can_delete_safe_only": len(safe_ids) > 0,

                "can_archive_protected": True

            }), 409



        # Target IDs to permanently delete:

        ids_to_delete = safe_ids

        deleted_subjects = [d for d in deps if d["subject_id"] in ids_to_delete]



        if ids_to_delete:

            del_placeholders = ",".join(["%s"] * len(ids_to_delete))

            # Delete non-critical references first

            cur.execute(f"DELETE FROM faculty_subjects WHERE subject_id IN ({del_placeholders})", tuple(ids_to_delete))

            cur.execute(f"DELETE FROM faculty_course_profiles WHERE suggested_subject_id IN ({del_placeholders})", tuple(ids_to_delete))

            cur.execute(f"DELETE FROM subjects WHERE subject_id IN ({del_placeholders})", tuple(ids_to_delete))



        # Handle archiving protected if requested

        archived_count = 0

        archived_subjects = []

        if action == "delete_safe_and_archive_protected" and protected_ids:

            arch_placeholders = ",".join(["%s"] * len(protected_ids))

            cur.execute(f"UPDATE subjects SET is_active = 0 WHERE subject_id IN ({arch_placeholders})", tuple(protected_ids))

            archived_count = len(protected_ids)

            archived_subjects = protected_records



        # Audit log

        try:

            cur.execute("""

                INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                VALUES (%s, %s, %s, %s, %s)

            """, (

                "BULK_DELETE_SUBJECTS",

                "subject",

                str(len(ids_to_delete)),

                f"Bulk processed {len(sids)} subjects: permanently deleted {len(ids_to_delete)} safe subjects, archived {archived_count} protected, skipped {len(protected_records) - archived_count}.",

                deleted_by

            ))

        except Exception:

            pass



        conn.commit()



        msg = []

        if ids_to_delete:

            msg.append(f"Successfully deleted {len(ids_to_delete)} subject(s)")

        if archived_count:

            msg.append(f"archived {archived_count} protected subject(s)")

        if protected_records and not archived_count:

            msg.append(f"kept {len(protected_records)} protected subject(s) safe")



        return jsonify({

            "success": True,

            "total_selected": len(sids),

            "deleted_count": len(ids_to_delete),

            "deleted_subjects": [{"subject_id": s["subject_id"], "subject_code": s["subject_code"], "subject_name": s["subject_name"]} for s in deleted_subjects],

            "archived_count": archived_count,

            "archived_subjects": archived_subjects,

            "protected_skipped_count": len(protected_records) - archived_count,

            "protected_subjects": protected_records if not archived_count else [],

            "message": ". ".join(msg) if msg else "Bulk operation completed successfully."

        }), 200



    except Exception as e:

        if conn and conn.is_connected():

            conn.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()

















# =========================================================







# EXAMINATIONS MANAGEMENT (ADD, EDIT, DELETE, DETAILS, UPLOAD)







# =========================================================















def sync_and_get_exam_students(cursor, connection, exam_id):

    """

    Every time called:

    Fetches the fresh, latest student records directly from MySQL matching the examination's

    department, academic year, study year, semester, and target sections.

    Recalculates eligible students and synchronizes exam_registrations and expected_students.

    Returns: (eligible_students, exam)

    """

    cursor.execute("""

        SELECT es.*, s.subject_code, s.subject_name, s.department as sub_dept, s.semester as sub_semester,

               s.study_year as sub_study_year, s.academic_year as sub_academic_year

        FROM exam_sessions es

        JOIN subjects s ON es.subject_id = s.subject_id

        WHERE es.exam_id = %s

    """, (exam_id,))

    exam = cursor.fetchone()

    if not exam:

        return [], None



    target_dept = (exam.get("target_branch") or exam.get("sub_dept") or "CSE").strip()

    study_yr = exam.get("study_year") or exam.get("sub_study_year") or 3

    sem = (exam.get("semester") or exam.get("sub_semester") or "Semester 5").strip()

    acad_yr = (exam.get("academic_year") or exam.get("sub_academic_year") or "2026-2027").strip()

    target_secs = exam.get("target_sections") or "ALL"



    sem_digits = "".join(filter(str.isdigit, sem)) or "5"



    dept_clause = "(department = %s OR branch = %s)" if target_dept != "ALL" else "(1=1 OR %s=%s)"

    dept_params = [target_dept, target_dept] if target_dept != "ALL" else ["ALL", "ALL"]



    try:

        study_yr_int = int(study_yr)

    except Exception:

        study_yr_int = 3



    # Check if specific students are already explicitly registered for this exam session

    cursor.execute("""

        SELECT COUNT(*) AS reg_cnt

        FROM exam_registrations

        WHERE exam_id = %s

    """, (exam_id,))

    reg_res = cursor.fetchone()

    has_existing_registrations = reg_res and reg_res["reg_cnt"] > 0



    if has_existing_registrations:

        cursor.execute(f"""

            SELECT

                s.student_id,

                s.hall_ticket_no,

                s.name,

                s.department,

                COALESCE(s.section, 'A') AS section,

                %s AS subject_code,

                %s AS subject_name

            FROM exam_registrations er

            JOIN students s ON er.student_id = s.student_id

            WHERE er.exam_id = %s AND s.is_active = 1

            ORDER BY s.section, s.hall_ticket_no

        """, (exam["subject_code"], exam["subject_name"], exam_id))

        eligible_students = cursor.fetchall()

    else:

        # Match cohort students from the shared student master roster (Year {study_yr_int} AY {acad_yr})

        query = f"""

            SELECT

                student_id,

                hall_ticket_no,

                name,

                department,

                COALESCE(section, 'A') AS section,

                %s AS subject_code,

                %s AS subject_name

            FROM students

            WHERE is_active = 1

              AND (study_year = %s OR year = %s)

              AND (academic_year = %s OR academic_year IS NULL)

              AND {dept_clause}

        """

        params = [exam["subject_code"], exam["subject_name"], study_yr_int, study_yr_int, acad_yr] + dept_params



        if target_secs and target_secs != "ALL":

            secs = [s.strip().upper() for s in target_secs.split(",") if s.strip()]

            if secs:

                placeholders = ",".join(["%s"] * len(secs))

                query += f" AND UPPER(section) IN ({placeholders})"

                params.extend(secs)



        query += " ORDER BY section, hall_ticket_no"

        cursor.execute(query, tuple(params))

        eligible_students = cursor.fetchall()



        # Synchronize into exam_registrations

        if eligible_students:

            ins_data = [(st["student_id"], exam_id) for st in eligible_students]

            cursor.executemany("""

                INSERT IGNORE INTO exam_registrations (student_id, exam_id)

                VALUES (%s, %s)

            """, ins_data)



    # Update expected_students count on exam session

    cursor.execute("""

        UPDATE exam_sessions

        SET expected_students = %s

        WHERE exam_id = %s

    """, (len(eligible_students), exam_id))



    if connection and connection.is_connected():

        connection.commit()



    return eligible_students, exam



@admin_bp.route("/exams", methods=["POST"])

def create_exam():
    from auth_routes import get_authenticated_user
    auth_user = get_authenticated_user()
    if not auth_user:
        return jsonify({"error": "Authentication required"}), 401
    if auth_user.get("role") not in ("admin", "exam_admin"):
        return jsonify({"error": "Access denied: Administrative permissions required. Only Admin can create or schedule examinations."}), 403








    data = request.get_json(silent=True) or {}







    subject_id = data.get("subject_id")







    exam_name = data.get("exam_name", "").strip()







    exam_date = data.get("exam_date", "").strip()







    session = data.get("session", "FN").strip().upper()







    start_time = data.get("start_time", "").strip()







    end_time = data.get("end_time", "").strip()







    expected_students = int(data.get("expected_students") or 0)















    if not subject_id or not exam_date:

        return jsonify({"error": "subject_id and exam_date are required"}), 400



    if not start_time:

        return jsonify({"error": "Examination start time is required"}), 400

    if not end_time:

        return jsonify({"error": "Examination end time is required"}), 400



    s_mins = parse_time_to_minutes(start_time)

    e_mins = parse_time_to_minutes(end_time)

    if s_mins is None or e_mins is None:

        return jsonify({"error": "Invalid time format. Please provide valid start and end times (HH:MM)."}), 400

    if e_mins <= s_mins:

        return jsonify({"error": "End time must be strictly after start time"}), 400



    # Auto-derive session indicator from start time (no preset selection required)

    session = "FN" if s_mins < 780 else "AN" 















    connection = None







    cursor = None







    try:







        connection = get_db_connection()







        cursor = connection.cursor(dictionary=True)















        cursor.execute("SELECT subject_id, subject_name FROM subjects WHERE subject_id = %s", (subject_id,))







        subj = cursor.fetchone()







        if not subj:







            return jsonify({"error": "Subject not found"}), 404















        if not exam_name:







            exam_name = subj["subject_name"]















        academic_year = (data.get("academic_year") or "2026-2027").strip()

        semester = (data.get("semester") or subj.get("semester") or "Semester 5").strip()

        study_year = int(data.get("study_year") or 3)

        target_branch = (data.get("target_branch") or subj.get("department") or "CSE").strip()

        target_sections = (data.get("target_sections") or "ALL").strip()

        exam_type = (data.get("exam_type") or "Class Test 1").strip()



        # Check overlapping examinations for the same student cohort on the same date

        cursor.execute("""

            SELECT exam_id, exam_name, exam_date, session, start_time, end_time, academic_year, study_year, semester, target_branch

            FROM exam_sessions

            WHERE exam_date = %s AND status NOT IN ('Cancelled')

        """, (exam_date,))

        other_exams = cursor.fetchall()



        new_exam_spec = {

            "exam_date": str(exam_date),

            "start_time": start_time,

            "end_time": end_time,

            "session": session

        }



        for oe in other_exams:

            if check_exam_overlap(new_exam_spec, oe):

                if (oe.get("study_year") == study_year and

                    str(oe.get("semester", "")).lower().replace(" ", "") == str(semester).lower().replace(" ", "") and

                    oe.get("academic_year") == academic_year):

                    return jsonify({

                        "error": f"Student Scheduling Conflict: Study Year {study_year} ({semester}) already has an active examination '{oe['exam_name']}' scheduled on {exam_date} from {str(oe['start_time'])[:5]} to {str(oe['end_time'])[:5]}."

                    }), 400



        # Check hall availability (total capacity vs expected students)

        cursor.execute("SELECT SUM(capacity) as total_cap FROM halls WHERE is_active = 1")

        total_hall_cap = (cursor.fetchone() or {}).get("total_cap") or 0

        if total_hall_cap > 0 and expected_students > total_hall_cap:

            return jsonify({

                "error": f"Room Capacity Conflict: Expected candidates ({expected_students}) exceed total active examination hall capacity ({total_hall_cap})."

            }), 400



        # Check faculty availability

        cursor.execute("SELECT COUNT(*) as fac_cnt FROM faculty WHERE is_active = 1")

        fac_cnt = (cursor.fetchone() or {}).get("fac_cnt") or 0

        if fac_cnt == 0:

            return jsonify({

                "error": "Faculty Availability Conflict: No active faculty members found in the system to invigilate."

            }), 400



        cursor.execute("""

            INSERT INTO exam_sessions (

                subject_id, exam_name, exam_date, session, start_time, end_time,

                academic_year, semester, study_year, target_branch, target_sections, exam_type, expected_students

            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)

        """, (

            subject_id, exam_name, exam_date, session, start_time, end_time,

            academic_year, semester, study_year, target_branch, target_sections, exam_type, expected_students

        ))

        new_exam_id = cursor.lastrowid



        # Automatically synchronize cohort students into exam_registrations

        sync_st, _ = sync_and_get_exam_students(cursor, connection, new_exam_id)

        expected_students = len(sync_st)















        # Seed availability for all existing faculty for this new exam session







        cursor.execute("SELECT faculty_id FROM faculty")







        all_fac = cursor.fetchall()







        for f in all_fac:







            try:







                cursor.execute("""







                    INSERT IGNORE INTO faculty_availability (faculty_id, exam_date, session, is_available)







                    VALUES (%s, %s, %s, TRUE)







                """, (f["faculty_id"], exam_date, session))







            except Exception:







                pass















        connection.commit()















        return jsonify({







            "message": "Examination created successfully",







            "exam_id": new_exam_id,







            "exam_name": exam_name,







            "exam_date": exam_date,







            "session": session,







            "start_time": start_time,







            "end_time": end_time,







            "expected_students": expected_students







        }), 201







    except Exception as e:







        if connection and connection.is_connected(): connection.rollback()







        return jsonify({"error": str(e)}), 500







    finally:







        if cursor: cursor.close()







        if connection and connection.is_connected(): connection.close()





























@admin_bp.route("/exams/<int:exam_id>", methods=["PUT"])







def update_exam(exam_id):
    from auth_routes import get_authenticated_user
    auth_user = get_authenticated_user()
    if not auth_user:
        return jsonify({"error": "Authentication required"}), 401
    if auth_user.get("role") not in ("admin", "exam_admin"):
        return jsonify({"error": "Access denied: Administrative permissions required. Only Admin can update examinations."}), 403








    data = request.get_json(silent=True) or {}







    subject_id = data.get("subject_id")







    exam_name = data.get("exam_name", "").strip()







    exam_date = data.get("exam_date", "").strip()







    session = data.get("session", "FN").strip().upper()







    start_time = data.get("start_time", "").strip()







    end_time = data.get("end_time", "").strip()







    expected_students = int(data.get("expected_students") or 0)















    connection = None







    cursor = None







    try:







        connection = get_db_connection()







        cursor = connection.cursor(dictionary=True)















        cursor.execute("SELECT exam_id, exam_date, session, start_time, end_time FROM exam_sessions WHERE exam_id = %s", (exam_id,))







        existing_exam = cursor.fetchone()







        if not existing_exam:







            return jsonify({"error": "Examination not found"}), 404















        # Check if date/time changed and if existing assigned halls conflict with another exam at the new time







        schedule_changed = (str(existing_exam["exam_date"]) != str(exam_date) or existing_exam["session"] != session or existing_exam["start_time"] != start_time or existing_exam["end_time"] != end_time)















        if schedule_changed:







            # Check currently allocated halls for this exam







            cursor.execute("""







                SELECT DISTINCT s.hall_id, h.hall_name







                FROM seat_allocations sa







                JOIN seats s ON sa.seat_id = s.seat_id







                JOIN halls h ON s.hall_id = h.hall_id







                WHERE sa.exam_id = %s







            """, (exam_id,))







            current_halls = cursor.fetchall()















            if current_halls:







                # Find other exams on new date that overlap







                cursor.execute("""







                    SELECT exam_id, exam_name, exam_date, session, start_time, end_time







                    FROM exam_sessions







                    WHERE exam_date = %s AND exam_id != %s







                """, (exam_date, exam_id))







                other_exams = cursor.fetchall()







                target_exam_spec = {"exam_date": exam_date, "session": session, "start_time": start_time, "end_time": end_time}







                conflicting_exams = [oe for oe in other_exams if check_exam_overlap(target_exam_spec, oe)]















                if conflicting_exams:







                    conflicting_ids = [oe["exam_id"] for oe in conflicting_exams]







                    placeholders = ",".join(["%s"] * len(conflicting_ids))







                    cursor.execute(f"""







                        SELECT DISTINCT s.hall_id, h.hall_name, es.exam_name







                        FROM seat_allocations sa







                        JOIN seats s ON sa.seat_id = s.seat_id







                        JOIN halls h ON s.hall_id = h.hall_id







                        JOIN exam_sessions es ON sa.exam_id = es.exam_id







                        WHERE sa.exam_id IN ({placeholders})







                    """, tuple(conflicting_ids))







                    booked_other = cursor.fetchall()







                    booked_hall_ids = {b["hall_id"]: b for b in booked_other}















                    for ch in current_halls:







                        if ch["hall_id"] in booked_hall_ids:







                            b_info = booked_hall_ids[ch["hall_id"]]







                            return jsonify({







                                "error": f"Cannot reschedule to {exam_date} ({session}): Hall '{ch['hall_name']}' is already allocated to '{b_info['exam_name']}' at that time. Please reallocate seats first."







                            }), 400















        cursor.execute("""







            UPDATE exam_sessions







            SET subject_id = %s, exam_name = %s, exam_date = %s, session = %s,







                start_time = %s, end_time = %s, expected_students = %s







            WHERE exam_id = %s







        """, (subject_id, exam_name, exam_date, session, start_time, end_time, expected_students, exam_id))















        connection.commit()







        return jsonify({"message": "Examination updated successfully", "exam_id": exam_id}), 200







    except Exception as e:







        if connection and connection.is_connected(): connection.rollback()







        return jsonify({"error": str(e)}), 500







    finally:







        if cursor: cursor.close()







        if connection and connection.is_connected(): connection.close()





























@admin_bp.route("/exams/<int:exam_id>/publish", methods=["POST"])







def publish_exam(exam_id):
    from auth_routes import get_authenticated_user
    auth_user = get_authenticated_user()
    if not auth_user:
        return jsonify({"error": "Authentication required"}), 401
    if auth_user.get("role") not in ("admin", "exam_admin"):
        return jsonify({"error": "Access denied: Administrative permissions required. Only Admin can publish examination plans."}), 403








    connection = None







    cursor = None







    data = request.get_json(silent=True) or {}







    publish_val = data.get("publish", True)







    try:







        connection = get_db_connection()







        cursor = connection.cursor(dictionary=True)















        cursor.execute("SELECT exam_id, exam_name, status, is_published FROM exam_sessions WHERE exam_id = %s", (exam_id,))







        exam = cursor.fetchone()







        if not exam:







            return jsonify({"error": "Examination not found"}), 404















        # Check if seats are allocated before publishing







        cursor.execute("SELECT COUNT(*) as count FROM seat_allocations WHERE exam_id = %s", (exam_id,))







        alloc_count = cursor.fetchone()["count"]







        if publish_val and alloc_count == 0:







            return jsonify({"error": "Cannot publish examination before allocating seats"}), 400















        if exam.get("status") == "Completed":

            new_status = "Completed"

        elif exam.get("status") == "Cancelled":

            return jsonify({"error": "Cannot publish a cancelled examination"}), 400

        else:

            new_status = 'Published' if publish_val else 'Scheduled'



        new_is_pub = 1 if publish_val else 0















        cursor.execute("""







            UPDATE exam_sessions







            SET status = %s, is_published = %s







            WHERE exam_id = %s







        """, (new_status, new_is_pub, exam_id))







        connection.commit()















        msg = (







            f"Examination '{exam['exam_name']}' published successfully. Students can now view their seating arrangements."







            if publish_val







            else f"Examination '{exam['exam_name']}' reverted to draft."







        )















        return jsonify({







            "message": msg,







            "exam_id": exam_id,







            "status": new_status,







            "is_published": new_is_pub,







            "allocated_seats": alloc_count,







        }), 200







    except Exception as e:







        if connection and connection.is_connected():







            connection.rollback()







        return jsonify({"error": str(e)}), 500







    finally:







        if cursor:







            cursor.close()







        if connection and connection.is_connected():







            connection.close()























@admin_bp.route("/exams/<int:exam_id>/deletion-check", methods=["GET"])

def check_exam_deletion(exam_id):

    conn = None

    cur = None

    try:

        conn = get_db_connection()

        cur = conn.cursor(dictionary=True)



        cur.execute("""

            SELECT 

                e.exam_id, e.subject_id, COALESCE(e.exam_name, s.subject_name) AS exam_name,

                s.subject_code, s.subject_name, e.exam_date, e.session, e.start_time, e.end_time,

                COALESCE(e.expected_students, 0) AS expected_students,

                COALESCE(e.status, 'Scheduled') AS status,

                COALESCE(e.academic_year, '2026-2027') AS academic_year,

                COALESCE(e.study_year, 3) AS study_year,

                COALESCE(e.semester, 'Semester 5') AS semester,

                COALESCE(e.exam_type, 'Class Test 1') AS exam_type,

                COALESCE(e.is_archived, 0) AS is_archived,

                COALESCE(e.is_retention_locked, 0) AS is_retention_locked,

                e.retention_reason

            FROM exam_sessions e

            JOIN subjects s ON e.subject_id = s.subject_id

            WHERE e.exam_id = %s

        """, (exam_id,))

        exam = cur.fetchone()

        if not exam:

            return jsonify({"error": "Examination not found"}), 404



        cur.execute("SELECT COUNT(*) AS count FROM seat_allocations WHERE exam_id = %s", (exam_id,))

        alloc_count = cur.fetchone()["count"]



        cur.execute("SELECT COUNT(*) AS count FROM invigilator_assignments WHERE exam_id = %s", (exam_id,))

        invig_count = cur.fetchone()["count"]



        cur.execute("SELECT COUNT(*) AS count FROM exam_registrations WHERE exam_id = %s", (exam_id,))

        reg_count = cur.fetchone()["count"]



        if reg_count == 0:

            cur.execute("""

                SELECT COUNT(*) AS count FROM students 

                WHERE academic_year = %s AND study_year = %s

            """, (exam["academic_year"], exam["study_year"]))

            reg_count = cur.fetchone()["count"]



        # Attendance count tracks candidate allocations

        attendance_count = alloc_count

        # Associated reports (Seating Chart, Attendance Sheet, Faculty Register)

        report_count = 3 if alloc_count > 0 else 0



        if exam.get("exam_date"):

            exam["exam_date"] = str(exam["exam_date"])



        is_locked = bool(exam.get("is_retention_locked", 0))



        if is_locked:

            can_delete = False

            blocking_reason = f"Institutional Retention Rule: {exam.get('retention_reason') or 'This examination is locked by university policy and cannot be permanently deleted. You may Archive it instead.'}"

        else:

            can_delete = True

            blocking_reason = None



        return jsonify({

            "can_delete": can_delete,

            "blocking_reason": blocking_reason,

            "exam": exam,

            "dependencies": {

                "seat_allocations": alloc_count,

                "invigilator_assignments": invig_count,

                "registrations": reg_count,

                "attendance_records": attendance_count,

                "associated_reports": report_count

            }

        }), 200

    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/exams/<int:exam_id>/archive", methods=["POST"])

def archive_exam(exam_id):

    from auth_routes import get_authenticated_user

    user = get_authenticated_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401
    if user.get("role") not in ("admin", "exam_admin"):
        return jsonify({"error": "Access denied: Administrative permissions required. Only Admin can cancel examinations."}), 403

    user_email = user.get("email", "admin")



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        conn.autocommit = False

        cur = conn.cursor(dictionary=True)



        cur.execute("SELECT exam_id, exam_name, status, is_archived FROM exam_sessions WHERE exam_id = %s", (exam_id,))

        exam = cur.fetchone()

        if not exam:

            return jsonify({"error": "Examination not found"}), 404



        cur.execute("""

            UPDATE exam_sessions

            SET is_archived = 1, archived_at = NOW(), archived_by = %s

            WHERE exam_id = %s

        """, (user_email, exam_id))



        cur.execute("""

            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

            VALUES (%s, %s, %s, %s, %s)

        """, (

            "ARCHIVE_EXAM", "exam_session", str(exam_id),

            f"Archived examination #{exam_id} ('{exam['exam_name']}', status: '{exam['status']}'). Preserved seating allocations, invigilator assignments, and reports.",

            user_email

        ))



        conn.commit()

        return jsonify({

            "message": f"Examination #{exam_id} archived successfully.",

            "exam_id": exam_id,

            "is_archived": 1

        }), 200

    except Exception as e:

        if conn: conn.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/exams/<int:exam_id>/restore", methods=["POST"])

def restore_exam(exam_id):

    from auth_routes import get_authenticated_user

    user = get_authenticated_user() or {}

    user_email = user.get("email", "admin")



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        conn.autocommit = False

        cur = conn.cursor(dictionary=True)



        cur.execute("SELECT exam_id, exam_name, status, is_archived FROM exam_sessions WHERE exam_id = %s", (exam_id,))

        exam = cur.fetchone()

        if not exam:

            return jsonify({"error": "Examination not found"}), 404



        cur.execute("""

            UPDATE exam_sessions

            SET is_archived = 0, archived_at = NULL, archived_by = NULL

            WHERE exam_id = %s

        """, (exam_id,))



        cur.execute("""

            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

            VALUES (%s, %s, %s, %s, %s)

        """, (

            "RESTORE_EXAM", "exam_session", str(exam_id),

            f"Restored archived examination #{exam_id} ('{exam['exam_name']}') back to active completed list.",

            user_email

        ))



        conn.commit()

        return jsonify({

            "message": f"Examination #{exam_id} restored to completed examinations list.",

            "exam_id": exam_id,

            "is_archived": 0

        }), 200

    except Exception as e:

        if conn: conn.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/exams/<int:exam_id>/status", methods=["PUT"])

def update_exam_status(exam_id):

    from auth_routes import get_authenticated_user

    user = get_authenticated_user() or {}

    user_email = user.get("email", "admin")



    data = request.get_json(silent=True) or {}

    new_status = data.get("status")

    allowed_statuses = ["Scheduled", "Published", "In Progress", "Completed", "Cancelled"]

    if new_status not in allowed_statuses:

        return jsonify({"error": f"Invalid status '{new_status}'. Allowed: {', '.join(allowed_statuses)}"}), 400



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        conn.autocommit = False

        cur = conn.cursor(dictionary=True)



        cur.execute("SELECT exam_id, exam_name, status, is_published FROM exam_sessions WHERE exam_id = %s", (exam_id,))

        exam = cur.fetchone()

        if not exam:

            return jsonify({"error": "Examination not found"}), 404



        old_status = exam.get("status") or "Scheduled"

        is_pub = exam.get("is_published", 0)



        if new_status == "Published":

            is_pub = 1

        elif new_status == "Cancelled":

            is_pub = 0

        elif new_status == "Scheduled":

            is_pub = 0



        cur.execute("UPDATE exam_sessions SET status = %s, is_published = %s WHERE exam_id = %s", (new_status, is_pub, exam_id))



        cur.execute("""

            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

            VALUES (%s, %s, %s, %s, %s)

        """, (

            "UPDATE_EXAM_STATUS", "exam_session", str(exam_id),

            f"Updated exam #{exam_id} ('{exam['exam_name']}') status from '{old_status}' to '{new_status}'",

            user_email

        ))



        conn.commit()

        return jsonify({

            "message": f"Examination #{exam_id} status updated to '{new_status}' successfully.",

            "exam_id": exam_id,

            "status": new_status,

            "is_published": is_pub

        }), 200

    except Exception as e:

        if conn: conn.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/exams/<int:exam_id>", methods=["DELETE"])

def delete_exam(exam_id):

    from auth_routes import get_authenticated_user

    user = get_authenticated_user() or {}

    user_email = user.get("email", "admin")



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        connection.autocommit = False

        cursor = connection.cursor(dictionary=True)



        cursor.execute("""

            SELECT exam_id, exam_name, status, academic_year, semester, study_year,

                   COALESCE(is_retention_locked, 0) AS is_retention_locked, retention_reason

            FROM exam_sessions WHERE exam_id = %s

        """, (exam_id,))

        exam = cursor.fetchone()

        if not exam:

            return jsonify({"error": "Examination not found"}), 404



        if exam.get("is_retention_locked", 0):

            return jsonify({

                "error": f"Deletion blocked by institutional policy: {exam.get('retention_reason') or 'Retention locked examination'}. Please archive instead.",

                "can_delete": False

            }), 403



        # Count affected records for audit trail

        cursor.execute("SELECT COUNT(*) AS count FROM seat_allocations WHERE exam_id = %s", (exam_id,))

        alloc_count = cursor.fetchone()["count"]



        cursor.execute("SELECT COUNT(*) AS count FROM invigilator_assignments WHERE exam_id = %s", (exam_id,))

        invig_count = cursor.fetchone()["count"]



        cursor.execute("SELECT COUNT(*) AS count FROM exam_registrations WHERE exam_id = %s", (exam_id,))

        reg_count = cursor.fetchone()["count"]



        # Safe transaction delete: Only remove exam-specific child rows.

        # Master student roster (students table), faculty, halls, seats, and subjects remain 100% untouched.

        cursor.execute("DELETE FROM invigilator_history WHERE exam_id = %s", (exam_id,))

        cursor.execute("DELETE FROM hod_concerns WHERE exam_id = %s", (exam_id,))

        cursor.execute("DELETE FROM system_notifications WHERE related_id = %s", (exam_id,))

        cursor.execute("DELETE FROM seat_allocations WHERE exam_id = %s", (exam_id,))

        cursor.execute("DELETE FROM invigilator_assignments WHERE exam_id = %s", (exam_id,))

        cursor.execute("DELETE FROM exam_registrations WHERE exam_id = %s", (exam_id,))

        cursor.execute("DELETE FROM exam_sessions WHERE exam_id = %s", (exam_id,))



        summary = (

            f"Permanently deleted examination #{exam_id} ('{exam['exam_name']}', status: '{exam['status']}'). "

            f"Safely purged {alloc_count} seat allocations, {invig_count} invigilator assignments, and {reg_count} registrations. "

            f"Master student, faculty, hall, and subject records strictly preserved."

        )

        cursor.execute("""

            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

            VALUES (%s, %s, %s, %s, %s)

        """, (

            "PERMANENT_DELETE_EXAM", "exam_session", str(exam_id),

            summary,

            user_email

        ))



        connection.commit()

        return jsonify({

            "message": f"Examination #{exam_id} and its associated records were permanently deleted successfully.",

            "exam_id": exam_id,

            "deleted_allocations": alloc_count,

            "deleted_invigilators": invig_count

        }), 200

    except Exception as e:

        if connection: connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()















@admin_bp.route("/exams/<int:exam_id>/students", methods=["GET"])







def get_exam_students(exam_id):

    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)

        students, exam = sync_and_get_exam_students(cursor, connection, exam_id)

        if not exam:

            return jsonify({"error": "Examination not found"}), 404

        return jsonify({

            "exam_id": exam_id,

            "exam_name": exam.get("exam_name"),

            "total_students": len(students),

            "students": students

        }), 200







    except Exception as e:







        return jsonify({"error": str(e)}), 500







    finally:







        if cursor: cursor.close()







        if connection and connection.is_connected(): connection.close()





























@admin_bp.route("/exams/<int:exam_id>/upload-students", methods=["POST"])







def upload_exam_students(exam_id):







    file = request.files.get("file")







    is_preview = (







        request.args.get("preview", "").lower() in ("true", "1") or







        request.form.get("preview", "").lower() in ("true", "1")







    )















    if not file:







        return jsonify({"error": "No file uploaded"}), 400















    filename = file.filename or ""







    if not (filename.lower().endswith(".csv") or filename.lower().endswith(".xlsx") or filename.lower().endswith(".xls") or filename.lower().endswith(".pdf")):







        return jsonify({"error": "Unsupported file format. Please upload CSV, Excel (.xlsx, .xls), or PDF"}), 400















    connection = None







    cursor = None







    try:







        # Parse file contents







        parsed_students = parse_student_file(file, filename)







        if not parsed_students:







            return jsonify({"error": "No valid student records could be parsed from the uploaded file"}), 400















        connection = get_db_connection()







        cursor = connection.cursor(dictionary=True)















        cursor.execute("SELECT exam_id, exam_name, expected_students FROM exam_sessions WHERE exam_id = %s", (exam_id,))







        exam = cursor.fetchone()







        if not exam:







            return jsonify({"error": "Examination not found"}), 404















        expected = exam.get("expected_students") or 0







        actual = len(parsed_students)







        diff = actual - expected







        warning = None







        if expected > 0 and actual != expected:







            warning = f"Warning: Actual uploaded student count ({actual}) differs from expected count ({expected}) by {abs(diff)}."















        # If preview mode, return extracted list and stats without saving to DB







        if is_preview:







            validation_errors = getattr(parsed_students, "validation_errors", [])







            detected_sections = sorted(list({s.get("section", "A") for s in parsed_students}))







            return jsonify({







                "preview_mode": True,







                "exam_id": exam_id,







                "total_count": actual,







                "expected_count": expected,







                "warning": warning,







                "detected_sections": detected_sections,







                "validation_errors": validation_errors,







                "students": parsed_students[:50],  # preview first 50







                "message": f"Parsed {actual} students successfully across {len(detected_sections)} section(s). Ready to save."







            }), 200















        # Save to database: upsert students and insert exam_registrations







        inserted_students = 0







        registered_count = 0















        for s in parsed_students:







            cursor.execute("SELECT student_id FROM students WHERE hall_ticket_no = %s", (s["hall_ticket_no"],))







            existing_student = cursor.fetchone()















            if existing_student:







                student_id = existing_student["student_id"]







                cursor.execute("""







                    UPDATE students







                    SET name = %s, department = %s, year = %s, section = %s







                    WHERE student_id = %s







                """, (s["name"], s["department"], s["year"], s["section"], student_id))







            else:







                cursor.execute("""







                    INSERT INTO students (hall_ticket_no, name, department, year, section)







                    VALUES (%s, %s, %s, %s, %s)







                """, (s["hall_ticket_no"], s["name"], s["department"], s["year"], s["section"]))







                student_id = cursor.lastrowid







                inserted_students += 1















            cursor.execute("""







                SELECT registration_id FROM exam_registrations







                WHERE student_id = %s AND exam_id = %s







            """, (student_id, exam_id))







            if not cursor.fetchone():







                cursor.execute("""







                    INSERT INTO exam_registrations (student_id, exam_id)







                    VALUES (%s, %s)







                """, (student_id, exam_id))







                registered_count += 1















        # Automatically update expected_students count if was 0 or unassigned







        if expected == 0:







            cursor.execute("UPDATE exam_sessions SET expected_students = %s WHERE exam_id = %s", (actual, exam_id))















        connection.commit()















        # Check if caller requested immediate automatic seat allocation







        auto_allocate_req = (







            request.args.get("auto_allocate", "").lower() in ("true", "1") or







            request.form.get("auto_allocate", "").lower() in ("true", "1")







        )







        allocation_result = None







        if auto_allocate_req:







            allocation_result = auto_allocate_seats_for_exam(cursor, connection, exam_id)







            connection.commit()















        return jsonify({







            "message": "Student records saved and registered successfully" + (







                " with seats automatically allocated!" if (allocation_result and allocation_result.get("success")) else ""







            ),







            "exam_id": exam_id,







            "total_processed": actual,







            "new_students_added": inserted_students,







            "registrations_added": registered_count,







            "expected_count": expected or actual,







            "warning": warning,







            "auto_allocation": allocation_result







        }), 200















    except Exception as e:







        if connection and connection.is_connected(): connection.rollback()







        return jsonify({"error": str(e)}), 500







    finally:







        if cursor: cursor.close()







        if connection and connection.is_connected(): connection.close()





























# =========================================================







# HELPER: AUTO-ALLOCATE SEATS FOR EXAM







# =========================================================







def solve_hall_seating_csp(seats, students_by_section, rng, max_retries=100):

    """

    Constraint-Satisfaction Problem (CSP) solver for a single hall with 8-neighbor exclusion.

    No student from the same section may occupy an adjacent seat (horizontal, vertical, diagonal,

    or across aisles/benches).

    Uses Minimum Remaining Values (MRV) heuristic and most-constrained section ordering.

    """

    total_students = sum(len(lst) for lst in students_by_section.values())

    if len(seats) < total_students:

        return None, f"Insufficient seats: {len(seats)} seats for {total_students} students"



    seat_map = {(s['row_no'], s['column_no']): s for s in seats}

    neighbors = {}

    for s in seats:

        r, c = s['row_no'], s['column_no']

        nbrs = []

        for dr in (-1, 0, 1):

            for dc in (-1, 0, 1):

                if dr == 0 and dc == 0:

                    continue

                nr, nc = r + dr, c + dc

                if (nr, nc) in seat_map:

                    nbrs.append(seat_map[(nr, nc)]['seat_id'])

        neighbors[s['seat_id']] = nbrs



    all_sections = [sec for sec, lst in students_by_section.items() if len(lst) > 0]



    # Theoretical capacity check: on an R x C grid with 8-neighbor exclusion,

    # max seats a single section can occupy is ceil(R/2) * ceil(C/2)

    max_r = max(s['row_no'] for s in seats)

    max_c = max(s['column_no'] for s in seats)

    max_single_sec_cap = ((max_r + 1) // 2) * ((max_c + 1) // 2)

    for sec, lst in students_by_section.items():

        if len(lst) > max_single_sec_cap:

            return None, (

                f"Constraint conflict: Section {sec} has {len(lst)} students in this hall, "

                f"exceeding theoretical maximum of {max_single_sec_cap} seats for 8-neighbor separation."

            )



    for attempt in range(max_retries):

        chosen_seats = list(seats)

        if len(chosen_seats) > total_students:

            rng.shuffle(chosen_seats)

            chosen_seats = chosen_seats[:total_students]



        rng.shuffle(chosen_seats)



        seat_sec = {}

        rem_sec_counts = {sec: len(students_by_section[sec]) for sec in all_sections}

        assignment = {}

        sec_student_pools = {sec: list(students_by_section[sec]) for sec in all_sections}

        for sec in sec_student_pools:

            rng.shuffle(sec_student_pools[sec])



        def backtrack(seat_idx):

            if seat_idx == len(chosen_seats):

                return True



            best_seat = None

            best_options = None

            best_idx = -1



            # MRV (Minimum Remaining Values heuristic)

            for idx in range(seat_idx, len(chosen_seats)):

                curr_seat = chosen_seats[idx]

                sid = curr_seat['seat_id']

                forbidden = {seat_sec[nid] for nid in neighbors[sid] if nid in seat_sec}

                valid = [sec for sec in all_sections if sec not in forbidden and rem_sec_counts[sec] > 0]

                if not valid:

                    return False

                if best_options is None or len(valid) < len(best_options):

                    best_options = valid

                    best_seat = curr_seat

                    best_idx = idx

                    if len(best_options) == 1:

                        break



            chosen_seats[seat_idx], chosen_seats[best_idx] = chosen_seats[best_idx], chosen_seats[seat_idx]

            curr_seat = chosen_seats[seat_idx]

            sid = curr_seat['seat_id']



            rng.shuffle(best_options)

            best_options.sort(key=lambda s: -rem_sec_counts[s])



            for sec in best_options:

                seat_sec[sid] = sec

                rem_sec_counts[sec] -= 1

                stu = sec_student_pools[sec].pop()

                assignment[sid] = (curr_seat, stu)



                if backtrack(seat_idx + 1):

                    return True



                sec_student_pools[sec].append(stu)

                rem_sec_counts[sec] += 1

                del seat_sec[sid]

                del assignment[sid]



            return False



        if backtrack(0):

            return list(assignment.values()), None



    return None, f"CSP solver reached max retries ({max_retries}) without finding conflict-free layout."





def generate_multi_room_seating(all_students, halls_with_seats, rng):

    """

    Dynamically distributes students across all allocated examination rooms proportionally by section,

    then solves 8-neighbor constraint satisfaction for each room.

    """

    sections = {}

    for st in all_students:

        sec = st.get("section") or "A"

        if sec not in sections:

            sections[sec] = []

        sections[sec].append(st)



    for sec in sections:

        rng.shuffle(sections[sec])



    num_halls = len(halls_with_seats)

    total_students = len(all_students)



    base_quota = total_students // num_halls

    rem = total_students % num_halls

    quotas = [base_quota + (1 if i < rem else 0) for i in range(num_halls)]

    rng.shuffle(quotas)



    hall_section_pools = [ {sec: [] for sec in sections} for _ in range(num_halls) ]



    for sec, st_list in sections.items():

        st_pool = list(st_list)

        rng.shuffle(st_pool)

        h_indices = list(range(num_halls))

        rng.shuffle(h_indices)

        idx = 0

        while st_pool:

            target_h = h_indices[idx % num_halls]

            current_h_count = sum(len(p) for p in hall_section_pools[target_h].values())

            if current_h_count < quotas[target_h]:

                hall_section_pools[target_h][sec].append(st_pool.pop())

            idx += 1

            if idx > num_halls * 50 and st_pool:

                for th in range(num_halls):

                    if sum(len(p) for p in hall_section_pools[th].values()) < quotas[th] and st_pool:

                        hall_section_pools[th][sec].append(st_pool.pop())

                break



    all_allocations = []

    hall_order = list(range(num_halls))

    rng.shuffle(hall_order)



    for h_idx in hall_order:

        hall = halls_with_seats[h_idx]

        seats = hall["seats"]

        st_by_sec = hall_section_pools[h_idx]

        hall_res, err = solve_hall_seating_csp(seats, st_by_sec, rng)

        if err or not hall_res:

            return None, err or f"Failed to seat hall {hall['hall_name']}"

        for seat, st in hall_res:

            all_allocations.append({

                "hall_id": hall["hall_id"],

                "hall_name": hall["hall_name"],

                "seat_id": seat["seat_id"],

                "row_no": seat["row_no"],

                "column_no": seat["column_no"],

                "student_id": st["student_id"],

                "hall_ticket_no": st["hall_ticket_no"],

                "name": st["name"],

                "department": st.get("department", "CSE"),

                "section": st.get("section", "A")

            })



    return all_allocations, None





def run_incremental_seat_allocation(cursor, connection, exam_id, chosen_hall_ids=None, reallocate_all=False):

    """

    Randomized Constraint-Based Seat Allocation Engine:

    1. Fetches fresh eligible student records directly from MySQL via sync_and_get_exam_students.

    2. Recalculates total eligible count directly from database.

    3. If existing allocations exist and reallocate_all is False:

       - Returns requires_confirmation: True so admin is prompted before overwriting.

    4. If reallocate_all is True:

       - Archives the existing seating arrangement to seat_allocation_history (with version & timestamp).

       - Clears previous allocations for this exam.

    5. Generates a fresh cryptographically randomized run seed (secrets.randbits(64) ^ time.time_ns() ^ exam_id).

    6. Identifies available halls avoiding conflicts with overlapping exam sessions.

    7. Proportional dynamic section distribution across all rooms.

    8. Solves 8-neighbor constraint satisfaction (horizontal, vertical, diagonal, aisle/bench adjacencies).

    9. Pre-commit validation pass: exactly 1:1 student-seat mapping, room capacities respected,

       and ZERO same-section 8-neighbor conflicts.

    10. Atomic database transaction commit.

    """

    import secrets

    import time

    import random



    eligible_students, exam = sync_and_get_exam_students(cursor, connection, exam_id)

    if not exam:

        return {"success": False, "error": "Exam not found", "status_code": 404}



    if exam.get("status") == "Completed":

        return {

            "success": False,

            "error": "Cannot allocate seats: This examination has already been conducted and marked as Completed.",

            "status_code": 400

        }

    if exam.get("status") == "Cancelled":

        return {

            "success": False,

            "error": "Cannot allocate seats: This examination has been cancelled.",

            "status_code": 400

        }



    total_eligible = len(eligible_students)

    if total_eligible == 0:

        return {

            "success": False,

            "error": f"No eligible students found in the database for {exam.get('target_branch', 'CSE')} {exam.get('semester', '')} ({exam.get('academic_year', '')}).",

            "status_code": 400

        }



    eligible_student_map = {st["student_id"]: st for st in eligible_students}

    eligible_student_ids = set(eligible_student_map.keys())



    # Retrieve existing allocations for this exam

    cursor.execute("""

        SELECT

            sa.allocation_id,

            sa.student_id,

            sa.seat_id,

            se.hall_id,

            se.row_no,

            se.column_no,

            h.hall_name,

            h.room_no,

            h.capacity

        FROM seat_allocations sa

        JOIN seats se ON sa.seat_id = se.seat_id

        JOIN halls h ON se.hall_id = h.hall_id

        WHERE sa.exam_id = %s

        ORDER BY h.hall_id, se.row_no, se.column_no

    """, (exam_id,))

    existing_allocations_raw = cursor.fetchall()



    def format_alloc(alloc, st_info):

        return {

            "hall_name": alloc["hall_name"],

            "hall_id": alloc["hall_id"],

            "row": alloc["row_no"],

            "column": alloc["column_no"],

            "hall_ticket_no": st_info["hall_ticket_no"],

            "student_name": st_info["name"],

            "department": st_info["department"],

            "section": st_info.get("section") or "",

            "subject_code": exam["subject_code"],

            "subject_name": exam["subject_name"],

        }



    # If allocations already exist and reallocate_all was NOT requested, prompt confirmation

    if existing_allocations_raw and not reallocate_all:

        existing_formatted = [

            format_alloc(a, eligible_student_map[a["student_id"]])

            for a in existing_allocations_raw if a["student_id"] in eligible_student_map

        ]

        used_halls = {a["hall_name"]: a.get("capacity", 0) for a in existing_allocations_raw}

        return {

            "success": True,

            "already_allocated": True,

            "requires_confirmation": True,

            "message": (

                f"A seating arrangement already exists for this examination ({len(existing_allocations_raw)} students currently seated). "

                f"Do you want to generate a new arrangement?"

            ),

            "total_eligible": total_eligible,

            "already_allocated_count": len(existing_allocations_raw),

            "total_allocated": len(existing_allocations_raw),

            "allocations_count": len(existing_allocations_raw),

            "total_students": len(existing_allocations_raw),

            "unallocated_students": [],

            "unallocated_count": 0,

            "selected_halls": [{"hall_name": h, "capacity": cap} for h, cap in used_halls.items()],

            "allocations": existing_formatted

        }



    # If reallocate_all is requested, archive the previous allocation to seat_allocation_history

    if existing_allocations_raw and reallocate_all:

        cursor.execute("SELECT COALESCE(MAX(version), 0) + 1 AS next_ver FROM seat_allocation_history WHERE exam_id = %s", (exam_id,))

        v_row = cursor.fetchone()

        next_version = (v_row["next_ver"] if v_row else 1) or 1



        cursor.execute("""

            INSERT INTO seat_allocation_history (exam_id, version, student_id, seat_id, hall_id, row_no, column_no)

            SELECT sa.exam_id, %s, sa.student_id, sa.seat_id, s.hall_id, s.row_no, s.column_no

            FROM seat_allocations sa

            JOIN seats s ON sa.seat_id = s.seat_id

            WHERE sa.exam_id = %s

        """, (next_version, exam_id))



        cursor.execute("DELETE FROM seat_allocations WHERE exam_id = %s", (exam_id,))

        connection.commit()



    # Identify conflicting exams on same date/time

    cursor.execute("""

        SELECT exam_id, exam_name, exam_date, session, start_time, end_time

        FROM exam_sessions

        WHERE exam_date = %s AND exam_id != %s

    """, (exam["exam_date"], exam_id))

    other_exams = cursor.fetchall()

    conflicting_exam_ids = [oe["exam_id"] for oe in other_exams if check_exam_overlap(exam, oe)]



    booked_hall_ids = set()

    booked_hall_names = {}

    if conflicting_exam_ids:

        placeholders = ",".join(["%s"] * len(conflicting_exam_ids))

        cursor.execute(f"""

            SELECT DISTINCT s.hall_id, h.hall_name, es.exam_name

            FROM seat_allocations sa

            JOIN seats s ON sa.seat_id = s.seat_id

            JOIN halls h ON s.hall_id = h.hall_id

            JOIN exam_sessions es ON sa.exam_id = es.exam_id

            WHERE sa.exam_id IN ({placeholders})

        """, tuple(conflicting_exam_ids))

        for r in cursor.fetchall():

            booked_hall_ids.add(r["hall_id"])

            booked_hall_names[r["hall_id"]] = f"'{r['hall_name']}' (booked for '{r['exam_name']}')"



    cursor.execute("""

        SELECT hall_id, hall_name, room_no, capacity, rows_count, columns_count

        FROM halls

        WHERE is_active = TRUE

        ORDER BY capacity DESC, hall_id

    """)

    all_active_halls = cursor.fetchall()



    selected_halls = []

    if chosen_hall_ids and isinstance(chosen_hall_ids, list) and len(chosen_hall_ids) > 0:

        custom_ids = [int(h) for h in chosen_hall_ids]

        conflicts = [booked_hall_names[h_id] for h_id in custom_ids if h_id in booked_hall_ids]

        if conflicts:

            return {

                "success": False,

                "error": f"Room conflict: The following room(s) are already allocated to another overlapping examination on {exam['exam_date']}: {', '.join(conflicts)}.",

                "status_code": 400

            }

        for h in all_active_halls:

            if h["hall_id"] in custom_ids:

                selected_halls.append(h)



        # Persist selected hall configuration for this examination

        try:

            cursor.execute("DELETE FROM exam_halls WHERE exam_id = %s", (exam_id,))

            for h_id in custom_ids:

                cursor.execute("INSERT IGNORE INTO exam_halls (exam_id, hall_id) VALUES (%s, %s)", (exam_id, h_id))

            connection.commit()

        except Exception as eh_err:

            print("Warning saving exam_halls:", eh_err)

    else:

        # Load saved manual hall configuration for this examination from exam_halls

        cursor.execute("SELECT hall_id FROM exam_halls WHERE exam_id = %s", (exam_id,))

        saved_rows = cursor.fetchall()

        if saved_rows:

            custom_ids = [r["hall_id"] for r in saved_rows]

            conflicts = [booked_hall_names[h_id] for h_id in custom_ids if h_id in booked_hall_ids]

            if conflicts:

                return {

                    "success": False,

                    "error": f"Room conflict: The following previously configured room(s) are already allocated to another overlapping examination on {exam['exam_date']}: {', '.join(conflicts)}. Please update your hall selection.",

                    "status_code": 400

                }

            for h in all_active_halls:

                if h["hall_id"] in custom_ids:

                    selected_halls.append(h)

        else:

            # Check if this examination already has seat allocations in database

            cursor.execute("""

                SELECT DISTINCT s.hall_id

                FROM seat_allocations sa

                JOIN seats s ON sa.seat_id = s.seat_id

                WHERE sa.exam_id = %s

            """, (exam_id,))

            prev_alloc_rows = cursor.fetchall()

            if prev_alloc_rows:

                custom_ids = [r["hall_id"] for r in prev_alloc_rows]

                for h in all_active_halls:

                    if h["hall_id"] in custom_ids:

                        selected_halls.append(h)

                # Seed into exam_halls for future consistency

                try:

                    for h_id in custom_ids:

                        cursor.execute("INSERT IGNORE INTO exam_halls (exam_id, hall_id) VALUES (%s, %s)", (exam_id, h_id))

                    connection.commit()

                except Exception:

                    pass

            else:

                return {

                    "success": False,

                    "needs_hall_selection": True,

                    "error": "No examination halls have been selected for this examination. Please select examination halls in the Hall Configuration before generating seat allocations.",

                    "status_code": 400

                }



    if not selected_halls:

        return {

            "success": False,

            "error": f"No available examination halls on {exam['exam_date']} ({exam.get('session', '')}).",

            "status_code": 400

        }



    total_capacity = sum(h["capacity"] for h in selected_halls)

    if total_capacity < total_eligible:

        return {

            "success": False,

            "error": f"Insufficient hall capacity: Selected rooms accommodate {total_capacity} students, but {total_eligible} students require seats.",

            "status_code": 400

        }



    # Ensure physical seats exist in seats table for all selected halls up to capacity

    for hall in selected_halls:

        cursor.execute("SELECT COUNT(*) AS c FROM seats WHERE hall_id = %s", (hall["hall_id"],))

        sc = cursor.fetchone()["c"]

        if sc < hall["capacity"]:

            cols_c = (hall.get("columns_count") or 3) * 2

            for i in range(1, hall["capacity"] + 1):

                r = (i - 1) // max(1, cols_c) + 1

                c = (i - 1) % max(1, cols_c) + 1

                cursor.execute("INSERT IGNORE INTO seats (hall_id, row_no, column_no) VALUES (%s, %s, %s)", (hall["hall_id"], r, c))

            connection.commit()



    selected_hall_ids = [h["hall_id"] for h in selected_halls]

    ph = ",".join(["%s"] * len(selected_hall_ids))

    cursor.execute(f"""

        SELECT seat_id, hall_id, row_no, column_no

        FROM seats

        WHERE hall_id IN ({ph})

        ORDER BY hall_id, row_no, column_no

    """, tuple(selected_hall_ids))

    all_seats_raw = cursor.fetchall()



    hall_seats_map = {h["hall_id"]: [] for h in selected_halls}

    for s in all_seats_raw:

        if s["hall_id"] in hall_seats_map:

            hall_seats_map[s["hall_id"]].append(s)



    halls_with_seats = [

        {

            "hall_id": h["hall_id"],

            "hall_name": h["hall_name"],

            "capacity": h["capacity"],

            "seats": hall_seats_map[h["hall_id"]]

        }

        for h in selected_halls

    ]



    # Generate fresh cryptographically randomized seed per allocation run

    run_seed = (secrets.randbits(64) ^ time.time_ns() ^ int(exam_id)) & 0xFFFFFFFFFFFFFFFF

    rng = random.Random(run_seed)



    all_allocations, err = generate_multi_room_seating(eligible_students, halls_with_seats, rng)

    if err:

        return {

            "success": False,

            "error": f"Seat allocation constraint failure: {err}",

            "status_code": 400

        }



    # =========================================================

    # STRICT PRE-COMMIT VALIDATION PASS (Zero Tolerance)

    # =========================================================

    if len(all_allocations) != total_eligible:

        return {

            "success": False,

            "error": f"Validation failed: expected {total_eligible} allocations, got {len(all_allocations)}",

            "status_code": 400

        }



    # 1. Verify every eligible student is allocated to exactly one seat

    alloc_student_ids = [a["student_id"] for a in all_allocations]

    if len(alloc_student_ids) != len(set(alloc_student_ids)):

        return {

            "success": False,

            "error": "Validation failed: duplicate student seat allocation detected.",

            "status_code": 400

        }



    # 2. Verify no seat is assigned to multiple students

    alloc_seat_ids = [a["seat_id"] for a in all_allocations]

    if len(alloc_seat_ids) != len(set(alloc_seat_ids)):

        return {

            "success": False,

            "error": "Validation failed: multiple students assigned to the same seat.",

            "status_code": 400

        }



    # 3. Verify room capacities are respected

    hall_cap_map = {h["hall_id"]: h["capacity"] for h in selected_halls}

    hall_counts = {}

    for a in all_allocations:

        hall_counts[a["hall_id"]] = hall_counts.get(a["hall_id"], 0) + 1

    for h_id, count in hall_counts.items():

        if count > hall_cap_map.get(h_id, 0):

            return {

                "success": False,

                "error": f"Validation failed: Hall {h_id} allocation ({count}) exceeds capacity ({hall_cap_map.get(h_id, 0)}).",

                "status_code": 400

            }



    # 4. Verify ZERO same-section 8-neighbors (horizontal, vertical, diagonal, across aisles/benches)

    for h in selected_halls:

        h_id = h["hall_id"]

        h_allocs = [a for a in all_allocations if a["hall_id"] == h_id]

        grid = {(a["row_no"], a["column_no"]): a["section"] for a in h_allocs}

        for (r, c), sec in grid.items():

            for dr in (-1, 0, 1):

                for dc in (-1, 0, 1):

                    if dr == 0 and dc == 0:

                        continue

                    if grid.get((r + dr, c + dc)) == sec:

                        return {

                            "success": False,

                            "error": f"Validation failed: Same-section adjacency detected in {h['hall_name']} between ({r},{c}) and ({r+dr},{c+dc}) for section {sec}.",

                            "status_code": 400

                        }



    # =========================================================

    # PERSISTENCE: Transactional Database Insertion

    # =========================================================

    insert_data = [(a["student_id"], exam_id, a["seat_id"]) for a in all_allocations]

    cursor.executemany(

        "INSERT INTO seat_allocations (student_id, exam_id, seat_id) VALUES (%s, %s, %s)",

        insert_data

    )

    connection.commit()



    used_hall_names = {a["hall_name"] for a in all_allocations}

    final_halls = [h for h in selected_halls if h["hall_name"] in used_hall_names]



    formatted_allocations = [

        {

            "hall_name": a["hall_name"],

            "hall_id": a["hall_id"],

            "row": a["row_no"],

            "column": a["column_no"],

            "hall_ticket_no": a["hall_ticket_no"],

            "student_name": a["name"],

            "department": a["department"],

            "section": a["section"],

            "subject_code": exam["subject_code"],

            "subject_name": exam["subject_name"],

        }

        for a in all_allocations

    ]



    return {

        "success": True,

        "message": f"Successfully allocated seats for all {total_eligible} eligible student(s) across {len(final_halls)} room(s) with zero same-section neighbor conflicts.",

        "total_eligible": total_eligible,

        "already_allocated": 0,

        "newly_allocated": len(all_allocations),

        "total_allocated": len(all_allocations),

        "allocations_count": len(all_allocations),

        "total_students": len(all_allocations),

        "unallocated_students": [],

        "unallocated_count": 0,

        "selected_halls": [{"hall_name": h["hall_name"], "capacity": h["capacity"]} for h in final_halls],

        "allocations": formatted_allocations,

        "run_seed": run_seed

    }





def auto_allocate_seats_for_exam(cursor, connection, exam_id):

    """

    Wrapper for backward compatibility calling the incremental seat allocation engine.

    """

    return run_incremental_seat_allocation(cursor, connection, exam_id)





def batch_import_roster():







    """







    Imports subjects and registered students together from CSV, Excel (.xlsx/.xls), or PDF.







    - Adds new subjects automatically if they don't exist.







    - Upserts students into the students table.







    - Creates or links examination sessions.







    - Registers candidates for the examination(s).







    - Automatically assigns seat allocation across available halls.







    """







    file = request.files.get("file")







    is_preview = (







        request.args.get("preview", "").lower() in ("true", "1") or







        request.form.get("preview", "").lower() in ("true", "1")







    )







    default_sub_code = request.form.get("default_subject_code", "").strip()







    default_sub_name = request.form.get("default_subject_name", "").strip()







    exam_date = request.form.get("exam_date", "").strip() or datetime.now().strftime("%Y-%m-%d")







    session = request.form.get("session", "FN").strip().upper()







    auto_allocate = request.form.get("auto_allocate", "true").lower() in ("true", "1")

    form_study_year = request.form.get("study_year", "").strip()

    form_academic_year = request.form.get("academic_year", "").strip()

    form_dept = request.form.get("department", "CSE").strip()















    if not file:







        return jsonify({"error": "No file uploaded. Please upload a CSV, Excel, or PDF roster file."}), 400















    filename = file.filename or ""







    if not (filename.lower().endswith(".csv") or filename.lower().endswith(".xlsx") or filename.lower().endswith(".xls") or filename.lower().endswith(".pdf")):







        return jsonify({"error": "Unsupported file format. Please upload CSV, Excel (.xlsx, .xls), or PDF."}), 400















    connection = None







    cursor = None







    try:







        parsed_students, detected_subjects = parse_master_roster_file(







            file,







            filename,







            default_sub_code=default_sub_code,







            default_sub_name=default_sub_name,







            default_date=exam_date,







            default_session=session







        )















        if not parsed_students:







            return jsonify({"error": "No student records could be extracted from the uploaded file."}), 400















        # If preview mode, return extracted subjects and student rows without writing to DB







        if is_preview:







            validation_errors = getattr(parsed_students, "validation_errors", [])







            detected_sections = sorted(list({s.get("section", "A") for s in parsed_students}))







            return jsonify({







                "preview_mode": True,







                "total_students": len(parsed_students),







                "detected_subjects": detected_subjects,







                "detected_sections": detected_sections,







                "validation_errors": validation_errors,







                "preview_students": parsed_students[:50],







                "exam_date": exam_date,







                "session": session,







                "message": f"Parsed {len(parsed_students)} students across {len(detected_sections)} section(s). Ready for import."







            }), 200















        connection = get_db_connection()







        cursor = connection.cursor(dictionary=True)















        # 1. Process and upsert subjects







        subject_id_map = {}







        subjects_created = []















        for sub in detected_subjects:







            s_code = sub["subject_code"].strip().upper()







            s_name = sub["subject_name"].strip() or s_code















            cursor.execute("SELECT subject_id, subject_name FROM subjects WHERE UPPER(subject_code) = %s", (s_code,))







            existing_sub = cursor.fetchone()















            if existing_sub:







                subject_id_map[s_code] = existing_sub["subject_id"]







            else:







                cursor.execute("""







                    INSERT INTO subjects (subject_code, subject_name)







                    VALUES (%s, %s)







                """, (s_code, s_name))







                sub_id = cursor.lastrowid







                subject_id_map[s_code] = sub_id







                subjects_created.append({"subject_id": sub_id, "subject_code": s_code, "subject_name": s_name})















        # 2. Process and upsert students







        student_id_map = {}







        for s in parsed_students:







            ht = s["hall_ticket_no"]







            cursor.execute("SELECT student_id FROM students WHERE hall_ticket_no = %s", (ht,))







            existing_st = cursor.fetchone()



            dept_val = s.get("department") or form_dept or "CSE"

            year_val = int(form_study_year) if (form_study_year and form_study_year.isdigit()) else (s.get("year") or 3)

            sec_val = s.get("section") or "A"

            acad_val = form_academic_year or "2026-2027"



            if existing_st:

                s_id = existing_st["student_id"]

                cursor.execute("""

                    UPDATE students

                    SET name = %s, department = %s, year = %s, study_year = %s, section = %s, academic_year = %s

                    WHERE student_id = %s

                """, (s["name"], dept_val, year_val, year_val, sec_val, acad_val, s_id))

                student_id_map[ht] = s_id

            else:

                cursor.execute("""

                    INSERT INTO students (hall_ticket_no, name, department, branch, year, study_year, section, academic_year)

                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)

                """, (ht, s["name"], dept_val, dept_val, year_val, year_val, sec_val, acad_val))

                student_id_map[ht] = cursor.lastrowid















        # 3. Group students by (subject_code, exam_date, session)







        groups = {}







        for s in parsed_students:







            key = (s["subject_code"], s.get("exam_date") or exam_date, s.get("session") or session)







            groups.setdefault(key, []).append(s)















        affected_exams = []















        for (s_code, e_date, e_sess), group_students in groups.items():







            sub_id = subject_id_map.get(s_code)







            if not sub_id:







                continue















            sub_title = next((s["subject_name"] for s in detected_subjects if s["subject_code"] == s_code), s_code)















            # Check if exam session exists for this subject, date, session







            cursor.execute("""







                SELECT exam_id, exam_name, expected_students







                FROM exam_sessions







                WHERE subject_id = %s AND exam_date = %s AND session = %s







            """, (sub_id, e_date, e_sess))







            existing_exam = cursor.fetchone()















            if existing_exam:







                cur_exam_id = existing_exam["exam_id"]







                cur_exam_name = existing_exam["exam_name"]







            else:







                cur_exam_name = f"{sub_title} Examination"







                cursor.execute("""







                    INSERT INTO exam_sessions (exam_name, subject_id, exam_date, session, start_time, end_time, expected_students)







                    VALUES (%s, %s, %s, %s, %s, %s, %s)







                """, (







                    cur_exam_name,







                    sub_id,







                    e_date,







                    e_sess,







                    "09:30 AM" if e_sess == "FN" else "01:30 PM",







                    "12:30 PM" if e_sess == "FN" else "04:30 PM",







                    len(group_students)







                ))







                cur_exam_id = cursor.lastrowid















            # Register students for this exam







            reg_count = 0







            for st in group_students:







                st_id = student_id_map.get(st["hall_ticket_no"])







                if st_id:







                    cursor.execute("""







                        INSERT IGNORE INTO exam_registrations (student_id, exam_id)







                        VALUES (%s, %s)







                    """, (st_id, cur_exam_id))







                    reg_count += 1















            # Update expected_students count







            cursor.execute("""







                UPDATE exam_sessions







                SET expected_students = (SELECT COUNT(*) FROM exam_registrations WHERE exam_id = %s)







                WHERE exam_id = %s







            """, (cur_exam_id, cur_exam_id))















            affected_exams.append({







                "exam_id": cur_exam_id,







                "exam_name": cur_exam_name,







                "subject_code": s_code,







                "subject_name": sub_title,







                "exam_date": str(e_date),







                "session": e_sess,







                "registered_candidates": reg_count







            })















        connection.commit()















        # 4. Perform automatic seat allocation if requested







        allocation_summary = []







        if auto_allocate:







            for ex in affected_exams:







                res = auto_allocate_seats_for_exam(cursor, connection, ex["exam_id"])







                ex["allocation"] = res







                allocation_summary.append(res)







            connection.commit()















        return jsonify({







            "message": f"Successfully processed {len(parsed_students)} student records across {len(affected_exams)} examination session(s)!" + (







                " Seating plans generated automatically." if auto_allocate else ""







            ),







            "total_students": len(parsed_students),







            "subjects_created": subjects_created,







            "affected_exams": affected_exams,







            "auto_allocated": auto_allocate







        }), 200















    except Exception as e:







        if connection and connection.is_connected(): connection.rollback()







        return jsonify({"error": str(e)}), 500







    finally:







        if cursor: cursor.close()







        if connection and connection.is_connected(): connection.close()





























# =========================================================







# AVAILABLE HALLS FOR EXAM (OVERLAP-AWARE & CAPACITY-AWARE)







# =========================================================















@admin_bp.route("/exams/<int:exam_id>/available-halls", methods=["GET"])







def get_available_halls_for_exam(exam_id):







    connection = None







    cursor = None







    try:







        connection = get_db_connection()







        cursor = connection.cursor(dictionary=True)















        cursor.execute("""







            SELECT exam_id, exam_name, exam_date, session, start_time, end_time, expected_students,







                   (SELECT COUNT(*) FROM exam_registrations er WHERE er.exam_id = es.exam_id) AS student_count







            FROM exam_sessions es







            WHERE exam_id = %s







        """, (exam_id,))







        this_exam = cursor.fetchone()







        if not this_exam:







            return jsonify({"error": "Examination not found"}), 404















        # Get all halls







        cursor.execute("""







            SELECT hall_id, hall_name, room_no, rows_count, columns_count, capacity, is_active







            FROM halls







            ORDER BY capacity DESC, hall_name







        """)







        all_halls = cursor.fetchall()















        # Find other exams on the same date that overlap in time/session







        cursor.execute("""







            SELECT exam_id, exam_name, exam_date, session, start_time, end_time







            FROM exam_sessions







            WHERE exam_date = %s AND exam_id != %s







        """, (this_exam["exam_date"], exam_id))







        other_exams = cursor.fetchall()















        conflicting_exam_ids = [oe["exam_id"] for oe in other_exams if check_exam_overlap(this_exam, oe)]







        booked_hall_map = {}















        if conflicting_exam_ids:







            placeholders = ",".join(["%s"] * len(conflicting_exam_ids))







            cursor.execute(f"""







                SELECT DISTINCT s.hall_id, es.exam_name, es.session







                FROM seat_allocations sa







                JOIN seats s ON sa.seat_id = s.seat_id







                JOIN exam_sessions es ON sa.exam_id = es.exam_id







                WHERE sa.exam_id IN ({placeholders})







            """, tuple(conflicting_exam_ids))







            booked_rows = cursor.fetchall()







            for br in booked_rows:







                booked_hall_map[br["hall_id"]] = f"Occupied by '{br['exam_name']}' ({br['session']})"















        # Also get currently utilized halls for this exam







        cursor.execute("""







            SELECT DISTINCT s.hall_id







            FROM seat_allocations sa







            JOIN seats s ON sa.seat_id = s.seat_id







            WHERE sa.exam_id = %s







        """, (exam_id,))







        currently_allocated_ids = {r["hall_id"] for r in cursor.fetchall()}















        # Build response







        halls_result = []







        for h in all_halls:







            is_active = bool(h["is_active"])







            conflict = booked_hall_map.get(h["hall_id"])







            is_avail = is_active and (conflict is None)







            halls_result.append({







                "hall_id": h["hall_id"],







                "hall_name": h["hall_name"],







                "room_no": h["room_no"] or h["hall_name"],







                "capacity": h["capacity"],







                "rows_count": h["rows_count"],







                "columns_count": h["columns_count"],







                "is_active": is_active,







                "is_available": is_avail,







                "conflict_reason": conflict if conflict else ("Inactive hall" if not is_active else None),







                "is_currently_allocated": h["hall_id"] in currently_allocated_ids







            })















        return jsonify({







            "exam_id": exam_id,







            "exam_name": this_exam["exam_name"],







            "exam_date": str(this_exam["exam_date"]),







            "session": this_exam["session"],







            "student_count": this_exam["student_count"] or this_exam["expected_students"] or 0,







            "halls": halls_result







        }), 200















    except Exception as e:







        return jsonify({"error": str(e)}), 500







    finally:







        if cursor: cursor.close()







        if connection and connection.is_connected(): connection.close()





























# =========================================================







# HALLS MANAGEMENT (VIEW, ADD, EDIT, DELETE)







# =========================================================















@admin_bp.route("/halls", methods=["GET"])







def get_halls():







    connection = None







    cursor = None







    try:







        connection = get_db_connection()







        cursor = connection.cursor(dictionary=True)







        cursor.execute("""







            SELECT







                h.hall_id,







                h.hall_name,







                h.room_no,







                h.rows_count,







                h.columns_count,







                h.capacity,







                h.is_active,







                (SELECT COUNT(*) FROM seats s WHERE s.hall_id = h.hall_id) AS total_physical_seats







            FROM halls h







            ORDER BY h.hall_name







        """)







        halls = cursor.fetchall()







        return jsonify({"halls": halls, "total_halls": len(halls)}), 200







    except Exception as e:







        return jsonify({"error": str(e)}), 500







    finally:







        if cursor: cursor.close()







        if connection and connection.is_connected(): connection.close()





























@admin_bp.route("/halls", methods=["POST"])







def create_hall():







    data = request.get_json(silent=True) or {}







    hall_name = data.get("hall_name", "").strip().upper()







    room_no = data.get("room_no", "").strip() or hall_name







    raw_capacity = data.get("capacity")







    is_active = bool(data.get("is_active", True))















    if not hall_name:







        return jsonify({"error": "Hall name / room identifier is required"}), 400















    try:







        capacity = int(raw_capacity)







        if capacity <= 0:







            return jsonify({"error": "Total seating capacity must be a positive number greater than 0"}), 400







    except (TypeError, ValueError):







        return jsonify({"error": "Please enter a valid positive number for seating capacity"}), 400















    # Layout details are OPTIONAL







    raw_rows = data.get("rows_count")







    raw_cols = data.get("columns_count")







    rows_count = int(raw_rows) if raw_rows and str(raw_rows).isdigit() and int(raw_rows) > 0 else None







    columns_count = int(raw_cols) if raw_cols and str(raw_cols).isdigit() and int(raw_cols) > 0 else None















    # If layout provided, check capacity vs grid







    if rows_count and columns_count:







        if rows_count * columns_count < capacity:







            # Expand grid or use capacity







            pass















    connection = None







    cursor = None







    try:







        connection = get_db_connection()







        cursor = connection.cursor(dictionary=True)















        cursor.execute("SELECT hall_id FROM halls WHERE hall_name = %s", (hall_name,))







        if cursor.fetchone():







            return jsonify({"error": f"Hall '{hall_name}' already exists"}), 409















        cursor.execute("""







            INSERT INTO halls (hall_name, room_no, rows_count, columns_count, capacity, is_active)







            VALUES (%s, %s, %s, %s, %s, %s)







        """, (hall_name, room_no, rows_count or 6, columns_count or 6, capacity, is_active))















        hall_id = cursor.lastrowid















        # Generate physical seats for this hall







        seats_data = []







        if rows_count and columns_count:







            # Custom layout grid







            seat_num = 0







            for r in range(1, rows_count + 1):







                for c in range(1, columns_count + 1):







                    if seat_num < capacity:







                        seats_data.append((hall_id, r, c))







                        seat_num += 1







        else:







            # Standard bench layout: 2 seats per bench (pairs)







            for i in range(capacity):







                row_no = (i // 2) + 1







                col_no = (i % 2) + 1







                seats_data.append((hall_id, row_no, col_no))















        cursor.executemany("INSERT INTO seats (hall_id, row_no, column_no) VALUES (%s, %s, %s)", seats_data)







        connection.commit()















        return jsonify({







            "message": "Hall created and seating grid initialized successfully",







            "hall_id": hall_id,







            "hall_name": hall_name,







            "room_no": room_no,







            "capacity": capacity,







            "rows_count": rows_count,







            "columns_count": columns_count,







            "is_active": is_active,







            "seats_generated": len(seats_data)







        }), 201







    except Exception as e:







        if connection and connection.is_connected(): connection.rollback()







        return jsonify({"error": str(e)}), 500







    finally:







        if cursor: cursor.close()







        if connection and connection.is_connected(): connection.close()





























@admin_bp.route("/halls/<int:hall_id>", methods=["PUT"])







def update_hall(hall_id):







    data = request.get_json(silent=True) or {}







    hall_name = data.get("hall_name", "").strip().upper()







    room_no = data.get("room_no", "").strip() or hall_name







    raw_capacity = data.get("capacity")







    is_active = bool(data.get("is_active", True))















    if not hall_name:







        return jsonify({"error": "Hall name is required"}), 400















    try:







        capacity = int(raw_capacity)







        if capacity <= 0:







            return jsonify({"error": "Total seating capacity must be a positive number greater than 0"}), 400







    except (TypeError, ValueError):







        return jsonify({"error": "Please enter a valid positive number for seating capacity"}), 400















    raw_rows = data.get("rows_count")







    raw_cols = data.get("columns_count")







    rows_count = int(raw_rows) if raw_rows and str(raw_rows).isdigit() and int(raw_rows) > 0 else 6







    columns_count = int(raw_cols) if raw_cols and str(raw_cols).isdigit() and int(raw_cols) > 0 else 6















    connection = None







    cursor = None







    try:







        connection = get_db_connection()







        cursor = connection.cursor(dictionary=True)















        cursor.execute("SELECT hall_id, rows_count, columns_count, capacity FROM halls WHERE hall_id = %s", (hall_id,))







        existing = cursor.fetchone()







        if not existing:







            return jsonify({"error": "Hall not found"}), 404















        # Update hall attributes







        cursor.execute("""







            UPDATE halls







            SET hall_name = %s, room_no = %s, rows_count = %s, columns_count = %s, capacity = %s, is_active = %s







            WHERE hall_id = %s







        """, (hall_name, room_no, rows_count, columns_count, capacity, is_active, hall_id))















        # Check if seats need regeneration







        cursor.execute("SELECT COUNT(*) AS count FROM seat_allocations sa JOIN seats s ON sa.seat_id = s.seat_id WHERE s.hall_id = %s", (hall_id,))







        has_allocations = cursor.fetchone()["count"] > 0















        if not has_allocations:







            cursor.execute("DELETE FROM seats WHERE hall_id = %s", (hall_id,))







            seats_data = []







            if raw_rows and raw_cols:







                seat_num = 0







                for r in range(1, rows_count + 1):







                    for c in range(1, columns_count + 1):







                        if seat_num < capacity:







                            seats_data.append((hall_id, r, c))







                            seat_num += 1







            else:







                for i in range(capacity):







                    seats_data.append((hall_id, (i // 2) + 1, (i % 2) + 1))







            cursor.executemany("INSERT INTO seats (hall_id, row_no, column_no) VALUES (%s, %s, %s)", seats_data)















        connection.commit()







        return jsonify({"message": "Hall updated successfully", "hall_id": hall_id}), 200







    except Exception as e:







        if connection and connection.is_connected(): connection.rollback()







        return jsonify({"error": str(e)}), 500







    finally:







        if cursor: cursor.close()







        if connection and connection.is_connected(): connection.close()





























@admin_bp.route("/halls/<int:hall_id>", methods=["DELETE"])

def delete_hall(hall_id):

    """

    Permanently delete an examination hall from the active directory.

    If the hall has historical records (completed examinations, past seat allocations, supervisor registers):

      - Safely preserves full snapshot in historical_halls.

      - Preserves hall_name, room_no, and seating grid metadata in exam_halls, seats, seat_allocations,

        and invigilator_assignments.

      - Sets hall_id to NULL on historical records so foreign keys remain intact.

      - Removes unreferenced physical seats.

      - Deletes the master hall record from halls.

    If the hall has active/upcoming examination records:

      - Strictly blocks deletion with HTTP 409 prompting conclusion or reallocation first.

    """

    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        connection.autocommit = False

        cursor = connection.cursor(dictionary=True)



        cursor.execute("SELECT hall_id, hall_name, room_no, capacity, rows_count, columns_count FROM halls WHERE hall_id = %s", (hall_id,))

        hall = cursor.fetchone()

        if not hall:

            return jsonify({"error": "Examination hall not found."}), 404



        # 1. Check Active Duties / Active Seat Allocations / Active Exam Halls

        cursor.execute("""

            SELECT

                COALESCE((

                    SELECT COUNT(DISTINCT sa.allocation_id)

                    FROM seat_allocations sa

                    JOIN seats s ON sa.seat_id = s.seat_id

                    JOIN exam_sessions es ON sa.exam_id = es.exam_id

                    WHERE s.hall_id = %s

                      AND (es.status IN ('Scheduled', 'Published', 'In-Progress', 'Allocated') OR (es.exam_date >= CURRENT_DATE() AND (es.status IS NULL OR es.status <> 'Cancelled')))

                ), 0) AS active_seat_count,

                COALESCE((

                    SELECT COUNT(DISTINCT ia.assignment_id)

                    FROM invigilator_assignments ia

                    JOIN exam_sessions es ON ia.exam_id = es.exam_id

                    WHERE ia.hall_id = %s

                      AND (es.status IN ('Scheduled', 'Published', 'In-Progress', 'Allocated') OR (es.exam_date >= CURRENT_DATE() AND (es.status IS NULL OR es.status <> 'Cancelled')))

                ), 0) AS active_invig_count,

                COALESCE((

                    SELECT COUNT(DISTINCT eh.id)

                    FROM exam_halls eh

                    JOIN exam_sessions es ON eh.exam_id = es.exam_id

                    WHERE eh.hall_id = %s

                      AND (es.status IN ('Scheduled', 'Published', 'In-Progress', 'Allocated') OR (es.exam_date >= CURRENT_DATE() AND (es.status IS NULL OR es.status <> 'Cancelled')))

                ), 0) AS active_exam_count,

                COALESCE((

                    SELECT COUNT(DISTINCT sa.allocation_id)

                    FROM seat_allocations sa

                    JOIN seats s ON sa.seat_id = s.seat_id

                    JOIN exam_sessions es ON sa.exam_id = es.exam_id

                    WHERE s.hall_id = %s

                      AND (es.status = 'Completed' OR (es.exam_date < CURRENT_DATE() AND es.status <> 'Cancelled'))

                ), 0) AS hist_seat_count,

                COALESCE((

                    SELECT COUNT(DISTINCT ia.assignment_id)

                    FROM invigilator_assignments ia

                    JOIN exam_sessions es ON ia.exam_id = es.exam_id

                    WHERE ia.hall_id = %s

                      AND (es.status = 'Completed' OR (es.exam_date < CURRENT_DATE() AND es.status <> 'Cancelled'))

                ), 0) AS hist_invig_count,

                COALESCE((

                    SELECT COUNT(DISTINCT eh.id)

                    FROM exam_halls eh

                    JOIN exam_sessions es ON eh.exam_id = es.exam_id

                    WHERE eh.hall_id = %s

                      AND (es.status = 'Completed' OR (es.exam_date < CURRENT_DATE() AND es.status <> 'Cancelled'))

                ), 0) AS hist_exam_count,

                COALESCE((

                    SELECT COUNT(DISTINCT ih.history_id)

                    FROM invigilator_history ih

                    WHERE ih.hall_id = %s

                ), 0) +

                COALESCE((

                    SELECT COUNT(DISTINCT sah.history_id)

                    FROM seat_allocation_history sah

                    WHERE sah.hall_id = %s

                ), 0) AS hist_logs_count

        """, (hall_id, hall_id, hall_id, hall_id, hall_id, hall_id, hall_id, hall_id))

        deps = cursor.fetchone()



        active_total = deps["active_seat_count"] + deps["active_invig_count"] + deps["active_exam_count"]

        hist_total = deps["hist_seat_count"] + deps["hist_invig_count"] + deps["hist_exam_count"] + deps["hist_logs_count"]



        if active_total > 0:

            parts = []

            if deps["active_seat_count"] > 0: parts.append(f"{deps['active_seat_count']} active seat allocation(s)")

            if deps["active_invig_count"] > 0: parts.append(f"{deps['active_invig_count']} active invigilation duty assignment(s)")

            if deps["active_exam_count"] > 0: parts.append(f"{deps['active_exam_count']} scheduled examination session(s)")

            return jsonify({

                "error": f"Cannot permanently remove Hall '{hall['room_no'] or hall['hall_name']}': It is actively referenced in {', '.join(parts)}. Please conclude, reassign, or cancel active examinations first, or choose 'Deactivate'."

            }), 409



        hall_name = hall["hall_name"]

        room_no = hall["room_no"] or hall_name

        capacity = hall["capacity"] or 0

        rows_count = hall["rows_count"] or 0

        columns_count = hall["columns_count"] or 0



        # If hall has historical records, preserve them before removal

        if hist_total > 0:

            # 1. Fetch seating layout

            cursor.execute("SELECT seat_id, row_no, column_no FROM seats WHERE hall_id = %s ORDER BY row_no, column_no", (hall_id,))

            layout_data = cursor.fetchall()

            layout_json = json.dumps(layout_data) if layout_data else None



            # 2. Count metrics

            cursor.execute("SELECT COUNT(DISTINCT exam_id) AS c FROM exam_halls WHERE hall_id = %s", (hall_id,))

            exams_conducted = cursor.fetchone()["c"]

            cursor.execute("SELECT COUNT(DISTINCT allocation_id) AS c FROM seat_allocations sa JOIN seats s ON sa.seat_id = s.seat_id WHERE s.hall_id = %s", (hall_id,))

            seats_alloc_count = cursor.fetchone()["c"]

            cursor.execute("SELECT COUNT(DISTINCT assignment_id) AS c FROM invigilator_assignments WHERE hall_id = %s", (hall_id,))

            duties_count = cursor.fetchone()["c"]



            # 3. Insert historical snapshot into historical_halls

            cursor.execute("""

                INSERT INTO historical_halls (

                    original_hall_id, hall_name, room_no, rows_count, columns_count, capacity,

                    seating_layout, total_exams_conducted, total_seat_allocations, total_duties_assigned,

                    removed_by, removal_reason

                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)

            """, (

                hall_id, hall_name, room_no, rows_count, columns_count, capacity,

                layout_json, exams_conducted, seats_alloc_count, duties_count,

                "admin", "Permanent hall removal with historical snapshot preservation"

            ))

            hist_hall_id = cursor.lastrowid



            # 4. Snapshot exam_halls

            cursor.execute("""

                UPDATE exam_halls

                SET historical_hall_id = %s,

                    hall_name = COALESCE(hall_name, %s),

                    room_no = COALESCE(room_no, %s),

                    capacity = COALESCE(capacity, %s),

                    rows_count = COALESCE(rows_count, %s),

                    columns_count = COALESCE(columns_count, %s)

                WHERE hall_id = %s

            """, (hist_hall_id, hall_name, room_no, capacity, rows_count, columns_count, hall_id))



            # 5. Snapshot invigilator_assignments

            cursor.execute("""

                UPDATE invigilator_assignments

                SET historical_hall_id = %s,

                    hall_name = COALESCE(hall_name, %s),

                    room_no = COALESCE(room_no, %s)

                WHERE hall_id = %s

            """, (hist_hall_id, hall_name, room_no, hall_id))



            # 6. Snapshot invigilator_history

            cursor.execute("""

                UPDATE invigilator_history

                SET hall_name = COALESCE(hall_name, %s),

                    room_no = COALESCE(room_no, %s)

                WHERE hall_id = %s

            """, (hall_name, room_no, hall_id))



            # 7. Snapshot seat_allocations

            cursor.execute("""

                UPDATE seat_allocations sa

                JOIN seats s ON sa.seat_id = s.seat_id

                SET sa.hall_name = COALESCE(sa.hall_name, %s),

                    sa.room_no = COALESCE(sa.room_no, %s),

                    sa.row_no = COALESCE(sa.row_no, s.row_no),

                    sa.column_no = COALESCE(sa.column_no, s.column_no)

                WHERE s.hall_id = %s

            """, (hall_name, room_no, hall_id))



            # 8. Snapshot seat_allocation_history

            cursor.execute("""

                UPDATE seat_allocation_history

                SET hall_name = COALESCE(hall_name, %s),

                    room_no = COALESCE(room_no, %s)

                WHERE hall_id = %s

            """, (hall_name, room_no, hall_id))



            # 9. Update allocated seats (retain seat record for seat_allocations FK, snapshot hall info, nullify hall_id)

            cursor.execute("""

                UPDATE seats

                SET historical_hall_id = %s,

                    hall_name = COALESCE(hall_name, %s),

                    room_no = COALESCE(room_no, %s),

                    hall_id = NULL

                WHERE hall_id = %s AND seat_id IN (SELECT seat_id FROM seat_allocations)

            """, (hist_hall_id, hall_name, room_no, hall_id))



            # 10. Delete unallocated physical seats

            cursor.execute("""

                DELETE FROM seats

                WHERE hall_id = %s AND seat_id NOT IN (SELECT seat_id FROM seat_allocations)

            """, (hall_id,))



            # 11. Unlink any remaining seats

            cursor.execute("""

                UPDATE seats

                SET historical_hall_id = %s,

                    hall_name = COALESCE(hall_name, %s),

                    room_no = COALESCE(room_no, %s),

                    hall_id = NULL

                WHERE hall_id = %s

            """, (hist_hall_id, hall_name, room_no, hall_id))



            # 12. Delete master hall

            cursor.execute("DELETE FROM halls WHERE hall_id = %s", (hall_id,))



            try:

                cursor.execute("""

                    INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                    VALUES (%s, %s, %s, %s, %s)

                """, ("PERMANENT_REMOVE_HALL_HISTORICAL", "hall", str(hall_id), f"Permanently removed hall '{room_no}' while preserving snapshot ({hist_total} historical records) in historical_halls ID {hist_hall_id}", "admin"))

            except Exception:

                pass



            connection.commit()

            return jsonify({

                "message": f"Hall '{room_no}' permanently removed from active directory. All historical seating arrangements, attendance sheets, and invigilator registers remain safely preserved.",

                "hall_id": hall_id,

                "historical_hall_id": hist_hall_id,

                "historical_records_preserved": hist_total

            }), 200



        # Safe to delete (0 active, 0 historical):

        cursor.execute("DELETE FROM seats WHERE hall_id = %s", (hall_id,))

        cursor.execute("DELETE FROM halls WHERE hall_id = %s", (hall_id,))



        try:

            cursor.execute("""

                INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                VALUES (%s, %s, %s, %s, %s)

            """, ("DELETE", "hall", str(hall_id), f"Permanently deleted unused hall '{room_no}'", "admin"))

        except Exception:

            pass



        connection.commit()

        return jsonify({

            "message": f"Hall '{room_no}' permanently deleted successfully.",

            "hall_id": hall_id

        }), 200



    except Exception as e:

        if connection and connection.is_connected(): connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()





@admin_bp.route("/halls/deletion-check", methods=["POST"])

def check_hall_deletion():

    """

    Preflight dependency inspection before Examination Hall bulk deletion or deactivation.

    Categorizes selected examination halls into:

      1. safe: No dependencies anywhere -> Safe for permanent deletion.

      2. historical: Referenced in completed exams/history -> Safe for permanent removal with snapshot preservation!

      3. blocked_active: Referenced in scheduled/active/ongoing exams -> Strictly blocked until exams conclude.

    """

    data = request.get_json(silent=True) or {}

    hall_ids = data.get("hall_ids", [])

    if not hall_ids:

        return jsonify({"error": "No hall IDs specified."}), 400



    hids = [int(hid) for hid in hall_ids if str(hid).isdigit()]

    if not hids:

        return jsonify({"error": "Invalid hall IDs provided."}), 400



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        cur = conn.cursor(dictionary=True)

        placeholders = ",".join(["%s"] * len(hids))



        cur.execute(f"""

            SELECT

                h.hall_id,

                h.hall_name,

                h.room_no,

                h.capacity,

                h.rows_count,

                h.columns_count,

                h.is_active,

                COALESCE((

                    SELECT COUNT(DISTINCT sa.allocation_id)

                    FROM seat_allocations sa

                    JOIN seats s ON sa.seat_id = s.seat_id

                    JOIN exam_sessions es ON sa.exam_id = es.exam_id

                    WHERE s.hall_id = h.hall_id

                      AND (es.status IN ('Scheduled', 'Published', 'In-Progress', 'Allocated') OR (es.exam_date >= CURRENT_DATE() AND (es.status IS NULL OR es.status <> 'Cancelled')))

                ), 0) AS active_seat_count,

                COALESCE((

                    SELECT COUNT(DISTINCT ia.assignment_id)

                    FROM invigilator_assignments ia

                    JOIN exam_sessions es ON ia.exam_id = es.exam_id

                    WHERE ia.hall_id = h.hall_id

                      AND (es.status IN ('Scheduled', 'Published', 'In-Progress', 'Allocated') OR (es.exam_date >= CURRENT_DATE() AND (es.status IS NULL OR es.status <> 'Cancelled')))

                ), 0) AS active_invig_count,

                COALESCE((

                    SELECT COUNT(DISTINCT eh.id)

                    FROM exam_halls eh

                    JOIN exam_sessions es ON eh.exam_id = es.exam_id

                    WHERE eh.hall_id = h.hall_id

                      AND (es.status IN ('Scheduled', 'Published', 'In-Progress', 'Allocated') OR (es.exam_date >= CURRENT_DATE() AND (es.status IS NULL OR es.status <> 'Cancelled')))

                ), 0) AS active_exam_count,

                COALESCE((

                    SELECT COUNT(DISTINCT sa.allocation_id)

                    FROM seat_allocations sa

                    JOIN seats s ON sa.seat_id = s.seat_id

                    JOIN exam_sessions es ON sa.exam_id = es.exam_id

                    WHERE s.hall_id = h.hall_id

                      AND (es.status = 'Completed' OR (es.exam_date < CURRENT_DATE() AND es.status <> 'Cancelled'))

                ), 0) AS hist_seat_count,

                COALESCE((

                    SELECT COUNT(DISTINCT ia.assignment_id)

                    FROM invigilator_assignments ia

                    JOIN exam_sessions es ON ia.exam_id = es.exam_id

                    WHERE ia.hall_id = h.hall_id

                      AND (es.status = 'Completed' OR (es.exam_date < CURRENT_DATE() AND es.status <> 'Cancelled'))

                ), 0) AS hist_invig_count,

                COALESCE((

                    SELECT COUNT(DISTINCT eh.id)

                    FROM exam_halls eh

                    JOIN exam_sessions es ON eh.exam_id = es.exam_id

                    WHERE eh.hall_id = h.hall_id

                      AND (es.status = 'Completed' OR (es.exam_date < CURRENT_DATE() AND es.status <> 'Cancelled'))

                ), 0) AS hist_exam_count,

                COALESCE((

                    SELECT COUNT(DISTINCT ih.history_id)

                    FROM invigilator_history ih

                    WHERE ih.hall_id = h.hall_id

                ), 0) +

                COALESCE((

                    SELECT COUNT(DISTINCT sah.history_id)

                    FROM seat_allocation_history sah

                    WHERE sah.hall_id = h.hall_id

                ), 0) AS hist_logs_count

            FROM halls h

            WHERE h.hall_id IN ({placeholders})

            ORDER BY h.room_no ASC, h.hall_name ASC

        """, tuple(hids))

        records = cur.fetchall()



        safe_halls = []

        historical_halls = []

        blocked_active_halls = []



        for h in records:

            h["reasons"] = []

            active_total = h["active_seat_count"] + h["active_invig_count"] + h["active_exam_count"]

            hist_total = h["hist_seat_count"] + h["hist_invig_count"] + h["hist_exam_count"] + h["hist_logs_count"]



            if active_total > 0:

                h["category"] = "blocked_active"

                h["category_label"] = "Active Exam Allocations"

                h["is_blocked"] = True

                h["can_permanently_remove"] = False

                parts = []

                if h["active_seat_count"] > 0: parts.append(f"{h['active_seat_count']} active seat allocation(s)")

                if h["active_invig_count"] > 0: parts.append(f"{h['active_invig_count']} active invigilation duty assignment(s)")

                if h["active_exam_count"] > 0: parts.append(f"{h['active_exam_count']} upcoming/scheduled exam(s)")

                h["blocking_reason"] = f"Linked to {', '.join(parts)} in active examination sessions. Cannot be removed until these exams are concluded or reallocated."

                blocked_active_halls.append(h)

            elif hist_total > 0:

                h["category"] = "historical"

                h["category_label"] = "Historical Records Preserved"

                h["is_blocked"] = False

                h["can_permanently_remove"] = True

                parts = []

                if h["hist_seat_count"] > 0: parts.append(f"{h['hist_seat_count']} completed seating record(s)")

                if h["hist_invig_count"] > 0: parts.append(f"{h['hist_invig_count']} completed duty register(s)")

                if h["hist_exam_count"] > 0: parts.append(f"{h['hist_exam_count']} past exam session(s)")

                if h["hist_logs_count"] > 0: parts.append(f"{h['hist_logs_count']} audit log entries")

                h["preservation_info"] = f"Referenced in {', '.join(parts)}. Historical snapshot will be archived and all reports will continue displaying original room data."

                h["blocking_reason"] = None

                historical_halls.append(h)

            else:

                h["category"] = "safe"

                h["category_label"] = "Safe to Delete"

                h["is_blocked"] = False

                h["can_permanently_remove"] = True

                h["blocking_reason"] = None

                safe_halls.append(h)



        can_safe_delete = (len(blocked_active_halls) == 0 and len(historical_halls) == 0)

        can_remove_with_history = (len(blocked_active_halls) == 0)

        blocking_reason = None

        if len(blocked_active_halls) > 0:

            blocking_reason = f"Active Examination Block: {len(blocked_active_halls)} selected hall(s) have active seating allocations or scheduled exams. To preserve examination integrity, active examinations must be concluded, reallocated, or cancelled first; or use 'Deactivate' instead."



        return jsonify({

            "total_selected": len(records),

            "hall_count": len(records),

            "safe_count": len(safe_halls),

            "historical_count": len(historical_halls),

            "blocked_active_count": len(blocked_active_halls),

            "blocked_count": len(blocked_active_halls),

            "blocked_history_count": 0,

            "blocked_other_count": 0,

            "can_safe_delete": can_safe_delete,

            "can_remove_with_history": can_remove_with_history,

            "can_permanently_remove": can_remove_with_history,

            "blocking_reason": blocking_reason,

            "allow_deactivation": True,

            "safe_halls": safe_halls,

            "historical_halls": historical_halls,

            "blocked_active_halls": blocked_active_halls,

            "blocked_halls": blocked_active_halls,

            "halls_preview": records,

            "safe_hall_ids": [h["hall_id"] for h in safe_halls],

            "historical_hall_ids": [h["hall_id"] for h in historical_halls],

            "removable_hall_ids": [h["hall_id"] for h in safe_halls] + [h["hall_id"] for h in historical_halls],

            "blocked_active_ids": [h["hall_id"] for h in blocked_active_halls]

        }), 200



    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/halls/bulk-delete", methods=["POST"])

def execute_hall_bulk_delete():

    """

    Bulk deactivation or permanent removal of examination halls.

    - If action == 'deactivate': sets is_active = 0 without altering schema/records.

    - If action in ('delete', 'remove_permanent', 'permanent_remove'):

      - Purely safe halls (0 references) are deleted directly.

      - Historical halls are permanently removed with complete snapshot preserved in historical_halls.

      - Active halls are strictly blocked from removal.

    """

    data = request.get_json(silent=True) or {}

    hall_ids = data.get("hall_ids", [])

    action = data.get("action", "delete")

    delete_safe_only = bool(data.get("delete_safe_only", False) or data.get("force_safe_only", False) or data.get("remove_eligible_only", False))

    deleted_by = data.get("deleted_by", "admin")



    hids = [int(hid) for hid in hall_ids if str(hid).isdigit()]

    if not hids:

        return jsonify({"error": "No valid hall IDs provided."}), 400



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        conn.autocommit = False

        cur = conn.cursor(dictionary=True)

        placeholders = ",".join(["%s"] * len(hids))



        if action == "deactivate":

            cur.execute(f"UPDATE halls SET is_active = 0 WHERE hall_id IN ({placeholders})", tuple(hids))

            deactivated_count = cur.rowcount

            try:

                cur.execute("""

                    INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                    VALUES (%s, %s, %s, %s, %s)

                """, ("BULK_DEACTIVATE", "hall", str(deactivated_count), f"Bulk deactivated {deactivated_count} examination halls (IDs: {hids})", deleted_by))

            except Exception:

                pass

            conn.commit()

            return jsonify({

                "success": True,

                "action": "deactivate",

                "deactivated_count": deactivated_count,

                "message": f"Successfully deactivated {deactivated_count} examination hall(s). Hall(s) will not be available for future exam allocations while historical records remain intact."

            }), 200



        # Action: Permanent removal / delete

        cur.execute(f"""

            SELECT

                h.hall_id,

                h.hall_name,

                h.room_no,

                h.capacity,

                h.rows_count,

                h.columns_count,

                COALESCE((

                    SELECT COUNT(DISTINCT sa.allocation_id)

                    FROM seat_allocations sa

                    JOIN seats s ON sa.seat_id = s.seat_id

                    JOIN exam_sessions es ON sa.exam_id = es.exam_id

                    WHERE s.hall_id = h.hall_id

                      AND (es.status IN ('Scheduled', 'Published', 'In-Progress', 'Allocated') OR (es.exam_date >= CURRENT_DATE() AND (es.status IS NULL OR es.status <> 'Cancelled')))

                ), 0) AS active_seat_count,

                COALESCE((

                    SELECT COUNT(DISTINCT ia.assignment_id)

                    FROM invigilator_assignments ia

                    JOIN exam_sessions es ON ia.exam_id = es.exam_id

                    WHERE ia.hall_id = h.hall_id

                      AND (es.status IN ('Scheduled', 'Published', 'In-Progress', 'Allocated') OR (es.exam_date >= CURRENT_DATE() AND (es.status IS NULL OR es.status <> 'Cancelled')))

                ), 0) AS active_invig_count,

                COALESCE((

                    SELECT COUNT(DISTINCT eh.id)

                    FROM exam_halls eh

                    JOIN exam_sessions es ON eh.exam_id = es.exam_id

                    WHERE eh.hall_id = h.hall_id

                      AND (es.status IN ('Scheduled', 'Published', 'In-Progress', 'Allocated') OR (es.exam_date >= CURRENT_DATE() AND (es.status IS NULL OR es.status <> 'Cancelled')))

                ), 0) AS active_exam_count,

                COALESCE((

                    SELECT COUNT(DISTINCT sa.allocation_id)

                    FROM seat_allocations sa

                    JOIN seats s ON sa.seat_id = s.seat_id

                    JOIN exam_sessions es ON sa.exam_id = es.exam_id

                    WHERE s.hall_id = h.hall_id

                      AND (es.status = 'Completed' OR (es.exam_date < CURRENT_DATE() AND es.status <> 'Cancelled'))

                ), 0) AS hist_seat_count,

                COALESCE((

                    SELECT COUNT(DISTINCT ia.assignment_id)

                    FROM invigilator_assignments ia

                    JOIN exam_sessions es ON ia.exam_id = es.exam_id

                    WHERE ia.hall_id = h.hall_id

                      AND (es.status = 'Completed' OR (es.exam_date < CURRENT_DATE() AND es.status <> 'Cancelled'))

                ), 0) AS hist_invig_count,

                COALESCE((

                    SELECT COUNT(DISTINCT eh.id)

                    FROM exam_halls eh

                    JOIN exam_sessions es ON eh.exam_id = es.exam_id

                    WHERE eh.hall_id = h.hall_id

                      AND (es.status = 'Completed' OR (es.exam_date < CURRENT_DATE() AND es.status <> 'Cancelled'))

                ), 0) AS hist_exam_count,

                COALESCE((

                    SELECT COUNT(DISTINCT ih.history_id)

                    FROM invigilator_history ih

                    WHERE ih.hall_id = h.hall_id

                ), 0) +

                COALESCE((

                    SELECT COUNT(DISTINCT sah.history_id)

                    FROM seat_allocation_history sah

                    WHERE sah.hall_id = h.hall_id

                ), 0) AS hist_logs_count

            FROM halls h

            WHERE h.hall_id IN ({placeholders})

        """, tuple(hids))

        deps = cur.fetchall()



        active_blocked = []

        eligible_halls = []

        for d in deps:

            active_cnt = d["active_seat_count"] + d["active_invig_count"] + d["active_exam_count"]

            if active_cnt > 0:

                active_blocked.append({

                    "hall_id": d["hall_id"],

                    "hall_name": d["room_no"] or d["hall_name"],

                    "active_seat_count": d["active_seat_count"],

                    "active_invig_count": d["active_invig_count"],

                    "active_exam_count": d["active_exam_count"]

                })

            else:

                eligible_halls.append(d)



        if active_blocked and not delete_safe_only:

            conn.rollback()

            return jsonify({

                "error": f"Safety Block: {len(active_blocked)} examination hall(s) are assigned to active/upcoming examination sessions. Please cancel or conclude these examinations first, or choose 'Deactivate Selected Halls'.",

                "blocked_count": len(active_blocked),

                "failed_records": active_blocked,

                "requires_deactivation": True

            }), 400



        if not eligible_halls:

            conn.rollback()

            return jsonify({

                "error": "No examination halls in the selection are eligible for permanent removal. All selected halls are assigned to active examinations.",

                "requires_deactivation": True,

                "blocked_count": len(active_blocked)

            }), 400



        preserved_count = 0

        purely_deleted_count = 0



        for h_rec in eligible_halls:

            hid = h_rec["hall_id"]

            h_name = h_rec["hall_name"]

            r_no = h_rec["room_no"] or h_name

            cap = h_rec["capacity"] or 0

            rows = h_rec["rows_count"] or 0

            cols = h_rec["columns_count"] or 0

            hist_cnt = h_rec["hist_seat_count"] + h_rec["hist_invig_count"] + h_rec["hist_exam_count"] + h_rec["hist_logs_count"]



            if hist_cnt > 0:

                # 1. Capture layout

                cur.execute("SELECT seat_id, row_no, column_no FROM seats WHERE hall_id = %s ORDER BY row_no, column_no", (hid,))

                s_layout = cur.fetchall()

                s_layout_json = json.dumps(s_layout) if s_layout else None



                # 2. Count metrics

                cur.execute("SELECT COUNT(DISTINCT exam_id) AS c FROM exam_halls WHERE hall_id = %s", (hid,))

                ex_cond = cur.fetchone()["c"]

                cur.execute("SELECT COUNT(DISTINCT allocation_id) AS c FROM seat_allocations sa JOIN seats s ON sa.seat_id = s.seat_id WHERE s.hall_id = %s", (hid,))

                st_alloc = cur.fetchone()["c"]

                cur.execute("SELECT COUNT(DISTINCT assignment_id) AS c FROM invigilator_assignments WHERE hall_id = %s", (hid,))

                inv_alloc = cur.fetchone()["c"]



                # 3. Insert into historical_halls

                cur.execute("""

                    INSERT INTO historical_halls (

                        original_hall_id, hall_name, room_no, rows_count, columns_count, capacity,

                        seating_layout, total_exams_conducted, total_seat_allocations, total_duties_assigned,

                        removed_by, removal_reason

                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)

                """, (

                    hid, h_name, r_no, rows, cols, cap,

                    s_layout_json, ex_cond, st_alloc, inv_alloc,

                    deleted_by, "Bulk permanent hall removal with historical snapshot preservation"

                ))

                hist_id = cur.lastrowid



                # 4. Snapshot exam_halls

                cur.execute("""

                    UPDATE exam_halls

                    SET historical_hall_id = %s,

                        hall_name = COALESCE(hall_name, %s),

                        room_no = COALESCE(room_no, %s),

                        capacity = COALESCE(capacity, %s),

                        rows_count = COALESCE(rows_count, %s),

                        columns_count = COALESCE(columns_count, %s)

                    WHERE hall_id = %s

                """, (hist_id, h_name, r_no, cap, rows, cols, hid))



                # 5. Snapshot invigilator_assignments

                cur.execute("""

                    UPDATE invigilator_assignments

                    SET historical_hall_id = %s,

                        hall_name = COALESCE(hall_name, %s),

                        room_no = COALESCE(room_no, %s)

                    WHERE hall_id = %s

                """, (hist_id, h_name, r_no, hid))



                # 6. Snapshot invigilator_history

                cur.execute("""

                    UPDATE invigilator_history

                    SET hall_name = COALESCE(hall_name, %s),

                        room_no = COALESCE(room_no, %s)

                    WHERE hall_id = %s

                """, (h_name, r_no, hid))



                # 7. Snapshot seat_allocations

                cur.execute("""

                    UPDATE seat_allocations sa

                    JOIN seats s ON sa.seat_id = s.seat_id

                    SET sa.hall_name = COALESCE(sa.hall_name, %s),

                        sa.room_no = COALESCE(sa.room_no, %s),

                        sa.row_no = COALESCE(sa.row_no, s.row_no),

                        sa.column_no = COALESCE(sa.column_no, s.column_no)

                    WHERE s.hall_id = %s

                """, (h_name, r_no, hid))



                # 8. Snapshot seat_allocation_history

                cur.execute("""

                    UPDATE seat_allocation_history

                    SET hall_name = COALESCE(hall_name, %s),

                        room_no = COALESCE(room_no, %s)

                    WHERE hall_id = %s

                """, (h_name, r_no, hid))



                # 9. Snapshot seats that have allocations and set hall_id = NULL

                cur.execute("""

                    UPDATE seats

                    SET historical_hall_id = %s,

                        hall_name = COALESCE(hall_name, %s),

                        room_no = COALESCE(room_no, %s),

                        hall_id = NULL

                    WHERE hall_id = %s AND seat_id IN (SELECT seat_id FROM seat_allocations)

                """, (hist_id, h_name, r_no, hid))



                # 10. Delete unallocated physical seats

                cur.execute("""

                    DELETE FROM seats

                    WHERE hall_id = %s AND seat_id NOT IN (SELECT seat_id FROM seat_allocations)

                """, (hid,))



                # 11. Unlink any remaining seats

                cur.execute("""

                    UPDATE seats

                    SET historical_hall_id = %s,

                        hall_name = COALESCE(hall_name, %s),

                        room_no = COALESCE(room_no, %s),

                        hall_id = NULL

                    WHERE hall_id = %s

                """, (hist_id, h_name, r_no, hid))



                # 12. Delete master hall

                cur.execute("DELETE FROM halls WHERE hall_id = %s", (hid,))

                preserved_count += 1

            else:

                # Purely safe

                cur.execute("DELETE FROM seats WHERE hall_id = %s", (hid,))

                cur.execute("DELETE FROM halls WHERE hall_id = %s", (hid,))

                purely_deleted_count += 1



        total_processed = preserved_count + purely_deleted_count



        try:

            cur.execute("""

                INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                VALUES (%s, %s, %s, %s, %s)

            """, ("PERMANENT_REMOVE_HALLS_HISTORICAL", "hall", str(total_processed), f"Permanently removed {total_processed} examination halls ({preserved_count} with historical snapshot preservation, {purely_deleted_count} unused)", deleted_by))

        except Exception:

            pass



        conn.commit()

        return jsonify({

            "success": True,

            "action": "remove_permanent",

            "removed_count": total_processed,

            "preserved_count": preserved_count,

            "purely_deleted_count": purely_deleted_count,

            "message": f"Successfully permanently removed {total_processed} examination hall(s) from active directory ({preserved_count} preserved in historical archive, {purely_deleted_count} unused). All historical examination reports and attendance sheets remain intact."

        }), 200



    except Exception as e:

        if conn and conn.is_connected(): conn.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()







@admin_bp.route("/faculty", methods=["GET"])







def get_faculty():







    connection = None







    cursor = None







    try:







        connection = get_db_connection()







        cursor = connection.cursor(dictionary=True)















        cursor.execute("SELECT faculty_id, faculty_name, designation, department, email, is_active FROM faculty ORDER BY faculty_id ASC")







        faculty_rows = cursor.fetchall()















        cursor.execute("""







            SELECT fs.faculty_id, s.subject_id, s.subject_code, s.subject_name







            FROM faculty_subjects fs







            JOIN subjects s ON fs.subject_id = s.subject_id







            ORDER BY s.subject_code







        """)







        subject_links = cursor.fetchall()















        faculty_map = {}







        for f in faculty_rows:







            f["subjects_taught"] = []







            faculty_map[f["faculty_id"]] = f















        for sl in subject_links:







            if sl["faculty_id"] in faculty_map:







                faculty_map[sl["faculty_id"]]["subjects_taught"].append({







                    "subject_id": sl["subject_id"],







                    "subject_code": sl["subject_code"],







                    "subject_name": sl["subject_name"]







                })















        return jsonify({







            "faculty": list(faculty_map.values()),







            "total_faculty": len(faculty_rows)







        }), 200







    except Exception as e:







        return jsonify({"error": str(e)}), 500







    finally:







        if cursor: cursor.close()







        if connection and connection.is_connected(): connection.close()





























@admin_bp.route("/faculty", methods=["POST"])

def create_faculty():

    data = request.get_json(silent=True) or {}

    name = (data.get("faculty_name") or data.get("name") or "").strip()

    desig = (data.get("designation") or "").strip()

    dept = (data.get("department") or "CSE").strip().upper()

    email = (data.get("email") or "").strip().lower()

    is_active = 1 if data.get("is_active", True) in (True, 1, "1", "true") else 0

    subject_ids = data.get("subject_ids", [])



    if not name:

        return jsonify({"error": "faculty_name is required"}), 400



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        if email:

            cursor.execute("SELECT faculty_id, faculty_name FROM faculty WHERE LOWER(TRIM(email)) = %s", (email,))

            existing = cursor.fetchone()

            if existing:

                return jsonify({"error": f"A faculty member with email '{email}' already exists ({existing['faculty_name']})."}), 400



        cursor.execute("""

            INSERT INTO faculty (faculty_name, designation, department, email, is_active)

            VALUES (%s, %s, %s, %s, %s)

        """, (name, desig, dept, email or None, is_active))

        new_faculty_id = cursor.lastrowid



        for s_id in subject_ids:

            try:

                cursor.execute("INSERT IGNORE INTO faculty_subjects (faculty_id, subject_id, is_verified) VALUES (%s, %s, 1)", (new_faculty_id, int(s_id)))

            except Exception:

                pass



        connection.commit()

        return jsonify({

            "message": "Faculty member created successfully",

            "faculty_id": new_faculty_id,

            "faculty_name": name,

            "designation": desig,

            "department": dept,

            "email": email,

            "is_active": is_active

        }), 201

    except Exception as e:

        if connection and connection.is_connected(): connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/faculty/<int:faculty_id>", methods=["PUT"])

def update_faculty(faculty_id):

    data = request.get_json(silent=True) or {}

    name = (data.get("faculty_name") or data.get("name") or "").strip()

    desig = (data.get("designation") or "").strip()

    dept = (data.get("department") or "CSE").strip().upper()

    email = (data.get("email") or "").strip().lower()

    is_active = 1 if data.get("is_active", True) in (True, 1, "1", "true") else 0



    if not name:

        return jsonify({"error": "faculty_name is required"}), 400



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        cursor.execute("SELECT faculty_id FROM faculty WHERE faculty_id = %s", (faculty_id,))

        if not cursor.fetchone():

            return jsonify({"error": "Faculty not found"}), 404



        if email:

            cursor.execute("SELECT faculty_id, faculty_name FROM faculty WHERE LOWER(TRIM(email)) = %s AND faculty_id <> %s", (email, faculty_id))

            collision = cursor.fetchone()

            if collision:

                return jsonify({"error": f"Another faculty member ({collision['faculty_name']}) is already using email '{email}'."}), 400



        cursor.execute("""

            UPDATE faculty

            SET faculty_name = %s, designation = %s, department = %s, email = %s, is_active = %s

            WHERE faculty_id = %s

        """, (name, desig, dept, email or None, is_active, faculty_id))



        if "subject_ids" in data and isinstance(data["subject_ids"], list):

            cursor.execute("DELETE FROM faculty_subjects WHERE faculty_id = %s", (faculty_id,))

            for s_id in data["subject_ids"]:

                try:

                    cursor.execute("INSERT INTO faculty_subjects (faculty_id, subject_id, is_verified) VALUES (%s, %s, 1)", (faculty_id, int(s_id)))

                except Exception:

                    pass



        connection.commit()

        return jsonify({

            "message": "Faculty details updated successfully",

            "faculty_id": faculty_id,

            "faculty_name": name,

            "designation": desig,

            "department": dept,

            "email": email,

            "is_active": is_active

        }), 200

    except Exception as e:

        if connection and connection.is_connected(): connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/faculty/<int:faculty_id>", methods=["DELETE"])

def delete_faculty(faculty_id):

    """

    Permanently delete a single faculty member from the directory.

    If the faculty member has historical examination duty records:

      - Preserves full identity snapshot (Name, Email, Designation, Department, Original ID) in invigilator_assignments & invigilator_history.

      - Safely unlinks and deactivates any linked login account without deleting user authentication.

      - Cascades removal from auxiliary profile tables (faculty_subjects, availability, profiles).

      - Permanently removes the faculty master record from MySQL.

    If the faculty member has active/upcoming examination duties:

      - Blocks deletion with HTTP 409 prompting duty reassignment first.

    """

    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        connection.autocommit = False

        cursor = connection.cursor(dictionary=True)



        cursor.execute("SELECT faculty_id, faculty_name, designation, department, email FROM faculty WHERE faculty_id = %s", (faculty_id,))

        fac = cursor.fetchone()

        if not fac:

            return jsonify({"error": "Faculty not found"}), 404



        # 1. Check Active Duties (upcoming or in-progress)

        cursor.execute("""

            SELECT COUNT(DISTINCT ia.assignment_id) AS count

            FROM invigilator_assignments ia

            JOIN exam_sessions es ON ia.exam_id = es.exam_id

            WHERE ia.faculty_id = %s

              AND (es.exam_date >= CURRENT_DATE() OR es.status IN ('Scheduled', 'Published', 'In-Progress', 'Allocated'))

        """, (faculty_id,))

        active_count = cursor.fetchone()["count"]

        if active_count > 0:

            return jsonify({

                "error": f"Cannot delete faculty member '{fac['faculty_name']}': Currently assigned to {active_count} active upcoming examination session(s). Please reassign or unassign upcoming duties first."

            }), 409



        # 2. Count Historical Examination Records to be preserved

        cursor.execute("""

            SELECT (

                SELECT COUNT(DISTINCT ia.assignment_id)

                FROM invigilator_assignments ia

                JOIN exam_sessions es ON ia.exam_id = es.exam_id

                WHERE (ia.faculty_id = %s OR ia.original_faculty_id = %s)

                  AND (es.status = 'Completed' OR es.exam_date < CURRENT_DATE())

            ) + (

                SELECT COUNT(DISTINCT ih.history_id)

                FROM invigilator_history ih

                WHERE ih.original_faculty_id = %s OR ih.replacement_faculty_id = %s

            ) AS hist_count

        """, (faculty_id, faculty_id, faculty_id, faculty_id))

        hist_count = cursor.fetchone()["hist_count"]



        # Step A: Preserve historical identity in invigilator_assignments

        cursor.execute("""

            UPDATE invigilator_assignments

            SET

                faculty_name = COALESCE(faculty_name, %s),

                faculty_email = COALESCE(faculty_email, %s),

                designation = COALESCE(designation, %s),

                department = COALESCE(department, %s),

                original_faculty_id = COALESCE(original_faculty_id, %s)

            WHERE faculty_id = %s

        """, (fac["faculty_name"], fac["email"], fac["designation"], fac["department"] or 'CSE', faculty_id, faculty_id))



        # Step B: Preserve historical identity in invigilator_history

        cursor.execute("""

            UPDATE invigilator_history

            SET

                original_faculty_name = COALESCE(original_faculty_name, %s),

                original_faculty_email = COALESCE(original_faculty_email, %s),

                original_designation = COALESCE(original_designation, %s)

            WHERE original_faculty_id = %s

        """, (fac["faculty_name"], fac["email"], fac["designation"], faculty_id))



        cursor.execute("""

            UPDATE invigilator_history

            SET

                replacement_faculty_name = COALESCE(replacement_faculty_name, %s),

                replacement_faculty_email = COALESCE(replacement_faculty_email, %s),

                replacement_designation = COALESCE(replacement_designation, %s)

            WHERE replacement_faculty_id = %s

        """, (fac["faculty_name"], fac["email"], fac["designation"], faculty_id))



        # Step C: Safely unlink and deactivate any associated login account without deleting user credentials

        cursor.execute("""

            UPDATE users

            SET faculty_id = NULL, is_active = 0

            WHERE faculty_id = %s

        """, (faculty_id,))

        unlinked_users = cursor.rowcount



        # Step D: Delete auxiliary active mappings

        cursor.execute("DELETE FROM faculty_course_profiles WHERE faculty_id = %s", (faculty_id,))

        cursor.execute("DELETE FROM faculty_availability WHERE faculty_id = %s", (faculty_id,))

        cursor.execute("DELETE FROM faculty_subjects WHERE faculty_id = %s", (faculty_id,))



        # Step E: Permanently delete faculty master record

        cursor.execute("DELETE FROM faculty WHERE faculty_id = %s", (faculty_id,))



        # Step F: Audit log

        details_msg = f"Permanently deleted faculty member '{fac['faculty_name']}' (ID: {faculty_id}). "

        if hist_count > 0:

            details_msg += f"Preserved {hist_count} historical invigilation duty record(s). "

        if unlinked_users > 0:

            details_msg += f"Safely unlinked and deactivated {unlinked_users} login account(s)."



        try:

            cursor.execute("""

                INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                VALUES (%s, %s, %s, %s, %s)

            """, ("PERMANENT_DELETE", "faculty", str(faculty_id), details_msg, "admin"))

        except Exception:

            pass



        connection.commit()

        return jsonify({

            "success": True,

            "message": f"Faculty member '{fac['faculty_name']}' permanently deleted from the directory. {hist_count} historical examination duty record(s) have been preserved.",

            "faculty_id": faculty_id,

            "preserved_records_count": hist_count,

            "unlinked_users_count": unlinked_users

        }), 200



    except Exception as e:

        if connection and connection.is_connected():

            connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/faculty/deletion-check", methods=["POST"])

def check_faculty_deletion():

    data = request.get_json(silent=True) or {}

    faculty_ids = data.get("faculty_ids", [])

    if not faculty_ids:

        return jsonify({"error": "No faculty IDs specified."}), 400



    fids = [int(fid) for fid in faculty_ids if str(fid).isdigit()]

    if not fids:

        return jsonify({"error": "Invalid faculty IDs."}), 400



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        cur = conn.cursor(dictionary=True)

        placeholders = ",".join(["%s"] * len(fids))



        cur.execute(f"""

            SELECT f.faculty_id, f.faculty_name, f.department, f.email, f.designation, f.is_active,

                   -- Active Duties (upcoming or in-progress)

                   COALESCE((

                       SELECT COUNT(DISTINCT ia.assignment_id)

                       FROM invigilator_assignments ia

                       JOIN exam_sessions es ON ia.exam_id = es.exam_id

                       WHERE ia.faculty_id = f.faculty_id

                         AND (es.exam_date >= CURRENT_DATE() OR es.status IN ('Scheduled', 'Published', 'In-Progress', 'Allocated'))

                   ), 0) AS active_duty_count,

                   -- Historical Records (completed exams & duty modification audit logs)

                   COALESCE((

                       SELECT COUNT(DISTINCT ia.assignment_id)

                       FROM invigilator_assignments ia

                       JOIN exam_sessions es ON ia.exam_id = es.exam_id

                       WHERE (ia.faculty_id = f.faculty_id OR ia.original_faculty_id = f.faculty_id)

                         AND (es.status = 'Completed' OR es.exam_date < CURRENT_DATE())

                   ), 0) +

                   COALESCE((

                       SELECT COUNT(DISTINCT ih.history_id)

                       FROM invigilator_history ih

                       WHERE ih.original_faculty_id = f.faculty_id OR ih.replacement_faculty_id = f.faculty_id

                   ), 0) AS history_count,

                   -- Institutional Login Account

                   (SELECT u.user_id FROM users u WHERE u.faculty_id = f.faculty_id LIMIT 1) AS user_id,

                   (SELECT u.email FROM users u WHERE u.faculty_id = f.faculty_id LIMIT 1) AS user_email,

                   (SELECT u.role FROM users u WHERE u.faculty_id = f.faculty_id LIMIT 1) AS user_role,

                   -- Auxiliary info

                   (SELECT COUNT(*) FROM faculty_course_profiles fcp WHERE fcp.faculty_id = f.faculty_id) AS course_profile_count,

                   (SELECT COUNT(*) FROM faculty_subjects fs WHERE fs.faculty_id = f.faculty_id) AS subject_count

            FROM faculty f

            WHERE f.faculty_id IN ({placeholders})

            ORDER BY f.faculty_name

        """, tuple(fids))

        records = cur.fetchall()



        safe_clean_faculty = []

        eligible_history_faculty = []

        blocked_duty_faculty = []

        all_safe_to_delete = []



        total_preserved_history = 0

        total_unlinked_logins = 0



        for fac in records:

            fac["reasons"] = []



            if fac["active_duty_count"] > 0:

                fac["category"] = "blocked_duty"

                fac["category_label"] = "Protected by Active Duties"

                fac["blocking_reason"] = f"Assigned to {fac['active_duty_count']} upcoming/active examination duty session(s). Duties must be reassigned first."

                blocked_duty_faculty.append(fac)

            elif fac["history_count"] > 0:

                fac["category"] = "eligible_with_history"

                fac["category_label"] = "Historical Records Preserved"

                fac["blocking_reason"] = None

                fac["preserves_history"] = True

                total_preserved_history += fac["history_count"]

                if fac["user_id"]:

                    total_unlinked_logins += 1

                eligible_history_faculty.append(fac)

                all_safe_to_delete.append(fac)

            else:

                fac["category"] = "safe"

                fac["category_label"] = "Safe to Delete"

                fac["blocking_reason"] = None

                if fac["user_id"]:

                    total_unlinked_logins += 1

                safe_clean_faculty.append(fac)

                all_safe_to_delete.append(fac)



        can_safe_delete = len(blocked_duty_faculty) == 0

        blocking_reason = None

        if not can_safe_delete:

            blocking_reason = f"Active Duty Guard: {len(blocked_duty_faculty)} faculty member(s) have upcoming examination duty allocations and cannot be deleted until those sessions are completed or reassigned."



        return jsonify({

            "faculty_count": len(records),

            "total_selected": len(records),

            "safe_count": len(all_safe_to_delete),

            "safe_clean_count": len(safe_clean_faculty),

            "eligible_history_count": len(eligible_history_faculty),

            "historical_preserved_count": total_preserved_history,

            "login_unlinked_count": total_unlinked_logins,

            "blocked_duty_count": len(blocked_duty_faculty),

            "blocked_count": len(blocked_duty_faculty),

            "faculty_preview": records,

            "safe_faculty": all_safe_to_delete,

            "blocked_duty_faculty": blocked_duty_faculty,

            "blocked_faculty": blocked_duty_faculty,

            "can_safe_delete": can_safe_delete,

            "blocking_reason": blocking_reason,

            "allow_deactivation": True,

            "safe_faculty_ids": [fac["faculty_id"] for fac in all_safe_to_delete],

            "blocked_faculty_ids": [fac["faculty_id"] for fac in blocked_duty_faculty]

        }), 200

    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/faculty/bulk-delete", methods=["POST"])

def execute_faculty_bulk_delete():

    data = request.get_json(silent=True) or {}

    faculty_ids = data.get("faculty_ids", [])

    action = data.get("action", "delete")  # 'delete' or 'deactivate'

    delete_safe_only = bool(data.get("delete_safe_only", False) or data.get("force_safe_only", False))

    deleted_by = data.get("deleted_by", "admin")



    fids = [int(fid) for fid in faculty_ids if str(fid).isdigit()]

    if not fids:

        return jsonify({"error": "No valid faculty IDs provided."}), 400



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        conn.autocommit = False

        cur = conn.cursor(dictionary=True)

        placeholders = ",".join(["%s"] * len(fids))



        if action == "deactivate":

            cur.execute(f"UPDATE faculty SET is_active = 0 WHERE faculty_id IN ({placeholders})", tuple(fids))

            cur.execute(f"UPDATE users SET is_active = 0 WHERE faculty_id IN ({placeholders}) AND role NOT IN ('admin', 'exam_admin', 'super_admin')", tuple(fids))

            try:

                cur.execute("""

                    INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                    VALUES (%s, %s, %s, %s, %s)

                """, ("BULK_DEACTIVATE", "faculty", str(len(fids)), f"Bulk deactivated {len(fids)} faculty members (IDs: {fids})", deleted_by))

            except Exception:

                pass

            conn.commit()

            return jsonify({

                "success": True,

                "action": "deactivate",

                "deactivated_count": len(fids),

                "message": f"Successfully deactivated {len(fids)} faculty member(s). Their historical duty records, attendance sheets, and staff credentials are preserved."

            }), 200



        # Action is 'delete'

        # Inspect for active upcoming duties

        cur.execute(f"""

            SELECT f.faculty_id, f.faculty_name, f.department, f.designation, f.email,

                   COALESCE((

                       SELECT COUNT(DISTINCT ia.assignment_id)

                       FROM invigilator_assignments ia

                       JOIN exam_sessions es ON ia.exam_id = es.exam_id

                       WHERE ia.faculty_id = f.faculty_id

                         AND (es.exam_date >= CURRENT_DATE() OR es.status IN ('Scheduled', 'Published', 'In-Progress', 'Allocated'))

                   ), 0) AS active_duty_count,

                   COALESCE((

                       SELECT COUNT(DISTINCT ia.assignment_id)

                       FROM invigilator_assignments ia

                       JOIN exam_sessions es ON ia.exam_id = es.exam_id

                       WHERE (ia.faculty_id = f.faculty_id OR ia.original_faculty_id = f.faculty_id)

                         AND (es.status = 'Completed' OR es.exam_date < CURRENT_DATE())

                   ), 0) +

                   COALESCE((

                       SELECT COUNT(DISTINCT ih.history_id)

                       FROM invigilator_history ih

                       WHERE ih.original_faculty_id = f.faculty_id OR ih.replacement_faculty_id = f.faculty_id

                   ), 0) AS history_count

            FROM faculty f

            WHERE f.faculty_id IN ({placeholders})

        """, tuple(fids))

        deps = cur.fetchall()



        safe_ids = []

        blocked_records = []

        total_history_preserved = 0



        for d in deps:

            if d["active_duty_count"] > 0:

                blocked_records.append({

                    "faculty_id": d["faculty_id"],

                    "faculty_name": d["faculty_name"],

                    "reason": f"Assigned to {d['active_duty_count']} upcoming/active examination duty session(s)"

                })

            else:

                safe_ids.append(d["faculty_id"])

                total_history_preserved += d["history_count"]



        if blocked_records and not delete_safe_only:

            conn.rollback()

            return jsonify({

                "error": f"Cannot permanently delete selected faculty: {len(blocked_records)} faculty member(s) have upcoming examination duty allocations. Please reassign those duties first or choose 'Delete Safe Records Only'.",

                "blocked_count": len(blocked_records),

                "safe_count": len(safe_ids),

                "failed_records": blocked_records

            }), 400



        target_ids = safe_ids if delete_safe_only else fids

        if not target_ids:

            conn.rollback()

            return jsonify({

                "error": "No faculty members in the selection are safe for permanent deletion (all have active upcoming duties).",

                "blocked_count": len(blocked_records),

                "failed_records": blocked_records

            }), 400



        target_placeholders = ",".join(["%s"] * len(target_ids))



        # 1. Preserve historical identity snapshot in invigilator_assignments

        cur.execute(f"""

            UPDATE invigilator_assignments ia

            JOIN faculty f ON ia.faculty_id = f.faculty_id

            SET

                ia.faculty_name = COALESCE(ia.faculty_name, f.faculty_name),

                ia.faculty_email = COALESCE(ia.faculty_email, f.email),

                ia.designation = COALESCE(ia.designation, f.designation),

                ia.department = COALESCE(ia.department, f.department, 'CSE'),

                ia.original_faculty_id = COALESCE(ia.original_faculty_id, f.faculty_id)

            WHERE f.faculty_id IN ({target_placeholders})

        """, tuple(target_ids))



        # 2. Preserve historical identity snapshot in invigilator_history

        cur.execute(f"""

            UPDATE invigilator_history ih

            JOIN faculty f ON ih.original_faculty_id = f.faculty_id

            SET

                ih.original_faculty_name = COALESCE(ih.original_faculty_name, f.faculty_name),

                ih.original_faculty_email = COALESCE(ih.original_faculty_email, f.email),

                ih.original_designation = COALESCE(ih.original_designation, f.designation)

            WHERE f.faculty_id IN ({target_placeholders})

        """, tuple(target_ids))



        cur.execute(f"""

            UPDATE invigilator_history ih

            JOIN faculty f ON ih.replacement_faculty_id = f.faculty_id

            SET

                ih.replacement_faculty_name = COALESCE(ih.replacement_faculty_name, f.faculty_name),

                ih.replacement_faculty_email = COALESCE(ih.replacement_faculty_email, f.email),

                ih.replacement_designation = COALESCE(ih.replacement_designation, f.designation)

            WHERE f.faculty_id IN ({target_placeholders})

        """, tuple(target_ids))



        # 3. Safely unlink and deactivate linked login accounts in users table

        cur.execute(f"""

            UPDATE users

            SET faculty_id = NULL, is_active = 0

            WHERE faculty_id IN ({target_placeholders})

        """, tuple(target_ids))

        unlinked_users = cur.rowcount



        # 4. Delete dependent active auxiliary records in proper foreign key order

        cur.execute(f"DELETE FROM faculty_course_profiles WHERE faculty_id IN ({target_placeholders})", tuple(target_ids))

        cur.execute(f"DELETE FROM faculty_availability WHERE faculty_id IN ({target_placeholders})", tuple(target_ids))

        cur.execute(f"DELETE FROM faculty_subjects WHERE faculty_id IN ({target_placeholders})", tuple(target_ids))



        # 5. Permanently delete the faculty master records

        cur.execute(f"DELETE FROM faculty WHERE faculty_id IN ({target_placeholders})", tuple(target_ids))

        deleted_count = cur.rowcount



        try:

            cur.execute("""

                INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                VALUES (%s, %s, %s, %s, %s)

            """, (

                "PERMANENT_DELETE",

                "faculty",

                str(deleted_count),

                f"Permanently deleted {deleted_count} faculty records (IDs: {target_ids}) with {total_history_preserved} historical records preserved and {unlinked_users} login accounts safely unlinked",

                deleted_by

            ))

        except Exception:

            pass



        conn.commit()



        results = [{"faculty_id": fid, "status": "deleted"} for fid in target_ids]

        return jsonify({

            "success": True,

            "action": "delete",

            "deleted_count": deleted_count,

            "preserved_history_count": total_history_preserved,

            "unlinked_logins_count": unlinked_users,

            "results": results,

            "message": f"Successfully permanently deleted {deleted_count} faculty member(s). Preserved {total_history_preserved} historical examination duty records and safely unlinked {unlinked_users} login account(s)."

        }), 200



    except Exception as e:

        if conn: conn.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/faculty/bulk-status", methods=["POST"])

def bulk_update_faculty_status():

    """

    Bulk activate or deactivate faculty members.

    Activation (is_active = 1):

      - Restores faculty eligibility for invigilator duty assignment.

      - Reactivates linked users in users table.

    Deactivation (is_active = 0):

      - Excludes faculty from future automatic assignments, manual allocations, and reassignments.

      - Safely preserves login credentials and historical examination duty records.

      - Deactivates non-administrative linked user accounts.

    """

    from auth_routes import get_authenticated_user

    admin_user = get_authenticated_user()

    if not admin_user or admin_user.get("role") not in ("exam_admin", "admin"):

        return jsonify({"error": "Admin privileges required"}), 403



    data = request.get_json(silent=True) or {}

    faculty_ids = data.get("faculty_ids") or []

    action = str(data.get("action") or "").lower().strip()

    status_raw = data.get("status")



    if not isinstance(faculty_ids, list) or len(faculty_ids) == 0:

        return jsonify({"error": "faculty_ids list must be provided and not empty"}), 400



    if action == "activate" or status_raw in (1, "1", True):

        target_status = 1

        action_verb = "activated"

        audit_action = "BULK_ACTIVATE"

    elif action == "deactivate" or status_raw in (0, "0", False):

        target_status = 0

        action_verb = "deactivated"

        audit_action = "BULK_DEACTIVATE"

    else:

        return jsonify({"error": "Invalid action. Must be 'activate' or 'deactivate'"}), 400



    clean_ids = []

    for fid in faculty_ids:

        try:

            clean_ids.append(int(fid))

        except (ValueError, TypeError):

            continue



    if not clean_ids:

        return jsonify({"error": "No valid faculty IDs provided"}), 400



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        conn.autocommit = False

        cur = conn.cursor(dictionary=True)



        placeholders = ",".join(["%s"] * len(clean_ids))



        # 1. Update faculty table

        cur.execute(

            f"UPDATE faculty SET is_active = %s WHERE faculty_id IN ({placeholders})",

            (target_status, *clean_ids)

        )

        updated_faculty_count = cur.rowcount



        # 2. Update linked accounts in users table

        if target_status == 1:

            cur.execute(

                f"UPDATE users SET is_active = 1 WHERE faculty_id IN ({placeholders})",

                tuple(clean_ids)

            )

        else:

            cur.execute(

                f"""

                UPDATE users 

                SET is_active = 0 

                WHERE faculty_id IN ({placeholders}) 

                  AND role NOT IN ('admin', 'exam_admin', 'super_admin')

                """,

                tuple(clean_ids)

            )



        # 3. Audit log

        admin_email = admin_user.get("email") or "admin"

        try:

            cur.execute("""

                INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                VALUES (%s, %s, %s, %s, %s)

            """, (

                audit_action, 

                "faculty", 

                str(updated_faculty_count), 

                f"Bulk {action_verb} {len(clean_ids)} faculty member(s) (IDs: {clean_ids})", 

                admin_email

            ))

        except Exception:

            pass



        conn.commit()



        return jsonify({

            "success": True,

            "action": "activate" if target_status == 1 else "deactivate",

            "target_status": target_status,

            "updated_count": len(clean_ids),

            "faculty_ids": clean_ids,

            "message": f"Successfully {action_verb} {len(clean_ids)} faculty member(s)."

        }), 200



    except Exception as e:

        if conn: conn.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/faculty/upload-preview", methods=["POST"])

def preview_faculty_upload():

    """

    Analyzes an uploaded faculty Excel / CSV file without saving changes to DB.

    Automatically matches:

      - Faculty by: 1) Faculty ID, 2) Normalized institutional email, 3) Faculty name

      - Subjects by: 1) Subject Code, 2) Subject Name, 3) Aliases, 4) Token overlap

    Returns matched allocations, unmatched courses for review, and summary statistics.

    """

    file = request.files.get("file")

    if not file:

        return jsonify({"error": "No file uploaded"}), 400



    filename = file.filename or ""

    if not (filename.lower().endswith(".csv") or filename.lower().endswith(".xlsx") or filename.lower().endswith(".xls")):

        return jsonify({"error": "Supported formats: CSV, Excel (.xlsx, .xls)"}), 400



    academic_year = (request.form.get("academic_year") or "2026-2027").strip()

    raw_sem = request.form.get("semester")

    semester = raw_sem.strip() if (raw_sem and raw_sem.strip() and raw_sem.strip().lower() not in ("none", "null", "", "undefined")) else None



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        cur = conn.cursor(dictionary=True)



        cur.execute("SELECT subject_id, subject_code, subject_name, semester, study_year FROM subjects WHERE is_active = 1 OR is_active IS NULL")

        subjects_catalogue = cur.fetchall()



        cur.execute("SELECT faculty_id, faculty_name, designation, department, email, is_active FROM faculty")

        existing_faculty = cur.fetchall()



        result = parse_faculty_subject_file(

            file, filename,

            subjects_catalogue=subjects_catalogue,

            existing_faculty=existing_faculty,

            default_ay=academic_year,

            default_sem=semester

        )



        return jsonify({

            "success": True,

            "filename": filename,

            **result

        }), 200



    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/faculty/bulk-import-mappings", methods=["POST"])

def bulk_import_faculty_mappings():

    """

    Imports or replaces faculty records and saves verified teaching allocations.

    Accepts:

      - faculty_records: [{ faculty_name, designation, department, email, raw_faculty_id, ... }]

      - auto_matched: [{ faculty_name, email, subject_id, academic_year, semester, study_year, course_name, ... }]

      - reviewed_mappings: [{ faculty_name, email, subject_id, academic_year, semester, study_year, ... }]

      - replace_existing: bool

      - academic_year: str

      - semester: str

    """

    data = request.get_json(silent=True) or {}

    faculty_records = data.get("faculty_records") or []

    auto_matched = data.get("auto_matched") or []

    reviewed_mappings = data.get("reviewed_mappings") or []

    replace_existing = bool(data.get("replace_existing", False))

    academic_year = (data.get("academic_year") or "2026-2027").strip()

    semester = (data.get("semester") or "Semester 5").strip()



    if not faculty_records and not auto_matched and not reviewed_mappings:

        return jsonify({"error": "No faculty or mapping records provided for import"}), 400



    conn = None

    cur = None

    user_email = "admin"

    try:

        conn = get_db_connection()

        conn.autocommit = False

        cur = conn.cursor(dictionary=True)



        purged_count = 0

        archived_count = 0



        # If REPLACE MODE: Purge safe records and archive protected records

        if replace_existing:

            cur.execute("""

                SELECT f.faculty_id, f.faculty_name, f.email, f.department, f.designation,

                       COALESCE((

                           SELECT COUNT(DISTINCT ia.assignment_id)

                           FROM invigilator_assignments ia

                           JOIN exam_sessions es ON ia.exam_id = es.exam_id

                           WHERE ia.faculty_id = f.faculty_id

                             AND (es.exam_date >= CURRENT_DATE() OR es.status IN ('Scheduled', 'Published', 'In-Progress', 'Allocated'))

                       ), 0) AS active_duty_count,

                       COALESCE((

                           SELECT COUNT(DISTINCT ia.assignment_id)

                           FROM invigilator_assignments ia

                           JOIN exam_sessions es ON ia.exam_id = es.exam_id

                           WHERE ia.faculty_id = f.faculty_id

                             AND (es.status = 'Completed' OR es.exam_date < CURRENT_DATE())

                       ), 0) +

                       COALESCE((

                           SELECT COUNT(DISTINCT ih.history_id)

                           FROM invigilator_history ih

                           WHERE ih.original_faculty_id = f.faculty_id OR ih.replacement_faculty_id = f.faculty_id

                       ), 0) AS history_count,

                       (SELECT u.user_id FROM users u WHERE u.faculty_id = f.faculty_id LIMIT 1) AS user_id

                FROM faculty f

            """)

            all_existing = cur.fetchall()

            safe_purge_ids = []

            protected_archive_ids = []

            for ef in all_existing:

                if ef["active_duty_count"] > 0 or ef["history_count"] > 0 or ef["user_id"]:

                    protected_archive_ids.append(ef["faculty_id"])

                else:

                    safe_purge_ids.append(ef["faculty_id"])



            if safe_purge_ids:

                p_safe = ",".join(["%s"] * len(safe_purge_ids))

                cur.execute(f"DELETE FROM faculty_course_profiles WHERE faculty_id IN ({p_safe})", tuple(safe_purge_ids))

                cur.execute(f"DELETE FROM faculty_availability WHERE faculty_id IN ({p_safe})", tuple(safe_purge_ids))

                cur.execute(f"DELETE FROM faculty_subjects WHERE faculty_id IN ({p_safe})", tuple(safe_purge_ids))

                cur.execute(f"DELETE FROM faculty WHERE faculty_id IN ({p_safe})", tuple(safe_purge_ids))

                purged_count = len(safe_purge_ids)



            if protected_archive_ids:

                p_prot = ",".join(["%s"] * len(protected_archive_ids))

                cur.execute(f"UPDATE faculty SET is_active = 0 WHERE faculty_id IN ({p_prot})", tuple(protected_archive_ids))

                cur.execute(f"DELETE FROM faculty_course_profiles WHERE faculty_id IN ({p_prot}) AND is_confirmed = 0", tuple(protected_archive_ids))

                cur.execute(f"DELETE FROM faculty_subjects WHERE faculty_id IN ({p_prot})", tuple(protected_archive_ids))

                archived_count = len(protected_archive_ids)



        cur.execute("SELECT faculty_id, faculty_name, designation, department, email, is_active FROM faculty")

        existing_faculty = cur.fetchall()



        id_to_fac = {str(ef["faculty_id"]): ef for ef in existing_faculty}

        email_to_fac = {}

        name_to_fac = {}

        for ef in existing_faculty:

            name_to_fac[ef["faculty_name"].strip().lower()] = ef

            if ef.get("email"):

                for em in re.findall(r'[\w\.-]+@[\w\.-]+', ef["email"].lower()):

                    email_to_fac[em] = ef



        matched_existing = 0

        newly_added = 0

        faculty_id_map = {}



        for f in faculty_records:

            name = (f.get("faculty_name") or "").strip()

            if not name:

                continue

            desig = (f.get("designation") or "").strip()

            dept = (f.get("department") or "CSE").strip() or "CSE"

            primary_email = f.get("email")

            raw_fid = f.get("raw_faculty_id")



            # Matching priority: 1) ID, 2) Email, 3) Name

            matched_ef = None

            if raw_fid and str(raw_fid) in id_to_fac:

                matched_ef = id_to_fac[str(raw_fid)]

            if not matched_ef and primary_email and primary_email in email_to_fac:

                matched_ef = email_to_fac[primary_email]

            if not matched_ef:

                matched_ef = name_to_fac.get(name.lower())



            if matched_ef:

                resolved_id = matched_ef["faculty_id"]

                matched_existing += 1

                cur.execute("""

                    UPDATE faculty

                    SET faculty_name = %s,

                        designation = COALESCE(NULLIF(%s, ''), designation),

                        department = COALESCE(NULLIF(%s, ''), department),

                        email = COALESCE(NULLIF(%s, ''), email),

                        is_active = 1

                    WHERE faculty_id = %s

                """, (name, desig, dept, primary_email or matched_ef.get("email"), resolved_id))

                cur.execute("UPDATE users SET is_active = 1 WHERE faculty_id = %s", (resolved_id,))

            else:

                cur.execute("""

                    INSERT INTO faculty (faculty_name, designation, department, email, is_active)

                    VALUES (%s, %s, %s, %s, 1)

                """, (name, desig, dept, primary_email))

                resolved_id = cur.lastrowid

                newly_added += 1

                new_entry = {"faculty_id": resolved_id, "faculty_name": name, "email": primary_email, "designation": desig, "department": dept, "is_active": 1}

                name_to_fac[name.lower()] = new_entry

                if primary_email: email_to_fac[primary_email] = new_entry

                id_to_fac[str(resolved_id)] = new_entry



            faculty_key = primary_email or name.lower()

            faculty_id_map[faculty_key] = resolved_id

            if primary_email:

                faculty_id_map[primary_email.lower()] = resolved_id

            faculty_id_map[name.lower()] = resolved_id

            faculty_id_map[str(resolved_id)] = resolved_id

            if raw_fid:

                faculty_id_map[str(raw_fid).strip()] = resolved_id



        # Insert teaching allocations

        allocations_to_save = list(auto_matched) + list(reviewed_mappings)

        saved_mappings_count = 0

        seen_saved_mappings = set()



        def get_sy(sem_val, subj_sy=None):

            if subj_sy is not None:

                try:

                    return int(subj_sy)

                except Exception:

                    pass

            digits = ''.join(c for c in str(sem_val) if c.isdigit())

            num = int(digits) if digits else 5

            return 1 if num in [1, 2] else (2 if num in [3, 4] else (3 if num in [5, 6] else 4))



        for alloc in allocations_to_save:

            s_id = alloc.get("subject_id")

            if not s_id:

                continue

            try:

                s_id = int(s_id)

            except Exception:

                continue



            cur.execute("SELECT subject_id, study_year, semester FROM subjects WHERE subject_id = %s", (s_id,))

            valid_subj = cur.fetchone()

            if not valid_subj:

                continue



            f_id = alloc.get("faculty_id")

            if not f_id or str(f_id) not in id_to_fac:

                f_key = alloc.get("email") or (alloc.get("faculty_name") or "").lower()

                f_id = faculty_id_map.get(f_key)

                if not f_id and alloc.get("raw_faculty_id"):

                    f_id = faculty_id_map.get(str(alloc.get("raw_faculty_id")).strip())

                if not f_id and alloc.get("faculty_name"):

                    f_id = faculty_id_map.get(alloc["faculty_name"].strip().lower())



            if not f_id:

                continue



            ay = (alloc.get("academic_year") or academic_year).strip()

            sem = (alloc.get("semester") or semester).strip()

            sy = get_sy(sem, alloc.get("study_year") or valid_subj.get("study_year"))



            assign_key = (f_id, s_id, ay, sem)

            is_new_mapping = assign_key not in seen_saved_mappings

            if is_new_mapping:

                seen_saved_mappings.add(assign_key)



            cur.execute("""

                SELECT id FROM faculty_subjects

                WHERE faculty_id = %s AND subject_id = %s

            """, (f_id, s_id))

            existing_asg = cur.fetchone()



            if not existing_asg:

                cur.execute("""

                    INSERT INTO faculty_subjects (faculty_id, subject_id, academic_year, study_year, semester, is_verified)

                    VALUES (%s, %s, %s, %s, %s, 1)

                    ON DUPLICATE KEY UPDATE academic_year = VALUES(academic_year), study_year = VALUES(study_year), semester = VALUES(semester), is_verified = 1

                """, (f_id, s_id, ay, sy, sem))

                if is_new_mapping:

                    saved_mappings_count += 1

            else:

                cur.execute("""

                    UPDATE faculty_subjects 

                    SET academic_year = %s, study_year = %s, semester = %s, is_verified = 1 

                    WHERE id = %s

                """, (ay, sy, sem, existing_asg["id"]))

                if is_new_mapping:

                    saved_mappings_count += 1



            c_name = alloc.get("course_name") or alloc.get("subject_name") or "Teaching Allocation"

            c_class = alloc.get("classification") or "UG Profile Courses"

            if c_class not in ("UG Profile Courses", "Teaching Level Unspecified"):

                c_class = "UG Profile Courses"

            conf = alloc.get("match_confidence") or "exact"

            cur.execute("""

                INSERT INTO faculty_course_profiles (

                    faculty_id, course_name, classification, suggested_subject_id, match_confidence, is_confirmed, academic_year, semester

                ) VALUES (%s, %s, %s, %s, %s, 1, %s, %s)

                ON DUPLICATE KEY UPDATE is_confirmed = 1, suggested_subject_id = %s

            """, (f_id, c_name, c_class, s_id, conf, ay, sem, s_id))



        action_name = "FACULTY_DIRECTORY_REPLACE" if replace_existing else "FACULTY_IMPORT"

        details_str = (

            f"Imported {len(faculty_records)} unique faculty records ({newly_added} new, {matched_existing} updated/reactivated). "

            f"Created {saved_mappings_count} verified teaching assignments for {academic_year} ({semester}). "

            f"{f'Purged {purged_count} records, archived {archived_count} records.' if replace_existing else ''}"

        )

        cur.execute("""

            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

            VALUES (%s, %s, %s, %s, %s)

        """, (action_name, "faculty", None, details_str, user_email))



        conn.commit()



        return jsonify({

            "success": True,

            "replace_mode": replace_existing,

            "imported_faculty_count": len(faculty_records),

            "unique_faculty_count": len(faculty_records),

            "newly_added": newly_added,

            "matched_existing": matched_existing,

            "purged_count": purged_count,

            "archived_count": archived_count,

            "saved_mappings_count": saved_mappings_count,

            "teaching_mappings_count": saved_mappings_count,

            "message": (

                f"Successfully imported {len(faculty_records)} unique faculty records ({newly_added} new, {matched_existing} linked) "

                f"and created {saved_mappings_count} teaching assignments."

            )

        }), 200



    except Exception as e:

        if conn: conn.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()







@admin_bp.route("/faculty/upload-directory", methods=["POST"])

def upload_faculty_directory():

    """

    Upload 1: Master Faculty Directory Import.

    Imports master faculty records into the Faculty Directory.

    Deduplicates: each faculty member exists only once.

    Matches existing records using Faculty ID, then normalized email, then validated name.

    Preserves existing faculty IDs, institutional login accounts, and historical exam records.

    Never duplicates faculty.

    """

    file = request.files.get("file")

    if not file:

        return jsonify({"error": "No file uploaded"}), 400



    filename = file.filename or ""

    if not (filename.lower().endswith(".csv") or filename.lower().endswith(".xlsx") or filename.lower().endswith(".xls")):

        return jsonify({"error": "Supported formats: CSV, Excel (.xlsx, .xls)"}), 400



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        connection.autocommit = False

        cursor = connection.cursor(dictionary=True)



        parsed_records = parse_faculty_directory_file(file, filename)

        if not parsed_records:

            return jsonify({"error": "No valid faculty records found in file. Please verify columns: Faculty Name, Designation, Department, Email."}), 400



        # Fetch existing faculty

        cursor.execute("SELECT faculty_id, faculty_name, designation, department, email, is_active FROM faculty")

        existing_faculty = cursor.fetchall()



        inserted_count = 0

        matched_count = 0

        matched_faculty_list = []

        newly_added_list = []



        for rec in parsed_records:

            raw_name = rec["faculty_name"]

            raw_desig = rec.get("designation") or "Faculty"

            raw_dept = rec.get("department") or "CSE"

            raw_email = rec.get("email")

            raw_id = rec.get("raw_faculty_id")



            # Determine matched existing record and exact match method

            matched = None

            match_method = None



            # 1. Match by Faculty ID if provided

            if raw_id is not None and str(raw_id).strip():

                q_id_str = str(raw_id).strip()

                for ef in existing_faculty:

                    if str(ef.get("faculty_id", "")).strip() == q_id_str:

                        matched = ef

                        match_method = "Faculty ID"

                        break



            # 2. Match by Institutional Email if provided

            if not matched and raw_email:

                q_em = str(raw_email).strip().lower()

                if q_em and "@" in q_em:

                    for ef in existing_faculty:

                        if ef.get("email") and q_em in str(ef.get("email", "")).lower():

                            matched = ef

                            match_method = "Email"

                            break



            # 3. Match by Name & Verified Aliases

            if not matched:

                matched = match_faculty_record(raw_name, raw_email, raw_id, existing_faculty)

                if matched:

                    match_method = "Name"



            if matched:

                fid = matched["faculty_id"]

                updates = []

                u_params = []



                if (not matched.get("email") or matched["email"] == "") and raw_email:

                    updates.append("email = %s")

                    u_params.append(raw_email)

                    matched["email"] = raw_email



                if (not matched.get("designation") or matched["designation"] in ("Faculty", "")) and raw_desig != "Faculty":

                    updates.append("designation = %s")

                    u_params.append(raw_desig)

                    matched["designation"] = raw_desig



                if matched.get("is_active") == 0:

                    updates.append("is_active = 1")

                    matched["is_active"] = 1



                if updates:

                    u_params.append(fid)

                    cursor.execute(f"UPDATE faculty SET {', '.join(updates)} WHERE faculty_id = %s", tuple(u_params))

                    action_label = "Existing record updated"

                else:

                    action_label = "Existing record unchanged"



                matched_count += 1

                matched_faculty_list.append({

                    "faculty_id": fid,

                    "faculty_name": matched.get("faculty_name") or raw_name,

                    "designation": matched.get("designation") or raw_desig,

                    "department": matched.get("department") or raw_dept,

                    "email": matched.get("email") or raw_email or "—",

                    "match_method": match_method or "Name",

                    "import_action": action_label

                })

            else:

                cursor.execute("""

                    INSERT INTO faculty (faculty_name, designation, department, email, is_active)

                    VALUES (%s, %s, %s, %s, 1)

                """, (raw_name, raw_desig, raw_dept, raw_email))

                new_fid = cursor.lastrowid

                new_fac = {

                    "faculty_id": new_fid,

                    "faculty_name": raw_name,

                    "designation": raw_desig,

                    "department": raw_dept,

                    "email": raw_email,

                    "is_active": 1

                }

                existing_faculty.append(new_fac)

                inserted_count += 1

                newly_added_list.append({

                    "faculty_id": new_fid,

                    "faculty_name": raw_name,

                    "designation": raw_desig,

                    "department": raw_dept,

                    "email": raw_email or "—",

                    "match_method": "N/A (New Record)",

                    "import_action": "New record created"

                })



        connection.commit()



        cursor.execute("SELECT COUNT(*) AS total_active FROM faculty WHERE is_active = 1")

        total_active_row = cursor.fetchone()

        imported_total = total_active_row["total_active"] if total_active_row else len(existing_faculty)



        user_email = "admin"

        try:

            cursor.execute('''

                INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                VALUES (%s, %s, %s, %s, %s)

            ''', (

                "FACULTY_DIRECTORY_IMPORT",

                "faculty",

                str(inserted_count),

                f"Imported faculty directory '{filename}': {len(parsed_records)} records, {inserted_count} new, {matched_count} matched/preserved.",

                user_email

            ))

        except Exception:

            pass

        connection.commit()



        return jsonify({

            "success": True,

            "filename": filename,

            "total_records": len(parsed_records),

            "inserted_new": inserted_count,

            "newly_added": inserted_count,

            "matched_existing": matched_count,

            "imported_total": imported_total,

            "matched_faculty": matched_faculty_list,

            "newly_added_faculty": newly_added_list,

            "message": f"Faculty Directory imported successfully: {len(parsed_records)} records processed ({inserted_count} new faculty added, {matched_count} existing faculty verified/updated)."

        }), 200



    except Exception as e:

        if connection:

            connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()





@admin_bp.route("/faculty/upload-semester-teaching", methods=["POST"])

def upload_semester_teaching():

    """

    Upload 2: Semester-Wise Teaching Assignments Import.

    Admin selects Academic Year.

    Study Year is automatically derived from Semester.

    Matches faculty against Faculty Directory (reuses existing faculty_id; never duplicates).

    Matches subjects against Subject Catalogue.

    Saves teaching assignments to faculty_subjects automatically.

    Uploading Semester 4 never deletes Semester 3 assignments.

    Re-uploading the same file skips duplicates.

    Returns concise summary and exception list.

    """

    file = request.files.get("file")

    if not file:

        return jsonify({"error": "No file uploaded"}), 400



    filename = file.filename or ""

    if not (filename.lower().endswith(".csv") or filename.lower().endswith(".xlsx") or filename.lower().endswith(".xls")):

        return jsonify({"error": "Supported formats: CSV, Excel (.xlsx, .xls)"}), 400



    academic_year = (request.form.get("academic_year") or "2026-2027").strip()

    raw_sem = request.form.get("semester")

    semester = raw_sem.strip() if (raw_sem and raw_sem.strip() and raw_sem.strip().lower() not in ("none", "null", "", "undefined")) else None



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        connection.autocommit = False

        cursor = connection.cursor(dictionary=True)



        cursor.execute("SELECT subject_id, subject_code, subject_name, semester, study_year FROM subjects WHERE is_active = 1 OR is_active IS NULL")

        subjects_catalogue = cursor.fetchall()



        cursor.execute("SELECT faculty_id, faculty_name, designation, department, email, is_active FROM faculty")

        existing_faculty = cursor.fetchall()



        if not existing_faculty:

            return jsonify({

                "error": "The Faculty Directory is currently empty. Please import the Master Faculty Directory first before importing semester teaching assignments."

            }), 400



        parsed = parse_semester_teaching_file(

            file, filename,

            default_ay=academic_year,

            default_sem=semester,

            existing_faculty=existing_faculty,

            subjects_catalogue=subjects_catalogue

        )



        valid_mappings = parsed["valid_mappings"]

        unmatched_faculty = parsed["unmatched_faculty"]

        unmatched_subjects = parsed["unmatched_subjects"]

        invalid_rows = parsed["invalid_rows"]



        target_sem = parsed["semester"]

        target_sy = parsed["study_year"]

        target_ay = parsed["academic_year"]



        successfully_mapped = 0

        duplicates_skipped = 0



        for m in valid_mappings:
            fid = m["faculty_id"]
            sid = m["subject_id"]
            ay = m["academic_year"]
            sy = m["study_year"]
            sem = m["semester"]
            sec = (m.get("section") or "").strip() or None

            # 1. Exact match with same faculty_id (already mapped correctly)
            if sec:
                cursor.execute("""
                    SELECT id FROM faculty_subjects
                    WHERE faculty_id = %s AND subject_id = %s
                      AND academic_year = %s AND semester = %s AND section = %s
                """, (fid, sid, ay, sem, sec))
            else:
                cursor.execute("""
                    SELECT id FROM faculty_subjects
                    WHERE faculty_id = %s AND subject_id = %s
                      AND academic_year = %s AND semester = %s AND (section IS NULL OR section = '')
                """, (fid, sid, ay, sem))

            existing_exact = cursor.fetchone()
            if existing_exact:
                duplicates_skipped += 1
                continue

            # 2. Check for stale mapping for the same subject & section with a DIFFERENT faculty member
            if sec:
                cursor.execute("""
                    SELECT id, faculty_id FROM faculty_subjects
                    WHERE subject_id = %s AND academic_year = %s AND semester = %s AND section = %s
                """, (sid, ay, sem, sec))
            else:
                cursor.execute("""
                    SELECT id, faculty_id FROM faculty_subjects
                    WHERE subject_id = %s AND academic_year = %s AND semester = %s AND (section IS NULL OR section = '')
                """, (sid, ay, sem))

            stale_rows = cursor.fetchall()
            if stale_rows:
                # Update the first stale mapping to point to the correct faculty_id!
                first_stale_id = stale_rows[0]["id"]
                cursor.execute("""
                    UPDATE faculty_subjects
                    SET faculty_id = %s, study_year = %s, is_verified = 1, updated_at = NOW()
                    WHERE id = %s
                """, (fid, sy, first_stale_id))
                successfully_mapped += 1

                # If there are redundant duplicate rows for the same subject and section, clean them up
                for extra in stale_rows[1:]:
                    cursor.execute("DELETE FROM faculty_subjects WHERE id = %s", (extra["id"],))
            else:
                # 3. New mapping: insert fresh row
                cursor.execute("""
                    INSERT INTO faculty_subjects (
                        faculty_id, subject_id, academic_year, study_year, semester, section, is_verified
                    ) VALUES (%s, %s, %s, %s, %s, %s, 1)
                """, (fid, sid, ay, sy, sem, sec))
                successfully_mapped += 1

        connection.commit()



        exception_list = []

        for uf in unmatched_faculty:

            exception_list.append({

                "row": uf.get("row", ""),

                "type": "Unmatched Faculty",

                "item": uf.get("faculty_name", ""),

                "course_code": uf.get("subject_code", ""),

                "section": uf.get("section", ""),

                "reason": uf.get("reason", "Faculty not found in Directory")

            })

        for us in unmatched_subjects:

            exception_list.append({

                "row": us.get("row", ""),

                "type": "Unmatched Subject",

                "item": us.get("subject_code") or us.get("subject_name", ""),

                "course_code": us.get("subject_code", ""),

                "section": us.get("section", ""),

                "reason": us.get("reason", "Subject not found in Subject Catalogue")

            })

        for inv in invalid_rows:

            exception_list.append({

                "row": inv.get("row", ""),

                "type": "Invalid Row",

                "item": inv.get("faculty_name", ""),

                "course_code": "",

                "section": "",

                "reason": inv.get("reason", "Incomplete row data")

            })



        user_email = "admin"

        try:

            cursor.execute('''

                INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                VALUES (%s, %s, %s, %s, %s)

            ''', (

                "SEMESTER_TEACHING_IMPORT",

                "faculty_subjects",

                str(successfully_mapped),

                f"Imported semester teaching assignments from '{filename}': AY {target_ay}, Sem {target_sem}, Year {target_sy}, {successfully_mapped} mapped, {duplicates_skipped} duplicates skipped, {len(unmatched_faculty)} unmatched faculty.",

                user_email

            ))

        except Exception:

            pass

        connection.commit()



        msg = f"{target_sem} ({target_ay}) Teaching Assignments processed: {successfully_mapped} mapped, {duplicates_skipped} duplicates skipped."

        if unmatched_faculty or unmatched_subjects:

            msg += f" {len(unmatched_faculty)} unmatched faculty and {len(unmatched_subjects)} unmatched subjects flagged for review."



        return jsonify({

            "success": True,

            "filename": filename,

            "academic_year": target_ay,

            "semester": target_sem,

            "study_year": target_sy,

            "successfully_mapped": successfully_mapped,

            "saved_mappings_count": successfully_mapped,

            "duplicates_skipped": duplicates_skipped,

            "duplicate_mappings_skipped": duplicates_skipped,

            "unmatched_faculty": unmatched_faculty,

            "unmatched_subjects": unmatched_subjects,

            "invalid_rows": invalid_rows,

            "exception_list": exception_list,

            "total_exceptions": len(exception_list),

            "message": msg

        }), 200



    except Exception as e:

        if connection:

            connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()





@admin_bp.route("/faculty/upload", methods=["POST"])

def upload_faculty():

    file = request.files.get("file")

    if not file:

        return jsonify({"error": "No file uploaded"}), 400



    filename = file.filename or ""

    if not (filename.lower().endswith(".csv") or filename.lower().endswith(".xlsx") or filename.lower().endswith(".xls")):

        return jsonify({"error": "Supported formats: CSV, Excel (.xlsx, .xls)"}), 400



    replace_existing = request.form.get("replace_existing", "").lower() in ["true", "1", "yes"]

    academic_year = (request.form.get("academic_year") or "2026-2027").strip()

    raw_sem = request.form.get("semester")

    semester = raw_sem.strip() if (raw_sem and raw_sem.strip() and raw_sem.strip().lower() not in ("none", "null", "", "undefined")) else None



    connection = None

    cursor = None

    user_email = "admin"

    try:

        connection = get_db_connection()

        connection.autocommit = False

        cursor = connection.cursor(dictionary=True)



        # 1. Fetch Subject Catalogue for intelligent matching

        cursor.execute("SELECT subject_id, subject_code, subject_name, semester, study_year FROM subjects WHERE is_active = 1 OR is_active IS NULL")

        subjects_catalogue = cursor.fetchall()

        subj_by_id = {s["subject_id"]: s for s in subjects_catalogue}



        # 2. Parse file using advanced intelligent parser

        parsed_faculty = parse_faculty_file(file, filename, subjects_catalogue)

        if not parsed_faculty:

            return jsonify({"error": "No valid faculty records found in file"}), 400



        purged_count = 0

        archived_count = 0



        # 3. If REPLACE MODE: Purge safe records and archive protected records

        if replace_existing:

            cursor.execute("""

                SELECT f.faculty_id, f.faculty_name, f.email, f.department, f.designation,

                       COALESCE((

                           SELECT COUNT(DISTINCT ia.assignment_id)

                           FROM invigilator_assignments ia

                           JOIN exam_sessions es ON ia.exam_id = es.exam_id

                           WHERE ia.faculty_id = f.faculty_id

                             AND (es.exam_date >= CURRENT_DATE() OR es.status IN ('Scheduled', 'Published', 'In-Progress', 'Allocated'))

                       ), 0) AS active_duty_count,

                       COALESCE((

                           SELECT COUNT(DISTINCT ia.assignment_id)

                           FROM invigilator_assignments ia

                           JOIN exam_sessions es ON ia.exam_id = es.exam_id

                           WHERE ia.faculty_id = f.faculty_id

                             AND (es.status = 'Completed' OR es.exam_date < CURRENT_DATE())

                       ), 0) +

                       COALESCE((

                           SELECT COUNT(DISTINCT ih.history_id)

                           FROM invigilator_history ih

                           WHERE ih.original_faculty_id = f.faculty_id OR ih.replacement_faculty_id = f.faculty_id

                       ), 0) AS history_count,

                       (SELECT u.user_id FROM users u WHERE u.faculty_id = f.faculty_id LIMIT 1) AS user_id

                FROM faculty f

            """)

            all_existing = cursor.fetchall()

            safe_purge_ids = []

            protected_archive_ids = []

            for ef in all_existing:

                if ef["active_duty_count"] > 0 or ef["history_count"] > 0 or ef["user_id"]:

                    protected_archive_ids.append(ef["faculty_id"])

                else:

                    safe_purge_ids.append(ef["faculty_id"])



            if safe_purge_ids:

                p_safe = ",".join(["%s"] * len(safe_purge_ids))

                cursor.execute(f"DELETE FROM faculty_course_profiles WHERE faculty_id IN ({p_safe})", tuple(safe_purge_ids))

                cursor.execute(f"DELETE FROM faculty_availability WHERE faculty_id IN ({p_safe})", tuple(safe_purge_ids))

                cursor.execute(f"DELETE FROM faculty_subjects WHERE faculty_id IN ({p_safe})", tuple(safe_purge_ids))

                cursor.execute(f"DELETE FROM faculty WHERE faculty_id IN ({p_safe})", tuple(safe_purge_ids))

                purged_count = len(safe_purge_ids)



            if protected_archive_ids:

                p_prot = ",".join(["%s"] * len(protected_archive_ids))

                cursor.execute(f"UPDATE faculty SET is_active = 0 WHERE faculty_id IN ({p_prot})", tuple(protected_archive_ids))

                cursor.execute(f"DELETE FROM faculty_course_profiles WHERE faculty_id IN ({p_prot}) AND is_confirmed = 0", tuple(protected_archive_ids))

                cursor.execute(f"DELETE FROM faculty_subjects WHERE faculty_id IN ({p_prot})", tuple(protected_archive_ids))

                archived_count = len(protected_archive_ids)



        # 4. Fetch existing faculty to match incoming records (including preserved archived faculty)

        cursor.execute("SELECT faculty_id, faculty_name, designation, department, email, is_active FROM faculty")

        existing_faculty = cursor.fetchall()



        email_to_fac = {}

        name_to_fac = {}

        for ef in existing_faculty:

            name_to_fac[ef["faculty_name"].strip().lower()] = ef

            if ef.get("email"):

                for em in re.findall(r'[\w\.-]+@[\w\.-]+', ef["email"].lower()):

                    email_to_fac[em] = ef



        matched_existing = 0

        newly_added = 0

        ug_courses_count = 0

        unspecified_courses_count = 0

        suggested_matches = 0

        teaching_mappings_count = 0



        # Derive study_year integer from semester string

        sem_digits = ''.join(c for c in semester if c.isdigit())

        sem_num = int(sem_digits) if sem_digits else 5

        derived_study_year = 3 if sem_num in [5, 6] else (2 if sem_num in [3, 4] else (4 if sem_num in [7, 8] else 1))



        for f in parsed_faculty:

            name = f["faculty_name"].strip()

            desig = f.get("designation", "").strip()

            dept = f.get("department", "CSE").strip() or "CSE"

            primary_email = f.get("email")

            all_emails = f.get("all_emails", [])



            # Match against existing faculty

            matched_ef = None

            for em in all_emails:

                if em in email_to_fac:

                    matched_ef = email_to_fac[em]

                    break

            if not matched_ef and primary_email and primary_email in email_to_fac:

                matched_ef = email_to_fac[primary_email]

            if not matched_ef:

                matched_ef = name_to_fac.get(name.lower())



            if matched_ef:

                faculty_id = matched_ef["faculty_id"]

                matched_existing += 1

                cursor.execute("""

                    UPDATE faculty

                    SET faculty_name = %s,

                        designation = COALESCE(NULLIF(%s, ''), designation),

                        department = COALESCE(NULLIF(%s, ''), department),

                        email = COALESCE(NULLIF(%s, ''), email),

                        is_active = 1

                    WHERE faculty_id = %s

                """, (name, desig, dept, primary_email or matched_ef.get("email"), faculty_id))

                cursor.execute("UPDATE users SET is_active = 1 WHERE faculty_id = %s", (faculty_id,))

            else:

                cursor.execute("""

                    INSERT INTO faculty (faculty_name, designation, department, email, is_active)

                    VALUES (%s, %s, %s, %s, 1)

                """, (name, desig, dept, primary_email))

                faculty_id = cursor.lastrowid

                newly_added += 1

                new_entry = {"faculty_id": faculty_id, "faculty_name": name, "email": primary_email, "designation": desig, "department": dept, "is_active": 1}

                name_to_fac[name.lower()] = new_entry

                if primary_email: email_to_fac[primary_email] = new_entry



            # Store course profile items and auto-map if suggested_subject_id is present

            cursor.execute("DELETE FROM faculty_course_profiles WHERE faculty_id = %s AND is_confirmed = 0", (faculty_id,))



            for p in f.get("profile", []):

                c_name = p["course_name"]

                c_class = p["classification"]

                s_id = p.get("suggested_subject_id")

                conf = p.get("match_confidence", "none")



                if c_class == "UG Profile Courses":

                    ug_courses_count += 1

                else:

                    unspecified_courses_count += 1



                is_confirmed = 0

                if s_id:

                    suggested_matches += 1

                    # Auto-map into faculty_subjects for replace_mode or recognized subjects

                    subj_meta = subj_by_id.get(s_id, {})

                    sub_sy = p.get("study_year") or subj_meta.get("study_year") or derived_study_year

                    sub_sem = p.get("semester") or subj_meta.get("semester") or semester

                    sub_ay = p.get("academic_year") or academic_year



                    cursor.execute("""

                        SELECT id FROM faculty_subjects

                        WHERE faculty_id = %s AND subject_id = %s

                    """, (faculty_id, s_id))

                    existing_sub = cursor.fetchone()



                    if not existing_sub:

                        cursor.execute("""

                            INSERT INTO faculty_subjects (faculty_id, subject_id, academic_year, study_year, semester, is_verified)

                            VALUES (%s, %s, %s, %s, %s, 1)

                            ON DUPLICATE KEY UPDATE academic_year = VALUES(academic_year), study_year = VALUES(study_year), semester = VALUES(semester), is_verified = 1

                        """, (faculty_id, s_id, sub_ay, sub_sy, sub_sem))

                        teaching_mappings_count += 1

                    else:

                        cursor.execute("UPDATE faculty_subjects SET academic_year = %s, study_year = %s, semester = %s, is_verified = 1 WHERE id = %s", (sub_ay, sub_sy, sub_sem, existing_sub["id"]))

                        teaching_mappings_count += 1



                    is_confirmed = 1



                cursor.execute("""

                    INSERT INTO faculty_course_profiles (

                        faculty_id, course_name, classification, suggested_subject_id, match_confidence, is_confirmed, academic_year, semester

                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)

                """, (faculty_id, c_name, c_class, s_id, conf, is_confirmed, academic_year if is_confirmed else None, semester if is_confirmed else None))



        # Audit log

        action_name = "FACULTY_DIRECTORY_REPLACE" if replace_existing else "FACULTY_IMPORT"

        details_str = (

            f"Faculty directory replacement: {len(parsed_faculty)} active records imported ({newly_added} new, {matched_existing} reactivated). "

            f"Purged {purged_count} unreferenced records, archived {archived_count} protected records. "

            f"Auto-mapped {teaching_mappings_count} teaching assignments for {academic_year} ({semester})."

            if replace_existing else

            f"Imported faculty master workbook: {len(parsed_faculty)} records ({newly_added} new, {matched_existing} updated). "

            f"Extracted {ug_courses_count} UG courses, {unspecified_courses_count} unspecified courses with {suggested_matches} suggested catalogue matches."

        )



        cursor.execute("""

            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

            VALUES (%s, %s, %s, %s, %s)

        """, (action_name, "faculty", None, details_str, user_email))



        connection.commit()

        return jsonify({

            "success": True,

            "replace_mode": replace_existing,

            "message": (

                f"Successfully replaced faculty directory: {len(parsed_faculty)} active faculty loaded ({newly_added} new, {matched_existing} reactivated). "

                f"{purged_count} unreferenced records purged, {archived_count} protected records archived. {teaching_mappings_count} teaching assignments mapped."

                if replace_existing else

                f"Successfully processed {len(parsed_faculty)} faculty records ({newly_added} new, {matched_existing} linked to existing)."

            ),

            "total_records": len(parsed_faculty),

            "imported_total": len(parsed_faculty),

            "newly_added": newly_added,

            "matched_existing": matched_existing,

            "reactivated_existing": matched_existing,

            "purged_count": purged_count,

            "archived_count": archived_count,

            "teaching_mappings_count": teaching_mappings_count,

            "ug_courses_count": ug_courses_count,

            "unspecified_courses_count": unspecified_courses_count,

            "suggested_matches": suggested_matches

        }), 200

    except Exception as e:

        if connection and connection.is_connected(): connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()









@admin_bp.route("/faculty/course-profiles", methods=["GET"])

def get_faculty_course_profiles():

    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)

        cursor.execute("""

            SELECT fcp.id, fcp.faculty_id, f.faculty_name, f.designation, f.department, f.email,

                   fcp.course_name, fcp.classification, fcp.suggested_subject_id, fcp.match_confidence,

                   fcp.is_confirmed, fcp.academic_year, fcp.semester,

                   s.subject_code, s.subject_name, s.semester AS catalog_semester

            FROM faculty_course_profiles fcp

            JOIN faculty f ON fcp.faculty_id = f.faculty_id

            LEFT JOIN subjects s ON fcp.suggested_subject_id = s.subject_id

            ORDER BY f.faculty_name ASC, fcp.classification ASC, fcp.course_name ASC

        """)

        profiles = cursor.fetchall()

        return jsonify({"profiles": profiles, "count": len(profiles)}), 200

    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/faculty/course-profiles/confirm", methods=["POST"])

def confirm_faculty_course_profiles():

    data = request.get_json(silent=True) or {}

    confirmations = data.get("confirmations", [])

    academic_year = data.get("academic_year", "2026-2027")

    semester = data.get("semester", "Semester 5")

    user_email = "admin"



    if not confirmations:

        return jsonify({"error": "No course profile items provided for confirmation."}), 400



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        confirmed_count = 0

        for item in confirmations:

            profile_id = item.get("profile_id")

            faculty_id = item.get("faculty_id")

            subject_id = item.get("subject_id")



            if not faculty_id or not subject_id:

                continue



            # 1. Insert or update in faculty_subjects

            cursor.execute("""

                SELECT id FROM faculty_subjects

                WHERE faculty_id = %s AND subject_id = %s AND academic_year = %s AND semester = %s

            """, (faculty_id, subject_id, academic_year, semester))

            existing_sub = cursor.fetchone()



            if not existing_sub:

                cursor.execute("""

                    INSERT INTO faculty_subjects (faculty_id, subject_id, academic_year, semester, is_verified)

                    VALUES (%s, %s, %s, %s, 1)

                """, (faculty_id, subject_id, academic_year, semester))

            else:

                cursor.execute("""

                    UPDATE faculty_subjects SET is_verified = 1

                    WHERE id = %s

                """, (existing_sub["id"],))



            # 2. Mark profile as confirmed

            if profile_id:

                cursor.execute("""

                    UPDATE faculty_course_profiles

                    SET is_confirmed = 1, suggested_subject_id = %s, academic_year = %s, semester = %s

                    WHERE id = %s

                """, (subject_id, academic_year, semester, profile_id))



            confirmed_count += 1



        # Audit log

        cursor.execute("""

            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

            VALUES (%s, %s, %s, %s, %s)

        """, (

            "TEACHING_ASSIGNMENT_CONFIRM", "faculty_subjects", None,

            f"Confirmed {confirmed_count} teaching assignments for {academic_year} ({semester}).",

            user_email

        ))



        connection.commit()

        return jsonify({

            "success": True,

            "confirmed_count": confirmed_count,

            "message": f"Successfully verified and saved {confirmed_count} teaching assignment(s) for {academic_year} ({semester})."

        }), 200

    except Exception as e:

        if connection and connection.is_connected(): connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/faculty/subject-allocations", methods=["GET"])

def get_faculty_subject_allocations():

    academic_year = request.args.get("academic_year")

    study_year = request.args.get("study_year")

    semester = request.args.get("semester")

    faculty_id = request.args.get("faculty_id")

    subject_id = request.args.get("subject_id")



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        query = """

            SELECT fs.id, fs.faculty_id, f.faculty_name, f.designation, f.department, f.email,

                   fs.subject_id, s.subject_code, s.subject_name, s.semester AS catalog_semester,

                   fs.academic_year, fs.study_year, fs.semester, fs.section, fs.is_verified, fs.created_at

            FROM faculty_subjects fs

            JOIN faculty f ON fs.faculty_id = f.faculty_id

            JOIN subjects s ON fs.subject_id = s.subject_id

            WHERE 1=1

        """

        params = []

        if academic_year and academic_year != "ALL":

            query += " AND (fs.academic_year = %s OR fs.academic_year IS NULL)"

            params.append(academic_year)

        if study_year and study_year != "ALL":

            try:

                sy_int = int(str(study_year).replace("st Year", "").replace("nd Year", "").replace("rd Year", "").replace("th Year", "").replace("Year", "").strip())

                query += " AND (fs.study_year = %s OR fs.study_year IS NULL)"

                params.append(sy_int)

            except ValueError:

                pass

        if semester and semester != "ALL":

            sem_digits = ''.join(c for c in str(semester) if c.isdigit())

            if sem_digits:

                query += " AND (fs.semester = %s OR REGEXP_REPLACE(fs.semester, '[^0-9]', '') = %s OR fs.semester IS NULL)"

                params.extend([semester, sem_digits])

            else:

                query += " AND (fs.semester = %s OR fs.semester IS NULL)"

                params.append(semester)

        if faculty_id:

            query += " AND fs.faculty_id = %s"

            params.append(faculty_id)

        if subject_id:

            query += " AND fs.subject_id = %s"

            params.append(subject_id)



        query += " ORDER BY f.faculty_name ASC, s.subject_code ASC"

        cursor.execute(query, tuple(params))

        allocations = cursor.fetchall()



        # Faculty-wise summary

        faculty_map = {}

        subject_map = {}



        for a in allocations:

            fid = a["faculty_id"]

            sid = a["subject_id"]



            if fid not in faculty_map:

                faculty_map[fid] = {

                    "faculty_id": fid,

                    "faculty_name": a["faculty_name"],

                    "designation": a["designation"],

                    "department": a["department"],

                    "email": a["email"],

                    "subjects": []

                }

            faculty_map[fid]["subjects"].append({

                "allocation_id": a["id"],

                "subject_id": sid,

                "subject_code": a["subject_code"],

                "subject_name": a["subject_name"],

                "study_year": a["study_year"],

                "semester": a["semester"],

                "academic_year": a["academic_year"],

                "section": a.get("section"),

                "is_verified": bool(a["is_verified"])

            })



            if sid not in subject_map:

                subject_map[sid] = {

                    "subject_id": sid,

                    "subject_code": a["subject_code"],

                    "subject_name": a["subject_name"],

                    "faculty": []

                }

            subject_map[sid]["faculty"].append({

                "allocation_id": a["id"],

                "faculty_id": fid,

                "faculty_name": a["faculty_name"],

                "designation": a["designation"],

                "department": a["department"],

                "email": a["email"],

                "study_year": a["study_year"],

                "semester": a["semester"],

                "academic_year": a["academic_year"],

                "section": a.get("section"),

                "is_verified": bool(a["is_verified"])

            })



        return jsonify({

            "allocations": allocations,

            "faculty_summary": list(faculty_map.values()),

            "subject_summary": list(subject_map.values()),

            "total_allocations": len(allocations)

        }), 200

    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/faculty/subject-allocations", methods=["POST"])

def save_faculty_subject_allocations():

    data = request.get_json(silent=True) or {}

    faculty_id = data.get("faculty_id")

    subject_ids = data.get("subject_ids", [])

    if not subject_ids and data.get("subject_id"):

        subject_ids = [data.get("subject_id")]

    academic_year = (data.get("academic_year") or "2026-2027").strip()

    semester = (data.get("semester") or "Semester 5").strip()

    user_email = "admin"



    sem_digits = ''.join(c for c in str(semester) if c.isdigit())

    sem_num = int(sem_digits) if sem_digits else 5

    calculated_study_year = (sem_num + 1) // 2



    raw_sy = data.get("study_year")

    if raw_sy:

        try:

            study_year = int(str(raw_sy).replace("st Year", "").replace("nd Year", "").replace("rd Year", "").replace("th Year", "").replace("Year", "").strip())

        except ValueError:

            study_year = calculated_study_year

    else:

        study_year = calculated_study_year



    if not faculty_id:

        return jsonify({"error": "Faculty member must be selected."}), 400

    if not subject_ids or not isinstance(subject_ids, list):

        return jsonify({"error": "At least one subject must be selected."}), 400



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        cursor.execute("SELECT faculty_id, faculty_name FROM faculty WHERE faculty_id = %s", (faculty_id,))

        fac = cursor.fetchone()

        if not fac:

            return jsonify({"error": "Selected faculty does not exist."}), 404



        saved_count = 0

        for sid in subject_ids:

            try:

                sid_int = int(sid)

            except ValueError:

                continue



            cursor.execute("""

                SELECT id FROM faculty_subjects

                WHERE faculty_id = %s AND subject_id = %s AND academic_year = %s

                  AND (semester = %s OR REGEXP_REPLACE(semester, '[^0-9]', '') = %s)

            """, (faculty_id, sid_int, academic_year, semester, sem_digits))

            existing = cursor.fetchone()



            if not existing:

                cursor.execute("""

                    INSERT INTO faculty_subjects (faculty_id, subject_id, academic_year, study_year, semester, is_verified)

                    VALUES (%s, %s, %s, %s, %s, 1)

                """, (faculty_id, sid_int, academic_year, study_year, semester))

                saved_count += 1

            else:

                cursor.execute("""

                    UPDATE faculty_subjects

                    SET is_verified = 1, study_year = %s, semester = %s

                    WHERE id = %s

                """, (study_year, semester, existing["id"]))



        cursor.execute("""

            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

            VALUES (%s, %s, %s, %s, %s)

        """, (

            "SAVE_FACULTY_SUBJECT_ALLOCATION", "faculty_subjects", faculty_id,

            f"Allocated {saved_count} subjects to faculty #{faculty_id} ({fac['faculty_name']}) for {academic_year} (Year {study_year}, {semester}).",

            user_email

        ))



        connection.commit()

        return jsonify({

            "success": True,

            "message": f"Successfully allocated {len(subject_ids)} subject(s) to {fac['faculty_name']} for {academic_year} ({semester}).",

            "saved_count": saved_count

        }), 200

    except Exception as e:

        if connection and connection.is_connected(): connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/faculty/subject-allocations/<int:allocation_id>", methods=["PUT"])

def update_faculty_subject_allocation(allocation_id):

    data = request.get_json(silent=True) or {}

    faculty_id = data.get("faculty_id")

    subject_id = data.get("subject_id")

    academic_year = (data.get("academic_year") or "2026-2027").strip()

    semester = (data.get("semester") or "Semester 5").strip()



    sem_digits = ''.join(c for c in str(semester) if c.isdigit())

    sem_num = int(sem_digits) if sem_digits else 5

    calculated_study_year = (sem_num + 1) // 2



    raw_sy = data.get("study_year")

    if raw_sy:

        try:

            study_year = int(str(raw_sy).replace("st Year", "").replace("nd Year", "").replace("rd Year", "").replace("th Year", "").replace("Year", "").strip())

        except ValueError:

            study_year = calculated_study_year

    else:

        study_year = calculated_study_year



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        cursor.execute("SELECT id FROM faculty_subjects WHERE id = %s", (allocation_id,))

        if not cursor.fetchone():

            return jsonify({"error": "Teaching allocation record not found."}), 404



        update_fields = ["academic_year = %s", "study_year = %s", "semester = %s", "is_verified = 1"]

        params = [academic_year, study_year, semester]



        if faculty_id:

            update_fields.append("faculty_id = %s")

            params.append(int(faculty_id))

        if subject_id:

            update_fields.append("subject_id = %s")

            params.append(int(subject_id))



        params.append(allocation_id)

        cursor.execute(f"UPDATE faculty_subjects SET {', '.join(update_fields)} WHERE id = %s", tuple(params))

        connection.commit()



        return jsonify({

            "success": True,

            "message": "Teaching assignment updated successfully."

        }), 200

    except Exception as e:

        if connection and connection.is_connected(): connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/faculty/subject-allocations/<int:allocation_id>", methods=["DELETE"])

def delete_faculty_subject_allocation(allocation_id):

    connection = None

    cursor = None

    user_email = "admin"

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        cursor.execute("""

            SELECT fs.id, fs.faculty_id, f.faculty_name, fs.subject_id, s.subject_code, s.subject_name

            FROM faculty_subjects fs

            JOIN faculty f ON fs.faculty_id = f.faculty_id

            JOIN subjects s ON fs.subject_id = s.subject_id

            WHERE fs.id = %s

        """, (allocation_id,))

        rec = cursor.fetchone()

        if not rec:

            return jsonify({"error": "Teaching allocation record not found."}), 404



        cursor.execute("DELETE FROM faculty_subjects WHERE id = %s", (allocation_id,))



        cursor.execute("""

            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

            VALUES (%s, %s, %s, %s, %s)

        """, (

            "DELETE_FACULTY_SUBJECT_ALLOCATION", "faculty_subjects", allocation_id,

            f"Removed teaching assignment of {rec['subject_code']} - {rec['subject_name']} for faculty #{rec['faculty_id']} ({rec['faculty_name']}).",

            user_email

        ))



        connection.commit()

        return jsonify({

            "success": True,

            "message": f"Removed teaching assignment of {rec['subject_code']} for {rec['faculty_name']}."

        }), 200

    except Exception as e:

        if connection and connection.is_connected(): connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()


@admin_bp.route("/faculty/subject-allocations/bulk-delete", methods=["POST"])
def bulk_delete_faculty_subject_allocations():
    """
    Bulk Deletion of Faculty-Subject Teaching Mappings.
    - Validates every mapping ID.
    - Preserves historical records via faculty_subjects_history and audit_logs.
    - NEVER touches faculty master records, user login accounts, course catalogue, or exams.
    - Returns deleted_count, protected_count, and failed_count.
    """
    from auth_routes import get_authenticated_user
    admin_user = get_authenticated_user()
    if not admin_user or admin_user.get("role") not in ("exam_admin", "admin", "hod"):
        return jsonify({"error": "Administrative privileges required"}), 403

    user_email = admin_user.get("email", "admin")
    data = request.get_json(silent=True) or {}
    raw_ids = data.get("allocation_ids") or data.get("mapping_ids") or []

    if not isinstance(raw_ids, list) or len(raw_ids) == 0:
        return jsonify({"error": "allocation_ids list must be provided and not empty"}), 400

    clean_ids = []
    for mid in raw_ids:
        try:
            clean_ids.append(int(mid))
        except (ValueError, TypeError):
            continue

    if not clean_ids:
        return jsonify({"error": "No valid allocation IDs provided"}), 400

    # Deduplicate while preserving order
    clean_ids = list(dict.fromkeys(clean_ids))

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        connection.autocommit = False
        cursor = connection.cursor(dictionary=True)

        # 1. Fetch existing mapping records
        ph = ",".join(["%s"] * len(clean_ids))
        cursor.execute(f"""
            SELECT fs.id, fs.faculty_id, f.faculty_name, fs.subject_id, s.subject_code, s.subject_name,
                   fs.academic_year, fs.study_year, fs.semester, fs.section
            FROM faculty_subjects fs
            JOIN faculty f ON fs.faculty_id = f.faculty_id
            JOIN subjects s ON fs.subject_id = s.subject_id
            WHERE fs.id IN ({ph})
        """, tuple(clean_ids))
        found_records = cursor.fetchall()

        found_map = {r["id"]: r for r in found_records}
        missing_ids = [mid for mid in clean_ids if mid not in found_map]

        if not found_records:
            return jsonify({
                "error": "None of the specified teaching mapping IDs were found in the database.",
                "deleted_count": 0,
                "protected_count": 0,
                "failed_count": len(clean_ids),
                "deleted_ids": [],
                "protected_ids": []
            }), 404

        # 2. Ensure historical archive table exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS faculty_subjects_history (
                history_id INT AUTO_INCREMENT PRIMARY KEY,
                original_allocation_id INT NOT NULL,
                faculty_id INT NOT NULL,
                faculty_name VARCHAR(150) NULL,
                subject_id INT NOT NULL,
                subject_code VARCHAR(50) NULL,
                subject_name VARCHAR(150) NULL,
                academic_year VARCHAR(20) NULL,
                study_year INT NULL,
                semester VARCHAR(50) NULL,
                section VARCHAR(50) NULL,
                action_taken VARCHAR(50) DEFAULT 'bulk_deleted',
                deleted_by VARCHAR(100) DEFAULT 'admin',
                deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_orig_alloc_id (original_allocation_id),
                INDEX idx_fac_subj (faculty_id, subject_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)

        # 3. Insert into archive table before deleting
        archive_rows = []
        for r in found_records:
            archive_rows.append((
                r["id"], r["faculty_id"], r["faculty_name"],
                r["subject_id"], r["subject_code"], r["subject_name"],
                r.get("academic_year"), r.get("study_year"), r.get("semester"), r.get("section"),
                "bulk_deleted", user_email
            ))

        cursor.executemany("""
            INSERT INTO faculty_subjects_history (
                original_allocation_id, faculty_id, faculty_name,
                subject_id, subject_code, subject_name,
                academic_year, study_year, semester, section,
                action_taken, deleted_by
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, archive_rows)

        # 4. Delete from faculty_subjects strictly by ID
        del_ph = ",".join(["%s"] * len(found_records))
        del_ids = [r["id"] for r in found_records]
        cursor.execute(f"DELETE FROM faculty_subjects WHERE id IN ({del_ph})", tuple(del_ids))
        deleted_count = cursor.rowcount

        # 5. Record audit log
        audit_details = f"Bulk removed {deleted_count} teaching mapping(s): " + ", ".join([
            f"#{r['id']} ({r['faculty_name']} -> {r['subject_code']} [{r.get('semester', '')} {r.get('section', '')}])"
            for r in found_records[:10]
        ])
        if len(found_records) > 10:
            audit_details += f" ...and {len(found_records) - 10} more."

        cursor.execute("""
            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)
            VALUES (%s, %s, %s, %s, %s)
        """, ("BULK_DELETE_FACULTY_SUBJECTS", "faculty_subjects", str(deleted_count), audit_details, user_email))

        connection.commit()

        return jsonify({
            "success": True,
            "deleted_count": deleted_count,
            "protected_count": 0,
            "failed_count": len(missing_ids),
            "deleted_ids": del_ids,
            "protected_ids": [],
            "message": f"Successfully deleted {deleted_count} faculty-subject teaching assignment(s)."
        }), 200

    except Exception as e:
        if connection:
            connection.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor: cursor.close()
        if connection and connection.is_connected(): connection.close()











# =====================================================================

# INDIVIDUAL STUDENT MANAGEMENT ENDPOINTS

# =====================================================================



@admin_bp.route("/students/individual", methods=["POST"])

def add_student_individually():

    data = request.get_json(silent=True) or {}

    hall_ticket_no = str(data.get("hall_ticket_no", "")).strip().upper()

    name = str(data.get("name", "")).strip().upper()

    section = str(data.get("section", "")).strip().upper()

    department = str(data.get("department", "CSE")).strip().upper() or "CSE"

    academic_year = str(data.get("academic_year", "2026-2027")).strip()

    study_year = data.get("study_year", 3)

    semester = str(data.get("semester", "Semester 5")).strip()

    user_email = "admin"



    # Validation

    if not hall_ticket_no:

        return jsonify({"error": "Hall Ticket Number is required and cannot be empty."}), 400

    if not name:

        return jsonify({"error": "Student Full Name is required and cannot be empty."}), 400

    if not section:

        return jsonify({"error": "Target section must be specified."}), 400



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        try:

            study_year_int = int(study_year)

        except Exception:

            study_year_int = 3



        # 1. Check duplicate within the same study year cohort across ANY section (shared roster)

        cursor.execute("""

            SELECT student_id, hall_ticket_no, name, section, department, academic_year, semester, study_year

            FROM students

            WHERE UPPER(TRIM(hall_ticket_no)) = %s

              AND academic_year = %s

              AND (study_year = %s OR year = %s)

              AND is_active = 1

            LIMIT 1

        """, (hall_ticket_no, academic_year, study_year_int, study_year_int))

        existing_cohort = cursor.fetchone()



        if existing_cohort:

            sec = existing_cohort.get("section") or "Unknown"

            ex_name = existing_cohort.get("name") or "Existing Student"

            return jsonify({

                "error": f"Hall Ticket '{hall_ticket_no}' is already registered in Section {sec} ({ex_name}) for {academic_year} (Year {study_year_int}). The student roster is shared across both semesters.",

                "existing_student": existing_cohort

            }), 409



        # 2. Check general active duplicate

        cursor.execute("""

            SELECT student_id, hall_ticket_no, name, section, department, academic_year, semester

            FROM students

            WHERE UPPER(TRIM(hall_ticket_no)) = %s

              AND is_active = 1

            LIMIT 1

        """, (hall_ticket_no,))

        existing_global = cursor.fetchone()



        if existing_global:

            return jsonify({

                "error": f"Hall Ticket '{hall_ticket_no}' already belongs to '{existing_global['name']}' in {existing_global['department']} (Section {existing_global['section']}, {existing_global['academic_year']}).",

                "existing_student": existing_global

            }), 409



        # 3. Insert student record into shared master roster

        cursor.execute("""

            INSERT INTO students (

                hall_ticket_no, name, section, department, branch,

                academic_year, study_year, year, semester, is_active

            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 1)

        """, (

            hall_ticket_no, name, section, department, department,

            academic_year, study_year_int, study_year_int, semester

        ))

        new_student_id = cursor.lastrowid



        # 4. Audit log

        cursor.execute("""

            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

            VALUES (%s, %s, %s, %s, %s)

        """, (

            "ADD_STUDENT_INDIVIDUAL", "student", new_student_id,

            f"Individually registered student '{name}' ({hall_ticket_no}) into Section {section} for {academic_year} ({semester}).",

            user_email

        ))



        connection.commit()

        return jsonify({

            "success": True,

            "message": f"Student '{name}' ({hall_ticket_no}) successfully registered in Section {section}.",

            "student": {

                "student_id": new_student_id,

                "hall_ticket_no": hall_ticket_no,

                "name": name,

                "section": section,

                "department": department,

                "academic_year": academic_year,

                "study_year": study_year,

                "semester": semester

            }

        }), 201

    except Exception as e:

        if connection and connection.is_connected(): connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/students/<int:student_id>", methods=["PUT"])

def update_student_details(student_id):

    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip().upper()

    department = str(data.get("department", "CSE")).strip().upper()

    is_active = data.get("is_active", 1)

    user_email = "admin"



    if not name:

        return jsonify({"error": "Student name cannot be empty."}), 400



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        cursor.execute("SELECT student_id, hall_ticket_no, name, section FROM students WHERE student_id = %s", (student_id,))

        student = cursor.fetchone()

        if not student:

            return jsonify({"error": "Student not found."}), 404



        cursor.execute("""

            UPDATE students

            SET name = %s, department = %s, is_active = %s

            WHERE student_id = %s

        """, (name, department, 1 if is_active else 0, student_id))



        cursor.execute("""

            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

            VALUES (%s, %s, %s, %s, %s)

        """, (

            "UPDATE_STUDENT_DETAILS", "student", student_id,

            f"Updated student #{student_id} ({student['hall_ticket_no']}): name changed from '{student['name']}' to '{name}'.",

            user_email

        ))



        connection.commit()

        return jsonify({

            "success": True,

            "message": f"Student '{student['hall_ticket_no']}' updated successfully.",

            "student": {

                "student_id": student_id,

                "hall_ticket_no": student["hall_ticket_no"],

                "name": name,

                "department": department,

                "section": student["section"]

            }

        }), 200

    except Exception as e:

        if connection and connection.is_connected(): connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/invigilators/<int:assignment_id>/respond", methods=["POST"])

def respond_duty(assignment_id):

    """

    Invigilator accepts or declines duty.

    If declined:

      - Validates mandatory decline reason from predefined categories:

        'Personal reasons', 'Health issues', 'Unavailable on examination date',

        'Already assigned another academic duty', 'Other'.

      - If 'Other' is chosen, requires a specific written explanation.

      - Saves decline reason and optional comments in invigilator_assignments.

      - Creates or updates persistent notification in system_notifications:

        Title: 'Invigilation Duty Declined – Replacement Required'

        Includes: Declining faculty ID/name, course code/name, exam type/date,

        start/end time, hall, reason, timestamp, reassignment status.

      - Prevents duplicate notifications.

    """

    data = request.get_json(silent=True) or {}

    raw_action = (data.get("action") or data.get("response") or "").lower().strip()

    action = "accept" if raw_action in ("accept", "accepted") else ("decline" if raw_action in ("decline", "declined") else raw_action)

    

    if action not in ("accept", "decline"):

        return jsonify({"error": "Action must be 'accept' or 'decline'"}), 400



    raw_reason = (data.get("reason") or data.get("decline_reason") or "").strip()

    explanation = (data.get("explanation") or "").strip()

    message = (data.get("message") or data.get("message_to_admin") or "").strip()



    if action == "decline":

        valid_reasons = [

            "Personal reasons",

            "Health issues",

            "Unavailable on examination date",

            "Already assigned another academic duty",

            "Other"

        ]

        

        # Check if raw_reason starts with or matches one of valid_reasons

        if not raw_reason:

            return jsonify({"error": "A reason for declining invigilation duty is required."}), 400

        

        if raw_reason.lower() == "other" or raw_reason.lower().startswith("other:"):

            if not explanation and ":" in raw_reason:

                explanation = raw_reason.split(":", 1)[1].strip()

            if not explanation:

                return jsonify({"error": "Please provide a written explanation when selecting 'Other'."}), 400

            full_reason = f"Other: {explanation}"

        else:

            full_reason = raw_reason

    else:

        full_reason = None



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        cursor.execute("SELECT assignment_id, faculty_id, exam_id, hall_id, status FROM invigilator_assignments WHERE assignment_id = %s", (assignment_id,))

        assign = cursor.fetchone()

        if not assign:

            return jsonify({"error": "Duty assignment not found"}), 404



        now = datetime.now()



        if action == "accept":

            cursor.execute("""

                UPDATE invigilator_assignments

                SET status = 'accepted', accepted_at = %s, decline_reason = NULL, message_to_admin = %s

                WHERE assignment_id = %s

            """, (now, message or None, assignment_id))

            msg = "Invigilation duty accepted. Thank you for confirming."

        else:

            cursor.execute("""

                UPDATE invigilator_assignments

                SET status = 'declined', declined_at = %s, decline_reason = %s, message_to_admin = %s

                WHERE assignment_id = %s

            """, (now, full_reason, message or None, assignment_id))



            # Fetch detailed examination and faculty info for notification

            cursor.execute("""

                SELECT

                    ia.assignment_id, ia.faculty_id, f.faculty_name, f.department,

                    es.exam_id, es.exam_name, es.exam_type, es.exam_date, es.session, es.start_time, es.end_time,

                    sub.subject_code, sub.subject_name,

                    h.hall_name, COALESCE(h.room_no, h.hall_name) AS room_no

                FROM invigilator_assignments ia

                JOIN faculty f ON ia.faculty_id = f.faculty_id

                JOIN exam_sessions es ON ia.exam_id = es.exam_id

                JOIN subjects sub ON es.subject_id = sub.subject_id

                JOIN halls h ON ia.hall_id = h.hall_id

                WHERE ia.assignment_id = %s

            """, (assignment_id,))

            duty_info = cursor.fetchone()



            if duty_info:

                notif_title = "Invigilation Duty Declined – Replacement Required"

                start_str = duty_info['start_time'] or ("09:30" if duty_info['session'] == "FN" else "13:30")

                end_str = duty_info['end_time'] or ("12:30" if duty_info['session'] == "FN" else "16:30")

                date_str = str(duty_info['exam_date'])

                

                notif_msg = (

                    f"Faculty ID: {duty_info['faculty_id']} - {duty_info['faculty_name']} ({duty_info['department']}) "

                    f"declined duty for Course: {duty_info['subject_code']} - {duty_info['subject_name']} "

                    f"({duty_info['exam_type'] or 'Examination'}) on {date_str} from {start_str} to {end_str} "

                    f"in Hall: {duty_info['hall_name']} (Room {duty_info['room_no']}). "

                    f"Reason: {full_reason}. Declined At: {now.strftime('%Y-%m-%d %H:%M:%S')}. "

                    f"Reassignment Status: Pending."

                )



                # Check if notification already exists to avoid duplicates

                cursor.execute("""

                    SELECT notification_id FROM system_notifications

                    WHERE related_id = %s AND notification_type = 'duty_declined'

                """, (assignment_id,))

                existing_notif = cursor.fetchone()



                if existing_notif:

                    cursor.execute("""

                        UPDATE system_notifications

                        SET title = %s, message = %s, is_read = 0, created_at = %s

                        WHERE notification_id = %s

                    """, (notif_title, notif_msg, now, existing_notif["notification_id"]))

                else:

                    cursor.execute("""

                        INSERT INTO system_notifications

                        (recipient_role, title, message, notification_type, related_id, is_read, created_at)

                        VALUES ('exam_admin', %s, %s, 'duty_declined', %s, 0, %s)

                    """, (notif_title, notif_msg, assignment_id, now))



            msg = "Invigilation duty marked as declined. The administrator has been notified."



        connection.commit()

        return jsonify({

            "message": msg,

            "assignment_id": assignment_id,

            "status": action + "ed",

            "reason": full_reason

        }), 200



    except Exception as e:

        if connection and connection.is_connected(): connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()













@admin_bp.route("/invigilators/<int:assignment_id>/message", methods=["POST"])







def send_invigilator_message(assignment_id):







    data = request.get_json(silent=True) or {}







    message = data.get("message", "").strip()















    if not message:







        return jsonify({"error": "Message content is required"}), 400















    connection = None







    cursor = None







    try:







        connection = get_db_connection()







        cursor = connection.cursor(dictionary=True)















        cursor.execute("SELECT assignment_id FROM invigilator_assignments WHERE assignment_id = %s", (assignment_id,))







        if not cursor.fetchone():







            return jsonify({"error": "Duty assignment not found"}), 404















        cursor.execute("""







            UPDATE invigilator_assignments







            SET message_to_admin = %s







            WHERE assignment_id = %s







        """, (message, assignment_id))















        connection.commit()







        return jsonify({"message": "Message sent to administrator successfully.", "assignment_id": assignment_id}), 200







    except Exception as e:







        if connection and connection.is_connected(): connection.rollback()







        return jsonify({"error": str(e)}), 500







    finally:







        if cursor: cursor.close()







        if connection and connection.is_connected(): connection.close()





























@admin_bp.route("/admin/notifications", methods=["GET"])

@admin_bp.route("/notifications", methods=["GET"])

def get_admin_notifications():

    """

    Returns persistent notifications from system_notifications table.

    Augments duty_declined notifications with rich exam, faculty, and reassignment details.

    """

    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        cursor.execute("""

            SELECT

                sn.notification_id,

                sn.recipient_role,

                sn.recipient_user_id,

                sn.title,

                sn.message,

                sn.notification_type,

                sn.related_id,

                sn.is_read,

                sn.created_at,

                ia.assignment_id,

                ia.faculty_id,

                f.faculty_name,

                f.department,

                es.exam_id,

                es.exam_name,

                es.exam_type,

                es.exam_date,

                es.session,

                es.start_time,

                es.end_time,

                sub.subject_code,

                sub.subject_name,

                h.hall_name,

                COALESCE(h.room_no, h.hall_name) AS room_no,

                ia.decline_reason,

                ia.declined_at,

                ia.message_to_admin,

                ih.history_id,

                ih.replacement_faculty_id,

                ih.action_taken,

                rep_f.faculty_name AS replacement_faculty_name

            FROM system_notifications sn

            LEFT JOIN invigilator_assignments ia ON sn.related_id = ia.assignment_id

            LEFT JOIN faculty f ON ia.faculty_id = f.faculty_id

            LEFT JOIN exam_sessions es ON ia.exam_id = es.exam_id

            LEFT JOIN subjects sub ON es.subject_id = sub.subject_id

            LEFT JOIN halls h ON ia.hall_id = h.hall_id

            LEFT JOIN invigilator_history ih ON (ih.assignment_id = sn.related_id AND ih.action_taken = 'reassigned')

            LEFT JOIN faculty rep_f ON ih.replacement_faculty_id = rep_f.faculty_id

            WHERE sn.recipient_role = 'exam_admin' OR sn.recipient_role IS NULL

            ORDER BY sn.created_at DESC

        """)

        raw_list = cursor.fetchall()



        notifications = []

        unread_count = 0



        for r in raw_list:

            if not r["is_read"]:

                unread_count += 1

            

            is_reassigned = bool(r["replacement_faculty_id"]) or (r["message"] and "[Status: Reassigned" in r["message"])

            reassignment_status = "Reassigned" if is_reassigned else "Pending"



            item = {

                "notification_id": r["notification_id"],

                "title": r["title"],

                "message": r["message"],

                "notification_type": r["notification_type"],

                "related_id": r["related_id"],

                "is_read": bool(r["is_read"]),

                "created_at": str(r["created_at"]) if r["created_at"] else None,

                "assignment_id": r["assignment_id"] or r["related_id"],

                "faculty_id": r["faculty_id"],

                "faculty_name": r["faculty_name"],

                "department": r["department"],

                "subject_code": r["subject_code"],

                "subject_name": r["subject_name"],

                "exam_id": r["exam_id"],

                "exam_name": r["exam_name"],

                "exam_type": r["exam_type"],

                "exam_date": str(r["exam_date"]) if r["exam_date"] else None,

                "session": r["session"],

                "start_time": r["start_time"],

                "end_time": r["end_time"],

                "hall_name": r["hall_name"],

                "room_no": r["room_no"],

                "decline_reason": r["decline_reason"],

                "declined_at": str(r["declined_at"]) if r["declined_at"] else None,

                "message_to_admin": r["message_to_admin"],

                "reassignment_status": reassignment_status,

                "replacement_faculty_id": r["replacement_faculty_id"],

                "replacement_faculty_name": r["replacement_faculty_name"],

            }

            notifications.append(item)



        # For backwards compatibility with older dashboard widgets

        declined_duties = [n for n in notifications if n["notification_type"] == "duty_declined" and n["reassignment_status"] == "Pending"]



        return jsonify({

            "notifications": notifications,

            "unread_count": unread_count,

            "declined_duties": declined_duties,

            "total_pending_actions": len(declined_duties)

        }), 200



    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/notifications/<int:notification_id>/read", methods=["PUT", "POST"])

def mark_notification_as_read(notification_id):

    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)

        cursor.execute("UPDATE system_notifications SET is_read = 1 WHERE notification_id = %s", (notification_id,))

        connection.commit()

        return jsonify({"message": "Notification marked as read.", "notification_id": notification_id}), 200

    except Exception as e:

        if connection and connection.is_connected(): connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/notifications/mark-all-read", methods=["POST"])

def mark_all_notifications_read():

    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)

        cursor.execute("UPDATE system_notifications SET is_read = 1 WHERE recipient_role = 'exam_admin' OR recipient_role IS NULL")

        connection.commit()

        return jsonify({"message": "All notifications marked as read."}), 200

    except Exception as e:

        if connection and connection.is_connected(): connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/admin/pending-reassignments", methods=["GET"])

def get_pending_reassignments():

    """

    Returns list of invigilation duties that were declined by faculty,

    with filtering support: status = 'pending' | 'reassigned' | 'all'.

    Includes elapsed time calculation, decline reasons, and full exam context.

    """

    filter_status = request.args.get("status", "pending").lower().strip()

    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        cursor.execute("""

            SELECT

                ia.assignment_id,

                COALESCE(ia.faculty_id, ia.original_faculty_id) AS faculty_id,

                COALESCE(f.faculty_name, ia.faculty_name, 'Invigilator') AS faculty_name,

                COALESCE(f.department, ia.department, 'CSE') AS department,

                COALESCE(f.email, ia.faculty_email) AS email,

                es.exam_id,

                es.exam_name,

                es.exam_type,

                es.exam_date,

                es.session,

                es.start_time,

                es.end_time,

                sub.subject_code,

                sub.subject_name,

                h.hall_id,

                h.hall_name,

                COALESCE(h.room_no, h.hall_name) AS room_no,

                ia.status,

                ia.decline_reason,

                ia.declined_at,

                ia.message_to_admin,

                ih.history_id,

                ih.replacement_faculty_id,

                ih.created_at AS reassigned_at,

                COALESCE(rep_f.faculty_name, ih.replacement_faculty_name) AS replacement_faculty_name

            FROM invigilator_assignments ia

            LEFT JOIN faculty f ON ia.faculty_id = f.faculty_id

            JOIN exam_sessions es ON ia.exam_id = es.exam_id

            JOIN subjects sub ON es.subject_id = sub.subject_id

            JOIN halls h ON ia.hall_id = h.hall_id

            LEFT JOIN invigilator_history ih ON (ih.assignment_id = ia.assignment_id AND ih.action_taken = 'reassigned')

            LEFT JOIN faculty rep_f ON ih.replacement_faculty_id = rep_f.faculty_id

            WHERE ia.status = 'declined'

            ORDER BY ia.declined_at DESC

        """)

        rows = cursor.fetchall()

        now = datetime.now()



        results = []

        for r in rows:

            is_reassigned = bool(r["replacement_faculty_id"])

            reassign_status = "Reassigned" if is_reassigned else "Pending"



            if filter_status == "pending" and is_reassigned:

                continue

            if filter_status == "reassigned" and not is_reassigned:

                continue



            # Calculate time elapsed

            time_elapsed_str = ""

            if r["declined_at"]:

                diff = now - r["declined_at"]

                mins = int(diff.total_seconds() // 60)

                if mins < 1:

                    time_elapsed_str = "Just now"

                elif mins < 60:

                    time_elapsed_str = f"{mins} min ago"

                elif mins < 1440:

                    time_elapsed_str = f"{mins // 60} hr {(mins % 60)} min ago"

                else:

                    time_elapsed_str = f"{mins // 1440} day(s) ago"



            results.append({

                "assignment_id": r["assignment_id"],

                "faculty_id": r["faculty_id"],

                "faculty_name": r["faculty_name"],

                "department": r["department"],

                "email": r["email"],

                "exam_id": r["exam_id"],

                "exam_name": r["exam_name"],

                "exam_type": r["exam_type"],

                "exam_date": str(r["exam_date"]) if r["exam_date"] else None,

                "session": r["session"],

                "start_time": r["start_time"],

                "end_time": r["end_time"],

                "subject_code": r["subject_code"],

                "subject_name": r["subject_name"],

                "hall_id": r["hall_id"],

                "hall_name": r["hall_name"],

                "room_no": r["room_no"],

                "decline_reason": r["decline_reason"],

                "declined_at": str(r["declined_at"]) if r["declined_at"] else None,

                "message_to_admin": r["message_to_admin"],

                "reassignment_status": reassign_status,

                "replacement_faculty_id": r["replacement_faculty_id"],

                "replacement_faculty_name": r["replacement_faculty_name"],

                "reassigned_at": str(r["reassigned_at"]) if r["reassigned_at"] else None,

                "time_elapsed": time_elapsed_str

            })



        return jsonify({

            "items": results,

            "total": len(results),

            "filter": filter_status

        }), 200



    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()













@admin_bp.route("/reassign-invigilator", methods=["POST"])

def reassign_invigilator():
    from auth_routes import get_authenticated_user
    auth_user = get_authenticated_user()
    if not auth_user:
        return jsonify({"error": "Authentication required"}), 401
    if auth_user.get("role") not in ("admin", "exam_admin"):
        return jsonify({"error": "Access denied: Administrative permissions required. Only Admin can reassign invigilators."}), 403


    """

    Reassigns a declined or pending invigilator duty to a new faculty member.

    Enforces non-teaching, non-overlapping schedule, and availability.

    Preserves original decline history in both invigilator_history and invigilator_assignments.

    Creates replacement assignment for new faculty with status 'pending'.

    Updates notification status to 'Reassigned' and notifies replacement faculty.

    """

    data = request.get_json(silent=True) or {}

    assignment_id = data.get("assignment_id")

    new_faculty_id = data.get("new_faculty_id")

    admin_reason = (data.get("reason") or "Administrative replacement").strip()



    if not assignment_id or not new_faculty_id:

        return jsonify({"error": "assignment_id and new_faculty_id are required"}), 400



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        cursor.execute("""

            SELECT ia.assignment_id, ia.faculty_id AS original_faculty_id, ia.exam_id, ia.hall_id,

                   ia.decline_reason, ia.declined_at, ia.message_to_admin,

                   es.exam_date, es.session, es.start_time, es.end_time, es.subject_id, es.exam_name,

                   es.academic_year, es.semester,

                   h.hall_name, COALESCE(h.room_no, h.hall_name) AS room_no,

                   sub.subject_code, sub.subject_name

            FROM invigilator_assignments ia

            JOIN exam_sessions es ON ia.exam_id = es.exam_id

            JOIN halls h ON ia.hall_id = h.hall_id

            JOIN subjects sub ON es.subject_id = sub.subject_id

            WHERE ia.assignment_id = %s

        """, (assignment_id,))

        assignment = cursor.fetchone()



        if not assignment:

            return jsonify({"error": "Assignment not found"}), 404



        exam_id = assignment["exam_id"]

        exam_date = assignment["exam_date"]

        session = assignment["session"]

        subject_id = assignment["subject_id"]

        original_faculty_id = assignment["original_faculty_id"]

        orig_decline_reason = assignment["decline_reason"] or admin_reason



        # Fetch replacement faculty details

        cursor.execute("SELECT faculty_id, faculty_name, department, is_active FROM faculty WHERE faculty_id = %s", (new_faculty_id,))

        new_fac = cursor.fetchone()

        if not new_fac:

            return jsonify({"error": "Replacement faculty member not found"}), 404

        if new_fac.get("is_active") == 0:

            return jsonify({"error": f"Faculty member {new_fac['faculty_name']} is inactive and cannot be assigned to examination duties."}), 400



        # 1. Subject conflict check (Mandatory subject-teaching restriction: AY + Semester + Subject)

        exam_ay = (assignment.get("academic_year") or "").strip()

        exam_sem = (assignment.get("semester") or "").strip()

        exam_sem_num = ''.join(c for c in exam_sem if c.isdigit())

        cursor.execute("""

            SELECT 1 FROM faculty_subjects fs

            JOIN subjects s ON fs.subject_id = s.subject_id

            WHERE fs.faculty_id = %s

              AND (fs.subject_id = %s OR UPPER(TRIM(s.subject_code)) = UPPER(TRIM(%s)))

              AND (%s = '' OR fs.academic_year IS NULL OR TRIM(fs.academic_year) = %s)

              AND (%s = '' OR fs.semester IS NULL OR TRIM(fs.semester) = %s OR REGEXP_REPLACE(fs.semester, '[^0-9]', '') = %s)

        """, (new_faculty_id, subject_id, assignment["subject_code"], exam_ay, exam_ay, exam_sem_num, exam_sem, exam_sem_num))

        if cursor.fetchone():

            return jsonify({

                "error": f"Subject Teaching Restriction: {new_fac['faculty_name']} teaches {assignment['subject_code']} ({assignment['subject_name']}) in {exam_ay} {exam_sem} and cannot be assigned as invigilator."

            }), 400



        # Check inactive faculty

        if new_fac.get("is_active") == 0:

            return jsonify({

                "error": f"Inactive Faculty: {new_fac['faculty_name']} is currently inactive and cannot be assigned."

            }), 400



        # 2. Overlap check with active duties

        start_min = _parse_time_min(assignment["start_time"], session, False)

        end_min = _parse_time_min(assignment["end_time"], session, True)



        cursor.execute("""

            SELECT es2.exam_name, es2.start_time, es2.end_time, es2.session, h2.hall_name

            FROM invigilator_assignments ia2

            JOIN exam_sessions es2 ON ia2.exam_id = es2.exam_id

            JOIN halls h2 ON ia2.hall_id = h2.hall_id

            WHERE ia2.faculty_id = %s

              AND es2.exam_date = %s

              AND ia2.assignment_id <> %s

              AND ia2.status IN ('pending', 'accepted')

        """, (new_faculty_id, exam_date, assignment_id))

        duties = cursor.fetchall()

        for d in duties:

            d_start = _parse_time_min(d["start_time"], d["session"], False)

            d_end = _parse_time_min(d["end_time"], d["session"], True)

            if max(start_min, d_start) < min(end_min, d_end):

                timing = f"{d['start_time']} - {d['end_time']}" if d["start_time"] else d["session"]

                return jsonify({"error": f"Conflict: {new_fac['faculty_name']} already has an active duty for '{d['exam_name']}' in {d['hall_name']} ({timing})."}), 400



        # Authenticated Admin ID

        try:

            from auth_routes import get_authenticated_user

            auth_user = get_authenticated_user()

            user_id = auth_user.get("user_id") if auth_user else None

        except Exception:

            user_id = None



        now = datetime.now()



        # Step A: Log into invigilator_history preserving original decline details

        cursor.execute("""

            INSERT INTO invigilator_history

            (assignment_id, exam_id, hall_id, original_faculty_id, replacement_faculty_id, action_taken, reason, action_by_user_id, created_at)

            VALUES (%s, %s, %s, %s, %s, 'reassigned', %s, %s, %s)

        """, (assignment_id, exam_id, assignment["hall_id"], original_faculty_id, new_faculty_id, orig_decline_reason, user_id, now))



        # Step B: Create new assignment row for replacement faculty (status 'pending')

        # Check if replacement already assigned to this exam/hall

        cursor.execute("""

            SELECT assignment_id FROM invigilator_assignments

            WHERE faculty_id = %s AND exam_id = %s AND hall_id = %s

        """, (new_faculty_id, exam_id, assignment["hall_id"]))

        existing_rep_assign = cursor.fetchone()



        if existing_rep_assign:

            new_assign_id = existing_rep_assign["assignment_id"]

            cursor.execute("""

                UPDATE invigilator_assignments

                SET status = 'pending', assigned_at = %s, decline_reason = NULL, message_to_admin = NULL, accepted_at = NULL, declined_at = NULL

                WHERE assignment_id = %s

            """, (now, new_assign_id))

        else:

            cursor.execute("""

                INSERT INTO invigilator_assignments

                (faculty_id, exam_id, hall_id, assigned_at, status)

                VALUES (%s, %s, %s, %s, 'pending')

            """, (new_faculty_id, exam_id, assignment["hall_id"], now))

            new_assign_id = cursor.lastrowid



        # Step C: Update notification for admin to 'Reassigned'

        cursor.execute("""

            UPDATE system_notifications

            SET is_read = 1,

                message = CONCAT(message, ' [Status: Reassigned to ', %s, ' on ', %s, ']')

            WHERE related_id = %s AND notification_type = 'duty_declined'

              AND message NOT LIKE '%%[Status: Reassigned%%'

        """, (new_fac["faculty_name"], now.strftime("%Y-%m-%d %H:%M"), assignment_id))



        # Step D: Notify the replacement faculty of the new assignment

        cursor.execute("SELECT user_id FROM users WHERE faculty_id = %s LIMIT 1", (new_faculty_id,))

        rep_user = cursor.fetchone()

        rep_user_id = rep_user["user_id"] if rep_user else None



        notif_fac_title = "New Invigilation Duty Assigned"

        notif_fac_msg = (

            f"You have been assigned examination supervision duty for {assignment['exam_name']} "

            f"in {assignment['hall_name']} (Room {assignment['room_no']}) on {str(exam_date)} ({session}). "

            f"Please review and confirm your attendance in My Duty Schedule."

        )

        cursor.execute("""

            INSERT INTO system_notifications

            (recipient_role, recipient_user_id, title, message, notification_type, related_id, is_read, created_at)

            VALUES ('invigilator', %s, %s, %s, 'duty_assigned', %s, 0, %s)

        """, (rep_user_id, notif_fac_title, notif_fac_msg, new_assign_id, now))



        connection.commit()



        return jsonify({

            "message": f"Invigilator reassigned successfully to {new_fac['faculty_name']}.",

            "original_assignment_id": assignment_id,

            "new_assignment_id": new_assign_id,

            "replacement_faculty_id": new_faculty_id,

            "replacement_faculty_name": new_fac["faculty_name"],

            "status": "reassigned"

        }), 200



    except Exception as e:

        if connection and connection.is_connected(): connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()













@admin_bp.route("/hod/daily-schedule", methods=["GET"])







def get_hod_daily_schedule():







    """







    Returns full day schedule for HOD date selector:







    - All examinations scheduled on selected date







    - Subjects, timings







    - Assigned rooms & student seat counts







    - Seating rosters per room







    - Assigned invigilators and their duty response status (Accepted / Pending / Declined)







    """







    date_str = request.args.get("date", "").strip()







    if not date_str:







        date_str = datetime.now().strftime("%Y-%m-%d")















    connection = None







    cursor = None







    try:







        connection = get_db_connection()







        cursor = connection.cursor(dictionary=True)















        cursor.execute("""







            SELECT







                es.exam_id,







                es.exam_name,







                es.exam_date,







                es.session,







                es.start_time,







                es.end_time,







                es.expected_students,







                sub.subject_code,







                sub.subject_name







            FROM exam_sessions es







            JOIN subjects sub ON es.subject_id = sub.subject_id







            WHERE es.exam_date = %s







            ORDER BY es.session, es.start_time, es.exam_id







        """, (date_str,))







        exams = cursor.fetchall()















        result = []







        for ex in exams:







            ex_id = ex["exam_id"]















            # Get assigned halls and seating counts







            cursor.execute("""







                SELECT







                    h.hall_id,







                    h.hall_name,







                    h.room_no,







                    h.capacity,







                    COUNT(sa.allocation_id) AS allocated_count







                FROM seat_allocations sa







                JOIN seats s ON sa.seat_id = s.seat_id







                JOIN halls h ON s.hall_id = h.hall_id







                WHERE sa.exam_id = %s







                GROUP BY h.hall_id, h.hall_name, h.room_no, h.capacity







                ORDER BY h.hall_name







            """, (ex_id,))







            halls_info = cursor.fetchall()















            # Get assigned invigilators and status







            cursor.execute("""







                SELECT

                    ia.assignment_id,

                    COALESCE(ia.faculty_id, ia.original_faculty_id) AS faculty_id,

                    COALESCE(f.faculty_name, ia.faculty_name, 'Invigilator') AS faculty_name,

                    COALESCE(f.department, ia.department, 'CSE') AS department,

                    h.hall_id,

                    h.hall_name,

                    h.room_no,

                    ia.status,

                    ia.decline_reason,

                    ia.accepted_at,

                    ia.declined_at

                FROM invigilator_assignments ia

                LEFT JOIN faculty f ON ia.faculty_id = f.faculty_id







                JOIN halls h ON ia.hall_id = h.hall_id







                WHERE ia.exam_id = %s







                ORDER BY h.hall_name







            """, (ex_id,))







            invigilators_info = cursor.fetchall()















            # Map rooms for HOD interface

            rooms_list = []

            for h in halls_info:

                matching_inv = next((inv for inv in invigilators_info if inv["hall_id"] == h["hall_id"]), None)

                rooms_list.append({

                    "hall_id": h["hall_id"],

                    "hall_name": h["hall_name"],

                    "room_no": h["room_no"] or h["hall_name"],

                    "capacity": h["capacity"],

                    "student_count": h["allocated_count"],

                    "allocated_students": h["allocated_count"],

                    "invigilator_name": matching_inv["faculty_name"] if matching_inv else "Unassigned",

                    "invigilator_department": matching_inv["department"] if matching_inv else "",

                    "response_status": matching_inv["status"] if matching_inv else "unassigned"

                })



            result.append({

                "exam_id": ex_id,

                "exam_name": ex["exam_name"],

                "subject_code": ex["subject_code"],

                "subject_name": ex["subject_name"],

                "date": str(ex["exam_date"]),

                "session": ex["session"],

                "start_time": ex["start_time"] or "09:30 AM",

                "end_time": ex["end_time"] or "12:30 PM",

                "halls": halls_info,

                "rooms": rooms_list,

                "allocated_students": sum(h["allocated_count"] for h in halls_info),

                "total_seated": sum(h["allocated_count"] for h in halls_info),

                "invigilators": invigilators_info

            })















        return jsonify({







            "selected_date": date_str,







            "total_exams": len(result),







            "examinations": result







        }), 200







    except Exception as e:







        return jsonify({"error": str(e)}), 500







    finally:







        if cursor: cursor.close()







        if connection and connection.is_connected(): connection.close()





























# =========================================================







# REPORTS: DAILY DUTY SIGNATURE REGISTER PDF







# =========================================================















@admin_bp.route("/reports/daily-duty-register", methods=["GET"])

def download_daily_duty_register():

    date_str = request.args.get("date", "").strip()

    session = request.args.get("session", "").strip().upper() or None

    exam_id = request.args.get("exam_id", "").strip()



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

        from report_generator import generate_daily_duty_register_pdf, get_exam_details, get_exam_title_slug



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

        return send_file(pdf_buffer, mimetype="application/pdf", as_attachment=True, download_name=filename)

    except Exception as e:







        return jsonify({"error": str(e)}), 500













# =========================================================

# FEATURE ENHANCEMENT: HALL UPLOAD & BULK IMPORT

# =========================================================

@admin_bp.route("/halls/upload-preview", methods=["POST"])

def upload_halls_preview():

    """

    Parses an uploaded hall capacity file (.xlsx, .xls, .csv, .pdf)

    and returns a preview with row validation and existing database matches.

    """

    if "file" not in request.files:

        return jsonify({"error": "No file uploaded"}), 400



    file = request.files["file"]

    if not file or not file.filename:

        return jsonify({"error": "No selected file"}), 400



    from file_parser import parse_hall_file

    try:

        parsed = parse_hall_file(file, file.filename)

    except Exception as e:

        return jsonify({"error": f"Failed to parse file: {str(e)}"}), 400



    # Match with existing halls in MySQL

    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)

        cursor.execute("SELECT hall_id, hall_name, room_no, capacity, rows_count, columns_count FROM halls")

        existing_halls = cursor.fetchall()

        existing_map = {}

        for eh in existing_halls:

            k1 = str(eh["hall_name"]).strip().lower()

            k2 = str(eh["room_no"]).strip().lower() if eh.get("room_no") else ""

            existing_map[k1] = eh

            if k2:

                existing_map[k2] = eh



        for h in parsed["halls"]:

            k_name = str(h["hall_name"]).strip().lower()

            k_room = str(h["room_no"]).strip().lower()

            match = existing_map.get(k_name) or existing_map.get(k_room)

            if match:

                h["exists_in_db"] = True

                h["db_hall_id"] = match["hall_id"]

                h["current_capacity"] = match["capacity"]

                h["warning"] = f"Hall already exists in database (Capacity: {match['capacity']}). Will update upon confirmation."



        return jsonify(parsed), 200

    except Exception as e:

        return jsonify({"error": f"Database check failed: {str(e)}"}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/halls/bulk-import", methods=["POST"])

def bulk_import_halls():

    """

    Saves confirmed and edited hall capacity records into MySQL.

    Updates existing halls without blind deletion, generates seating grids.

    """

    data = request.get_json(silent=True) or {}

    halls_to_save = data.get("halls", [])



    if not halls_to_save or not isinstance(halls_to_save, list):

        return jsonify({"error": "No hall records provided for import"}), 400



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        inserted_count = 0

        updated_count = 0



        for h in halls_to_save:

            hall_name = str(h.get("hall_name", "")).strip()

            room_no = str(h.get("room_no", "")).strip() or hall_name

            capacity = int(h.get("capacity") or 0)

            rows_count = int(h.get("rows_count") or 6)

            columns_count = int(h.get("columns_count") or 8)



            if not hall_name or capacity <= 0:

                continue



            # Check if hall already exists

            cursor.execute("""

                SELECT hall_id FROM halls

                WHERE LOWER(hall_name) = LOWER(%s) OR (room_no IS NOT NULL AND LOWER(room_no) = LOWER(%s))

            """, (hall_name, room_no))

            existing = cursor.fetchone()



            if existing:

                hall_id = existing["hall_id"]

                cursor.execute("""

                    UPDATE halls

                    SET hall_name = %s, room_no = %s, capacity = %s, rows_count = %s, columns_count = %s, is_active = TRUE

                    WHERE hall_id = %s

                """, (hall_name, room_no, capacity, rows_count, columns_count, hall_id))



                # Safe seat handling respecting existing allocations

                cursor.execute("""

                    SELECT COUNT(*) AS alloc_count

                    FROM seat_allocations sa

                    JOIN seats s ON sa.seat_id = s.seat_id

                    WHERE s.hall_id = %s

                """, (hall_id,))

                has_allocs = (cursor.fetchone()["alloc_count"] or 0) > 0



                if not has_allocs:

                    cursor.execute("DELETE FROM seats WHERE hall_id = %s", (hall_id,))

                    seats_data = []

                    seat_num = 0

                    for r in range(1, rows_count + 1):

                        for c in range(1, columns_count + 1):

                            if seat_num < capacity:

                                seats_data.append((hall_id, r, c))

                                seat_num += 1

                    if seats_data:

                        cursor.executemany("INSERT INTO seats (hall_id, row_no, column_no) VALUES (%s, %s, %s)", seats_data)

                else:

                    # Hall has active seat allocations. Ensure missing seat grid coordinates exist without removing existing seats

                    cursor.execute("SELECT row_no, column_no FROM seats WHERE hall_id = %s", (hall_id,))

                    existing_coords = {(s["row_no"], s["column_no"]) for s in cursor.fetchall()}

                    new_seats = []

                    seat_num = len(existing_coords)

                    for r in range(1, rows_count + 1):

                        for c in range(1, columns_count + 1):

                            if (r, c) not in existing_coords and seat_num < capacity:

                                new_seats.append((hall_id, r, c))

                                seat_num += 1

                    if new_seats:

                        cursor.executemany("INSERT INTO seats (hall_id, row_no, column_no) VALUES (%s, %s, %s)", new_seats)



                updated_count += 1

            else:

                cursor.execute("""

                    INSERT INTO halls (hall_name, room_no, capacity, rows_count, columns_count, is_active)

                    VALUES (%s, %s, %s, %s, %s, TRUE)

                """, (hall_name, room_no, capacity, rows_count, columns_count))

                hall_id = cursor.lastrowid



                seats_data = []

                seat_num = 0

                for r in range(1, rows_count + 1):

                    for c in range(1, columns_count + 1):

                        if seat_num < capacity:

                            seats_data.append((hall_id, r, c))

                            seat_num += 1

                if seats_data:

                    cursor.executemany("INSERT INTO seats (hall_id, row_no, column_no) VALUES (%s, %s, %s)", seats_data)

                inserted_count += 1



        connection.commit()

        return jsonify({

            "message": f"Successfully processed {len(halls_to_save)} halls: {inserted_count} created, {updated_count} updated.",

            "inserted_count": inserted_count,

            "updated_count": updated_count,

            "total_processed": len(halls_to_save)

        }), 200



    except Exception as e:

        if connection and connection.is_connected(): connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











# =========================================================

# FEATURE ENHANCEMENT: ELIGIBLE REPLACEMENT FACULTY

# =========================================================

def _parse_time_min(t_val, default_session="FN", is_end=False):

    if not t_val:

        if default_session == "FN":

            return 750 if is_end else 570

        return 990 if is_end else 810

    if hasattr(t_val, 'total_seconds'):

        return int(t_val.total_seconds()) // 60

    if hasattr(t_val, 'hour') and hasattr(t_val, 'minute'):

        return t_val.hour * 60 + t_val.minute

    if isinstance(t_val, str):

        parts = t_val.strip().split(":")

        if len(parts) >= 2:

            try:

                return int(parts[0]) * 60 + int(parts[1])

            except ValueError:

                pass

    return 750 if is_end else 570





@admin_bp.route("/invigilators/<int:assignment_id>/eligible-replacements", methods=["GET"])

def get_eligible_replacements(assignment_id):

    """

    Finds available faculty eligible to replace an invigilator for this assignment.

    Criteria:

      - Active faculty members (is_active = 1 or NULL).

      - Excludes the declining faculty member for this duty.

      - Excludes faculty marked unavailable or on leave in faculty_availability.

      - Excludes faculty with overlapping active duties (status IN ('pending', 'accepted')).

      - Excludes faculty who teach this specific course (faculty_subjects).

      - Ranks eligible candidates by lowest existing invigilation workload count.

      - If candidates are excluded, returns detailed diagnostic reasons per candidate.

    """

    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        cursor.execute("""

            SELECT ia.assignment_id, ia.faculty_id AS current_faculty_id, ia.exam_id, ia.hall_id,

                   es.exam_date, es.session, es.start_time, es.end_time, es.subject_id, es.exam_name, es.exam_type,

                   es.academic_year, es.semester,

                   h.hall_name, COALESCE(h.room_no, h.hall_name) AS room_no,

                   sub.subject_code, sub.subject_name,

                   f.faculty_name AS current_faculty_name, f.department AS current_faculty_dept,

                   ia.decline_reason, ia.message_to_admin, ia.declined_at

            FROM invigilator_assignments ia

            JOIN exam_sessions es ON ia.exam_id = es.exam_id

            JOIN halls h ON ia.hall_id = h.hall_id

            JOIN subjects sub ON es.subject_id = sub.subject_id

            JOIN faculty f ON ia.faculty_id = f.faculty_id

            WHERE ia.assignment_id = %s

        """, (assignment_id,))

        assignment = cursor.fetchone()



        if not assignment:

            return jsonify({"error": "Assignment not found"}), 404



        exam_date = assignment["exam_date"]

        exam_session = assignment["session"]

        start_min = _parse_time_min(assignment["start_time"], exam_session, False)

        end_min = _parse_time_min(assignment["end_time"], exam_session, True)

        subject_id = assignment["subject_id"]

        current_fac_id = assignment["current_faculty_id"]



        # 1. Fetch all active faculty

        cursor.execute("""

            SELECT f.faculty_id, f.faculty_name, f.department,

                   (SELECT email FROM users u WHERE u.faculty_id = f.faculty_id LIMIT 1) AS email

            FROM faculty f

            WHERE f.is_active = 1 OR f.is_active IS NULL

            ORDER BY f.faculty_name ASC

        """)

        all_faculty = cursor.fetchall()



        # 2. Fetch faculty teaching this subject in this term (by subject_id OR subject_code)

        exam_ay = (assignment.get("academic_year") or "").strip()

        exam_sem = (assignment.get("semester") or "").strip()

        exam_sem_num = ''.join(c for c in exam_sem if c.isdigit())

        cursor.execute("""

            SELECT DISTINCT fs.faculty_id

            FROM faculty_subjects fs

            JOIN subjects s ON fs.subject_id = s.subject_id

            WHERE (fs.subject_id = %s OR UPPER(TRIM(s.subject_code)) = UPPER(TRIM(%s)))

              AND (%s = '' OR fs.academic_year IS NULL OR TRIM(fs.academic_year) = %s)

              AND (%s = '' OR fs.semester IS NULL OR TRIM(fs.semester) = %s OR REGEXP_REPLACE(fs.semester, '[^0-9]', '') = %s)

        """, (subject_id, assignment["subject_code"], exam_ay, exam_ay, exam_sem_num, exam_sem, exam_sem_num))

        teaching_faculty_ids = {r["faculty_id"] for r in cursor.fetchall()}

        is_mapping_missing = (len(teaching_faculty_ids) == 0)



        # 3. Fetch unavailable faculty for this date and session

        cursor.execute("""

            SELECT faculty_id, session, is_available FROM faculty_availability

            WHERE exam_date = %s AND (session = %s OR session = 'ALL') AND is_available = 0

        """, (exam_date, exam_session))

        unavailable_faculty_ids = {r["faculty_id"] for r in cursor.fetchall()}



        # 4. Fetch active non-declined duties on this date

        cursor.execute("""

            SELECT ia2.assignment_id, ia2.faculty_id, es2.exam_name, es2.start_time, es2.end_time, es2.session, h2.hall_name

            FROM invigilator_assignments ia2

            JOIN exam_sessions es2 ON ia2.exam_id = es2.exam_id

            JOIN halls h2 ON ia2.hall_id = h2.hall_id

            WHERE es2.exam_date = %s

              AND ia2.assignment_id <> %s

              AND ia2.status IN ('pending', 'accepted')

              AND (es2.status IS NULL OR es2.status != 'Cancelled')

        """, (exam_date, assignment_id))

        active_duties = cursor.fetchall()

        duties_by_faculty = {}

        for d in active_duties:

            duties_by_faculty.setdefault(d["faculty_id"], []).append(d)



        # 5. Fetch workload (active duty count)

        cursor.execute("""

            SELECT faculty_id, COUNT(*) AS duty_count

            FROM invigilator_assignments

            WHERE status != 'declined'

            GROUP BY faculty_id

        """)

        duty_counts = {r["faculty_id"]: r["duty_count"] for r in cursor.fetchall()}



        candidates = []

        excluded_faculty = []



        for fac in all_faculty:

            fac_id = fac["faculty_id"]



            if fac_id == current_fac_id:

                excluded_faculty.append({

                    **fac,

                    "exclusion_reason": "Declined this specific duty",

                    "reason_code": "declined_original"

                })

                continue



            if fac_id in teaching_faculty_ids:

                excluded_faculty.append({

                    **fac,

                    "exclusion_reason": f"Teaches course {assignment['subject_code']} - {assignment['subject_name']}",

                    "reason_code": "subject_teaching_conflict",

                    "is_subject_teacher": True

                })

                continue



            if fac_id in unavailable_faculty_ids:

                excluded_faculty.append({

                    **fac,

                    "exclusion_reason": f"Marked unavailable / on leave on {exam_date}",

                    "reason_code": "leave_unavailability"

                })

                continue



            # Check time overlap

            conflict_msg = None

            if fac_id in duties_by_faculty:

                for duty in duties_by_faculty[fac_id]:

                    d_start = _parse_time_min(duty["start_time"], duty["session"], False)

                    d_end = _parse_time_min(duty["end_time"], duty["session"], True)

                    # Check interval intersection

                    if max(start_min, d_start) < min(end_min, d_end):

                        timing = f"{duty['start_time']} - {duty['end_time']}" if duty["start_time"] else duty["session"]

                        conflict_msg = f"Overlapping duty for '{duty['exam_name']}' in {duty['hall_name']} ({timing})"

                        break



            if conflict_msg:

                excluded_faculty.append({

                    **fac,

                    "exclusion_reason": conflict_msg,

                    "reason_code": "schedule_overlap"

                })

                continue



            count = duty_counts.get(fac_id, 0)

            candidates.append({

                **fac,

                "duty_count": count

            })



        # Rank candidates by lowest duty count for fair distribution

        candidates.sort(key=lambda x: (x["duty_count"], x["faculty_name"]))

        for idx, c in enumerate(candidates):

            c["recommendation_rank"] = idx + 1

            if idx == 0:

                c["recommendation_badge"] = "Lowest Workload"

                c["recommendation_label"] = "Highly Recommended (Lowest Workload)"

            else:

                c["recommendation_badge"] = f"{c['duty_count']} duties"

                c["recommendation_label"] = f"Eligible (Workload: {c['duty_count']} duties)"



        # Date formatting

        if assignment.get("exam_date"):

            assignment["exam_date"] = str(assignment["exam_date"])

        if assignment.get("declined_at"):

            assignment["declined_at"] = str(assignment["declined_at"])



        return jsonify({

            "assignment": assignment,

            "eligible_replacements": candidates,

            "total_eligible": len(candidates),

            "excluded_faculty": excluded_faculty,

            "total_excluded": len(excluded_faculty),

            "teaching_mapping_status": "unverified" if is_mapping_missing else "verified",

            "teaching_mapping_warning": (f"Notice: No faculty members are currently recorded as teaching {assignment['subject_code']} in Faculty Data. Please verify teaching allocations.") if is_mapping_missing else None,

            "no_eligible_reason": (

                "No eligible replacement faculty available. All other faculty members are excluded due to "

                "subject teaching restrictions, active schedule overlaps, or leave unavailability."

            ) if len(candidates) == 0 else None

        }), 200



    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()



















@admin_bp.route("/admin/teaching-conflicts-audit", methods=["GET"])

def audit_teaching_conflicts():

    """

    System-wide Invigilation Audit:

    Inspects all existing invigilation assignments across the system and identifies

    any cases where a faculty member is supervising an examination for a subject they teach.

    Flags these assignments for Admin review without deleting or altering records.

    """

    from auth_routes import get_authenticated_user

    auth_user = get_authenticated_user()

    if not auth_user or auth_user.get("role") not in ("exam_admin", "admin", "hod"):

        return jsonify({"error": "Administrative permissions required"}), 403



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        cursor.execute("""

            SELECT

                ia.assignment_id,

                ia.exam_id,

                ia.hall_id,

                ia.faculty_id,

                f.faculty_name,

                f.department AS faculty_dept,

                es.exam_name,

                es.exam_type,

                es.exam_date,

                es.session,

                es.start_time,

                es.end_time,

                sub.subject_code,

                sub.subject_name,

                h.hall_name,

                COALESCE(h.room_no, h.hall_name) AS room_no,

                ia.status,

                'Faculty member is assigned to supervise an examination for a course they teach' AS conflict_reason

            FROM invigilator_assignments ia

            JOIN faculty f ON ia.faculty_id = f.faculty_id

            JOIN exam_sessions es ON ia.exam_id = es.exam_id

            JOIN subjects sub ON es.subject_id = sub.subject_id

            JOIN faculty_subjects fs ON fs.faculty_id = f.faculty_id

            JOIN subjects fs_sub ON fs.subject_id = fs_sub.subject_id

            JOIN halls h ON ia.hall_id = h.hall_id

            WHERE (fs.subject_id = es.subject_id OR UPPER(TRIM(fs_sub.subject_code)) = UPPER(TRIM(sub.subject_code)))

            ORDER BY es.exam_date, es.session, f.faculty_name

        """)

        conflicts = cursor.fetchall()

        for c in conflicts:

            if c.get("exam_date"):

                c["exam_date"] = str(c["exam_date"])

            if c.get("start_time"):

                c["start_time"] = str(c["start_time"])

            if c.get("end_time"):

                c["end_time"] = str(c["end_time"])



        return jsonify({

            "total_teaching_conflicts": len(conflicts),

            "flagged_assignments": conflicts,

            "has_conflicts": len(conflicts) > 0,

            "message": f"Identified {len(conflicts)} invigilator assignment(s) with subject-teaching conflicts requiring admin review." if conflicts else "No subject-teaching conflicts found across all active assignments."

        }), 200

    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()











@admin_bp.route("/hod/hall-roster", methods=["GET"])

def get_hod_hall_roster():

    """

    Returns candidate seating roster and invigilator details for a hall in an exam.

    Strictly read-only inspection for HOD.

    """

    exam_id = request.args.get("exam_id")

    hall_id = request.args.get("hall_id")



    if not exam_id or not hall_id:

        return jsonify({"error": "exam_id and hall_id query parameters are required"}), 400



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        # Get Exam Details

        cursor.execute("""

            SELECT es.exam_id, es.exam_name, es.exam_date, es.session, es.start_time, es.end_time,

                   sub.subject_code, sub.subject_name

            FROM exam_sessions es

            JOIN subjects sub ON es.subject_id = sub.subject_id

            WHERE es.exam_id = %s

        """, (exam_id,))

        exam = cursor.fetchone()

        if not exam:

            return jsonify({"error": "Exam not found"}), 404



        # Get Hall Details

        cursor.execute("""

            SELECT hall_id, hall_name, room_no, capacity, rows_count, columns_count

            FROM halls WHERE hall_id = %s

        """, (hall_id,))

        hall = cursor.fetchone()

        if not hall:

            return jsonify({"error": "Hall not found"}), 404



        # Get Assigned Invigilator

        cursor.execute("""

            SELECT ia.assignment_id, ia.status, ia.decline_reason, ia.accepted_at, ia.declined_at,

                   COALESCE(ia.faculty_id, ia.original_faculty_id) AS faculty_id,

                   COALESCE(f.faculty_name, ia.faculty_name, 'Invigilator') AS faculty_name,

                   COALESCE(f.department, ia.department, 'CSE') AS department,

                   COALESCE(f.email, ia.faculty_email, (SELECT email FROM users u WHERE u.faculty_id = ia.faculty_id LIMIT 1)) AS email

            FROM invigilator_assignments ia

            LEFT JOIN faculty f ON ia.faculty_id = f.faculty_id

            WHERE ia.exam_id = %s AND ia.hall_id = %s

        """, (exam_id, hall_id))

        invigilator = cursor.fetchone()



        # Get Seated Candidates

        cursor.execute("""

            SELECT

                s.student_id,

                s.hall_ticket_no,

                s.name AS student_name,

                s.department,

                COALESCE(s.section, 'A') AS section,

                se.row_no,

                se.column_no,

                CONCAT('Row ', se.row_no, ', Column ', se.column_no) AS seat_position

            FROM seat_allocations sa

            JOIN students s ON sa.student_id = s.student_id

            JOIN seats se ON sa.seat_id = se.seat_id

            WHERE sa.exam_id = %s AND se.hall_id = %s

            ORDER BY se.row_no, se.column_no, s.hall_ticket_no

        """, (exam_id, hall_id))

        candidates = cursor.fetchall()



        return jsonify({

            "exam": exam,

            "hall": hall,

            "invigilator": invigilator,

            "candidates": candidates,

            "total_candidates": len(candidates)

        }), 200



    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()













# =========================================================================

# SMART EXAM SYSTEM - STUDENT BATCHES, DELETION & SECTION MANAGEMENT APIS

# =========================================================================



@admin_bp.route("/student-batches", methods=["GET"])

def get_student_batches():

    conn = None

    cur = None

    try:

        conn = get_db_connection()

        cur = conn.cursor(dictionary=True)

        ay = request.args.get("academic_year")

        sy = request.args.get("study_year")

        dept = request.args.get("department")

        sec = request.args.get("section")



        query = "SELECT * FROM student_import_batches WHERE (is_cleared = 0 OR is_cleared IS NULL)"

        params = []

        batch_type = request.args.get("batch_type")

        if batch_type:

            query += " AND batch_type = %s"

            params.append(batch_type)

        if ay:

            query += " AND academic_year = %s"

            params.append(ay)

        if sy:

            query += " AND study_year = %s"

            params.append(int(sy))

        if dept:

            query += " AND department = %s"

            params.append(dept)

        if sec:

            query += " AND section = %s"

            params.append(sec)



        query += " ORDER BY upload_timestamp DESC, batch_id DESC"

        cur.execute(query, tuple(params))

        batches = cur.fetchall()

        for b in batches:

            if b.get("upload_timestamp"):

                b["upload_timestamp"] = str(b["upload_timestamp"])

            if b.get("deleted_at"):

                b["deleted_at"] = str(b["deleted_at"])

        return jsonify({"batches": batches, "total_batches": len(batches)}), 200

    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/students/deletion-check", methods=["POST"])

def check_student_deletion():

    data = request.get_json(silent=True) or {}

    del_type = data.get("type", "section")  # 'section', 'batch', 'cohort'

    ay = data.get("academic_year", "2026-2027")

    sy = data.get("study_year", 3)

    dept = data.get("department", "CSE")

    sec = data.get("section")

    batch_id = data.get("batch_id")



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        cur = conn.cursor(dictionary=True)



        where_clauses = ["1=1"]

        params = []



        if del_type == "batch" and batch_id:

            where_clauses.append("s.batch_id = %s")

            params.append(int(batch_id))

        elif del_type == "section" and sec:

            where_clauses.append("s.academic_year = %s AND s.study_year = %s AND s.department = %s AND s.section = %s")

            params.extend([ay, int(sy), dept, sec])

        elif del_type == "cohort":

            where_clauses.append("s.academic_year = %s AND s.study_year = %s AND s.department = %s")

            params.extend([ay, int(sy), dept])

            if sec:

                where_clauses.append("s.section = %s")

                params.append(sec)

        elif del_type == "selected" and data.get("student_ids"):

            sids = [int(x) for x in data.get("student_ids") if str(x).isdigit()]

            if not sids:

                return jsonify({"error": "No valid student IDs provided"}), 400

            placeholders = ",".join(["%s"] * len(sids))

            where_clauses.append(f"s.student_id IN ({placeholders})")

            params.extend(sids)

        else:

            return jsonify({"error": "Invalid deletion parameters specified."}), 400



        where_str = " AND ".join(where_clauses)



        # 1. Matching students count and sample

        cur.execute(f"SELECT student_id, hall_ticket_no, name, section FROM students s WHERE {where_str} ORDER BY hall_ticket_no LIMIT 10", tuple(params))

        preview = cur.fetchall()



        cur.execute(f"SELECT COUNT(*) as cnt FROM students s WHERE {where_str}", tuple(params))

        total_students = cur.fetchone()["cnt"]



        if total_students == 0:

            return jsonify({

                "student_count": 0,

                "students_preview": [],

                "exam_registrations_count": 0,

                "seat_allocations_count": 0,

                "user_accounts_count": 0,

                "referenced_exams": [],

                "can_safe_delete": False,

                "blocking_reason": "No student records matched the specified deletion criteria."

            }), 200



        # 2. Check exam_registrations

        cur.execute(f"""

            SELECT COUNT(er.registration_id) as cnt, COUNT(DISTINCT er.exam_id) as exam_cnt

            FROM exam_registrations er

            JOIN students s ON er.student_id = s.student_id

            WHERE {where_str}

        """, tuple(params))

        er_res = cur.fetchone()

        reg_count = er_res["cnt"]



        # 3. Check seat_allocations

        cur.execute(f"""

            SELECT COUNT(sa.allocation_id) as cnt

            FROM seat_allocations sa

            JOIN students s ON sa.student_id = s.student_id

            WHERE {where_str}

        """, tuple(params))

        seat_count = cur.fetchone()["cnt"]



        # 4. Check user accounts

        cur.execute(f"""

            SELECT COUNT(u.user_id) as cnt

            FROM users u

            JOIN students s ON u.student_id = s.student_id

            WHERE {where_str}

        """, tuple(params))

        user_count = cur.fetchone()["cnt"]



        # 5. Get referenced exams details

        cur.execute(f"""

            SELECT DISTINCT es.exam_id, es.exam_name, es.exam_date, es.session

            FROM exam_sessions es

            WHERE es.exam_id IN (

                SELECT er.exam_id FROM exam_registrations er JOIN students s ON er.student_id = s.student_id WHERE {where_str}

                UNION

                SELECT sa.exam_id FROM seat_allocations sa JOIN students s ON sa.student_id = s.student_id WHERE {where_str}

            )

            ORDER BY es.exam_date DESC

        """, tuple(params) + tuple(params))

        ref_exams = cur.fetchall()

        for re_item in ref_exams:

            if re_item.get("exam_date"):

                re_item["exam_date"] = str(re_item["exam_date"])



        can_safe_delete = (reg_count == 0 and seat_count == 0 and user_count == 0)

        blocking_reason = None

        if not can_safe_delete:

            reasons = []

            if reg_count > 0:

                reasons.append(f"{reg_count} examination registration(s) across {len(ref_exams)} examination(s)")

            if seat_count > 0:

                reasons.append(f"{seat_count} allocated examination seat(s)")

            if user_count > 0:

                reasons.append(f"{user_count} active portal user account(s)")

            blocking_reason = f"Safety Block: {total_students} student(s) are actively referenced by " + ", and ".join(reasons) + ". To preserve integrity, safe deletion cannot proceed while these examination records exist."



        # Query student details with per-student dependency counts

        cur.execute(f"""

            SELECT s.student_id, s.hall_ticket_no, s.name, s.section, s.department,

                   COUNT(DISTINCT er.registration_id) as reg_count,

                   COUNT(DISTINCT sa.allocation_id) as seat_count

            FROM students s

            LEFT JOIN exam_registrations er ON s.student_id = er.student_id

            LEFT JOIN seat_allocations sa ON s.student_id = sa.student_id

            WHERE {where_str}

            GROUP BY s.student_id, s.hall_ticket_no, s.name, s.section, s.department

            ORDER BY s.hall_ticket_no

        """, tuple(params))

        all_students_deps = cur.fetchall()



        safe_students = []

        blocked_students = []

        for st in all_students_deps:

            if st["reg_count"] > 0 or st["seat_count"] > 0:

                reasons_list = []

                if st["reg_count"] > 0:

                    reasons_list.append(f"{st['reg_count']} exam registration(s)")

                if st["seat_count"] > 0:

                    reasons_list.append(f"{st['seat_count']} allocated seat(s)")

                st["blocking_reason"] = ", ".join(reasons_list)

                blocked_students.append(st)

            else:

                safe_students.append(st)



        return jsonify({

            "student_count": total_students,

            "students_preview": preview,

            "safe_count": len(safe_students),

            "blocked_count": len(blocked_students),

            "safe_students": safe_students,

            "blocked_students": blocked_students,

            "exam_registrations_count": reg_count,

            "seat_allocations_count": seat_count,

            "user_accounts_count": user_count,

            "referenced_exams": ref_exams,

            "can_safe_delete": can_safe_delete,

            "blocking_reason": blocking_reason

        }), 200



    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/students/delete", methods=["POST"])

def execute_student_deletion():

    data = request.get_json(silent=True) or {}

    del_type = data.get("type", "section")

    ay = data.get("academic_year", "2026-2027")

    sy = data.get("study_year", 3)

    dept = data.get("department", "CSE")

    sec = data.get("section")

    batch_id = data.get("batch_id")

    force = bool(data.get("force", False))

    deleted_by = data.get("deleted_by", "admin")



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        conn.autocommit = False

        cur = conn.cursor(dictionary=True)



        where_clauses = ["1=1"]

        params = []



        if del_type == "batch" and batch_id:

            where_clauses.append("s.batch_id = %s")

            params.append(int(batch_id))

        elif del_type == "section" and sec:

            where_clauses.append("s.academic_year = %s AND s.study_year = %s AND s.department = %s AND s.section = %s")

            params.extend([ay, int(sy), dept, sec])

        elif del_type == "cohort":

            where_clauses.append("s.academic_year = %s AND s.study_year = %s AND s.department = %s")

            params.extend([ay, int(sy), dept])

            if sec:

                where_clauses.append("s.section = %s")

                params.append(sec)

        elif del_type == "selected" and data.get("student_ids"):

            sids = [int(x) for x in data.get("student_ids") if str(x).isdigit()]

            if not sids:

                conn.rollback()

                return jsonify({"error": "No valid student IDs provided"}), 400

            placeholders = ",".join(["%s"] * len(sids))

            where_clauses.append(f"s.student_id IN ({placeholders})")

            params.extend(sids)

        else:

            conn.rollback()

            return jsonify({"error": "Invalid deletion parameters specified."}), 400



        where_str = " AND ".join(where_clauses)



        cur.execute(f"SELECT student_id FROM students s WHERE {where_str}", tuple(params))

        target_rows = cur.fetchall()

        target_ids = [r["student_id"] for r in target_rows]



        if not target_ids:

            conn.rollback()

            return jsonify({"error": "No students matched the deletion criteria."}), 404



        id_placeholders = ",".join(["%s"] * len(target_ids))

        cur.execute(f"SELECT COUNT(*) as cnt FROM exam_registrations WHERE student_id IN ({id_placeholders})", tuple(target_ids))

        reg_count = cur.fetchone()["cnt"]

        cur.execute(f"SELECT COUNT(*) as cnt FROM seat_allocations WHERE student_id IN ({id_placeholders})", tuple(target_ids))

        seat_count = cur.fetchone()["cnt"]

        cur.execute(f"SELECT COUNT(*) as cnt FROM users WHERE student_id IN ({id_placeholders})", tuple(target_ids))

        user_count = cur.fetchone()["cnt"]



        if (reg_count > 0 or seat_count > 0 or user_count > 0) and not force:

            conn.rollback()

            return jsonify({

                "error": f"Cannot delete {len(target_ids)} students because {reg_count} exam registrations, {seat_count} seat allocations, or {user_count} user accounts depend on them.",

                "requires_force": True

            }), 400



        if force:

            if seat_count > 0:

                cur.execute(f"DELETE FROM seat_allocations WHERE student_id IN ({id_placeholders})", tuple(target_ids))

            if reg_count > 0:

                cur.execute(f"DELETE FROM exam_registrations WHERE student_id IN ({id_placeholders})", tuple(target_ids))

            if user_count > 0:

                cur.execute(f"DELETE FROM users WHERE student_id IN ({id_placeholders})", tuple(target_ids))

            cur.execute(f"DELETE FROM student_course_registrations WHERE student_id IN ({id_placeholders})", tuple(target_ids))



        cur.execute(f"DELETE FROM students WHERE student_id IN ({id_placeholders})", tuple(target_ids))

        deleted_count = cur.rowcount



        if del_type == "batch" and batch_id:

            cur.execute("""

                UPDATE student_import_batches

                SET import_status = 'deleted', deleted_at = NOW(), deleted_by = %s,

                    notes = CONCAT(COALESCE(notes, ''), ' [Deleted on ', NOW(), ' by ', %s, ']')

                WHERE batch_id = %s

            """, (deleted_by, deleted_by, int(batch_id)))

        else:

            cur.execute("""

                UPDATE student_import_batches sib

                SET sib.import_status = 'deleted', sib.deleted_at = NOW(), sib.deleted_by = %s

                WHERE sib.batch_id NOT IN (SELECT DISTINCT batch_id FROM students WHERE batch_id IS NOT NULL)

                  AND sib.import_status <> 'deleted'

            """, (deleted_by,))



        try:

            cur.execute("""

                INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                VALUES (%s, %s, %s, %s, %s)

            """, ("BULK_DELETE", "student", str(deleted_count), f"Bulk deleted {deleted_count} student records (IDs: {target_ids})", deleted_by))

        except Exception:

            pass



        conn.commit()

        return jsonify({

            "success": True,

            "deleted_count": deleted_count,

            "message": f"Successfully deleted {deleted_count} student records without cascading to unrelated data."

        }), 200



    except Exception as e:

        if conn: conn.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/subjects/preview", methods=["POST"])

def preview_subject_upload():

    if "file" not in request.files:

        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]

    if not file or not file.filename:

        return jsonify({"error": "Empty filename"}), 400



    ay = request.form.get("academic_year", "2026-2027")

    sy = request.form.get("study_year", 3)

    sem = request.form.get("semester", "Semester 5")

    dept = request.form.get("department", "CSE")



    try:

        sy = int(sy)

    except Exception:

        sy = 3



    from file_parser import parse_subject_file

    parsed = parse_subject_file(file, file.filename, default_academic_year=ay, default_study_year=sy, default_semester=sem, default_dept=dept)



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        cur = conn.cursor(dictionary=True)

        cur.execute("SELECT subject_code FROM subjects")

        existing_codes = set(r["subject_code"].upper() for r in cur.fetchall())



        db_dup_count = 0

        for s in parsed["subjects"]:

            if s["subject_code"].upper() in existing_codes:

                s["exists_in_db"] = True

                db_dup_count += 1



        parsed["db_duplicate_count"] = db_dup_count

        return jsonify(parsed), 200

    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/subjects/bulk-import", methods=["POST"])

def bulk_import_subjects():

    data = request.get_json(silent=True) or {}

    subject_list = data.get("subjects", [])

    if not subject_list:

        return jsonify({"error": "No subjects provided for import"}), 400



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        cur = conn.cursor(dictionary=True)



        imported_count = 0

        updated_count = 0



        for s in subject_list:

            code = str(s.get("subject_code", "")).strip().upper()

            name = str(s.get("subject_name", "")).strip()

            dept = str(s.get("department", "CSE")).strip().upper()

            ay = str(s.get("academic_year", "2026-2027")).strip()

            sy = s.get("study_year", 3)

            sem = str(s.get("semester", "Semester 5")).strip()

            cat = str(s.get("category", "Core")).strip()



            if not code or not name:

                continue



            try:

                sy = int(sy)

            except Exception:

                sy = 3



            cur.execute("SELECT subject_id FROM subjects WHERE subject_code = %s", (code,))

            existing = cur.fetchone()



            course_type = "Laboratory" if cat == "Laboratory" else "Theory"



            if existing:

                cur.execute("""

                    UPDATE subjects

                    SET subject_name = %s, department = %s, academic_year = %s,

                        study_year = %s, semester = %s, category = %s, course_type = %s, is_active = 1

                    WHERE subject_id = %s

                """, (name, dept, ay, sy, sem, cat, course_type, existing["subject_id"]))

                updated_count += 1

            else:

                cur.execute("""

                    INSERT INTO subjects (subject_code, subject_name, department, academic_year, study_year, semester, category, course_type, is_active)

                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 1)

                """, (code, name, dept, ay, sy, sem, cat, course_type))

                imported_count += 1



        # Record into student_import_batches for upload history auditing

        try:

            from datetime import datetime

            batch_code = f"SUBJ-BATCH-{datetime.now().strftime('%Y%m%d%H%M%S')}"

            cur.execute("""

                INSERT INTO student_import_batches (

                    batch_code, batch_type, filename, academic_year, study_year, semester, department, section,

                    uploaded_by, total_records, accepted_records, rejected_records, import_status, notes

                ) VALUES (%s, 'subject_catalogue', %s, %s, %s, %s, 'CSE', 'ALL', 'admin', %s, %s, 0, 'completed', %s)

            """, (

                batch_code, data.get("filename", "Subjects_Import.xlsx"),

                data.get("academic_year", "2026-2027"), int(data.get("study_year") or 3),

                data.get("semester", "Semester 5"), len(subject_list), imported_count + updated_count,

                f"Subject catalog import ({imported_count} new, {updated_count} updated)"

            ))

            cur.execute("""

                INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                VALUES ('IMPORT_SUBJECTS', 'subject_catalogue', %s, %s, 'admin')

            """, (batch_code, f"Imported {imported_count} new and updated {updated_count} subjects"))

        except Exception as e_hist:

            print("Notice: history recording for subjects:", e_hist)



        conn.commit()

        return jsonify({

            "success": True,

            "imported_count": imported_count,

            "updated_count": updated_count,

            "total_processed": imported_count + updated_count,

            "message": f"Successfully processed {imported_count + updated_count} subject(s) ({imported_count} new, {updated_count} updated)."

        }), 200

    except Exception as e:

        if conn: conn.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/students/cohort-sections", methods=["GET"])

def get_cohort_sections():

    ay = request.args.get("academic_year", "2026-2027")

    sy = request.args.get("study_year", 3)

    dept = request.args.get("department", "CSE")



    try:

        sy = int(sy)

    except Exception:

        sy = 3



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        cur = conn.cursor(dictionary=True)

        cur.execute("""

            SELECT section, COUNT(*) as student_count

            FROM students

            WHERE academic_year = %s AND (study_year = %s OR year = %s) AND (department = %s OR branch = %s) AND is_active = 1

            GROUP BY section

            ORDER BY section ASC

        """, (ay, sy, sy, dept, dept))

        rows = cur.fetchall()



        # Fallback to archived historical roster if viewing past academic year

        if not rows and ay:

            cur.execute("""

                SELECT section, COUNT(*) as student_count

                FROM student_roster_history

                WHERE academic_year = %s AND study_year = %s AND department = %s

                GROUP BY section

                ORDER BY section ASC

            """, (ay, sy, dept))

            rows = cur.fetchall()



        total = sum(r["student_count"] for r in rows)

        sections = [

            {

                "section": r["section"],

                "student_count": r["student_count"],

                "status": "Uploaded" if r["student_count"] > 0 else "Empty"

            }

            for r in rows

        ]

        return jsonify({"sections": sections, "total_students": total}), 200

    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/students/preview-section", methods=["POST"])

def preview_section_roster():

    if "file" not in request.files:

        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]

    if not file or not file.filename:

        return jsonify({"error": "Empty filename"}), 400



    sec = request.form.get("section", "A").strip().upper()

    ay = request.form.get("academic_year", "2026-2027")

    sy = request.form.get("study_year", 3)

    sem = request.form.get("semester", "Semester 5")

    dept = request.form.get("department", "CSE")



    try:

        sy = int(sy)

    except Exception:

        sy = 3



    sheet_name = request.form.get("sheet_name")

    ht_col = request.form.get("ht_col")

    name_col = request.form.get("name_col")

    sec_col = request.form.get("sec_col")



    from file_parser import parse_section_student_file

    parsed = parse_section_student_file(

        file, file.filename, target_section=sec, default_dept=dept, default_ay=ay, default_year=sy, default_sem=sem,

        selected_sheet=sheet_name, ht_col=ht_col, name_col=name_col, sec_col=sec_col

    )



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        cur = conn.cursor(dictionary=True)

        cur.execute("SELECT hall_ticket_no FROM students")

        existing_hts = set(r["hall_ticket_no"].upper() for r in cur.fetchall())



        db_dup = 0

        for s in parsed["students"]:

            if s["hall_ticket_no"].upper() in existing_hts:

                s["exists_in_db"] = True

                db_dup += 1



        parsed["db_duplicate_count"] = db_dup

        return jsonify(parsed), 200

    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/students/import-section", methods=["POST"])

def import_section_roster():

    data = request.get_json(silent=True) or {}

    students = data.get("students", [])

    sec = str(data.get("section", "A")).strip().upper()

    ay = str(data.get("academic_year", "2026-2027")).strip()

    sy = data.get("study_year", 3)

    sem = str(data.get("semester", "Semester 5")).strip()

    dept = str(data.get("department", "CSE")).strip().upper()

    filename = data.get("filename", f"Section_{sec}_Roster.xlsx")

    uploaded_by = data.get("uploaded_by", "admin")



    if not students:

        return jsonify({"error": "No students provided for import"}), 400



    try:

        sy = int(sy)

    except Exception:

        sy = 3



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        conn.autocommit = False

        cur = conn.cursor(dictionary=True)



        batch_code = f"BATCH-{ay}-S{sy}-{sec}-{datetime.now().strftime('%Y%m%d%H%M%S')}"

        cur.execute("""

            INSERT INTO student_import_batches (

                batch_code, filename, academic_year, study_year, semester, department, section,

                uploaded_by, total_records, accepted_records, rejected_records, import_status, notes

            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'completed', %s)

        """, (

            batch_code, filename, ay, sy, sem, dept, sec,

            uploaded_by, len(students), len(students), 0,

            f"Section {sec} roster upload ({len(students)} students)"

        ))

        batch_id = cur.lastrowid



        imported_count = 0

        for s in students:

            ht = str(s.get("hall_ticket_no", "")).strip().upper()

            name = str(s.get("name", "")).strip()

            if not ht or not name:

                continue



            cur.execute("""

                INSERT INTO students (

                    hall_ticket_no, name, department, branch, study_year, semester,

                    section, academic_year, admission_batch, batch_id, is_active

                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, '2024-2028', %s, 1)

                ON DUPLICATE KEY UPDATE

                    name = VALUES(name),

                    section = VALUES(section),

                    academic_year = VALUES(academic_year),

                    study_year = VALUES(study_year),

                    semester = VALUES(semester),

                    batch_id = VALUES(batch_id),

                    is_active = 1

            """, (ht, name, dept, dept, sy, sem, sec, ay, batch_id))

            imported_count += 1



        cur.execute("UPDATE student_import_batches SET accepted_records = %s WHERE batch_id = %s", (imported_count, batch_id))

        conn.commit()



        return jsonify({

            "success": True,

            "batch_id": batch_id,

            "batch_code": batch_code,

            "imported_count": imported_count,

            "section": sec,

            "message": f"Successfully imported {imported_count} students into Section {sec} (Batch: {batch_code})."

        }), 201



    except Exception as e:

        if conn: conn.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





# =========================================================================

# CONTROLLED STUDENT PROMOTION APIS (ACADEMIC YEAR PROGRESSION)

# =========================================================================



@admin_bp.route("/students/promote-preview", methods=["POST"])

def preview_student_promotion():

    data = request.get_json(silent=True) or {}

    from_ay = str(data.get("from_academic_year", "2026-2027")).strip()

    to_ay = str(data.get("to_academic_year", "2027-2028")).strip()

    from_sy = data.get("from_study_year", 2)

    sec = str(data.get("section", "ALL")).strip().upper()

    dept = str(data.get("department", "CSE")).strip().upper()



    try:

        from_sy = int(from_sy)

    except Exception:

        from_sy = 2



    is_graduation = (from_sy >= 4)

    to_sy = 4 if is_graduation else from_sy + 1



    STUDY_YEAR_NAMES = {1: "1st Year", 2: "2nd Year", 3: "3rd Year", 4: "4th Year"}

    SEMESTER_PAIRS = {

        1: ["Semester 1", "Semester 2"],

        2: ["Semester 3", "Semester 4"],

        3: ["Semester 5", "Semester 6"],

        4: ["Semester 7", "Semester 8"],

    }



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        cur = conn.cursor(dictionary=True)



        where = ["academic_year = %s", "(study_year = %s OR year = %s)", "(department = %s OR branch = %s)", "is_active = 1"]

        params = [from_ay, from_sy, from_sy, dept, dept]

        if sec and sec != "ALL":

            where.append("section = %s")

            params.append(sec)



        where_sql = " AND ".join(where)

        cur.execute(f"""

            SELECT student_id, hall_ticket_no, name, section, department

            FROM students

            WHERE {where_sql}

            ORDER BY section, hall_ticket_no

        """, tuple(params))

        eligible_students = cur.fetchall()



        # Check existing students in target cohort to avoid conflicts

        existing_target_count = 0

        if not is_graduation and eligible_students:

            cur.execute(f"""

                SELECT COUNT(*) as cnt FROM students

                WHERE academic_year = %s AND (study_year = %s OR year = %s) AND (department = %s OR branch = %s) AND is_active = 1

            """, (to_ay, to_sy, to_sy, dept, dept))

            existing_target_count = cur.fetchone()["cnt"]



        return jsonify({

            "from_academic_year": from_ay,

            "to_academic_year": to_ay,

            "from_study_year": from_sy,

            "to_study_year": to_sy,

            "from_study_year_name": STUDY_YEAR_NAMES.get(from_sy, f"{from_sy}th Year"),

            "to_study_year_name": "Graduated / Alumni" if is_graduation else STUDY_YEAR_NAMES.get(to_sy, f"{to_sy}th Year"),

            "from_semesters": SEMESTER_PAIRS.get(from_sy, []),

            "to_semesters": [] if is_graduation else SEMESTER_PAIRS.get(to_sy, []),

            "section": sec,

            "department": dept,

            "eligible_count": len(eligible_students),

            "sample_students": eligible_students[:15],

            "is_graduation": is_graduation,

            "existing_target_count": existing_target_count,

            "can_promote": len(eligible_students) > 0,

            "summary_message": (

                f"Ready to promote {len(eligible_students)} student(s) from {STUDY_YEAR_NAMES.get(from_sy)} ({from_ay}) "

                f"to {('Graduated / Alumni' if is_graduation else STUDY_YEAR_NAMES.get(to_sy))} ({to_ay}). "

                f"Historical examination records and seat allocations will be 100% preserved."

            )

        }), 200

    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/students/promote", methods=["POST"])

def execute_student_promotion():

    data = request.get_json(silent=True) or {}

    from_ay = str(data.get("from_academic_year", "2026-2027")).strip()

    to_ay = str(data.get("to_academic_year", "2027-2028")).strip()

    from_sy = data.get("from_study_year", 2)

    sec = str(data.get("section", "ALL")).strip().upper()

    dept = str(data.get("department", "CSE")).strip().upper()

    promoted_by = str(data.get("promoted_by", "admin")).strip()

    notes = str(data.get("notes", "")).strip()



    try:

        from_sy = int(from_sy)

    except Exception:

        from_sy = 2



    is_graduation = (from_sy >= 4)

    to_sy = 4 if is_graduation else from_sy + 1



    STUDY_YEAR_NAMES = {1: "1st Year", 2: "2nd Year", 3: "3rd Year", 4: "4th Year"}

    SEMESTER_PAIRS = {

        1: ["Semester 1", "Semester 2"],

        2: ["Semester 3", "Semester 4"],

        3: ["Semester 5", "Semester 6"],

        4: ["Semester 7", "Semester 8"],

    }

    to_sem_default = "Graduated" if is_graduation else SEMESTER_PAIRS.get(to_sy, ["Semester 1"])[0]



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        conn.autocommit = False

        cur = conn.cursor(dictionary=True)



        # 1. Fetch all eligible students to be promoted

        where = ["academic_year = %s", "(study_year = %s OR year = %s)", "(department = %s OR branch = %s)", "is_active = 1"]

        params = [from_ay, from_sy, from_sy, dept, dept]

        if sec and sec != "ALL":

            where.append("section = %s")

            params.append(sec)



        where_sql = " AND ".join(where)

        cur.execute(f"""

            SELECT student_id, hall_ticket_no, name, department, academic_year, study_year, semester, section

            FROM students

            WHERE {where_sql}

        """, tuple(params))

        students_to_promote = cur.fetchall()



        if not students_to_promote:

            conn.rollback()

            return jsonify({"error": f"No active students found in {STUDY_YEAR_NAMES.get(from_sy)} ({from_ay}) matching section '{sec}'."}), 404



        # 2. Archive historical state of every student into student_roster_history

        # This completely guarantees that historical records, previous AY allocations, and past rosters remain intact!

        hist_rows = [

            (

                s["student_id"], s["hall_ticket_no"], s["name"], s["department"],

                s["academic_year"], s["study_year"], s["semester"] or "Semester 1", s["section"] or "A",

                to_sy if not is_graduation else 4, to_ay, promoted_by,

                f"Promoted from {STUDY_YEAR_NAMES.get(from_sy)} to {'Graduated' if is_graduation else STUDY_YEAR_NAMES.get(to_sy)}"

            )

            for s in students_to_promote

        ]

        cur.executemany("""

            INSERT INTO student_roster_history (

                student_id, hall_ticket_no, name, department,

                academic_year, study_year, semester, section,

                promoted_to_year, promoted_to_ay, promoted_by, notes

            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)

        """, hist_rows)



        # 3. Update master students records

        student_ids = [s["student_id"] for s in students_to_promote]

        id_placeholders = ",".join(["%s"] * len(student_ids))



        if is_graduation:

            cur.execute(f"""

                UPDATE students

                SET is_active = 0, semester = 'Graduated'

                WHERE student_id IN ({id_placeholders})

            """, tuple(student_ids))

        else:

            cur.execute(f"""

                UPDATE students

                SET study_year = %s,

                    year = %s,

                    academic_year = %s,

                    semester = %s

                WHERE student_id IN ({id_placeholders})

            """, tuple([to_sy, to_sy, to_ay, to_sem_default] + student_ids))



        # 4. Insert into student_promotions table

        promo_note = notes or f"Promoted {len(student_ids)} students from {STUDY_YEAR_NAMES.get(from_sy)} ({from_ay}) to {('Graduated' if is_graduation else STUDY_YEAR_NAMES.get(to_sy))} ({to_ay}) Section {sec}"

        cur.execute("""

            INSERT INTO student_promotions (

                from_academic_year, to_academic_year, from_study_year, to_study_year,

                department, section, promoted_count, promoted_by, notes

            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)

        """, (from_ay, to_ay, from_sy, to_sy, dept, sec, len(student_ids), promoted_by, promo_note))

        promo_id = cur.lastrowid



        # 5. Insert audit log

        cur.execute("""

            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

            VALUES (%s, %s, %s, %s, %s)

        """, (

            "STUDENT_PROMOTION", "students", promo_id,

            f"Successfully promoted {len(student_ids)} students from {STUDY_YEAR_NAMES.get(from_sy)} ({from_ay}) to {('Graduated' if is_graduation else STUDY_YEAR_NAMES.get(to_sy))} ({to_ay}) Section {sec}.",

            promoted_by

        ))



        # 6. Ensure target academic year exists in academic_years

        cur.execute("SELECT academic_year_id FROM academic_years WHERE year_code = %s", (to_ay,))

        if not cur.fetchone():

            cur.execute("""

                INSERT INTO academic_years (year_code, display_name, is_current, is_active)

                VALUES (%s, %s, 0, 1)

            """, (to_ay, f"Academic Year {to_ay}"))



        conn.commit()



        return jsonify({

            "success": True,

            "promotion_id": promo_id,

            "promoted_count": len(student_ids),

            "from_academic_year": from_ay,

            "to_academic_year": to_ay,

            "from_study_year": from_sy,

            "to_study_year": to_sy,

            "from_study_year_name": STUDY_YEAR_NAMES.get(from_sy),

            "to_study_year_name": "Graduated / Alumni" if is_graduation else STUDY_YEAR_NAMES.get(to_sy),

            "message": f"Successfully promoted {len(student_ids)} students to {('Graduated / Alumni' if is_graduation else STUDY_YEAR_NAMES.get(to_sy))} for {to_ay}. Historical exam records and previous academic year rosters are fully preserved."

        }), 200



    except Exception as e:

        if conn: conn.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/students/promotions", methods=["GET"])

def get_student_promotions():

    conn = None

    cur = None

    try:

        conn = get_db_connection()

        cur = conn.cursor(dictionary=True)

        cur.execute("""

            SELECT * FROM student_promotions

            ORDER BY promotion_date DESC

            LIMIT 50

        """)

        rows = cur.fetchall()

        for r in rows:

            if r.get("promotion_date"):

                r["promotion_date"] = str(r["promotion_date"])

        return jsonify({"promotions": rows}), 200

    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





# =========================================================================

# UPLOAD HISTORY AUDIT LOG CLEARING APIS

# =========================================================================



@admin_bp.route("/upload-history/clear-check", methods=["POST"])

def check_clear_upload_history():

    data = request.get_json(silent=True) or {}

    scope = data.get("scope", "all")  # 'all', 'student', 'subject', 'academic_year', 'study_year_semester', 'section'

    ay = data.get("academic_year")

    sy = data.get("study_year")

    sem = data.get("semester")

    sec = data.get("section")



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        cur = conn.cursor(dictionary=True)



        query = "SELECT * FROM student_import_batches WHERE (is_cleared = 0 OR is_cleared IS NULL)"

        params = []



        if scope == "student":

            query += " AND (batch_type = 'student_roster' OR batch_type IS NULL)"

        elif scope == "subject":

            query += " AND batch_type = 'subject_catalogue'"

        elif scope == "academic_year" and ay:

            query += " AND academic_year = %s"

            params.append(ay)

        elif scope == "study_year_semester":

            if sy:

                query += " AND study_year = %s"

                params.append(int(sy))

            if sem:

                query += " AND semester = %s"

                params.append(sem)

        elif scope == "section" and sec:

            query += " AND section = %s"

            params.append(sec)



        query += " ORDER BY upload_timestamp DESC"

        cur.execute(query, tuple(params))

        batches = cur.fetchall()



        filenames = list(dict.fromkeys([b["filename"] for b in batches if b.get("filename")]))

        academic_years = list(dict.fromkeys([b["academic_year"] for b in batches if b.get("academic_year")]))

        study_years = list(dict.fromkeys([b["study_year"] for b in batches if b.get("study_year") is not None]))

        semesters = list(dict.fromkeys([b["semester"] for b in batches if b.get("semester")]))

        sections = list(dict.fromkeys([b["section"] for b in batches if b.get("section")]))



        total_student_records = sum([b["accepted_records"] for b in batches if b.get("batch_type") != "subject_catalogue"])



        warning = (

            "CRITICAL DISTINCTION: Clearing upload history only removes the upload audit log records from this history view. "

            "It will NOT delete actual student records, course catalog subjects, examination schedules, or seating allocations. "

            "All underlying academic data will remain 100% intact."

        )



        return jsonify({

            "scope": scope,

            "matching_count": len(batches),

            "total_records_represented": total_student_records,

            "filenames": filenames,

            "academic_years": academic_years,

            "study_years": study_years,

            "semesters": semesters,

            "sections": sections,

            "batches": batches,

            "warning": warning

        }), 200

    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/upload-history/clear", methods=["POST"])

def clear_upload_history():

    from auth_routes import get_authenticated_user

    user = get_authenticated_user() or {}

    user_email = user.get("email", "admin")



    data = request.get_json(silent=True) or {}

    scope = data.get("scope", "all")

    ay = data.get("academic_year")

    sy = data.get("study_year")

    sem = data.get("semester")

    sec = data.get("section")



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        conn.autocommit = False

        cur = conn.cursor(dictionary=True)



        query = "UPDATE student_import_batches SET is_cleared = 1 WHERE (is_cleared = 0 OR is_cleared IS NULL)"

        params = []



        if scope == "student":

            query += " AND (batch_type = 'student_roster' OR batch_type IS NULL)"

        elif scope == "subject":

            query += " AND batch_type = 'subject_catalogue'"

        elif scope == "academic_year" and ay:

            query += " AND academic_year = %s"

            params.append(ay)

        elif scope == "study_year_semester":

            if sy:

                query += " AND study_year = %s"

                params.append(int(sy))

            if sem:

                query += " AND semester = %s"

                params.append(sem)

        elif scope == "section" and sec:

            query += " AND section = %s"

            params.append(sec)



        cur.execute(query, tuple(params))

        cleared_count = cur.rowcount



        cur.execute("""

            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

            VALUES (%s, %s, %s, %s, %s)

        """, (

            "CLEAR_UPLOAD_HISTORY", "student_import_batches", None,

            f"Cleared {cleared_count} upload history log entries (scope: {scope}). Student and subject records preserved.",

            user_email

        ))



        conn.commit()

        return jsonify({

            "success": True,

            "cleared_count": cleared_count,

            "scope": scope,

            "message": f"Successfully cleared {cleared_count} upload history log(s). Student and subject records remain intact."

        }), 200

    except Exception as e:

        if conn: conn.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





# =========================================================================

# EXAMINATION LIFECYCLE, AUTO-COMPLETION, CANCELLATION & RESCHEDULING APIS

# =========================================================================



def sync_examination_statuses(cursor=None, connection=None):

    """

    Date-based status synchronization:

    Automatically transitions any examination whose scheduled calendar date has passed

    (exam_date < current_calendar_date) from 'Scheduled', 'Published', or 'In Progress'

    to 'Completed'. Persists the update in MySQL and records audit logs.

    """

    should_close = False

    if cursor is None:

        try:

            connection = get_db_connection()

            cursor = connection.cursor(dictionary=True)

            should_close = True

        except Exception as e_conn:

            print("Notice: sync_examination_statuses could not connect to DB:", e_conn)

            return



    try:

        from datetime import datetime

        import zoneinfo

        try:

            tz = zoneinfo.ZoneInfo("Asia/Kolkata")

            current_date = datetime.now(tz).date()

        except Exception:

            current_date = datetime.now().date()



        cursor.execute("""

            SELECT exam_id, exam_name, exam_date, status

            FROM exam_sessions

            WHERE exam_date < %s AND status NOT IN ('Completed', 'Cancelled')

        """, (current_date,))

        expired_exams = cursor.fetchall()



        if expired_exams:

            cursor.execute("""

                UPDATE exam_sessions

                SET status = 'Completed', is_published = 1

                WHERE exam_date < %s AND status NOT IN ('Completed', 'Cancelled')

            """, (current_date,))



            for ex in expired_exams:

                cursor.execute("""

                    INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

                    VALUES (%s, %s, %s, %s, %s)

                """, (

                    "AUTO_COMPLETE_EXAM", "exam_session", str(ex["exam_id"]),

                    f"Auto-completed examination #{ex['exam_id']} ('{ex['exam_name']}') as scheduled date {ex['exam_date']} has passed.",

                    "system_scheduler"

                ))



            if connection:

                connection.commit()

            print(f"Date-based status sync: Automatically completed {len(expired_exams)} past examination(s).")

    except Exception as e:

        print("Notice: Error in sync_examination_statuses:", e)

        if connection:

            try:

                connection.rollback()

            except Exception:

                pass

    finally:

        if should_close:

            try:

                cursor.close()

                connection.close()

            except Exception:

                pass





@admin_bp.route("/exams/<int:exam_id>/cancel", methods=["POST"])

def cancel_exam(exam_id):

    from auth_routes import get_authenticated_user

    user = get_authenticated_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401
    if user.get("role") not in ("admin", "exam_admin"):
        return jsonify({"error": "Access denied: Administrative permissions required. Only Admin can cancel examinations."}), 403

    user_email = user.get("email", "admin")



    data = request.get_json(silent=True) or {}

    reason = str(data.get("cancellation_reason") or data.get("reason", "")).strip()

    if not reason:

        return jsonify({"error": "Cancellation reason is required"}), 400



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        conn.autocommit = False

        cur = conn.cursor(dictionary=True)



        cur.execute("SELECT exam_id, exam_name, status FROM exam_sessions WHERE exam_id = %s", (exam_id,))

        exam = cur.fetchone()

        if not exam:

            return jsonify({"error": "Examination not found"}), 404



        if exam["status"] == "Completed":

            return jsonify({"error": "Completed examinations cannot be cancelled. They are preserved for academic history."}), 400



        if exam["status"] == "Cancelled":

            return jsonify({"error": "This examination is already cancelled."}), 400



        from datetime import datetime

        now_dt = datetime.now()



        cur.execute("""

            UPDATE exam_sessions

            SET status = 'Cancelled',

                cancellation_reason = %s,

                cancelled_at = %s,

                cancelled_by = %s,

                is_published = 0

            WHERE exam_id = %s

        """, (reason, now_dt, user_email, exam_id))



        cur.execute("""

            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

            VALUES (%s, %s, %s, %s, %s)

        """, (

            "CANCEL_EXAM", "exam_session", str(exam_id),

            f"Cancelled examination #{exam_id} ('{exam['exam_name']}'). Reason: {reason}",

            user_email

        ))



        conn.commit()

        return jsonify({

            "message": f"Examination #{exam_id} has been cancelled successfully.",

            "exam_id": exam_id,

            "status": "Cancelled",

            "cancellation_reason": reason,

            "cancelled_at": str(now_dt)

        }), 200

    except Exception as e:

        if conn: conn.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/exams/<int:exam_id>/reschedule", methods=["POST"])

def reschedule_exam(exam_id):

    from auth_routes import get_authenticated_user

    user = get_authenticated_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401
    if user.get("role") not in ("admin", "exam_admin"):
        return jsonify({"error": "Access denied: Administrative permissions required. Only Admin can reschedule examinations."}), 403

    user_email = user.get("email", "admin")



    data = request.get_json(silent=True) or {}

    new_exam_date = str(data.get("exam_date", "")).strip()

    new_start_time = str(data.get("start_time", "")).strip()

    new_end_time = str(data.get("end_time", "")).strip()



    if not new_exam_date:

        return jsonify({"error": "New examination date is required"}), 400

    if not new_start_time or not new_end_time:

        return jsonify({"error": "Start time and end time are required"}), 400



    s_mins = parse_time_to_minutes(new_start_time)

    e_mins = parse_time_to_minutes(new_end_time)

    if s_mins is None or e_mins is None:

        return jsonify({"error": "Invalid time format. Please provide valid start and end times (HH:MM)."}), 400

    if e_mins <= s_mins:

        return jsonify({"error": "End time must be strictly after start time"}), 400



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        conn.autocommit = False

        cur = conn.cursor(dictionary=True)



        cur.execute("SELECT * FROM exam_sessions WHERE exam_id = %s", (exam_id,))

        orig_exam = cur.fetchone()

        if not orig_exam:

            return jsonify({"error": "Original examination not found"}), 404



        if orig_exam["status"] != "Cancelled":

            return jsonify({"error": f"Cannot reschedule examination with status '{orig_exam['status']}'. Only Cancelled examinations can be rescheduled."}), 400



        # Conflict check: Check other non-cancelled examinations on the new date

        cur.execute("""

            SELECT exam_id, exam_name, exam_date, session, start_time, end_time, academic_year, study_year, semester, target_branch

            FROM exam_sessions

            WHERE exam_date = %s AND status NOT IN ('Cancelled')

        """, (new_exam_date,))

        other_exams = cur.fetchall()



        new_exam_spec = {

            "exam_date": new_exam_date,

            "start_time": new_start_time,

            "end_time": new_end_time,

            "session": "FN" if s_mins < 780 else "AN"

        }



        for oe in other_exams:

            if check_exam_overlap(new_exam_spec, oe):

                if (oe.get("study_year") == orig_exam.get("study_year") and

                    str(oe.get("semester", "")).lower().replace(" ", "") == str(orig_exam.get("semester", "")).lower().replace(" ", "") and

                    oe.get("academic_year") == orig_exam.get("academic_year")):

                    return jsonify({

                        "error": f"Scheduling Conflict: Study Year {orig_exam['study_year']} ({orig_exam['semester']}) already has an examination '{oe['exam_name']}' scheduled on {new_exam_date} from {str(oe['start_time'])[:5]} to {str(oe['end_time'])[:5]}."

                    }), 400



        # Check hall availability (total halls vs expected students)

        cur.execute("SELECT SUM(capacity) as total_cap FROM halls WHERE is_active = 1")

        total_hall_cap = (cur.fetchone() or {}).get("total_cap") or 0

        exp_students = orig_exam.get("expected_students") or 0

        if total_hall_cap > 0 and exp_students > total_hall_cap:

            return jsonify({

                "error": f"Room Capacity Conflict: Expected candidates ({exp_students}) exceed total active examination hall capacity ({total_hall_cap})."

            }), 400



        # Check faculty availability

        cur.execute("SELECT COUNT(*) as fac_cnt FROM faculty WHERE is_active = 1")

        fac_cnt = (cur.fetchone() or {}).get("fac_cnt") or 0

        if fac_cnt == 0:

            return jsonify({

                "error": "Faculty Availability Conflict: No active faculty members found in the system to invigilate."

            }), 400



        session_val = "FN" if s_mins < 780 else "AN"



        # Create the new Scheduled examination

        cur.execute("""

            INSERT INTO exam_sessions (

                subject_id, exam_name, exam_date, session, start_time, end_time,

                expected_students, academic_year, semester, study_year,

                target_branch, target_sections, exam_type, status, is_published,

                rescheduled_from

            ) VALUES (

                %s, %s, %s, %s, %s, %s,

                %s, %s, %s, %s,

                %s, %s, %s, 'Scheduled', 0,

                %s

            )

        """, (

            orig_exam["subject_id"], orig_exam["exam_name"], new_exam_date, session_val, new_start_time, new_end_time,

            orig_exam["expected_students"], orig_exam["academic_year"], orig_exam["semester"], orig_exam["study_year"],

            orig_exam["target_branch"], orig_exam["target_sections"], orig_exam["exam_type"],

            orig_exam["exam_id"]

        ))

        new_exam_id = cur.lastrowid



        # Update original cancelled exam with rescheduled_to pointer (never overwriting cancelled record)

        cur.execute("UPDATE exam_sessions SET rescheduled_to = %s WHERE exam_id = %s", (new_exam_id, orig_exam["exam_id"]))



        # Synchronize registered cohort students into new exam

        sync_and_get_exam_students(cur, conn, new_exam_id)



        # Seed availability for all existing faculty for this new exam session

        cur.execute("SELECT faculty_id FROM faculty")

        all_fac = cur.fetchall()

        for f in all_fac:

            cur.execute("""

                INSERT INTO faculty_availability (faculty_id, exam_date, session, is_available)

                VALUES (%s, %s, %s, 1)

                ON DUPLICATE KEY UPDATE is_available = 1

            """, (f["faculty_id"], new_exam_date, session_val))



        # Audit log

        cur.execute("""

            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

            VALUES (%s, %s, %s, %s, %s)

        """, (

            "RESCHEDULE_EXAM", "exam_session", str(new_exam_id),

            f"Rescheduled cancelled exam #{orig_exam['exam_id']} ('{orig_exam['exam_name']}') into new exam #{new_exam_id} on {new_exam_date} ({new_start_time} - {new_end_time}).",

            user_email

        ))



        conn.commit()

        return jsonify({

            "message": f"Examination #{orig_exam['exam_id']} successfully rescheduled as new Examination #{new_exam_id} on {new_exam_date}.",

            "new_exam_id": new_exam_id,

            "original_exam_id": orig_exam["exam_id"],

            "exam_date": new_exam_date,

            "start_time": new_start_time,

            "end_time": new_end_time,

            "status": "Scheduled"

        }), 201

    except Exception as e:

        if conn: conn.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





# ============================================================================

# ADMINISTRATOR STAFF ACCOUNT MANAGEMENT (HOD & ADMINISTRATOR)

# ============================================================================

@admin_bp.route("/admin/staff-accounts", methods=["POST"])

def create_staff_account():

    """Authorized administrator control to create HOD or Administrator accounts with institutional email."""

    from auth_routes import get_authenticated_user

    from werkzeug.security import generate_password_hash

    

    admin_user = get_authenticated_user()

    if not admin_user or admin_user.get("role") not in ("exam_admin", "admin"):

        return jsonify({"error": "Only system administrators can create staff accounts."}), 403



    data = request.get_json(silent=True) or {}

    full_name = data.get("full_name", "").strip()

    email = data.get("email", "").strip().lower()

    role = data.get("role", "").strip().lower()

    password = data.get("password", "")



    if not full_name or not email or not password or not role:

        return jsonify({"error": "Full name, email, role, and password are required."}), 400



    if role not in ("hod", "exam_admin"):

        return jsonify({"error": "Allowed staff roles are 'hod' and 'exam_admin'."}), 400



    if "@" not in email or "." not in email.split("@")[-1]:

        return jsonify({"error": "Please provide a valid staff email address."}), 400



    if len(password) < 8:

        return jsonify({"error": "Password must contain at least 8 characters."}), 400



    conn = get_db_connection()

    cur = conn.cursor(dictionary=True)

    try:

        cur.execute("SELECT user_id FROM users WHERE email = %s", (email,))

        if cur.fetchone():

            return jsonify({"error": "An account with this email already exists."}), 409



        password_hash = generate_password_hash(password)

        cur.execute(

            """

            INSERT INTO users (full_name, email, password_hash, role, is_active)

            VALUES (%s, %s, %s, %s, 1)

            """,

            (full_name, email, password_hash, role)

        )

        new_user_id = cur.lastrowid



        # Audit log entry

        cur.execute(

            """

            INSERT INTO audit_logs (action, target_type, target_id, details, performed_by)

            VALUES (%s, %s, %s, %s, %s)

            """,

            (

                "CREATE_STAFF_ACCOUNT",

                "users",

                str(new_user_id),

                f"Created {role.upper()} account for {full_name} ({email})",

                admin_user.get("email", "admin")

            )

        )

        conn.commit()



        return jsonify({

            "message": f"{role.upper()} account created successfully.",

            "user": {

                "user_id": new_user_id,

                "full_name": full_name,

                "email": email,

                "role": role,

                "is_active": 1

            }

        }), 201

    finally:

        cur.close()

        conn.close()





@admin_bp.route("/admin/staff-accounts", methods=["GET"])

def list_staff_accounts():

    """List all institutional staff accounts (Administrators, HODs, and Faculty Invigilators)."""

    from auth_routes import get_authenticated_user

    admin_user = get_authenticated_user()

    if not admin_user or admin_user.get("role") not in ("exam_admin", "admin", "hod"):

        return jsonify({"error": "Unauthorized"}), 403



    conn = get_db_connection()

    cur = conn.cursor(dictionary=True)

    try:

        cur.execute(

            """

            SELECT user_id, full_name, email, role, is_active, created_at, faculty_id

            FROM users

            WHERE role IN ('exam_admin', 'admin', 'hod', 'invigilator')

            ORDER BY user_id DESC

            """

        )

        staff_accounts = cur.fetchall()

        for sa in staff_accounts:

            if sa.get("created_at") and hasattr(sa["created_at"], "isoformat"):

                sa["created_at"] = sa["created_at"].isoformat()

        return jsonify({"staff_accounts": staff_accounts}), 200

    finally:

        cur.close()

        conn.close()



@admin_bp.route("/assign-invigilator", methods=["POST"])

def manual_assign_invigilator():

    """

    Manually assign a single invigilator to an examination hall.

    Strictly enforces subject teaching restriction across (subject_id, academic_year, semester).

    """

    data = request.get_json(silent=True) or {}

    exam_id = data.get("exam_id")

    hall_id = data.get("hall_id")

    faculty_id = data.get("faculty_id")



    if not exam_id or not hall_id or not faculty_id:

        return jsonify({"error": "exam_id, hall_id, and faculty_id are required"}), 400



    connection = None

    cursor = None

    try:

        connection = get_db_connection()

        cursor = connection.cursor(dictionary=True)



        cursor.execute("""

            SELECT es.exam_id, es.exam_name, es.subject_id, es.exam_date, es.session,

                   es.start_time, es.end_time, es.academic_year, es.semester,

                   s.subject_code, s.subject_name

            FROM exam_sessions es

            JOIN subjects s ON es.subject_id = s.subject_id

            WHERE es.exam_id = %s

        """, (exam_id,))

        exam = cursor.fetchone()

        if not exam:

            return jsonify({"error": "Exam session not found"}), 404



        cursor.execute("SELECT faculty_id, faculty_name, department, is_active FROM faculty WHERE faculty_id = %s", (faculty_id,))

        fac = cursor.fetchone()

        if not fac:

            return jsonify({"error": "Faculty member not found"}), 404

        if fac.get("is_active") == 0:

            return jsonify({"error": f"Faculty member {fac['faculty_name']} is currently inactive."}), 400



        # Enforce Subject Teaching Restriction:

        exam_ay = (exam.get("academic_year") or "").strip()

        exam_sem = (exam.get("semester") or "").strip()

        exam_sem_num = ''.join(c for c in exam_sem if c.isdigit())

        cursor.execute("""

            SELECT 1 FROM faculty_subjects fs

            JOIN subjects s ON fs.subject_id = s.subject_id

            WHERE fs.faculty_id = %s

              AND (fs.subject_id = %s OR UPPER(TRIM(s.subject_code)) = UPPER(TRIM(%s)))

              AND (%s = '' OR fs.academic_year IS NULL OR TRIM(fs.academic_year) = %s)

              AND (%s = '' OR fs.semester IS NULL OR TRIM(fs.semester) = %s OR REGEXP_REPLACE(fs.semester, '[^0-9]', '') = %s)

        """, (faculty_id, exam["subject_id"], exam["subject_code"], exam_ay, exam_ay, exam_sem_num, exam_sem, exam_sem_num))

        if cursor.fetchone():

            return jsonify({

                "error": f"Subject Teaching Restriction: {fac['faculty_name']} teaches {exam['subject_code']} ({exam['subject_name']}) in {exam_ay} {exam_sem} and cannot invigilate this examination."

            }), 400



        cursor.execute("""

            SELECT assignment_id FROM invigilator_assignments

            WHERE exam_id = %s AND hall_id = %s

        """, (exam_id, hall_id))

        existing_hall_assign = cursor.fetchone()

        if existing_hall_assign:

            cursor.execute("""

                UPDATE invigilator_assignments

                SET faculty_id = %s, status = 'pending', assigned_at = NOW()

                WHERE assignment_id = %s

            """, (faculty_id, existing_hall_assign["assignment_id"]))

            asg_id = existing_hall_assign["assignment_id"]

        else:

            cursor.execute("""

                INSERT INTO invigilator_assignments (faculty_id, exam_id, hall_id, status)

                VALUES (%s, %s, %s, 'pending')

            """, (faculty_id, exam_id, hall_id))

            asg_id = cursor.lastrowid



        connection.commit()

        return jsonify({

            "success": True,

            "message": f"Successfully assigned {fac['faculty_name']} to invigilate {exam['exam_name']}.",

            "assignment_id": asg_id

        }), 200

    except Exception as e:

        if connection and connection.is_connected(): connection.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cursor: cursor.close()

        if connection and connection.is_connected(): connection.close()



@admin_bp.route("/exams/<int:exam_id>/halls", methods=["GET"])

def get_exam_halls(exam_id):

    """

    Retrieve configured examination halls for a specific examination,

    including available active halls, current selection status,

    eligible student count, total capacity, and validation indicators.

    """

    conn = None

    cur = None

    try:

        conn = get_db_connection()

        cur = conn.cursor(dictionary=True)



        # 1. Fetch examination session details

        cur.execute("""

            SELECT exam_id, exam_name, exam_date, session, start_time, end_time,

                   expected_students, academic_year, study_year, semester, target_branch

            FROM exam_sessions

            WHERE exam_id = %s

        """, (exam_id,))

        exam = cur.fetchone()

        if not exam:

            return jsonify({"error": "Examination session not found"}), 404



        # 2. Get eligible students directly from database

        eligible_students, _ = sync_and_get_exam_students(cur, conn, exam_id)

        eligible_count = len(eligible_students)

        if eligible_count == 0 and exam.get("expected_students"):

            eligible_count = int(exam["expected_students"])



        # 3. Check overlapping examinations for room conflicts

        cur.execute("""

            SELECT exam_id, exam_name, exam_date, session, start_time, end_time

            FROM exam_sessions

            WHERE exam_date = %s AND exam_id != %s

        """, (exam["exam_date"], exam_id))

        other_exams = cur.fetchall()

        conflicting_exam_ids = [oe["exam_id"] for oe in other_exams if check_exam_overlap(exam, oe)]



        booked_hall_map = {}

        if conflicting_exam_ids:

            ph = ",".join(["%s"] * len(conflicting_exam_ids))

            cur.execute(f"""

                SELECT DISTINCT s.hall_id, es.exam_name, es.session

                FROM seat_allocations sa

                JOIN seats s ON sa.seat_id = s.seat_id

                JOIN exam_sessions es ON sa.exam_id = es.exam_id

                WHERE sa.exam_id IN ({ph})

            """, tuple(conflicting_exam_ids))

            for br in cur.fetchall():

                booked_hall_map[br["hall_id"]] = f"Occupied by '{br['exam_name']}' ({br['session']})"



        # 4. Retrieve saved configured halls from exam_halls

        cur.execute("SELECT hall_id FROM exam_halls WHERE exam_id = %s", (exam_id,))

        saved_hall_ids = {r["hall_id"] for r in cur.fetchall()}



        # 5. Retrieve currently allocated halls (if already allocated)

        cur.execute("""

            SELECT DISTINCT s.hall_id

            FROM seat_allocations sa

            JOIN seats s ON sa.seat_id = s.seat_id

            WHERE sa.exam_id = %s

        """, (exam_id,))

        allocated_hall_ids = {r["hall_id"] for r in cur.fetchall()}



        # If exam_halls has no entries yet but seat allocations exist, use allocated halls

        if not saved_hall_ids and allocated_hall_ids:

            saved_hall_ids = allocated_hall_ids



        # 6. Fetch all active halls

        cur.execute("""

            SELECT hall_id, hall_name, room_no, rows_count, columns_count, capacity, is_active

            FROM halls

            WHERE is_active = 1 OR hall_id IN (

                SELECT hall_id FROM exam_halls WHERE exam_id = %s

            )

            ORDER BY capacity DESC, hall_name ASC

        """, (exam_id,))

        all_halls = cur.fetchall()



        halls_list = []

        total_selected_capacity = 0

        selected_ids_list = []



        for h in all_halls:

            h_id = h["hall_id"]

            is_active = bool(h["is_active"])

            conflict = booked_hall_map.get(h_id)

            is_selected = h_id in saved_hall_ids

            is_avail = is_active and (conflict is None)



            if is_selected:

                total_selected_capacity += h["capacity"]

                selected_ids_list.append(h_id)



            halls_list.append({

                "hall_id": h_id,

                "hall_name": h["hall_name"],

                "room_no": h["room_no"] or h["hall_name"],

                "capacity": h["capacity"],

                "rows_count": h.get("rows_count") or 5,

                "columns_count": h.get("columns_count") or 6,

                "is_active": is_active,

                "is_selected": is_selected,

                "is_available": is_avail,

                "conflict_reason": conflict,

                "is_currently_allocated": h_id in allocated_hall_ids,

            })



        is_sufficient = total_selected_capacity >= eligible_count

        diff = total_selected_capacity - eligible_count



        return jsonify({

            "exam_id": exam_id,

            "exam_name": exam.get("exam_name"),

            "exam_date": str(exam.get("exam_date")),

            "session": exam.get("session"),

            "eligible_student_count": eligible_count,

            "selected_halls_count": len(selected_ids_list),

            "total_selected_capacity": total_selected_capacity,

            "is_capacity_sufficient": is_sufficient,

            "capacity_difference": diff,

            "selected_hall_ids": selected_ids_list,

            "halls": halls_list

        }), 200



    except Exception as e:

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()





@admin_bp.route("/exams/<int:exam_id>/halls", methods=["POST"])

def save_exam_halls(exam_id):

    """

    Save the manual examination hall configuration for an examination session.

    Validates capacity against eligible students and checks for room booking conflicts.

    """

    from auth_routes import get_authenticated_user

    auth_user = get_authenticated_user()

    if not auth_user:

        return jsonify({"error": "Authentication required"}), 401

    if auth_user.get("role") not in ("exam_admin", "admin"):
        return jsonify({"error": "Access denied: Administrative permissions required. Only Admin can configure examination halls."}), 403



    data = request.get_json(silent=True) or {}

    hall_ids = data.get("hall_ids")

    if hall_ids is None or not isinstance(hall_ids, list):

        return jsonify({"error": "hall_ids must be a list of integers"}), 400



    conn = None

    cur = None

    try:

        conn = get_db_connection()

        cur = conn.cursor(dictionary=True)



        cur.execute("SELECT * FROM exam_sessions WHERE exam_id = %s", (exam_id,))

        exam = cur.fetchone()

        if not exam:

            return jsonify({"error": "Examination session not found"}), 404



        clean_hall_ids = [int(h) for h in hall_ids if h is not None]



        # Check overlapping exams for conflicts

        if clean_hall_ids:

            cur.execute("""

                SELECT exam_id, exam_name, exam_date, session, start_time, end_time

                FROM exam_sessions

                WHERE exam_date = %s AND exam_id != %s

            """, (exam["exam_date"], exam_id))

            other_exams = cur.fetchall()

            conflicting_exam_ids = [oe["exam_id"] for oe in other_exams if check_exam_overlap(exam, oe)]



            if conflicting_exam_ids:

                ph = ",".join(["%s"] * len(conflicting_exam_ids))

                cur.execute(f"""

                    SELECT DISTINCT s.hall_id, h.hall_name, es.exam_name

                    FROM seat_allocations sa

                    JOIN seats s ON sa.seat_id = s.seat_id

                    JOIN halls h ON s.hall_id = h.hall_id

                    JOIN exam_sessions es ON sa.exam_id = es.exam_id

                    WHERE sa.exam_id IN ({ph})

                """, tuple(conflicting_exam_ids))

                booked_map = {r["hall_id"]: f"'{r['hall_name']}' (booked for '{r['exam_name']}')" for r in cur.fetchall()}

                conflicts = [booked_map[h_id] for h_id in clean_hall_ids if h_id in booked_map]

                if conflicts:

                    return jsonify({

                        "error": f"Room conflict: The following room(s) are already allocated to another overlapping examination on {exam['exam_date']}: {', '.join(conflicts)}."

                    }), 400



        # Replace exam_halls records

        cur.execute("DELETE FROM exam_halls WHERE exam_id = %s", (exam_id,))

        for h_id in clean_hall_ids:

            cur.execute("INSERT INTO exam_halls (exam_id, hall_id) VALUES (%s, %s)", (exam_id, h_id))

        conn.commit()



        # Compute capacity stats

        total_cap = 0

        if clean_hall_ids:

            ph = ",".join(["%s"] * len(clean_hall_ids))

            cur.execute(f"SELECT SUM(capacity) as cap FROM halls WHERE hall_id IN ({ph})", tuple(clean_hall_ids))

            row = cur.fetchone()

            total_cap = int(row["cap"] or 0)



        eligible_students, _ = sync_and_get_exam_students(cur, conn, exam_id)

        eligible_count = len(eligible_students)

        if eligible_count == 0 and exam.get("expected_students"):

            eligible_count = int(exam["expected_students"])



        is_sufficient = total_cap >= eligible_count

        diff = total_cap - eligible_count



        warning = None

        if not is_sufficient:

            warning = f"Selected capacity ({total_cap} seats) is insufficient for {eligible_count} registered candidates (Deficit of {abs(diff)} seats). Please select additional halls before generating seating arrangements."



        return jsonify({

            "success": True,

            "message": f"Successfully configured {len(clean_hall_ids)} examination halls with total capacity of {total_cap} seats.",

            "selected_halls_count": len(clean_hall_ids),

            "total_selected_capacity": total_cap,

            "eligible_student_count": eligible_count,

            "is_capacity_sufficient": is_sufficient,

            "capacity_difference": diff,

            "warning": warning

        }), 200



    except Exception as e:

        if conn and conn.is_connected():

            conn.rollback()

        return jsonify({"error": str(e)}), 500

    finally:

        if cur: cur.close()

        if conn and conn.is_connected(): conn.close()



# ==============================================================================
# HOD READ-ONLY PUBLISHED EXAMINATION MONITORING ENDPOINT
# ==============================================================================
@admin_bp.route("/hod/published-monitoring", methods=["GET"])
def get_hod_published_monitoring():
    """
    Read-only examination monitoring API for Department HOD (and Admin oversight).
    Returns published, in-progress, completed, and cancelled examinations with:
    - Subject details, cohort, schedule, room counts, seated student counts
    - Room-wise seating capacity adherence and seat allocations
    - Assigned invigilators (clearly distinguishing confirmed vs pending)
    - Direct report download endpoints
    Strictly excludes draft / unpublished examinations from HOD view.
    """
    from auth_routes import get_authenticated_user
    auth_user = get_authenticated_user()
    if not auth_user:
        return jsonify({"error": "Authentication required"}), 401
    if auth_user.get("role") not in ("hod", "admin", "exam_admin"):
        return jsonify({"error": "Access denied: HOD or Administrative credentials required."}), 403

    academic_year = request.args.get("academic_year", "").strip()
    study_year = request.args.get("study_year", "").strip()
    semester = request.args.get("semester", "").strip()
    selected_exam_id = request.args.get("exam_id", "").strip()

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)

        # 1. Fetch published/completed/cancelled examinations
        query = """
            SELECT es.exam_id, es.exam_name, es.exam_date, es.session, es.start_time, es.end_time,
                   es.study_year, es.semester, es.academic_year, es.target_branch, es.target_sections,
                   es.exam_type, es.status, es.is_published, es.created_at AS published_at,
                   es.cancellation_reason, es.cancelled_at, es.cancelled_by,
                   es.rescheduled_from, es.rescheduled_to,
                   s.subject_code, s.subject_name,
                   (SELECT COUNT(*) FROM seat_allocations sa WHERE sa.exam_id = es.exam_id) as allocated_count,
                   (SELECT COUNT(*) FROM invigilator_assignments ia WHERE ia.exam_id = es.exam_id) as invig_count
            FROM exam_sessions es
            JOIN subjects s ON es.subject_id = s.subject_id
            WHERE (es.is_published = 1 OR es.status IN ('Published', 'In-Progress', 'In Progress', 'Completed', 'Cancelled'))
        """
        params = []
        if academic_year and academic_year != "ALL":
            query += " AND es.academic_year = %s"
            params.append(academic_year)
        if study_year and study_year != "ALL":
            sy_digits = "".join(filter(str.isdigit, study_year))
            if sy_digits:
                query += " AND es.study_year = %s"
                params.append(int(sy_digits))
        if semester and semester != "ALL":
            query += " AND es.semester = %s"
            params.append(semester)

        query += " ORDER BY es.exam_date DESC, es.session ASC, es.exam_id DESC"
        cur.execute(query, tuple(params))
        all_exams = cur.fetchall()

        published_exams = []
        cancelled_exams = []

        for ex in all_exams:
            ex["exam_date"] = str(ex["exam_date"]) if ex.get("exam_date") else ""
            ex["start_time"] = str(ex["start_time"]) if ex.get("start_time") else ""
            ex["end_time"] = str(ex["end_time"]) if ex.get("end_time") else ""
            if ex.get("cancelled_at"):
                ex["cancelled_at"] = str(ex["cancelled_at"])

            if ex.get("status") == "Cancelled":
                cancelled_exams.append(ex)
            else:
                published_exams.append(ex)

        # 2. Detailed room & invigilator breakdown for selected examination
        target_exam_id = int(selected_exam_id) if selected_exam_id and selected_exam_id.isdigit() else (
            published_exams[0]["exam_id"] if published_exams else None
        )

        selected_exam_details = None
        if target_exam_id:
            from report_generator import get_occupied_halls, get_report_preview_data
            preview_data = get_report_preview_data(target_exam_id)
            if preview_data:
                selected_exam_details = preview_data

        return jsonify({
            "success": True,
            "total_published": len(published_exams),
            "total_cancelled": len(cancelled_exams),
            "published_exams": published_exams,
            "cancelled_exams": cancelled_exams,
            "selected_exam_id": target_exam_id,
            "selected_exam_details": selected_exam_details
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn and conn.is_connected(): conn.close()
