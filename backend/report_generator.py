from io import BytesIO
import zipfile
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape, portrait
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
)
import pypdf
from db import get_db_connection


# Dark blue institutional brand color matching reference documents
NAVY_BLUE = colors.HexColor("#1e40af")
BLACK = colors.HexColor("#000000")
CHARCOAL = colors.HexColor("#0f172a")
BORDER_GREY = colors.HexColor("#64748b")
LIGHT_BG = colors.HexColor("#f8fafc")


def format_exam_date(date_val):
    if not date_val:
        return "________________"
    date_str = str(date_val).strip()
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return dt.strftime("%d-%m-%Y")
    except Exception:
        return date_str


def get_exam_details(cursor, exam_id):
    cursor.execute("""
        SELECT es.exam_id, es.exam_name, es.exam_date, es.session, es.start_time, es.end_time,
               es.study_year, es.semester, es.academic_year, es.target_branch, es.target_sections,
               es.exam_type,
               s.subject_code, s.subject_name
        FROM exam_sessions es
        JOIN subjects s ON es.subject_id = s.subject_id
        WHERE es.exam_id = %s
    """, (exam_id,))
    return cursor.fetchone()


def get_exam_title(exam):
    """
    Returns the dynamic uppercase examination heading based on the actual
    examination record in the database:
    - CLASS TEST 1
    - CLASS TEST 2
    - SESSIONAL 1
    - SESSIONAL 2
    - END SEMESTER EXAMINATIONS
    """
    if not exam:
        return "CLASS TEST 1"

    raw_type = str(exam.get("exam_type") or "").strip().upper()
    raw_name = str(exam.get("exam_name") or "").strip().upper()
    combined = f"{raw_type} {raw_name}"

    if "CLASS TEST 1" in combined or "CLASS TEST - 1" in combined or "CT 1" in combined or "CT-1" in combined or "CT1" in combined:
        return "CLASS TEST 1"
    if "CLASS TEST 2" in combined or "CLASS TEST - 2" in combined or "CT 2" in combined or "CT-2" in combined or "CT2" in combined:
        return "CLASS TEST 2"
    if "SESSIONAL 1" in combined or "SESSIONAL - 1" in combined or "MID 1" in combined or "MID-1" in combined or "MID1" in combined:
        return "SESSIONAL 1"
    if "SESSIONAL 2" in combined or "SESSIONAL - 2" in combined or "MID 2" in combined or "MID-2" in combined or "MID2" in combined:
        return "SESSIONAL 2"
    if "END SEMESTER" in combined or "SEMESTER END" in combined or "REGULAR" in combined:
        return "END SEMESTER EXAMINATIONS"

    if raw_type:
        return raw_type
    if raw_name:
        return raw_name
    return "CLASS TEST 1"


def get_exam_title_slug(exam):
    """
    Returns capitalized underscore-delimited slug for filenames:
    'CLASS TEST 1' -> 'Class_Test_1'
    'CLASS TEST 2' -> 'Class_Test_2'
    'SESSIONAL 1' -> 'Sessional_1'
    'SESSIONAL 2' -> 'Sessional_2'
    'END SEMESTER EXAMINATIONS' -> 'End_Semester_Examinations'
    """
    title = get_exam_title(exam)
    words = [w.capitalize() for w in title.split()]
    return "_".join(words)


def format_room_number(room_val):
    """
    Normalizes room labels to clean room numbers without redundant prefixes.
    e.g. '101' -> '101', 'ROOM 101' -> '101', 'HALL 101' -> '101'
    """
    if not room_val:
        return "—"
    s = str(room_val).strip()
    s_upper = s.upper()
    if s_upper.startswith("ROOM NO:"):
        return s[8:].strip()
    if s_upper.startswith("ROOM NO."):
        return s[8:].strip()
    if s_upper.startswith("ROOM"):
        return s[4:].strip()
    if s_upper.startswith("HALL"):
        return s[4:].strip()
    return s


def get_occupied_halls(cursor, exam_id, hall_id=None):
    sql = """
        SELECT
            COALESCE(h.hall_id, hh.original_hall_id, se.historical_hall_id, 0) AS hall_id,
            COALESCE(h.hall_name, se.hall_name, sa.hall_name, hh.hall_name, 'Hall') AS hall_name,
            COALESCE(h.room_no, se.room_no, sa.room_no, hh.room_no, '') AS room_no,
            COALESCE(h.capacity, hh.capacity, 0) AS capacity,
            COUNT(DISTINCT sa.allocation_id) AS student_count
        FROM seat_allocations sa
        JOIN seats se ON sa.seat_id = se.seat_id
        LEFT JOIN halls h ON se.hall_id = h.hall_id
        LEFT JOIN historical_halls hh ON se.historical_hall_id = hh.historical_hall_id
        WHERE sa.exam_id = %s
    """
    params = [exam_id]
    if hall_id:
        sql += " AND (se.hall_id = %s OR se.historical_hall_id = %s OR hh.original_hall_id = %s)"
        params.extend([hall_id, hall_id, hall_id])
    sql += " GROUP BY hall_id, hall_name, room_no, capacity ORDER BY hall_name ASC"
    cursor.execute(sql, tuple(params))
    return cursor.fetchall()


# ==============================================================================
# PART 2: SEATING ARRANGEMENT – PER ROOM (A4 LANDSCAPE)
# ==============================================================================
def generate_seating_chart_pdf(exam_id, hall_id=None):
    """
    Generates Seating Arrangement PDF strictly matching the reference
    'Examination Seating Chart - Room 304.pdf':
    - Layout: A4 Landscape
    - Header:
        END SEMESTER EXAMINATIONS (Dark blue bold text, centered)
        ROOM NO: [Actual Room Number] (Dark blue bold text, centered)
        SEATING ARRANGEMENT (Dark charcoal bold text, centered)
    - Bench columns: 3 blocks of benches, each bench pair [Seat 1] [Seat 2]
    - Footer:
        Total Seated: [Count]    INVIGILATOR SIGNATURE: ________    DATE: ________
    """
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)

    exam = get_exam_details(cur, exam_id)
    if not exam:
        cur.close()
        conn.close()
        return None

    halls = get_occupied_halls(cur, exam_id, hall_id)
    if not halls:
        cur.close()
        conn.close()
        return None

    date_formatted = format_exam_date(exam["exam_date"])

    pdf_buffer = BytesIO()
    doc = SimpleDocTemplate(
        pdf_buffer,
        pagesize=landscape(A4),
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "SeatingTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        alignment=1,
        textColor=NAVY_BLUE,
        spaceAfter=1,
    )
    room_title_style = ParagraphStyle(
        "SeatingRoomTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=19,
        alignment=1,
        textColor=NAVY_BLUE,
        spaceAfter=2,
    )
    sub_title_style = ParagraphStyle(
        "SeatingSubTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        alignment=1,
        textColor=CHARCOAL,
        spaceAfter=4,
    )

    story = []

    for h_idx, hall in enumerate(halls):
        if h_idx > 0:
            story.append(PageBreak())

        hid = hall["hall_id"]
        room_label = format_room_number(hall.get("room_no") or hall.get("hall_name"))

        # Fetch allocated students in exact allocation order (supporting active and historical halls)
        cur.execute("""
            SELECT st.hall_ticket_no, st.name
            FROM seat_allocations sa
            JOIN seats se ON sa.seat_id = se.seat_id
            JOIN students st ON sa.student_id = st.student_id
            LEFT JOIN historical_halls hh ON se.historical_hall_id = hh.historical_hall_id
            WHERE sa.exam_id = %s
              AND (se.hall_id = %s OR se.historical_hall_id = %s OR hh.original_hall_id = %s OR sa.hall_name = %s OR sa.room_no = %s)
            ORDER BY sa.allocation_id ASC
        """, (exam_id, hid, hid, hid, hall.get("hall_name"), hall.get("room_no")))
        seat_rows = cur.fetchall()
        total_seated = len(seat_rows)

        # Pair allocated students into 2 adjacent seats per bench
        benches = []
        for i in range(0, total_seated, 2):
            s1 = seat_rows[i]["hall_ticket_no"]
            s2 = seat_rows[i + 1]["hall_ticket_no"] if i + 1 < total_seated else ""
            benches.append((s1, s2))

        # Adapt layout automatically based on allocated student count
        num_benches = len(benches)
        rows_per_block = max(1, (num_benches + 2) // 3)

        table_data = []
        for r in range(rows_per_block):
            b1 = benches[r] if r < len(benches) else ("", "")
            b2_idx = r + rows_per_block
            b2 = benches[b2_idx] if b2_idx < len(benches) else ("", "")
            b3_idx = r + 2 * rows_per_block
            b3 = benches[b3_idx] if b3_idx < len(benches) else ("", "")

            row_cells = [
                b1[0], b1[1],  # Block 1 (Col 1 & 2)
                "",            # Aisle 1 Gap
                b2[0], b2[1],  # Block 2 (Col 3 & 4)
                "",            # Aisle 2 Gap
                b3[0], b3[1],  # Block 3 (Col 5 & 6)
            ]
            table_data.append(row_cells)

        # Equal widths for all 6 columns (38mm each) and consistent aisle gaps (10mm each)
        col_widths = [38 * mm, 38 * mm, 10 * mm, 38 * mm, 38 * mm, 10 * mm, 38 * mm, 38 * mm]
        row_height = max(13.5 * mm, min(22 * mm, 115 * mm / rows_per_block))

        grid_table = Table(table_data, colWidths=col_widths, rowHeights=[row_height] * rows_per_block)
        table_style = [
            # Block 1 (Columns 0 & 1)
            ("GRID", (0, 0), (1, -1), 0.75, BLACK),
            # Block 2 (Columns 3 & 4)
            ("GRID", (3, 0), (4, -1), 0.75, BLACK),
            # Block 3 (Columns 6 & 7)
            ("GRID", (6, 0), (7, -1), 0.75, BLACK),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9.5),
            ("TEXTCOLOR", (0, 0), (-1, -1), BLACK),
            ("BACKGROUND", (0, 0), (1, -1), colors.white),
            ("BACKGROUND", (3, 0), (4, -1), colors.white),
            ("BACKGROUND", (6, 0), (7, -1), colors.white),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]
        grid_table.setStyle(TableStyle(table_style))

        # Dynamic Header elements
        exam_title = get_exam_title(exam)
        story.append(Paragraph(exam_title, title_style))
        story.append(Paragraph(f"ROOM NO: {room_label}", room_title_style))
        story.append(Paragraph("SEATING ARRANGEMENT", sub_title_style))
        story.append(Spacer(1, 4 * mm))

        # Main Seating Table
        story.append(grid_table)
        story.append(Spacer(1, 6 * mm))

        # Footer row matching reference:
        # Total Seated: [Count]      INVIGILATOR SIGNATURE: ____________________      DATE: ____________________
        footer_table = Table([
            [
                Paragraph(f"<b>Total Seated: {total_seated}</b>", styles["Normal"]),
                Paragraph("<b>INVIGILATOR SIGNATURE:</b> ____________________", styles["Normal"]),
                Paragraph(f"<b>DATE:</b> ____________________", styles["Normal"]),
            ]
        ], colWidths=[60 * mm, 120 * mm, 68 * mm])
        footer_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TEXTCOLOR", (0, 0), (-1, -1), CHARCOAL),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(footer_table)

    cur.close()
    conn.close()

    doc.build(story)
    pdf_buffer.seek(0)
    return pdf_buffer


# ==============================================================================
# PART 3: STUDENT ATTENDANCE SHEET – PER ROOM (A4 PORTRAIT)
# ==============================================================================
def generate_attendance_sheet_pdf(exam_id, hall_id=None):
    """
    Generates Student Attendance & Signature Sheet PDF strictly matching
    'Examination Attendance Sheet - Room 304.pdf':
    - Layout: A4 Portrait
    - Header:
        END SEMESTER EXAMINATIONS (Dark blue bold text, centered)
        STUDENT ATTENDANCE & SIGNATURE SHEET (Dark charcoal bold text, centered)
    - Metadata row:
        ROOM NO: [Room]   DATE: [Date]   SESSION: FN / AN   TOTAL ALLOTTED: [Count]
    - Side-by-side 2-column table:
        S.NO | ROLL NUMBER | BOOKLET NO. | STUDENT SIGN  |  S.NO | ROLL NUMBER | BOOKLET NO. | STUDENT SIGN
    - Footer Box:
        Total Present: ___   Total Absent: ___   Absentee Roll Nos: ______________
        Invigilator Name: ______   Signature: ______   Date: ______
    """
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)

    exam = get_exam_details(cur, exam_id)
    if not exam:
        cur.close()
        conn.close()
        return None

    halls = get_occupied_halls(cur, exam_id, hall_id)
    if not halls:
        cur.close()
        conn.close()
        return None

    date_formatted = format_exam_date(exam["exam_date"])
    session_label = str(exam["session"] or "FN / AN")
    exam_title = get_exam_title(exam)

    pdf_buffer = BytesIO()
    doc = SimpleDocTemplate(
        pdf_buffer,
        pagesize=portrait(A4),
        rightMargin=12 * mm,
        leftMargin=12 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "AttTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=20,
        alignment=1,
        textColor=NAVY_BLUE,
        spaceAfter=1,
    )
    sub_title_style = ParagraphStyle(
        "AttSubTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        alignment=1,
        textColor=CHARCOAL,
        spaceAfter=3,
    )
    meta_style = ParagraphStyle(
        "AttMeta",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9.5,
        leading=13,
        textColor=CHARCOAL,
    )

    story = []

    for h_idx, hall in enumerate(halls):
        if h_idx > 0:
            story.append(PageBreak())

        hid = hall["hall_id"]
        room_label = hall["room_no"] or hall["hall_name"]

        # Fetch allocated students in alphabetical / roll number order (supporting active and historical halls)
        cur.execute("""
            SELECT st.hall_ticket_no, st.name
            FROM seat_allocations sa
            JOIN seats se ON sa.seat_id = se.seat_id
            JOIN students st ON sa.student_id = st.student_id
            LEFT JOIN historical_halls hh ON se.historical_hall_id = hh.historical_hall_id
            WHERE sa.exam_id = %s
              AND (se.hall_id = %s OR se.historical_hall_id = %s OR hh.original_hall_id = %s OR sa.hall_name = %s OR sa.room_no = %s)
            ORDER BY st.hall_ticket_no ASC
        """, (exam_id, hid, hid, hid, hall.get("hall_name"), hall.get("room_no")))
        students = cur.fetchall()
        total_allotted = len(students)

        # Header elements
        story.append(Paragraph(exam_title, title_style))
        story.append(Paragraph("STUDENT ATTENDANCE &amp; SIGNATURE SHEET", sub_title_style))
        story.append(Spacer(1, 2 * mm))

        # Metadata row exactly like reference:
        meta_table = Table([
            [
                Paragraph(f"<b>ROOM NO:</b> {room_label}", meta_style),
                Paragraph(f"<b>DATE:</b> {date_formatted}", meta_style),
                Paragraph(f"<b>SESSION:</b> {session_label}", meta_style),
                Paragraph(f"<b>TOTAL ALLOTTED:</b> {total_allotted}", meta_style),
            ]
        ], colWidths=[42 * mm, 46 * mm, 46 * mm, 52 * mm])
        meta_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 2 * mm))

        # Side-by-side 2-column table:
        # Left: 1 to half; Right: half+1 to N
        half = (total_allotted + 1) // 2
        col1_students = students[:half]
        col2_students = students[half:]
        max_rows = max(len(col1_students), len(col2_students), 18)

        table_data = [[
            "S.NO", "ROLL NUMBER", "BOOKLET\nNO.", "STUDENT SIGN",
            "S.NO", "ROLL NUMBER", "BOOKLET\nNO.", "STUDENT SIGN"
        ]]

        for i in range(max_rows):
            s1 = col1_students[i] if i < len(col1_students) else None
            s2 = col2_students[i] if i < len(col2_students) else None
            row_vals = [
                str(i + 1) if s1 else "",
                s1["hall_ticket_no"] if s1 else "",
                "", # Blank booklet number for manual entry
                "", # Blank student sign for manual signature
                str(half + i + 1) if s2 else "",
                s2["hall_ticket_no"] if s2 else "",
                "", # Blank booklet number
                "", # Blank student sign
            ]
            table_data.append(row_vals)

        # Widths: Left table 93mm (11+29+23+30) + Right table 93mm = 186mm
        att_col_widths = [11 * mm, 29 * mm, 23 * mm, 30 * mm, 11 * mm, 29 * mm, 23 * mm, 30 * mm]
        # Calculate dynamic row height to fit comfortably on single page if <= 24 rows
        row_height = 6.2 * mm if max_rows <= 24 else 5.8 * mm

        att_table = Table(
            table_data,
            colWidths=att_col_widths,
            rowHeights=[7.5 * mm] + [row_height] * max_rows,
            repeatRows=1
        )
        att_table.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, BLACK),
            ("BACKGROUND", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 1.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
        ]))
        story.append(att_table)
        story.append(Spacer(1, 4 * mm))

        # Footer Box exactly matching reference:
        footer_data = [
            [
                Paragraph("<b>Total Present:</b> __________", styles["Normal"]),
                Paragraph("<b>Total Absent:</b> __________", styles["Normal"]),
                Paragraph("<b>Absentee Roll Nos:</b> ______________________________", styles["Normal"]),
            ],
            [
                Paragraph("<b>Invigilator Name:</b> ____________________", styles["Normal"]),
                Paragraph("<b>Signature:</b> ____________________", styles["Normal"]),
                Paragraph("<b>Date:</b> ____________________", styles["Normal"]),
            ]
        ]
        footer_box = Table(footer_data, colWidths=[46 * mm, 46 * mm, 94 * mm])
        footer_box.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.75, BLACK),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ]))
        story.append(footer_box)

    cur.close()
    conn.close()

    doc.build(story)
    pdf_buffer.seek(0)
    return pdf_buffer


# ==============================================================================
# PART 4: FACULTY INVIGILATION DUTY ATTENDANCE REGISTER – PER DAY (A4 PORTRAIT)
# ==============================================================================
def generate_daily_duty_register_pdf(exam_date, session=None, exam_id=None):
    """
    Generates Faculty Invigilation Duty Attendance Register PDF
    strictly matching the reference image:
    - Layout: A4 Portrait
    - Dynamic Header:
        OFFICE OF THE CONTROLLER OF EXAMINATIONS (Dark charcoal bold)
        [DYNAMIC EXAM TITLE] (Dark blue bold, large, e.g. CLASS TEST 1, SESSIONAL 1, END SEMESTER EXAMINATIONS)
        FACULTY INVIGILATION DUTY ATTENDANCE REGISTER (Dark charcoal bold)
    - Subheader Box:
        Date of Exam: [ DD / MM / YYYY ]   Day: [ Day ]   Session: FORENOON (09:30 AM - 12:30 PM)
    - Table columns:
        S.NO | FACULTY NAME & DESIGNATION | DEPARTMENT | ROOM NO. | REPORTING TIME | REPORTING SIGN
    - Room numbers in dark blue bold text (e.g. ROOM 101, FLOOR 1 RELIEF)
    """
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)

    date_str = str(exam_date).strip()
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        date_formatted = dt.strftime("%d / %m / %Y")
        day_name = dt.strftime("%A")
    except Exception:
        date_formatted = date_str
        day_name = "Examination Day"

    # Resolve examination title dynamically
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

    exam_title = get_exam_title(exam) if exam else "CLASS TEST 1"

    sql = """
        SELECT
            ia.assignment_id,
            COALESCE(ia.faculty_id, ia.original_faculty_id) AS faculty_id,
            COALESCE(f.faculty_name, ia.faculty_name, 'Invigilator') AS faculty_name,
            COALESCE(f.department, ia.department, 'CSE') AS department,
            COALESCE(h.hall_name, ia.hall_name, hh.hall_name, 'Hall N/A') AS hall_name,
            COALESCE(h.room_no, ia.room_no, hh.room_no, 'N/A') AS room_no,
            es.exam_name,
            es.session,
            es.start_time,
            es.end_time,
            ia.status,
            ia.decline_reason
        FROM invigilator_assignments ia
        LEFT JOIN faculty f ON ia.faculty_id = f.faculty_id
        LEFT JOIN halls h ON ia.hall_id = h.hall_id
        LEFT JOIN historical_halls hh ON ia.historical_hall_id = hh.historical_hall_id
        JOIN exam_sessions es ON ia.exam_id = es.exam_id
        WHERE es.exam_date = %s
    """
    params = [date_str]
    if session:
        sql += " AND es.session = %s"
        params.append(session)
    sql += " ORDER BY es.session ASC, h.hall_name ASC, COALESCE(f.faculty_name, ia.faculty_name) ASC"

    cur.execute(sql, tuple(params))
    duty_rows = cur.fetchall()

    # Also check if any relief invigilators have been configured in MySQL
    # Relief invigilators can be registered in invigilator_assignments with specific hall or notes
    cur.close()
    conn.close()

    session_label = "FORENOON (09:30 AM – 12:30 PM)" if session == "FN" else (
        "AFTERNOON (01:30 PM – 04:30 PM)" if session == "AN" else "ALL SESSIONS"
    )

    pdf_buffer = BytesIO()
    doc = SimpleDocTemplate(
        pdf_buffer,
        pagesize=portrait(A4),
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
    )

    styles = getSampleStyleSheet()
    h1_style = ParagraphStyle(
        "DutyH1",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        alignment=1,
        textColor=CHARCOAL,
        spaceAfter=1,
    )
    h2_style = ParagraphStyle(
        "DutyH2",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=20,
        alignment=1,
        textColor=NAVY_BLUE,
        spaceAfter=2,
    )
    h3_style = ParagraphStyle(
        "DutyH3",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        alignment=1,
        textColor=CHARCOAL,
        spaceAfter=4,
    )
    sub_meta_style = ParagraphStyle(
        "DutyMeta",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        alignment=1,
        textColor=CHARCOAL,
    )

    story = [
        Paragraph("OFFICE OF THE CONTROLLER OF EXAMINATIONS", h1_style),
        Paragraph(exam_title, h2_style),
        Paragraph("FACULTY INVIGILATION DUTY ATTENDANCE REGISTER", h3_style),
        Spacer(1, 2 * mm)
    ]

    # Sub-header box matching reference image:
    # Date of Exam: [ DD / MM / YYYY ]      Day: [ Day ]      Session: FORENOON (09:30 AM - 12:30 PM)
    sub_box_data = [[
        Paragraph(f"<b>Date of Exam:</b> [ {date_formatted} ]", sub_meta_style),
        Paragraph(f"<b>Day:</b> [ {day_name} ]", sub_meta_style),
        Paragraph(f"<b>Session:</b> {session_label}", sub_meta_style),
    ]]
    sub_box = Table(sub_box_data, colWidths=[55 * mm, 45 * mm, 82 * mm])
    sub_box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.75, NAVY_BLUE),
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(sub_box)
    story.append(Spacer(1, 3 * mm))

    table_data = [[
        "S.NO",
        "FACULTY NAME & DESIGNATION",
        "DEPARTMENT",
        "ROOM NO.",
        "REPORTING TIME",
        "REPORTING SIGN"
    ]]

    # De-duplicate rows if any faculty has duplicate records on same hall/session
    seen_keys = set()
    s_idx = 1
    for d in duty_rows:
        key = (d["faculty_id"], d["hall_name"], d["session"])
        if key in seen_keys:
            continue
        seen_keys.add(key)

        r_no = d["room_no"] or d["hall_name"]
        room_label = f"ROOM {r_no}" if not str(r_no).upper().startswith("ROOM") else str(r_no)
        rep_time = "09:00 AM" if d["session"] == "FN" else "01:00 PM"

        fac_display = f"[ {d['faculty_name']} ]"
        table_data.append([
            f"{s_idx:02d}",
            fac_display,
            d["department"] or "CSE",
            room_label,
            rep_time,
            "" # Blank reporting signature cell
        ])
        s_idx += 1

    # If no duties found or fewer than 10, provide sample rows so the register is printable
    if len(table_data) <= 1:
        for idx in range(1, 11):
            table_data.append([
                f"{idx:02d}",
                f"[ Faculty Name {idx} ]",
                "CSE",
                f"ROOM {100 + idx}",
                "09:00 AM",
                ""
            ])

    # Table styling matching reference image:
    # Header: bold black, centered
    # ROOM NO: dark blue text (#1e40af), bold
    duty_col_widths = [12 * mm, 60 * mm, 26 * mm, 28 * mm, 26 * mm, 30 * mm]
    duty_table = Table(table_data, colWidths=duty_col_widths, repeatRows=1)
    
    t_style = [
        ("GRID", (0, 0), (-1, -1), 0.5, BLACK),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("TEXTCOLOR", (3, 1), (3, -1), NAVY_BLUE), # ROOM NO in dark blue
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    duty_table.setStyle(TableStyle(t_style))
    story.append(duty_table)

    doc.build(story)
    pdf_buffer.seek(0)
    return pdf_buffer


# ==============================================================================
# COMBINED PDF: SEATING + ATTENDANCE + FACULTY REGISTER
# ==============================================================================
def generate_combined_reports_pdf(exam_id):
    """
    Merges all reports for an exam into one multi-page PDF:
    1. Seating arrangements for all rooms (A4 Landscape)
    2. Attendance sheets for all rooms (A4 Portrait)
    3. Daily faculty invigilation duty register (A4 Portrait)
    """
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    exam = get_exam_details(cur, exam_id)
    cur.close()
    conn.close()

    if not exam:
        return None

    seating_pdf_bytes = generate_seating_chart_pdf(exam_id)
    attendance_pdf_bytes = generate_attendance_sheet_pdf(exam_id)
    faculty_pdf_bytes = generate_daily_duty_register_pdf(exam["exam_date"], exam["session"], exam_id=exam_id)

    writer = pypdf.PdfWriter()

    if seating_pdf_bytes:
        reader1 = pypdf.PdfReader(seating_pdf_bytes)
        for page in reader1.pages:
            writer.add_page(page)

    if attendance_pdf_bytes:
        reader2 = pypdf.PdfReader(attendance_pdf_bytes)
        for page in reader2.pages:
            writer.add_page(page)

    if faculty_pdf_bytes:
        reader3 = pypdf.PdfReader(faculty_pdf_bytes)
        for page in reader3.pages:
            writer.add_page(page)

    combined_buffer = BytesIO()
    writer.write(combined_buffer)
    combined_buffer.seek(0)
    return combined_buffer


# ==============================================================================
# ZIP ARCHIVE: ROOM-WISE PDFS + DAILY REGISTER + COMBINED PDF
# ==============================================================================
def generate_reports_zip(exam_id):
    """
    Builds a ZIP archive containing:
    - Seating_Arrangement_Room_[room].pdf for each occupied room
    - Attendance_Sheet_Room_[room].pdf for each occupied room
    - Faculty_Invigilation_Attendance_[date].pdf
    - Complete_Examination_Reports.pdf
    """
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)

    exam = get_exam_details(cur, exam_id)
    if not exam:
        cur.close()
        conn.close()
        return None

    halls = get_occupied_halls(cur, exam_id)
    cur.close()
    conn.close()

    slug = get_exam_title_slug(exam)

    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. Individual room-wise seating charts
        for h in halls:
            room_lbl = format_room_number(h["room_no"] or h["hall_name"])
            pdf_bytes = generate_seating_chart_pdf(exam_id, hall_id=h["hall_id"])
            if pdf_bytes:
                fname = f"{slug}_Seating_Room_{room_lbl}.pdf"
                zf.writestr(fname, pdf_bytes.getvalue())

        # 2. Individual room-wise attendance sheets
        for h in halls:
            room_lbl = format_room_number(h["room_no"] or h["hall_name"])
            pdf_bytes = generate_attendance_sheet_pdf(exam_id, hall_id=h["hall_id"])
            if pdf_bytes:
                fname = f"{slug}_Attendance_Room_{room_lbl}.pdf"
                zf.writestr(fname, pdf_bytes.getvalue())

        # 3. Faculty Duty Register
        faculty_pdf = generate_daily_duty_register_pdf(exam["exam_date"], exam["session"], exam_id=exam_id)
        if faculty_pdf:
            fname = f"{slug}_Faculty_Duty_Register.pdf"
            zf.writestr(fname, faculty_pdf.getvalue())

        # 4. Combined PDF
        combined_pdf = generate_combined_reports_pdf(exam_id)
        if combined_pdf:
            zf.writestr(f"{slug}_Complete_Examination_Reports.pdf", combined_pdf.getvalue())

    zip_buffer.seek(0)
    return zip_buffer


# ==============================================================================
# PREVIEW DATA API: STRUCTURED DATA FOR LIVE UI PREVIEW & BROWSER PRINT
# ==============================================================================
def get_report_preview_data(exam_id, hall_id=None):
    """
    Returns structured data for the interactive Reports Preview screen:
    - Examination metadata
    - Occupied halls with seating blocks and student attendance rosters
    - Daily faculty invigilation duty register
    """
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)

    exam = get_exam_details(cur, exam_id)
    if not exam:
        cur.close()
        conn.close()
        return None

    halls = get_occupied_halls(cur, exam_id, hall_id)
    date_formatted = format_exam_date(exam["exam_date"])
    date_str = str(exam["exam_date"])
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        day_name = dt.strftime("%A")
        date_slash = dt.strftime("%d / %m / %Y")
    except Exception:
        day_name = "Examination Day"
        date_slash = date_str

    session_label = "FORENOON (09:30 AM – 12:30 PM)" if exam["session"] == "FN" else (
        "AFTERNOON (01:30 PM – 04:30 PM)" if exam["session"] == "AN" else "ALL SESSIONS"
    )

    halls_data = []
    for hall in halls:
        hid = hall["hall_id"]
        room_label = format_room_number(hall.get("room_no") or hall.get("hall_name"))

        # Fetch allocated students in exact allocation order (supporting active and historical halls)
        cur.execute("""
            SELECT st.hall_ticket_no, st.name, st.section, st.department, sa.allocation_id
            FROM seat_allocations sa
            JOIN seats se ON sa.seat_id = se.seat_id
            JOIN students st ON sa.student_id = st.student_id
            LEFT JOIN historical_halls hh ON se.historical_hall_id = hh.historical_hall_id
            WHERE sa.exam_id = %s
              AND (se.hall_id = %s OR se.historical_hall_id = %s OR hh.original_hall_id = %s OR sa.hall_name = %s OR sa.room_no = %s)
            ORDER BY sa.allocation_id ASC
        """, (exam_id, hid, hid, hid, hall.get("hall_name"), hall.get("room_no")))
        seat_rows = cur.fetchall()

        # Pair allocated students into 2 adjacent seats per bench
        benches = []
        for i in range(0, len(seat_rows), 2):
            s1 = seat_rows[i]["hall_ticket_no"]
            s2 = seat_rows[i + 1]["hall_ticket_no"] if i + 1 < len(seat_rows) else ""
            benches.append((s1, s2))

        num_benches = len(benches)
        rows_per_block = max(1, (num_benches + 2) // 3)

        seating_rows = []
        for r in range(rows_per_block):
            b1 = benches[r] if r < len(benches) else ("", "")
            b2_idx = r + rows_per_block
            b2 = benches[b2_idx] if b2_idx < len(benches) else ("", "")
            b3_idx = r + 2 * rows_per_block
            b3 = benches[b3_idx] if b3_idx < len(benches) else ("", "")

            seating_rows.append({
                "row_no": r + 1,
                "b1_left": b1[0],
                "b1_right": b1[1],
                "b2_left": b2[0],
                "b2_right": b2[1],
                "b3_left": b3[0],
                "b3_right": b3[1],
            })

        # Attendance roster (alphabetical / hall ticket order)
        cur.execute("""
            SELECT st.student_id, st.hall_ticket_no, st.name, st.section, st.department
            FROM seat_allocations sa
            JOIN seats se ON sa.seat_id = se.seat_id
            JOIN students st ON sa.student_id = st.student_id
            LEFT JOIN historical_halls hh ON se.historical_hall_id = hh.historical_hall_id
            WHERE sa.exam_id = %s
              AND (se.hall_id = %s OR se.historical_hall_id = %s OR hh.original_hall_id = %s OR sa.hall_name = %s OR sa.room_no = %s)
            ORDER BY st.hall_ticket_no ASC
        """, (exam_id, hid, hid, hid, hall.get("hall_name"), hall.get("room_no")))
        student_roster = cur.fetchall()

        # Invigilator assigned to this room (with historical identity preservation)
        cur.execute("""
            SELECT COALESCE(f.faculty_name, ia.faculty_name, 'Invigilator') AS faculty_name,
                   COALESCE(f.department, ia.department, 'CSE') AS department,
                   ia.status
            FROM invigilator_assignments ia
            LEFT JOIN faculty f ON ia.faculty_id = f.faculty_id
            WHERE ia.exam_id = %s AND ia.hall_id = %s
            LIMIT 1
        """, (exam_id, hid))
        invig = cur.fetchone()

        halls_data.append({
            "hall_id": hid,
            "hall_name": hall["hall_name"],
            "room_no": room_label,
            "capacity": hall["capacity"],
            "student_count": len(student_roster),
            "seating_rows": seating_rows,
            "student_roster": student_roster,
            "invigilator": invig or {"faculty_name": "", "department": "", "status": "unassigned"}
        })

    # Faculty duty register for the day and session (with historical identity preservation)
    cur.execute("""
        SELECT ia.assignment_id,
               COALESCE(ia.faculty_id, ia.original_faculty_id) AS faculty_id,
               COALESCE(f.faculty_name, ia.faculty_name, 'Invigilator') AS faculty_name,
               COALESCE(f.department, ia.department, 'CSE') AS department,
               h.hall_name, h.room_no, es.session, ia.status
        FROM invigilator_assignments ia
        LEFT JOIN faculty f ON ia.faculty_id = f.faculty_id
        JOIN halls h ON ia.hall_id = h.hall_id
        JOIN exam_sessions es ON ia.exam_id = es.exam_id
        WHERE es.exam_date = %s
        ORDER BY es.session ASC, h.hall_name ASC, COALESCE(f.faculty_name, ia.faculty_name) ASC
    """, (date_str,))
    duty_assignments = cur.fetchall()

    faculty_rows = []
    seen = set()
    s_no = 1
    for d in duty_assignments:
        key = (d["faculty_id"], d["hall_name"], d["session"])
        if key in seen:
            continue
        seen.add(key)
        r_lbl = d["room_no"] or d["hall_name"]
        room_str = f"ROOM {r_lbl}" if not str(r_lbl).upper().startswith("ROOM") else str(r_lbl)
        rep_time = "09:00 AM" if d["session"] == "FN" else "01:00 PM"
        faculty_rows.append({
            "s_no": f"{s_no:02d}",
            "faculty_name": f"[ {d['faculty_name']} ]",
            "department": d["department"] or "CSE",
            "room_no": room_str,
            "reporting_time": rep_time,
            "status": d["status"]
        })
        s_no += 1

    cur.close()
    conn.close()

    return {
        "exam": {
            "exam_id": exam["exam_id"],
            "exam_title": get_exam_title(exam),
            "exam_type": exam.get("exam_type") or "",
            "exam_name": exam["exam_name"],
            "subject_code": exam["subject_code"],
            "subject_name": exam["subject_name"],
            "exam_date": date_str,
            "date_formatted": date_formatted,
            "date_slash": date_slash,
            "day_name": day_name,
            "session": exam["session"] or "FN",
            "session_label": session_label,
            "start_time": str(exam["start_time"] or "09:30"),
            "end_time": str(exam["end_time"] or "12:30"),
            "academic_year": exam["academic_year"] or "2026-2027",
            "study_year": exam["study_year"] or 3,
            "semester": exam["semester"] or "Semester 5",
        },
        "halls": halls_data,
        "faculty_register": {
            "exam_date": date_str,
            "date_formatted": date_slash,
            "day": day_name,
            "session_label": session_label,
            "rows": faculty_rows,
            "total_assigned": len(faculty_rows),
        }
    }
