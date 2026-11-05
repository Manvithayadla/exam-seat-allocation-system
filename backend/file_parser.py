import os
import re
import csv
import io
import pandas as pd
import openpyxl
from pypdf import PdfReader

SERIAL_EXCLUDE_RE = re.compile(r"^(s\.?\s*no|sl\.?\s*no|serial(\s*no)?|seq|sr\.?\s*no|section\s*s\.?\s*no|sno)$", re.I)

HT_PATTERNS = [
    re.compile(r"^(hall\s*ticket(\s*no|\s*number)?|ht\s*(no|num)?|htno|roll\s*(no|num|number)?|regd?\s*(no|num|number)?|registration(\s*no|\s*number)?|student\s*id|pin\s*(no|number)?)$", re.I),
    re.compile(r"\b(hall\s*ticket|roll\s*number|roll\s*no|regd\s*no|student\s*id|registration\s*no)\b", re.I)
]

NAME_PATTERNS = [
    re.compile(r"^(student\s*name|candidate\s*name|name\s*of\s*(the\s*)?(student|candidate)|full\s*name|candidate|name)$", re.I),
    re.compile(r"\b(student\s*name|candidate\s*name|candidate)\b", re.I)
]

NAME_EXCLUDE_RE = re.compile(r"(college|father|mother|parent|dept|department|subject|course|branch|exam|faculty|invigilator|room|hall|remarks|gender)", re.I)

METADATA_WORDS_RE = re.compile(r"(academic\s*year|semester|roll\s*number|student\s*name|gender|remarks|s\.no|sl\.no|total|autonomous|university|school\s*of|classroom|department)", re.I)

def is_serial_column(h):
    if not h: return False
    h_str = str(h).strip().lower()
    return bool(SERIAL_EXCLUDE_RE.search(h_str)) or any(k in h_str for k in ["s.no", "sl no", "sl.no", "serial no", "section s.no"])

def is_hall_ticket_column(h):
    if not h: return False
    h_str = str(h).strip().lower()
    if is_serial_column(h_str):
        return False
    return any(p.search(h_str) for p in HT_PATTERNS)

def is_student_name_column(h):
    if not h: return False
    h_str = str(h).strip().lower()
    if NAME_EXCLUDE_RE.search(h_str):
        return False
    return any(p.search(h_str) for p in NAME_PATTERNS)


class ValidatedStudentList(list):
    def __init__(self, items=None, validation_errors=None):
        super().__init__(items or [])
        self.validation_errors = validation_errors or []

def _extract_tabular_students(file_storage, filename):
    filename_lower = filename.lower()
    students = []
    errors = []
    seen_hts = set()
    detected_subjects_map = {}

    if filename_lower.endswith((".xlsx", ".xls")):
        if hasattr(file_storage, "seek"):
            file_storage.seek(0)
        wb = openpyxl.load_workbook(file_storage, data_only=True)
        if hasattr(file_storage, "seek"):
            file_storage.seek(0)

        # 1. Select candidate sheets
        target_sheets = []
        for sname in wb.sheetnames:
            s_low = sname.lower()
            if any(ign in s_low for ign in ['overview', 'summary', 'instructions', 'guidelines', 'stats', 'config', 'index']):
                continue
            if any(k in s_low for k in ["all", "master", "combined", "roll list", "students"]):
                target_sheets.append((sname, True))
        if not target_sheets:
            for sname in wb.sheetnames:
                if re.search(r"cse[-\s]?[a-z]", sname, re.I) or re.search(r"sec[-\s]?[a-z]", sname, re.I):
                    target_sheets.append((sname, False))
        if not target_sheets:
            target_sheets = [(wb.active.title, True)]

        for sname, is_master in target_sheets:
            sheet = wb[sname]
            header_row_idx = None
            ht_col = None
            name_col = None
            sec_col = None
            dept_col = None
            sub_code_col = None
            sub_name_col = None

            for r in range(1, min(25, sheet.max_row + 1)):
                row_vals = [str(sheet.cell(r, c).value or "").strip() for c in range(1, sheet.max_column + 1)]
                non_empty = [v for v in row_vals if v]
                if len(non_empty) < 2:
                    continue

                c_ht = None
                c_name = None
                c_sec = None
                c_dept = None
                c_scode = None
                c_sname = None

                for c_idx, val in enumerate(row_vals):
                    v_clean = val.strip()
                    if not v_clean or is_serial_column(v_clean):
                        continue
                    if c_ht is None and is_hall_ticket_column(v_clean):
                        c_ht = c_idx
                    if c_name is None and is_student_name_column(v_clean):
                        c_name = c_idx
                    if c_sec is None and re.search(r"^(section|classroom|class|sec)$", v_clean, re.I):
                        c_sec = c_idx
                    if c_dept is None and re.search(r"^(dept|department|branch)$", v_clean, re.I):
                        c_dept = c_idx
                    if c_scode is None and any(k in v_clean.lower() for k in ["subject_code", "course_code", "sub_code", "code"]) and "ticket" not in v_clean.lower():
                        c_scode = c_idx
                    if c_sname is None and any(k in v_clean.lower() for k in ["subject_name", "course_name", "title"]) and "student" not in v_clean.lower():
                        c_sname = c_idx

                if c_ht is not None and c_name is not None and c_ht != c_name:
                    header_row_idx = r
                    ht_col = c_ht
                    name_col = c_name
                    sec_col = c_sec
                    dept_col = c_dept
                    sub_code_col = c_scode
                    sub_name_col = c_sname
                    break

            if not header_row_idx:
                continue

            default_sec = "A"
            sheet_sec_match = re.search(r"([A-Za-z])$", sname.strip())
            if sheet_sec_match:
                default_sec = sheet_sec_match.group(1).upper()

            for r in range(header_row_idx + 1, sheet.max_row + 1):
                raw_ht = sheet.cell(r, ht_col + 1).value if ht_col is not None else None
                raw_name = sheet.cell(r, name_col + 1).value if name_col is not None else None
                if raw_ht is None and raw_name is None:
                    continue

                ht = str(raw_ht or "").strip().upper()
                name = str(raw_name or "").strip()

                if not ht or ht in ("NAN", "NONE"):
                    continue
                if not name or name.upper() in ("NAN", "NONE"):
                    continue

                # Reject serial numbers (e.g. "1", "2") and heading labels
                if (ht.isdigit() and len(ht) <= 4) or is_serial_column(ht) or METADATA_WORDS_RE.search(ht):
                    errors.append(f"Row {r} (Sheet {sname}): Rejected serial/heading row: {ht}")
                    continue

                if len(ht) < 5 or not re.search(r"[A-Za-z0-9]", ht):
                    errors.append(f"Row {r} (Sheet {sname}): Invalid Hall Ticket format: {ht}")
                    continue

                if len(name) < 2 or not any(c.isalpha() for c in name):
                    errors.append(f"Row {r} (Sheet {sname}): Invalid Student Name: {name}")
                    continue

                if ht in seen_hts:
                    errors.append(f"Row {r} (Sheet {sname}): Duplicate Hall Ticket Number {ht}")
                    continue
                seen_hts.add(ht)

                raw_sec = sheet.cell(r, sec_col + 1).value if sec_col is not None else default_sec
                sec_str = str(raw_sec or default_sec).strip()
                sec_match = re.search(r"([A-Za-z])$", sec_str)
                sec = sec_match.group(1).upper() if sec_match else default_sec

                raw_dept = sheet.cell(r, dept_col + 1).value if dept_col is not None else "CSE"
                dept_str = str(raw_dept or "CSE").strip().upper()
                dept = dept_str if dept_str not in ("NAN", "NONE", "") else "CSE"

                sub_code = str(sheet.cell(r, sub_code_col + 1).value or "").strip().upper() if sub_code_col is not None else ""
                sub_name = str(sheet.cell(r, sub_name_col + 1).value or "").strip() if sub_name_col is not None else ""
                if sub_code and sub_code != "NAN":
                    detected_subjects_map[sub_code] = sub_name or sub_code

                students.append({
                    "hall_ticket_no": ht,
                    "name": name,
                    "department": dept,
                    "year": 3,
                    "section": sec,
                    "subject_code": sub_code,
                    "subject_name": sub_name,
                })

    elif filename_lower.endswith(".csv"):
        try:
            if hasattr(file_storage, "read"):
                raw_bytes = file_storage.read()
                if hasattr(file_storage, "seek"):
                    file_storage.seek(0)
                content_str = raw_bytes.decode("utf-8-sig", errors="replace")
            else:
                with open(file_storage, "r", encoding="utf-8-sig", errors="replace") as f:
                    content_str = f.read()
        except Exception:
            content_str = str(file_storage)

        lines = [l for l in content_str.splitlines() if l.strip()]
        header_row_idx = None
        ht_col = None
        name_col = None
        sec_col = None
        dept_col = None
        sub_code_col = None
        sub_name_col = None

        for idx, line in enumerate(lines[:25]):
            reader = csv.reader([line])
            row = next(reader, [])
            row_clean = [c.strip() for c in row]
            if len([c for c in row_clean if c]) < 2:
                continue

            c_ht = None
            c_name = None
            c_sec = None
            c_dept = None
            c_scode = None
            c_sname = None

            for c_idx, val in enumerate(row_clean):
                if not val or is_serial_column(val):
                    continue
                if c_ht is None and is_hall_ticket_column(val):
                    c_ht = c_idx
                if c_name is None and is_student_name_column(val):
                    c_name = c_idx
                if c_sec is None and re.search(r"^(section|classroom|class|sec)$", val, re.I):
                    c_sec = c_idx
                if c_dept is None and re.search(r"^(dept|department|branch)$", val, re.I):
                    c_dept = c_idx
                if c_scode is None and any(k in val.lower() for k in ["subject_code", "course_code", "sub_code", "code"]) and "ticket" not in val.lower():
                    c_scode = c_idx
                if c_sname is None and any(k in val.lower() for k in ["subject_name", "course_name", "title"]) and "student" not in val.lower():
                    c_sname = c_idx

            if c_ht is not None and c_name is not None and c_ht != c_name:
                header_row_idx = idx
                ht_col = c_ht
                name_col = c_name
                sec_col = c_sec
                dept_col = c_dept
                sub_code_col = c_scode
                sub_name_col = c_sname
                break

        if header_row_idx is not None:
            for r_num, line in enumerate(lines[header_row_idx + 1:], start=header_row_idx + 2):
                reader = csv.reader([line])
                row = next(reader, [])
                if len(row) <= max(ht_col, name_col):
                    continue
                ht = str(row[ht_col] or "").strip().upper()
                name = str(row[name_col] or "").strip()

                if not ht or ht in ("NAN", "NONE"):
                    continue
                if not name or name.upper() in ("NAN", "NONE"):
                    continue

                if (ht.isdigit() and len(ht) <= 4) or is_serial_column(ht) or METADATA_WORDS_RE.search(ht):
                    errors.append(f"Row {r_num}: Rejected serial/heading row: {ht}")
                    continue

                if len(ht) < 5 or not re.search(r"[A-Za-z0-9]", ht):
                    errors.append(f"Row {r_num}: Invalid Hall Ticket format: {ht}")
                    continue

                if len(name) < 2 or not any(c.isalpha() for c in name):
                    errors.append(f"Row {r_num}: Invalid Student Name: {name}")
                    continue

                if ht in seen_hts:
                    errors.append(f"Row {r_num}: Duplicate Hall Ticket Number {ht}")
                    continue
                seen_hts.add(ht)

                sec_val = str(row[sec_col] or "A").strip() if (sec_col is not None and len(row) > sec_col) else "A"
                sec_match = re.search(r"([A-Za-z])$", sec_val)
                sec = sec_match.group(1).upper() if sec_match else "A"

                dept_val = str(row[dept_col] or "CSE").strip().upper() if (dept_col is not None and len(row) > dept_col) else "CSE"
                dept = dept_val if dept_val not in ("NAN", "NONE", "") else "CSE"

                sub_code = str(row[sub_code_col] or "").strip().upper() if (sub_code_col is not None and len(row) > sub_code_col) else ""
                sub_name = str(row[sub_name_col] or "").strip() if (sub_name_col is not None and len(row) > sub_name_col) else ""
                if sub_code and sub_code != "NAN":
                    detected_subjects_map[sub_code] = sub_name or sub_code

                students.append({
                    "hall_ticket_no": ht,
                    "name": name,
                    "department": dept,
                    "year": 3,
                    "section": sec,
                    "subject_code": sub_code,
                    "subject_name": sub_name,
                })

    elif filename_lower.endswith(".pdf"):
        if hasattr(file_storage, "seek"):
            file_storage.seek(0)
        reader = PdfReader(file_storage)
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text() or "\n"

        lines = [l.strip() for l in full_text.splitlines() if l.strip()]
        ht_pattern = re.compile(r"^([A-Za-z0-9_-]{4,15})$")
        ht_inline_pattern = re.compile(r"\b([0-9]{2}[A-Za-z]{2}[0-9A-Za-z]{4,8}|HT[0-9A-Za-z_-]+|[A-Za-z0-9]{5,15})\b")

        i = 0
        while i < len(lines):
            line = lines[i]
            tokens = [t.strip() for t in re.split(r"[,|\t\s]{2,}|\t|,", line) if t.strip()]
            if len(tokens) >= 2 and ht_inline_pattern.search(tokens[0]):
                ht = tokens[0].upper()
                name = tokens[1]
                dept = tokens[2].upper() if len(tokens) > 2 else "CSE"
                year = int(tokens[3]) if len(tokens) > 3 and tokens[3].isdigit() else 3
                sec = tokens[4].upper() if len(tokens) > 4 else "A"
                if not (ht.isdigit() and len(ht) <= 4) and len(ht) >= 5 and ht not in seen_hts:
                    seen_hts.add(ht)
                    students.append({
                        "hall_ticket_no": ht,
                        "name": name,
                        "department": dept,
                        "year": year,
                        "section": sec,
                        "subject_code": "",
                        "subject_name": "",
                    })
                i += 1
                continue

            has_digit = any(c.isdigit() for c in line)
            is_not_header = not any(h in line.lower() for h in ["hall", "ticket", "name", "dept", "year", "section", "page", "official", "roster"])
            if has_digit and is_not_header and ht_pattern.match(line):
                ht = line.upper()
                name = lines[i+1] if i+1 < len(lines) else f"Candidate {ht}"
                dept = lines[i+2].upper() if i+2 < len(lines) else "CSE"
                year_val = lines[i+3] if i+3 < len(lines) else "3"
                sec_val = lines[i+4].upper() if i+4 < len(lines) else "A"
                year = int(year_val) if year_val.isdigit() else 3
                sec = sec_val if len(sec_val) <= 2 else "A"
                if not (ht.isdigit() and len(ht) <= 4) and len(ht) >= 5 and ht not in seen_hts:
                    seen_hts.add(ht)
                    students.append({
                        "hall_ticket_no": ht,
                        "name": name,
                        "department": dept if len(dept) <= 8 else "CSE",
                        "year": year,
                        "section": sec,
                        "subject_code": "",
                        "subject_name": "",
                    })
                i += 5
                continue
            i += 1

    return ValidatedStudentList(students, validation_errors=errors), detected_subjects_map
def parse_student_file(file_storage, filename):
    students, _ = _extract_tabular_students(file_storage, filename)
    return students


def match_course_to_subject(course_name, subjects_catalogue=None):
    """
    Matches an imported faculty course name against the institutional Subject Catalogue.
    Priority 1: Subject Code (e.g. 24CS302, CS501, 24CS201, CS301)
    Priority 2: Exact Subject Name
    Priority 3: Canonical Curriculum Aliases
    Priority 4: Core Token Overlap
    Returns: (matched_subject_dict or None, confidence: 'exact' | 'fuzzy' | 'none')
    """
    if not subjects_catalogue or not course_name:
        return None, "none"

    raw_course = str(course_name).strip()
    clean_course = re.sub(r'[^a-zA-Z0-9\s]', '', raw_course).strip().lower()
    if not clean_course:
        return None, "none"

    # 1. Subject Code Priority Matching:
    # A) Check exact subject code match
    for s in subjects_catalogue:
        s_code = str(s.get("subject_code", "")).strip().upper()
        if not s_code:
            continue
        s_code_clean = re.sub(r'[^a-zA-Z0-9]', '', s_code).lower()
        if clean_course == s_code_clean:
            return s, "exact"
        # Check if subject code appears as a distinct word in the course string (e.g. "24CS302 - Theory of Computation")
        if re.search(r'\b' + re.escape(s_code) + r'\b', raw_course, re.IGNORECASE):
            return s, "exact"

    # B) Extract standard curriculum subject codes (e.g., 24CS302, CS501, 24CS201, CS301)
    extracted_codes = re.findall(r'\b([0-9]{2}[A-Za-z]{2,5}[0-9]{3}[A-Za-z]?|[A-Za-z]{2,5}[0-9]{3}[A-Za-z]?)\b', raw_course)
    for code_cand in extracted_codes:
        for s in subjects_catalogue:
            if str(s.get("subject_code", "")).strip().upper() == code_cand.strip().upper():
                return s, "exact"

    # 2. Exact match on subject_name
    for s in subjects_catalogue:
        s_name_clean = re.sub(r'[^a-zA-Z0-9\s]', '', str(s.get("subject_name", ""))).strip().lower()
        if clean_course == s_name_clean:
            return s, "exact"

    # 3. Canonical aliases for standard curriculum courses
    aliases = {
        "database systems": "database management systems",
        "dbms": "database management systems",
        "daa": "design and analysis of algorithms",
        "design and analysis of algorithm": "design and analysis of algorithms",
        "toc": "theory of computation",
        "automata theory": "theory of computation",
        "formal languages and automata theory": "theory of computation",
        "os": "operating systems",
        "se": "software engineering",
        "ai": "artificial intelligence",
        "java": "object oriented programming through java",
        "java programming": "object oriented programming through java",
        "oop through java": "object oriented programming through java",
        "object oriented programming java": "object oriented programming through java",
        "dld": "digital logic and design",
        "digital logic design": "digital logic and design",
        "digital logic": "digital logic and design",
        "p and s": "probability & statistics",
        "probability and statistics": "probability & statistics",
        "cloud computing": "cloud computing & devops",
        "devops": "cloud computing & devops",
        "web technology": "web technologies",
        "wt": "web technologies",
        "uhv": "universal human values-ii",
        "universal human values": "universal human values-ii",
        "data structures": "data structures & algorithms",
        "dsa": "data structures & algorithms",
        "computer networks": "computer networks",
        "cn": "computer networks",
        "machine learning": "machine learning",
        "ml": "machine learning",
        "deep learning": "artificial intelligence",
    }
    alias_target = aliases.get(clean_course)
    if alias_target:
        for s in subjects_catalogue:
            s_name_clean = re.sub(r'[^a-zA-Z0-9\s]', '', str(s.get("subject_name", ""))).strip().lower()
            if alias_target == s_name_clean:
                return s, "exact"
            if alias_target in s_name_clean or s_name_clean in alias_target:
                return s, "fuzzy"

    # 4. Core token overlap (excluding non-distinctive stop words)
    generic_stopwords = {
        "and", "of", "through", "the", "in", "to", "for", "with",
        "systems", "programming", "technologies", "technology", "science",
        "fundamentals", "principles", "applications", "introduction", "basic", "basics"
    }
    c_tokens = set(clean_course.split()) - generic_stopwords
    if not c_tokens:
        return None, "none"

    best_match = None
    best_score = 0.0

    for s in subjects_catalogue:
        s_name_clean = re.sub(r'[^a-zA-Z0-9\s]', '', str(s.get("subject_name", ""))).strip().lower()
        s_tokens = set(s_name_clean.split()) - generic_stopwords
        overlap = len(c_tokens & s_tokens)
        if overlap > 0:
            score = (2.0 * overlap) / (len(c_tokens) + len(s_tokens))
            if score > best_score and score >= 0.5:
                best_score = score
                best_match = s

    if best_match:
        return best_match, ("exact" if best_score >= 0.85 else "fuzzy")

    return None, "none"


def parse_faculty_file(file_storage, filename, subjects_catalogue=None):
    """
    Parses faculty file (Excel/CSV) and returns faculty records with their course profiles.
    Uses the unified intelligent parser supporting both single-sheet and multi-sheet layouts.
    """
    res = parse_faculty_subject_file(file_storage, filename, subjects_catalogue=subjects_catalogue)
    faculty_records = res.get("faculty_records") or []
    auto_matched = res.get("auto_matched") or []
    unmatched = res.get("unmatched") or []

    fac_map = {}
    faculty_list = []
    for f in faculty_records:
        rec = {
            "faculty_name": f["faculty_name"],
            "designation": f.get("designation") or "",
            "department": f.get("department") or "CSE",
            "email": f.get("email"),
            "all_emails": f.get("all_emails", []),
            "raw_faculty_id": f.get("raw_faculty_id"),
            "profile": [],
            "ug_courses": [],
            "unspecified_courses": [],
            "classification": "No Courses Listed",
            "subjects": []
        }
        fac_map[f["faculty_name"].lower()] = rec
        if f.get("email"):
            fac_map[f["email"].lower()] = rec
        if f.get("raw_faculty_id"):
            fac_map[str(f["raw_faculty_id"]).strip()] = rec
        faculty_list.append(rec)

    for m in auto_matched:
        k = m.get("raw_faculty_id") or m.get("email") or (m.get("faculty_name") or "").lower()
        rec = fac_map.get(str(k).strip() if k else "") or fac_map.get((m.get("faculty_name") or "").lower())
        if rec:
            p_item = {
                "course_name": m["course_name"],
                "course_code": m.get("course_code"),
                "classification": m.get("classification") or "Teaching Assignment",
                "suggested_subject_id": m.get("subject_id"),
                "suggested_subject_code": m.get("subject_code"),
                "suggested_subject_name": m.get("subject_name"),
                "match_confidence": m.get("match_confidence", "exact"),
                "academic_year": m.get("academic_year"),
                "semester": m.get("semester"),
                "study_year": m.get("study_year"),
                "section": m.get("section")
            }
            rec["profile"].append(p_item)
            rec["subjects"].append(m["course_name"])
            rec["ug_courses"].append(m["course_name"])
            rec["classification"] = "Teaching Assignment"

    for u in unmatched:
        k = u.get("raw_faculty_id") or u.get("email") or (u.get("faculty_name") or "").lower()
        rec = fac_map.get(str(k).strip() if k else "") or fac_map.get((u.get("faculty_name") or "").lower())
        if rec:
            p_item = {
                "course_name": u["course_name"],
                "course_code": u.get("course_code"),
                "classification": u.get("classification") or "Teaching Assignment",
                "suggested_subject_id": None,
                "suggested_subject_code": None,
                "suggested_subject_name": None,
                "match_confidence": "none",
                "academic_year": u.get("academic_year"),
                "semester": u.get("semester"),
                "study_year": u.get("study_year"),
                "section": u.get("section")
            }
            rec["profile"].append(p_item)
            rec["subjects"].append(u["course_name"])
            rec["unspecified_courses"].append(u["course_name"])

    return faculty_list



def parse_master_roster_file(file_storage, filename, default_sub_code="", default_sub_name="", default_date="", default_session="FN"):
    students_list, detected_subjects_map = _extract_tabular_students(file_storage, filename)
    
    if default_sub_code:
        detected_subjects_map[default_sub_code.upper()] = default_sub_name.strip() or default_sub_code.upper()

    final_sub_code = default_sub_code or "CS301"
    final_sub_name = default_sub_name or "Data Structures & Algorithms"
    if detected_subjects_map:
        first_code = list(detected_subjects_map.keys())[0]
        final_sub_code = first_code
        final_sub_name = detected_subjects_map[first_code]

    for s in students_list:
        if not s.get("subject_code"):
            s["subject_code"] = final_sub_code
            s["subject_name"] = final_sub_name
        if not s.get("exam_date"):
            s["exam_date"] = default_date
        if not s.get("session"):
            s["session"] = default_session

    detected_subjects = [
        {"subject_code": k, "subject_name": v or k}
        for k, v in detected_subjects_map.items()
    ]
    if not detected_subjects:
        detected_subjects = [{"subject_code": final_sub_code, "subject_name": final_sub_name}]

    return students_list, detected_subjects



def parse_hall_file(file_storage, filename):
    """
    Parses hall capacity files (.xlsx, .xls, .csv, .pdf) using openpyxl, csv, or pdfplumber.
    Returns:
      {
        "halls": [...],
        "total_records": int,
        "valid_records": int,
        "invalid_records": int,
        "summary": str
      }
    """
    import math
    import re
    import csv
    import io

    filename_lower = filename.lower()
    raw_rows = []

    if filename_lower.endswith((".xlsx", ".xls")):
        import openpyxl
        if hasattr(file_storage, "seek"):
            file_storage.seek(0)
        wb = openpyxl.load_workbook(file_storage, data_only=True)
        sheet = wb.active
        for row in sheet.iter_rows(values_only=True):
            if any(cell is not None for cell in row):
                raw_rows.append([str(c or "").strip() for c in row])

    elif filename_lower.endswith(".csv"):
        if hasattr(file_storage, "seek"):
            file_storage.seek(0)
        content = file_storage.read()
        if isinstance(content, bytes):
            content = content.decode("utf-8", errors="replace")
        reader = csv.reader(io.StringIO(content))
        for row in reader:
            if any(cell.strip() for cell in row):
                raw_rows.append([c.strip() for c in row])

    elif filename_lower.endswith(".pdf"):
        import pdfplumber
        if hasattr(file_storage, "seek"):
            file_storage.seek(0)
        with pdfplumber.open(file_storage) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                if tables:
                    for tbl in tables:
                        for row in tbl:
                            if any(cell for cell in row):
                                raw_rows.append([str(c or "").strip() for c in row])
                else:
                    text = page.extract_text() or ""
                    for line in text.splitlines():
                        parts = re.split(r"\s{2,}|\t", line.strip())
                        if len(parts) >= 2:
                            raw_rows.append([p.strip() for p in parts])
                        else:
                            tokens = line.strip().split()
                            if len(tokens) >= 3:
                                raw_rows.append(tokens)

    if not raw_rows:
        return {
            "halls": [],
            "total_records": 0,
            "valid_records": 0,
            "invalid_records": 0,
            "summary": "No tabular data found in the uploaded file"
        }

    # Identify header row
    header_idx = None
    col_name = None
    col_room = None
    col_cap = None
    col_rows = None
    col_cols = None

    for r_idx, row in enumerate(raw_rows[:15]):
        row_lower = [str(c).lower().strip() for c in row]
        has_hall = any("hall" in c or "room" in c for c in row_lower)
        has_cap = any("cap" in c or "seat" in c or "total" in c for c in row_lower)
        if has_hall and has_cap:
            header_idx = r_idx
            for c_idx, c_val in enumerate(row_lower):
                if "room" in c_val and ("no" in c_val or "num" in c_val):
                    col_room = c_idx
                elif "hall" in c_val or "room" in c_val:
                    if col_name is None:
                        col_name = c_idx
                    else:
                        col_room = c_idx
                elif "cap" in c_val or "seat" in c_val or "total" in c_val:
                    col_cap = c_idx
                elif "row" in c_val:
                    col_rows = c_idx
                elif "col" in c_val:
                    col_cols = c_idx
            break

    data_rows = raw_rows[header_idx + 1:] if header_idx is not None else raw_rows
    if header_idx is None:
        col_name = 0
        col_room = 1 if len(raw_rows[0]) > 4 else None
        col_cap = 2 if len(raw_rows[0]) > 4 else 1
        col_rows = 3 if len(raw_rows[0]) > 4 else 2
        col_cols = 4 if len(raw_rows[0]) > 4 else 3

    halls = []
    seen_keys = set()

    for idx, row in enumerate(data_rows):
        if not any(str(c).strip() for c in row):
            continue

        name_val = str(row[col_name]).strip() if col_name is not None and col_name < len(row) else ""
        room_val = str(row[col_room]).strip() if col_room is not None and col_room < len(row) else ""
        cap_val = str(row[col_cap]).strip() if col_cap is not None and col_cap < len(row) else ""
        rows_val = str(row[col_rows]).strip() if col_rows is not None and col_rows < len(row) else ""
        cols_val = str(row[col_cols]).strip() if col_cols is not None and col_cols < len(row) else ""

        if not name_val and not room_val:
            continue

        hall_name = name_val or f"HALL {room_val}"
        room_no = room_val or re.sub(r"[^0-9A-Za-z]", "", hall_name.replace("HALL", "").replace("ROOM", "").strip()) or hall_name

        error = None
        warning = None
        cap = 0
        try:
            cleaned_cap = re.sub(r"[^\d.]", "", cap_val)
            cap = int(float(cleaned_cap)) if cleaned_cap else 0
            if cap <= 0:
                error = "Capacity must be greater than 0"
        except Exception:
            error = f"Invalid capacity: '{cap_val}'"

        try:
            r_count = int(float(rows_val)) if rows_val else 6
        except Exception:
            r_count = 6

        try:
            c_count = int(float(cols_val)) if cols_val else (math.ceil(cap / r_count) if (cap and r_count) else 8)
        except Exception:
            c_count = 8

        if r_count <= 0:
            r_count = 6
        if c_count <= 0:
            c_count = 8

        if cap > 0 and (r_count * c_count < cap):
            warning = f"Seating grid ({r_count} rows x {c_count} cols = {r_count * c_count}) is smaller than total capacity ({cap})"

        key = hall_name.lower().replace(" ", "")
        is_duplicate = False
        if key in seen_keys:
            is_duplicate = True
            error = f"Duplicate hall/room in uploaded file: '{hall_name}'"
        else:
            seen_keys.add(key)

        halls.append({
            "temp_id": idx + 1,
            "hall_name": hall_name,
            "room_no": room_no,
            "capacity": cap,
            "rows_count": r_count,
            "columns_count": c_count,
            "is_valid": error is None,
            "error": error,
            "warning": warning,
            "is_duplicate": is_duplicate,
            "exists_in_db": False
        })

    valid_cnt = sum(1 for h in halls if h["is_valid"])
    invalid_cnt = sum(1 for h in halls if not h["is_valid"])

    return {
        "halls": halls,
        "total_records": len(halls),
        "valid_records": valid_cnt,
        "invalid_records": invalid_cnt,
        "summary": f"{len(halls)} hall records extracted ({valid_cnt} valid, {invalid_cnt} issues detected)"
    }



def detect_subject_category(name, code="", explicit_cat=""):
    """
    Automatically classifies a course into:
    - 'Laboratory'
    - 'Elective Theory'
    - 'Core Theory'

    Uses explicit category information in the uploaded file, subject name keywords,
    and verified code patterns. Protects against false positives from ambiguous abbreviations.
    Returns: (category, is_uncertain, reason)
    """
    name_str = (name or "").strip()
    code_str = (code or "").strip().upper()
    cat_str = (explicit_cat or "").strip().lower()

    # 1. Explicit Category matching from file (if provided and valid)
    if cat_str and cat_str not in ("none", "null", "-", "na", "n/a"):
        if any(k in cat_str for k in ["lab", "practical", "practicum", "workshop"]):
            return "Laboratory", False, "Explicitly specified as Laboratory in file"
        if any(k in cat_str for k in ["elective", "pe", "oe", "professional elective", "open elective"]):
            return "Elective Theory", False, "Explicitly specified as Elective in file"
        if any(k in cat_str for k in ["core", "theory", "mandatory", "compulsory"]):
            return "Core Theory", False, "Explicitly specified as Core Theory in file"

    # 2. Check for Laboratory using exact word boundaries
    # Must match: 'Lab', 'Laboratory', 'Practical', 'Practicum'
    # Must NOT match: 'Collaboration', 'Labor', 'Label', 'Database', etc.
    if re.search(r'\b(lab|laboratory|practicals?|practicum)\b', name_str, re.IGNORECASE):
        return "Laboratory", False, "Identified 'Lab/Laboratory' keyword in course title"

    # 3. Check for Elective Theory using exact word boundaries or standard code suffixes
    if re.search(r'\b(elective|electives|pe|oe)\b', name_str, re.IGNORECASE):
        return "Elective Theory", False, "Identified 'Elective' keyword in course title"
    if code_str.endswith("PE") or code_str.endswith("OE"):
        return "Elective Theory", False, f"Identified '{code_str[-2:]}' elective suffix in subject code"

    # 4. Check for special non-lecture courses where classification might be uncertain
    name_lower = name_str.lower()
    if any(k in name_lower for k in ["seminar", "project", "internship", "viva", "mini-project", "training"]):
        return "Core Theory", True, "Special non-lecture course; review recommended"

    # 5. Default: Core Theory
    return "Core Theory", False, "Standard academic theory course"


def parse_subject_file(file_storage, filename, default_academic_year='2026-2027', default_study_year=3, default_semester='Semester 5', default_dept='CSE'):
    """
    Parses subject catalogue files (.xlsx, .xls, .csv, .pdf).
    Extracts Subject Code, Subject Name, Department, Academic Year, Study Year, Semester, Category.
    """
    filename_lower = filename.lower()
    raw_rows = []

    if filename_lower.endswith(".csv"):
        if hasattr(file_storage, "seek"):
            file_storage.seek(0)
        content = file_storage.read()
        text = content.decode("utf-8", errors="replace") if isinstance(content, bytes) else content
        reader = csv.reader(io.StringIO(text))
        for row in reader:
            if any(str(c).strip() for c in row):
                raw_rows.append([str(c).strip() for c in row])

    elif filename_lower.endswith((".xlsx", ".xls")):
        if hasattr(file_storage, "seek"):
            file_storage.seek(0)
        wb = openpyxl.load_workbook(file_storage, data_only=True)
        sheet = wb.active
        for r in range(1, sheet.max_row + 1):
            row_vals = [str(sheet.cell(r, c).value or "").strip() for c in range(1, sheet.max_column + 1)]
            if any(row_vals):
                raw_rows.append(row_vals)

    elif filename_lower.endswith(".pdf"):
        if hasattr(file_storage, "seek"):
            file_storage.seek(0)
        reader = PdfReader(file_storage)
        for page in reader.pages:
            text = page.extract_text() or ""
            for line in text.split("\n"):
                line = line.strip()
                if line:
                    parts = re.split(r"\t+|\s{2,}", line)
                    if len(parts) >= 2:
                        raw_rows.append([p.strip() for p in parts])
                    else:
                        tokens = line.split()
                        if len(tokens) >= 2:
                            raw_rows.append(tokens)

    if not raw_rows:
        return {
            "subjects": [],
            "total_records": 0,
            "valid_records": 0,
            "duplicate_records": 0,
            "invalid_records": 0,
            "summary": "No tabular data found in uploaded file."
        }

    header_idx = None
    col_code = None
    col_name = None
    col_dept = None
    col_ay = None
    col_year = None
    col_sem = None
    col_cat = None

    for r_idx, row in enumerate(raw_rows[:15]):
        row_lower = [str(c).lower().strip() for c in row]
        has_code = any(any(k in c for k in ["code", "sub_code", "course_code", "subcode"]) for c in row_lower)
        has_name = any(any(k in c for k in ["name", "subject", "title", "course"]) and "code" not in c for c in row_lower)
        if has_code or (has_name and len(row) >= 2):
            header_idx = r_idx
            for c_idx, c_val in enumerate(row_lower):
                if any(k in c_val for k in ["code", "sub_code", "course_code", "subcode"]):
                    col_code = c_idx
                elif any(k in c_val for k in ["name", "subject_name", "title", "course_name"]):
                    col_name = c_idx
                elif any(k in c_val for k in ["dept", "department", "branch"]):
                    col_dept = c_idx
                elif any(k in c_val for k in ["ay", "academic", "academic_year"]):
                    col_ay = c_idx
                elif any(k in c_val for k in ["study_year", "year", "class"]):
                    col_year = c_idx
                elif any(k in c_val for k in ["sem", "semester", "term"]):
                    col_sem = c_idx
                elif any(k in c_val for k in ["cat", "category", "type", "course_type"]):
                    col_cat = c_idx
            break

    if header_idx is not None:
        data_rows = raw_rows[header_idx + 1:]
    else:
        data_rows = raw_rows
        col_code = 0
        col_name = 1 if len(raw_rows[0]) > 1 else None

    subjects = []
    seen_codes = set()

    for idx, row in enumerate(data_rows):
        if not any(str(c).strip() for c in row):
            continue

        raw_code = str(row[col_code]).strip().upper() if col_code is not None and col_code < len(row) else ""
        raw_name = str(row[col_name]).strip() if col_name is not None and col_name < len(row) else ""
        raw_dept = str(row[col_dept]).strip().upper() if col_dept is not None and col_dept < len(row) else default_dept
        raw_ay = str(row[col_ay]).strip() if col_ay is not None and col_ay < len(row) else default_academic_year
        raw_year = str(row[col_year]).strip() if col_year is not None and col_year < len(row) else str(default_study_year)
        raw_sem = str(row[col_sem]).strip() if col_sem is not None and col_sem < len(row) else default_semester
        raw_cat = str(row[col_cat]).strip() if col_cat is not None and col_cat < len(row) else "Core"

        if not raw_code and len(row) >= 2:
            raw_code = str(row[0]).strip().upper()
            raw_name = str(row[1]).strip()

        if not raw_code and not raw_name:
            continue

        error = None
        if not raw_code:
            error = "Missing subject code"
        elif not raw_name:
            error = "Missing subject name"

        is_duplicate = False
        if raw_code in seen_codes:
            is_duplicate = True
            error = f"Duplicate subject code in uploaded file: '{raw_code}'"
        elif raw_code:
            seen_codes.add(raw_code)

        try:
            study_year_int = int(re.sub(r"\D", "", raw_year)) if re.sub(r"\D", "", raw_year) else default_study_year
        except Exception:
            study_year_int = default_study_year

        # Automatic category classification
        detected_cat, is_uncertain, cat_reason = detect_subject_category(raw_name, raw_code, raw_cat)

        subjects.append({
            "temp_id": idx + 1,
            "subject_code": raw_code,
            "subject_name": raw_name,
            "department": raw_dept or default_dept,
            "academic_year": raw_ay or default_academic_year,
            "study_year": study_year_int,
            "semester": raw_sem or default_semester,
            "category": detected_cat,
            "detected_category": detected_cat,
            "is_uncertain": is_uncertain,
            "detection_reason": cat_reason,
            "category_options": ["Core Theory", "Laboratory", "Elective Theory"],
            "is_valid": error is None,
            "error": error,
            "is_duplicate": is_duplicate,
            "exists_in_db": False
        })

    valid_cnt = sum(1 for s in subjects if s["is_valid"])
    dup_cnt = sum(1 for s in subjects if s["is_duplicate"])
    invalid_cnt = sum(1 for s in subjects if not s["is_valid"])

    return {
        "subjects": subjects,
        "total_records": len(subjects),
        "valid_records": valid_cnt,
        "duplicate_records": dup_cnt,
        "invalid_records": invalid_cnt,
        "summary": f"{len(subjects)} subjects extracted ({valid_cnt} valid, {dup_cnt} duplicate, {invalid_cnt} invalid)"
    }


def parse_section_student_file(file_storage, filename, target_section='A', default_dept='CSE', default_ay='2026-2027', default_year=3, default_sem='Semester 5', selected_sheet=None, ht_col=None, name_col=None, sec_col=None):
    """
    Intelligently parses student roster file (.xlsx, .xls, .csv, .pdf) for a specific section.
    1. Inspects all worksheets, scores and selects the section-matching worksheet.
    2. Detects real table header row (never assumes row 1).
    3. Identifies Hall Ticket & Student Name columns, strictly ignoring serial numbers (S.No, SL No).
    4. Supports manual column mapping if header is ambiguous.
    5. Validates hall ticket & student name formats, rejecting serial numbers and metadata banners.
    6. Returns full preview breakdown (total, valid, duplicates, invalid, skipped headings, rejection reasons).
    """
    filename_lower = filename.lower()
    processed = []
    seen = set()
    reasons = set()
    skipped_headings_count = 0
    available_sheets = []
    chosen_sheet_name = None
    detected_cols = {}
    requires_mapping = False
    sheet_preview = []

    target_sec_clean = str(target_section or 'A').strip().upper()

    if filename_lower.endswith((".xlsx", ".xls")):
        if hasattr(file_storage, "seek"):
            file_storage.seek(0)
        wb = openpyxl.load_workbook(file_storage, data_only=True)
        available_sheets = list(wb.sheetnames)

        # 1. Sheet selection
        if selected_sheet and selected_sheet in wb.sheetnames:
            chosen_sheet_name = selected_sheet
        else:
            def score_sheet(sname):
                s_lower = sname.lower().strip()
                if any(ign in s_lower for ign in ['overview', 'summary', 'instructions', 'guidelines', 'stats', 'config', 'index']):
                    return -100
                sec_clean = target_sec_clean.lower()
                if re.search(rf"\b(cse|sec|section)?[-\s_]*{sec_clean}\b", s_lower) or s_lower.endswith(f"-{sec_clean}") or s_lower.endswith(f" {sec_clean}"):
                    return 100
                if any(k in s_lower for k in ['all', 'master', 'combined', 'students', 'roll list']):
                    return 50
                return 10

            ranked = sorted(wb.sheetnames, key=score_sheet, reverse=True)
            chosen_sheet_name = ranked[0] if ranked else wb.active.title

        sheet = wb[chosen_sheet_name]

        # Generate preview rows (first 10) for UI mapping if needed
        for r in range(1, min(12, sheet.max_row + 1)):
            row_vals = [str(sheet.cell(r, c).value or "").strip() for c in range(1, min(15, sheet.max_column + 1))]
            if any(row_vals):
                sheet_preview.append({"row": r, "values": row_vals})

        # 2. Header row detection
        header_row_idx = None
        ht_col_idx = None
        name_col_idx = None
        sec_col_idx = None
        dept_col_idx = None

        if ht_col is not None and name_col is not None:
            try:
                ht_col_idx = int(ht_col)
                name_col_idx = int(name_col)
                sec_col_idx = int(sec_col) if sec_col is not None else None
                header_row_idx = 1
                detected_cols = {
                    "hall_ticket": f"Column {ht_col_idx + 1}",
                    "name": f"Column {name_col_idx + 1}",
                    "section": f"Column {sec_col_idx + 1}" if sec_col_idx is not None else None
                }
            except Exception:
                header_row_idx = None

        if header_row_idx is None:
            for r in range(1, min(25, sheet.max_row + 1)):
                row_vals = [str(sheet.cell(r, c).value or "").strip() for c in range(1, sheet.max_column + 1)]
                non_empty = [v for v in row_vals if v]
                if len(non_empty) < 2:
                    if any(v for v in non_empty):
                        skipped_headings_count += 1
                    continue

                cand_ht = None
                cand_name = None
                cand_sec = None
                cand_dept = None

                for c_idx, val in enumerate(row_vals):
                    if not val:
                        continue
                    v_clean = val.strip()

                    if is_serial_column(v_clean):
                        continue

                    if cand_ht is None and is_hall_ticket_column(v_clean):
                        cand_ht = c_idx

                    if cand_name is None and is_student_name_column(v_clean):
                        cand_name = c_idx

                    if cand_sec is None and re.search(r"^(section|classroom|class|sec)$", v_clean, re.I):
                        cand_sec = c_idx

                    if cand_dept is None and re.search(r"^(dept|department|branch)$", v_clean, re.I):
                        cand_dept = c_idx

                if cand_ht is not None and cand_name is not None and cand_ht != cand_name:
                    header_row_idx = r
                    ht_col_idx = cand_ht
                    name_col_idx = cand_name
                    sec_col_idx = cand_sec
                    dept_col_idx = cand_dept
                    detected_cols = {
                        "hall_ticket": row_vals[ht_col_idx],
                        "name": row_vals[name_col_idx],
                        "section": row_vals[sec_col_idx] if sec_col_idx is not None else None
                    }
                    break
                else:
                    skipped_headings_count += 1

        if header_row_idx is None:
            requires_mapping = True
            return {
                "students": [],
                "section": target_sec_clean,
                "total_records": 0,
                "valid_records": 0,
                "duplicate_records": 0,
                "invalid_records": 0,
                "skipped_headings_count": skipped_headings_count,
                "rejection_reasons": ["Unable to automatically detect Hall Ticket Number and Student Name columns. Please map columns manually."],
                "detected_sheet": chosen_sheet_name,
                "available_sheets": available_sheets,
                "detected_columns": {},
                "requires_mapping": True,
                "sheet_preview": sheet_preview,
                "summary": "Header row ambiguous; please map columns."
            }

        # 3. Extract and validate data rows
        for r in range(header_row_idx + 1, sheet.max_row + 1):
            raw_ht = sheet.cell(r, ht_col_idx + 1).value
            raw_name = sheet.cell(r, name_col_idx + 1).value
            if raw_ht is None and raw_name is None:
                continue

            ht = str(raw_ht or "").strip().upper()
            name = str(raw_name or "").strip()

            if not ht and not name:
                continue

            # Check if this row is an accidental repeated header or summary row
            if METADATA_WORDS_RE.search(ht) and METADATA_WORDS_RE.search(name):
                skipped_headings_count += 1
                continue

            # Check Section if available in row
            sec_val = target_sec_clean
            if sec_col_idx is not None:
                raw_sec = sheet.cell(r, sec_col_idx + 1).value
                if raw_sec:
                    sec_str = str(raw_sec).strip().upper()
                    m = re.search(r"([A-Za-z])$", sec_str)
                    if m:
                        sec_val = m.group(1).upper()
                    elif sec_str in ("A", "B", "C", "D", "E"):
                        sec_val = sec_str

            # If master sheet with multiple sections, filter for target_section
            is_master = "all" in chosen_sheet_name.lower() or "master" in chosen_sheet_name.lower()
            if is_master and sec_col_idx is not None and sec_val != target_sec_clean:
                continue

            dept_val = default_dept.upper()
            if dept_col_idx is not None:
                raw_dept = sheet.cell(r, dept_col_idx + 1).value
                if raw_dept and str(raw_dept).strip() not in ("NAN", "NONE", ""):
                    dept_val = str(raw_dept).strip().upper()

            error = None
            is_duplicate = False

            # Strict validation checks
            if ht.isdigit() and len(ht) <= 4:
                error = f"Rejected serial number mistakenly identified as hall ticket: '{ht}'"
            elif not ht or ht in ("NAN", "NONE"):
                error = "Missing Hall Ticket Number"
            elif not name or name.upper() in ("NAN", "NONE"):
                error = "Missing Student Name"
            elif is_serial_column(ht) or ht.lower() in ("s.no", "sl no", "sl.no", "serial", "sno"):
                error = f"Serial number column label '{ht}' detected instead of hall ticket"
            elif METADATA_WORDS_RE.search(ht):
                error = f"Heading/metadata label detected in hall ticket column: '{ht}'"
            elif len(ht) < 5 or not re.search(r"[A-Za-z0-9]", ht):
                error = f"Invalid Hall Ticket format '{ht}' (must be at least 5 alphanumeric characters)"
            elif len(name) < 2 or not any(c.isalpha() for c in name):
                error = f"Invalid Student Name '{name}'"
            elif METADATA_WORDS_RE.search(name) and not any(p in name for p in [" ", ","]):
                error = f"Heading label detected in name column: '{name}'"

            if ht and ht in seen:
                is_duplicate = True
                error = f"Duplicate Hall Ticket Number in file: {ht}"
            elif ht and not error:
                seen.add(ht)

            if error:
                reasons.add(error)

            processed.append({
                "temp_id": len(processed) + 1,
                "row_number": r,
                "hall_ticket_no": ht,
                "name": name,
                "section": sec_val,
                "department": dept_val,
                "academic_year": default_ay,
                "study_year": default_year,
                "semester": default_sem,
                "is_valid": error is None,
                "error": error,
                "is_duplicate": is_duplicate,
                "exists_in_db": False
            })

    elif filename_lower.endswith(".csv"):
        try:
            if hasattr(file_storage, "read"):
                raw_bytes = file_storage.read()
                if hasattr(file_storage, "seek"):
                    file_storage.seek(0)
                content_str = raw_bytes.decode("utf-8-sig", errors="replace")
            else:
                with open(file_storage, "r", encoding="utf-8-sig", errors="replace") as f:
                    content_str = f.read()
        except Exception:
            content_str = str(file_storage)

        lines = [l for l in content_str.splitlines() if l.strip()]
        header_row_idx = None
        ht_col_idx = None
        name_col_idx = None
        sec_col_idx = None
        dept_col_idx = None

        if ht_col is not None and name_col is not None:
            try:
                ht_col_idx = int(ht_col)
                name_col_idx = int(name_col)
                sec_col_idx = int(sec_col) if sec_col is not None else None
                header_row_idx = 0
            except Exception:
                header_row_idx = None

        if header_row_idx is None:
            for idx, line in enumerate(lines[:25]):
                reader = csv.reader([line])
                row = next(reader, [])
                row_clean = [c.strip() for c in row]
                if len([c for c in row_clean if c]) < 2:
                    if any(row_clean):
                        skipped_headings_count += 1
                    continue

                c_ht = None
                c_name = None
                c_sec = None
                c_dept = None

                for c_idx, val in enumerate(row_clean):
                    if not val or is_serial_column(val):
                        continue
                    if c_ht is None and is_hall_ticket_column(val):
                        c_ht = c_idx
                    if c_name is None and is_student_name_column(val):
                        c_name = c_idx
                    if c_sec is None and re.search(r"^(section|classroom|class|sec)$", val, re.I):
                        c_sec = c_idx
                    if c_dept is None and re.search(r"^(dept|department|branch)$", val, re.I):
                        c_dept = c_idx

                if c_ht is not None and c_name is not None and c_ht != c_name:
                    header_row_idx = idx
                    ht_col_idx = c_ht
                    name_col_idx = c_name
                    sec_col_idx = c_sec
                    dept_col_idx = c_dept
                    detected_cols = {
                        "hall_ticket": row_clean[ht_col_idx],
                        "name": row_clean[name_col_idx],
                        "section": row_clean[sec_col_idx] if sec_col_idx is not None else None
                    }
                    break
                else:
                    skipped_headings_count += 1

        if header_row_idx is None:
            requires_mapping = True
            return {
                "students": [],
                "section": target_sec_clean,
                "total_records": 0,
                "valid_records": 0,
                "duplicate_records": 0,
                "invalid_records": 0,
                "skipped_headings_count": skipped_headings_count,
                "rejection_reasons": ["Unable to automatically detect Hall Ticket Number and Student Name columns. Please map columns manually."],
                "detected_sheet": "CSV",
                "available_sheets": ["CSV"],
                "detected_columns": {},
                "requires_mapping": True,
                "sheet_preview": [{"row": i+1, "values": [c.strip() for c in next(csv.reader([l]), [])]} for i, l in enumerate(lines[:10])],
                "summary": "Header row ambiguous; please map columns."
            }

        for r_num, line in enumerate(lines[header_row_idx + 1:], start=header_row_idx + 2):
            reader = csv.reader([line])
            row = next(reader, [])
            if len(row) <= max(ht_col_idx, name_col_idx):
                continue
            ht = str(row[ht_col_idx] or "").strip().upper()
            name = str(row[name_col_idx] or "").strip()

            if not ht and not name:
                continue

            if METADATA_WORDS_RE.search(ht) and METADATA_WORDS_RE.search(name):
                skipped_headings_count += 1
                continue

            sec_val = target_sec_clean
            if sec_col_idx is not None and len(row) > sec_col_idx:
                raw_sec = str(row[sec_col_idx] or "").strip()
                m = re.search(r"([A-Za-z])$", raw_sec)
                if m:
                    sec_val = m.group(1).upper()
                elif raw_sec in ("A", "B", "C", "D", "E"):
                    sec_val = raw_sec

            dept_val = default_dept.upper()
            if dept_col_idx is not None and len(row) > dept_col_idx:
                raw_dept = str(row[dept_col_idx] or "").strip()
                if raw_dept and raw_dept.upper() not in ("NAN", "NONE", ""):
                    dept_val = raw_dept.upper()

            error = None
            is_duplicate = False

            if ht.isdigit() and len(ht) <= 4:
                error = f"Rejected serial number mistakenly identified as hall ticket: '{ht}'"
            elif not ht or ht in ("NAN", "NONE"):
                error = "Missing Hall Ticket Number"
            elif not name or name.upper() in ("NAN", "NONE"):
                error = "Missing Student Name"
            elif is_serial_column(ht) or ht.lower() in ("s.no", "sl no", "sl.no", "serial", "sno"):
                error = f"Serial number column label '{ht}' detected instead of hall ticket"
            elif METADATA_WORDS_RE.search(ht):
                error = f"Heading/metadata label detected in hall ticket column: '{ht}'"
            elif len(ht) < 5 or not re.search(r"[A-Za-z0-9]", ht):
                error = f"Invalid Hall Ticket format '{ht}' (must be at least 5 alphanumeric characters)"
            elif len(name) < 2 or not any(c.isalpha() for c in name):
                error = f"Invalid Student Name '{name}'"

            if ht and ht in seen:
                is_duplicate = True
                error = f"Duplicate Hall Ticket Number in file: {ht}"
            elif ht and not error:
                seen.add(ht)

            if error:
                reasons.add(error)

            processed.append({
                "temp_id": len(processed) + 1,
                "row_number": r_num,
                "hall_ticket_no": ht,
                "name": name,
                "section": sec_val,
                "department": dept_val,
                "academic_year": default_ay,
                "study_year": default_year,
                "semester": default_sem,
                "is_valid": error is None,
                "error": error,
                "is_duplicate": is_duplicate,
                "exists_in_db": False
            })

    elif filename_lower.endswith(".pdf"):
        # Use existing PDF extractor with strict validation
        students_list, _ = _extract_tabular_students(file_storage, filename)
        for idx, s in enumerate(students_list):
            ht = str(s.get("hall_ticket_no", "")).strip().upper()
            name = str(s.get("name", "")).strip()
            sec = str(s.get("section", "")).strip().upper() or target_sec_clean
            dept = str(s.get("department", "")).strip().upper() or default_dept.upper()

            error = None
            if not ht:
                error = "Missing Hall Ticket Number"
            elif not name:
                error = "Missing Student Name"

            is_duplicate = False
            if ht in seen:
                is_duplicate = True
                error = f"Duplicate Hall Ticket Number in file: {ht}"
            elif ht:
                seen.add(ht)

            if error:
                reasons.add(error)

            processed.append({
                "temp_id": idx + 1,
                "row_number": idx + 1,
                "hall_ticket_no": ht,
                "name": name,
                "section": sec,
                "department": dept,
                "academic_year": default_ay,
                "study_year": default_year,
                "semester": default_sem,
                "is_valid": error is None,
                "error": error,
                "is_duplicate": is_duplicate,
                "exists_in_db": False
            })

    valid_cnt = sum(1 for p in processed if p["is_valid"])
    dup_cnt = sum(1 for p in processed if p["is_duplicate"])
    invalid_cnt = sum(1 for p in processed if not p["is_valid"])

    return {
        "students": processed,
        "section": target_sec_clean,
        "total_records": len(processed),
        "valid_records": valid_cnt,
        "duplicate_records": dup_cnt,
        "invalid_records": invalid_cnt,
        "skipped_headings_count": skipped_headings_count,
        "rejection_reasons": sorted(list(reasons)),
        "detected_sheet": chosen_sheet_name or "Sheet1",
        "available_sheets": available_sheets,
        "detected_columns": detected_cols,
        "requires_mapping": requires_mapping,
        "sheet_preview": sheet_preview,
        "summary": f"{len(processed)} students extracted for Section {target_sec_clean} ({valid_cnt} valid, {invalid_cnt} issues, {skipped_headings_count} heading rows skipped)"
    }


SEMESTER_MAP = {
    '1': 'Semester 1', '01': 'Semester 1', 'I': 'Semester 1', 'SEM 1': 'Semester 1', 'SEMESTER 1': 'Semester 1', '1ST': 'Semester 1', 'FIRST': 'Semester 1',
    '2': 'Semester 2', '02': 'Semester 2', 'II': 'Semester 2', 'SEM 2': 'Semester 2', 'SEMESTER 2': 'Semester 2', '2ND': 'Semester 2', 'SECOND': 'Semester 2',
    '3': 'Semester 3', '03': 'Semester 3', 'III': 'Semester 3', 'SEM 3': 'Semester 3', 'SEMESTER 3': 'Semester 3', '3RD': 'Semester 3', 'THIRD': 'Semester 3',
    '4': 'Semester 4', '04': 'Semester 4', 'IV': 'Semester 4', 'SEM 4': 'Semester 4', 'SEMESTER 4': 'Semester 4', '4TH': 'Semester 4', 'FOURTH': 'Semester 4',
    '5': 'Semester 5', '05': 'Semester 5', 'V': 'Semester 5', 'SEM 5': 'Semester 5', 'SEMESTER 5': 'Semester 5', '5TH': 'Semester 5', 'FIFTH': 'Semester 5',
    '6': 'Semester 6', '06': 'Semester 6', 'VI': 'Semester 6', 'SEM 6': 'Semester 6', 'SEMESTER 6': 'Semester 6', '6TH': 'Semester 6', 'SIXTH': 'Semester 6',
    '7': 'Semester 7', '07': 'Semester 7', 'VII': 'Semester 7', 'SEM 7': 'Semester 7', 'SEMESTER 7': 'Semester 7', '7TH': 'Semester 7', 'SEVENTH': 'Semester 7',
    '8': 'Semester 8', '08': 'Semester 8', 'VIII': 'Semester 8', 'SEM 8': 'Semester 8', 'SEMESTER 8': 'Semester 8', '8TH': 'Semester 8', 'EIGHTH': 'Semester 8',
}

def normalize_semester(val):
    if val is None:
        return None
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ('nan', 'none', 'null', ''):
        return None
    upper = val_str.upper()
    if upper in SEMESTER_MAP:
        return SEMESTER_MAP[upper]
    clean = re.sub(r'[^A-Z0-9]', ' ', upper).strip()
    if clean in SEMESTER_MAP:
        return SEMESTER_MAP[clean]
    roman_match = re.search(r'\b(VIII|VII|VI|IV|V|III|II|I)\b', upper)
    if roman_match:
        rom = roman_match.group(1)
        if rom in SEMESTER_MAP:
            return SEMESTER_MAP[rom]
    digits = re.findall(r'\b([1-8])\b', upper) or re.findall(r'([1-8])', upper)
    if digits:
        d = digits[0]
        if d in SEMESTER_MAP:
            return SEMESTER_MAP[d]
    return None

YEAR_MAP = {
    '1': 1, '01': 1, 'I': 1, '1ST': 1, 'YEAR 1': 1, '1ST YEAR': 1, 'FIRST': 1,
    '2': 2, '02': 2, 'II': 2, '2ND': 2, 'YEAR 2': 2, '2ND YEAR': 2, 'SECOND': 2,
    '3': 3, '03': 3, 'III': 3, '3RD': 3, 'YEAR 3': 3, '3RD YEAR': 3, 'THIRD': 3,
    '4': 4, '04': 4, 'IV': 4, '4TH': 4, 'YEAR 4': 4, '4TH YEAR': 4, 'FOURTH': 4,
}

def normalize_study_year(val):
    if val is None:
        return None
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ('nan', 'none', 'null', ''):
        return None
    upper = val_str.upper()
    if upper in YEAR_MAP:
        return YEAR_MAP[upper]
    clean = re.sub(r'[^A-Z0-9]', ' ', upper).strip()
    if clean in YEAR_MAP:
        return YEAR_MAP[clean]
    roman_match = re.search(r'\b(IV|III|II|I)\b', upper)
    if roman_match:
        rom = roman_match.group(1)
        if rom in YEAR_MAP:
            return YEAR_MAP[rom]
    digits = re.findall(r'\b([1-4])\b', upper) or re.findall(r'([1-4])', upper)
    if digits:
        d = digits[0]
        if d in YEAR_MAP:
            return YEAR_MAP[d]
    return None

VALID_YEAR_SEMESTERS = {
    1: ['Semester 1', 'Semester 2'],
    2: ['Semester 3', 'Semester 4'],
    3: ['Semester 5', 'Semester 6'],
    4: ['Semester 7', 'Semester 8'],
}

SEMESTER_TO_YEAR = {
    'Semester 1': 1, 'Semester 2': 1,
    'Semester 3': 2, 'Semester 4': 2,
    'Semester 5': 3, 'Semester 6': 3,
    'Semester 7': 4, 'Semester 8': 4,
}

def validate_year_semester(study_year, semester):
    if not semester:
        return False, 'missing_semester', 'Semester information is missing. Please select a valid semester.'
    if study_year is None:
        study_year = SEMESTER_TO_YEAR.get(semester)
        return True, None, None
    valid_sems = VALID_YEAR_SEMESTERS.get(study_year, [])
    if semester not in valid_sems:
        exp = f'{valid_sems[0]} or {valid_sems[1]}' if len(valid_sems) >= 2 else str(valid_sems)
        return False, 'year_semester_mismatch', f'Study Year {study_year} does not correspond with {semester} (Expected {exp}).'
    return True, None, None


def normalize_header(h):
    if not h:
        return ""
    return re.sub(r'[\s_\-]+', ' ', str(h).strip().lower())


def detect_faculty_and_subject_columns(headers):
    """
    Detects faculty profile and teaching assignment columns supporting all common
    variations in capitalization, spaces, underscores, and abbreviations.
    """
    cols = {
        'fid': None,
        'name': None,
        'desig': None,
        'dept': None,
        'email': None,
        'ay': None,
        'sy': None,
        'sem': None,
        'sub_code': None,
        'sub_name': None,
        'sec': None,
        'ug_courses': None,
        'unspec_courses': None
    }
    for h in headers:
        if not h:
            continue
        hn = normalize_header(h)
        if not hn or hn in ('nan', 'none', 'null'):
            continue

        if cols['sub_code'] is None:
            if re.fullmatch(r'(?:subject|course|sub|paper)\s*(?:code|no|num|number|id)', hn) or hn in ('subject code', 'course code', 'sub code', 'subcode', 'coursecode', 'paper code', 'code'):
                if not re.search(r'faculty|employee|emp|staff|student|hall|ticket', hn):
                    cols['sub_code'] = h
                    continue

        if cols['sub_name'] is None:
            if re.fullmatch(r'(?:subject|course|sub|paper)\s*(?:name|title|description)', hn) or hn in ('subject name', 'course name', 'sub name', 'paper name', 'subject', 'course', 'paper'):
                if not re.search(r'faculty|candidate|staff|teacher|instructor|student|department|dept|branch', hn):
                    cols['sub_name'] = h
                    continue

        if cols['fid'] is None:
            if re.fullmatch(r'(?:faculty|emp|employee|staff|fac)\s*(?:id|code|no|num|number)', hn) or hn in ('faculty id', 'emp id', 'employee id', 'faculty code', 'staff id', 'fid', 'id'):
                if not re.search(r'subject|course|paper|hall|student|exam|session', hn):
                    cols['fid'] = h
                    continue

        if cols['name'] is None:
            if re.fullmatch(r'(?:faculty|candidate|teacher|instructor|staff|faculty\s*member)\s*name', hn) or hn in ('faculty name', 'candidate name', 'teacher name', 'instructor name', 'staff name', 'faculty member', 'faculty', 'staff', 'name'):
                if not re.search(r'dept|department|branch|subject|course|paper|college|school|exam|hall|student', hn):
                    cols['name'] = h
                    continue

        if cols['email'] is None:
            if re.fullmatch(r'(?:institutional\s*email|official\s*email|faculty\s*email|college\s*email|email\s*id|mail\s*id)', hn) or hn in ('email', 'e mail', 'mail', 'email id'):
                cols['email'] = h
                continue

        if cols['desig'] is None:
            if re.fullmatch(r'(?:designation|desig|title|role|position|cadre|rank)', hn):
                cols['desig'] = h
                continue

        if cols['dept'] is None:
            if re.fullmatch(r'(?:department\s*name|dept\s*name|department|dept|branch)', hn):
                cols['dept'] = h
                continue

        if cols['sem'] is None:
            if re.fullmatch(r'(?:semester\s*name|sem\s*name|sem\s*no|semester\s*no|semester|sem|term)', hn):
                cols['sem'] = h
                continue

        if cols['ay'] is None:
            if re.fullmatch(r'(?:academic\s*year|acad\s*year|ay|session)', hn):
                cols['ay'] = h
                continue

        if cols['sy'] is None:
            if re.fullmatch(r'(?:study\s*year|year\s*of\s*study|class\s*year|student\s*year|target\s*year)', hn):
                cols['sy'] = h
                continue

        if cols['sec'] is None:
            if re.fullmatch(r'(?:section\s*name|sec\s*name|section|sec)', hn):
                cols['sec'] = h
                continue

        if cols['ug_courses'] is None:
            if re.search(r'ug\s*courses|undergraduate', hn):
                cols['ug_courses'] = h
                continue

        if cols['unspec_courses'] is None:
            if re.search(r'not\s*stated|unspecified|ug\s*/\s*pg', hn):
                cols['unspec_courses'] = h
                continue

    # Fallback for generic 'Year' header
    if cols['ay'] is None and cols['sy'] is None:
        for h in headers:
            if not h:
                continue
            if normalize_header(h) == 'year':
                cols['ay'] = h
                break

    return cols


def parse_faculty_subject_file(file_path_or_storage, filename, subjects_catalogue=None, existing_faculty=None, default_ay="2026-2027", default_sem=None):
    """
    Unified Intelligent Parser & Auto-Matcher for Faculty Directory and Semester-Wise Teaching Allocations.
    Supports:
    1. Single sheet containing both faculty details and teaching-subject information.
    2. Multi-sheet workbooks (Profile sheet + Teaching sheet, or Semester-wise sheets).
    3. Row-by-row Academic Year, Study Year, Semester, Subject Code, Subject Name, Section.
    4. Faculty deduplication: reuses the same faculty record if they teach multiple subjects or appear across rows.
    5. Subject Catalogue matching: Primary by Subject Code, Secondary by Subject Name / Alias.
    6. Does not invent subject mappings if a row has only faculty details and no subject information.
    7. Deduplicates identical assignments for the same faculty, subject, AY, and semester.
    8. Flags unmatched subjects and semester/study-year mismatch errors for review.
    """
    subjects_catalogue = subjects_catalogue or []
    existing_faculty = existing_faculty or []
    norm_default_sem = normalize_semester(default_sem) if default_sem else None

    # Map existing faculty from DB: 1) ID, 2) Email, 3) Name
    id_to_fac = {}
    email_to_fac = {}
    name_to_fac = {}
    for ef in existing_faculty:
        fid = ef.get("faculty_id")
        if fid is not None:
            id_to_fac[str(fid).strip()] = ef
        if ef.get("email"):
            for em in re.findall(r'[\w\.-]+@[\w\.-]+', ef["email"].lower()):
                email_to_fac[em] = ef
        if ef.get("faculty_name"):
            name_to_fac[ef["faculty_name"].strip().lower()] = ef

    # Subject Catalogue Lookups
    subj_by_code = {}
    subj_by_code_clean = {}
    subj_by_name_clean = {}
    for s in subjects_catalogue:
        s_code = str(s.get("subject_code", "")).strip().upper()
        if s_code:
            subj_by_code[s_code] = s
            s_code_cl = re.sub(r'[^A-Z0-9]', '', s_code)
            if s_code_cl:
                subj_by_code_clean[s_code_cl] = s
        s_name = str(s.get("subject_name", "")).strip().lower()
        if s_name:
            s_name_cl = re.sub(r'[^a-z0-9]', '', s_name)
            if s_name_cl:
                subj_by_name_clean[s_name_cl] = s

    noise_pattern = re.compile(r'\b(?:level\s+not\s+stated|see\s+next\s+column|none|nil|n/a|na|no\s+courses)\b', re.IGNORECASE)

    faculty_records = []
    parsed_by_name = {}
    parsed_by_email = {}
    parsed_by_id = {}

    def add_or_get_faculty(raw_name, raw_desig, raw_dept, raw_email, raw_fid=None):
        raw_name = str(raw_name).strip() if raw_name is not None else ""
        if raw_name.lower() in ("nan", "none", "null", ""):
            raw_name = ""
        raw_desig = str(raw_desig).strip() if raw_desig is not None and str(raw_desig).strip().lower() not in ("nan", "none", "null", "") else "Faculty"
        raw_dept = str(raw_dept).strip() if raw_dept is not None and str(raw_dept).strip().lower() not in ("nan", "none", "null", "") else "CSE"
        raw_email = str(raw_email).strip() if raw_email is not None and str(raw_email).strip().lower() not in ("nan", "none", "null", "") else ""
        raw_fid = str(raw_fid).strip() if raw_fid is not None and str(raw_fid).strip().lower() not in ("nan", "none", "null", "") else None

        found_emails = [e.lower() for e in re.findall(r'[\w\.-]+@[\w\.-]+', raw_email)]
        primary_email = found_emails[0] if found_emails else (raw_email.lower().strip() if raw_email else None)

        if not raw_name and not raw_fid and not primary_email:
            return None

        # Check in already parsed records: 1) ID, 2) Email, 3) Name
        matched_rec = None
        if raw_fid and raw_fid in parsed_by_id:
            matched_rec = parsed_by_id[raw_fid]
        if not matched_rec and primary_email and primary_email in parsed_by_email:
            matched_rec = parsed_by_email[primary_email]
        if not matched_rec:
            for em in found_emails:
                if em in parsed_by_email:
                    matched_rec = parsed_by_email[em]
                    break
        if not matched_rec and raw_name and raw_name.lower() in parsed_by_name:
            matched_rec = parsed_by_name[raw_name.lower()]

        if matched_rec:
            if not matched_rec.get("email") and primary_email:
                matched_rec["email"] = primary_email
                parsed_by_email[primary_email] = matched_rec
            if (matched_rec.get("designation") == "Faculty" or not matched_rec.get("designation")) and raw_desig != "Faculty":
                matched_rec["designation"] = raw_desig
            if not matched_rec.get("raw_faculty_id") and raw_fid:
                matched_rec["raw_faculty_id"] = raw_fid
                parsed_by_id[raw_fid] = matched_rec
            if (matched_rec.get("department") == "CSE" or not matched_rec.get("department")) and raw_dept != "CSE":
                matched_rec["department"] = raw_dept
            if not matched_rec.get("faculty_name") and raw_name:
                matched_rec["faculty_name"] = raw_name
                parsed_by_name[raw_name.lower()] = matched_rec
            return matched_rec

        # Match against DB existing faculty: 1) ID, 2) Email, 3) Name
        matched_ef = None
        matched_by = None
        if raw_fid and str(raw_fid) in id_to_fac:
            matched_ef = id_to_fac[str(raw_fid)]
            matched_by = "id"
        if not matched_ef and primary_email and primary_email in email_to_fac:
            matched_ef = email_to_fac[primary_email]
            matched_by = "email"
        if not matched_ef:
            for em in found_emails:
                if em in email_to_fac:
                    matched_ef = email_to_fac[em]
                    matched_by = "email"
                    break
        if not matched_ef and raw_name:
            matched_ef = name_to_fac.get(raw_name.lower())
            if matched_ef:
                matched_by = "name"

        final_name = raw_name or (matched_ef.get("faculty_name") if matched_ef else f"Faculty-{raw_fid or len(faculty_records)+1}")
        rec = {
            "row_index": len(faculty_records) + 1,
            "raw_faculty_id": raw_fid,
            "faculty_name": final_name,
            "designation": raw_desig or (matched_ef.get("designation") if matched_ef else "Faculty"),
            "department": (raw_dept or (matched_ef.get("department") if matched_ef else "CSE")).upper(),
            "email": primary_email or (matched_ef.get("email") if matched_ef else ""),
            "all_emails": found_emails,
            "matched_faculty_id": matched_ef["faculty_id"] if matched_ef else None,
            "matched_by": matched_by,
            "is_existing": matched_ef is not None,
            "total_courses": 0,
            "matched_courses": 0,
            "unmatched_courses": 0
        }
        faculty_records.append(rec)
        if final_name:
            parsed_by_name[final_name.lower()] = rec
        if primary_email:
            parsed_by_email[primary_email] = rec
        for em in found_emails:
            parsed_by_email[em] = rec
        if raw_fid:
            parsed_by_id[raw_fid] = rec
        return rec

    auto_matched = []
    unmatched = []
    seen_assignments = set()
    temp_counter = 0
    total_teaching_rows_detected = 0
    duplicate_count = 0

    def process_row_teaching(fac_rec, row_dict, cols):
        nonlocal temp_counter, total_teaching_rows_detected, duplicate_count

        raw_code = str(row_dict.get(cols['sub_code']) or "").strip() if cols.get('sub_code') else ""
        raw_name = str(row_dict.get(cols['sub_name']) or "").strip() if cols.get('sub_name') else ""

        if raw_code.lower() in ("nan", "none", "null", "-", "nil", "n/a", "na"):
            raw_code = ""
        if raw_name.lower() in ("nan", "none", "null", "-", "nil", "n/a", "na"):
            raw_name = ""

        legacy_courses = []
        if not raw_code and not raw_name:
            if cols.get('ug_courses') and row_dict.get(cols['ug_courses']):
                for c_str in re.split(r'[;\n|]', str(row_dict.get(cols['ug_courses']))):
                    c_clean = c_str.strip()
                    if c_clean and not noise_pattern.search(c_clean) and c_clean.lower() not in ("nan", "none", "null", ""):
                        legacy_courses.append((c_clean, "UG Profile Courses"))
            if cols.get('unspec_courses') and row_dict.get(cols['unspec_courses']):
                for c_str in re.split(r'[;\n|]', str(row_dict.get(cols['unspec_courses']))):
                    c_clean = c_str.strip()
                    if c_clean and not noise_pattern.search(c_clean) and c_clean.lower() not in ("nan", "none", "null", ""):
                        legacy_courses.append((c_clean, "Teaching Level Unspecified"))

        # If no subject information in this row, do not invent subject mappings!
        if not raw_code and not raw_name and not legacy_courses:
            return

        row_ay = str(row_dict.get(cols['ay']) or "").strip() if cols.get('ay') else ""
        if not row_ay or row_ay.lower() in ("nan", "none", "null", ""):
            row_ay = default_ay

        row_sem_raw = row_dict.get(cols['sem']) if cols.get('sem') else None
        normalized_row_sem = normalize_semester(row_sem_raw)

        row_sec = str(row_dict.get(cols['sec']) or "").strip() if cols.get('sec') else ""
        if row_sec.lower() in ("nan", "none", "null", ""):
            row_sec = ""

        items_to_match = []
        if raw_code or raw_name:
            disp = f"{raw_code} - {raw_name}" if (raw_code and raw_name) else (raw_code or raw_name)
            items_to_match.append((raw_code, raw_name, disp, "Teaching Assignment"))
        for l_name, l_class in legacy_courses:
            items_to_match.append(("", l_name, l_name, l_class))

        for c_code, c_name, disp_name, c_class in items_to_match:
            total_teaching_rows_detected += 1
            fac_rec["total_courses"] += 1

            matched_subj = None
            conf = "none"
            m_type = "none"

            # 1. Primary match: Subject Code
            if c_code:
                code_up = c_code.upper()
                if code_up in subj_by_code:
                    matched_subj = subj_by_code[code_up]
                    conf = "exact"
                    m_type = "code"
                else:
                    code_cl = re.sub(r'[^A-Z0-9]', '', code_up)
                    if code_cl in subj_by_code_clean:
                        matched_subj = subj_by_code_clean[code_cl]
                        conf = "exact"
                        m_type = "code"

            # 2. Secondary match: Subject Name / Alias
            if not matched_subj and c_name:
                name_cl = re.sub(r'[^a-z0-9]', '', c_name.lower())
                if name_cl in subj_by_name_clean:
                    matched_subj = subj_by_name_clean[name_cl]
                    conf = "exact"
                    m_type = "exact_name"
                else:
                    matched_subj, conf = match_course_to_subject(c_name, subjects_catalogue)
                    if matched_subj:
                        m_type = "alias" if conf == "exact" else "fuzzy"

            # 3. Fallback on combined display name
            if not matched_subj and disp_name and disp_name != c_name:
                matched_subj, conf = match_course_to_subject(disp_name, subjects_catalogue)
                if matched_subj:
                    m_type = "alias" if conf == "exact" else "fuzzy"

            # Determine Effective Semester
            if normalized_row_sem:
                eff_sem = normalized_row_sem
            elif norm_default_sem:
                eff_sem = norm_default_sem
            elif matched_subj and matched_subj.get("semester"):
                eff_sem = normalize_semester(matched_subj["semester"])
            else:
                eff_sem = None

            # Determine Effective Study Year
            row_sy_raw = row_dict.get(cols['sy']) if cols.get('sy') else None
            normalized_row_sy = normalize_study_year(row_sy_raw)
            if normalized_row_sy:
                eff_sy = normalized_row_sy
            elif eff_sem and eff_sem in SEMESTER_TO_YEAR:
                eff_sy = SEMESTER_TO_YEAR[eff_sem]
            elif matched_subj and matched_subj.get("study_year"):
                eff_sy = normalize_study_year(matched_subj["study_year"])
            else:
                eff_sy = None

            is_valid, err_type, err_msg = validate_year_semester(eff_sy, eff_sem)

            # Deduplication key for assignments within this file upload
            f_ident = fac_rec.get("raw_faculty_id") or fac_rec.get("email") or fac_rec["faculty_name"].lower()
            if matched_subj:
                dedup_key = (f_ident, matched_subj["subject_id"], row_ay, eff_sem)
            else:
                dedup_key = (f_ident, (c_code or "").upper(), (c_name or "").lower(), row_ay, eff_sem)

            if dedup_key in seen_assignments:
                duplicate_count += 1
                continue
            seen_assignments.add(dedup_key)

            temp_counter += 1
            if matched_subj:
                fac_rec["matched_courses"] += 1
                auto_matched.append({
                    "temp_id": f"m-{temp_counter}",
                    "faculty_name": fac_rec["faculty_name"],
                    "faculty_id": fac_rec["matched_faculty_id"],
                    "raw_faculty_id": fac_rec.get("raw_faculty_id"),
                    "email": fac_rec["email"],
                    "course_name": disp_name,
                    "course_code": c_code or matched_subj.get("subject_code"),
                    "classification": c_class,
                    "subject_id": matched_subj["subject_id"],
                    "subject_code": matched_subj["subject_code"],
                    "subject_name": matched_subj["subject_name"],
                    "academic_year": row_ay,
                    "study_year": eff_sy,
                    "semester": eff_sem,
                    "section": row_sec,
                    "match_confidence": conf,
                    "match_type": m_type,
                    "is_valid": is_valid,
                    "validation_error_type": err_type,
                    "validation_error": err_msg
                })
            else:
                fac_rec["unmatched_courses"] += 1
                unmatched.append({
                    "temp_id": f"u-{temp_counter}",
                    "faculty_name": fac_rec["faculty_name"],
                    "faculty_id": fac_rec["matched_faculty_id"],
                    "raw_faculty_id": fac_rec.get("raw_faculty_id"),
                    "email": fac_rec["email"],
                    "course_name": disp_name,
                    "course_code": c_code,
                    "course_title": c_name,
                    "classification": c_class,
                    "academic_year": row_ay,
                    "study_year": eff_sy,
                    "semester": eff_sem,
                    "section": row_sec,
                    "suggested_subject_id": None,
                    "is_valid": is_valid,
                    "validation_error_type": err_type,
                    "validation_error": err_msg
                })

    filename_lower = filename.lower()
    if filename_lower.endswith(".csv"):
        if hasattr(file_path_or_storage, "seek"):
            file_path_or_storage.seek(0)
        df = pd.read_csv(file_path_or_storage)
        headers = [str(c).strip() for c in df.columns]
        cols = detect_faculty_and_subject_columns(headers)
        for _, row in df.iterrows():
            row_dict = {headers[i]: row[c] for i, c in enumerate(df.columns)}
            raw_name = row_dict.get(cols['name']) if cols['name'] else None
            raw_fid = row_dict.get(cols['fid']) if cols['fid'] else None
            raw_desig = row_dict.get(cols['desig']) if cols['desig'] else "Faculty"
            raw_dept = row_dict.get(cols['dept']) if cols['dept'] else "CSE"
            raw_email = row_dict.get(cols['email']) if cols['email'] else ""

            fac_rec = add_or_get_faculty(raw_name, raw_desig, raw_dept, raw_email, raw_fid)
            if not fac_rec:
                continue
            process_row_teaching(fac_rec, row_dict, cols)

    elif filename_lower.endswith((".xlsx", ".xls")):
        if hasattr(file_path_or_storage, "seek"):
            file_path_or_storage.seek(0)
        wb = openpyxl.load_workbook(file_path_or_storage, data_only=True)
        sheet_info = []
        for s in wb.sheetnames:
            ws = wb[s]
            if ws.max_row < 2:
                continue
            headers = [str(ws.cell(1, c).value or "").strip() for c in range(1, ws.max_column + 1)]
            cols = detect_faculty_and_subject_columns(headers)
            has_faculty = bool(cols['name'] or cols['fid'] or cols['email'])
            has_subject = bool(cols['sub_code'] or cols['sub_name'] or cols['ug_courses'] or cols['unspec_courses'])
            if has_faculty or has_subject:
                sheet_info.append({
                    'sheet_name': s,
                    'ws': ws,
                    'headers': headers,
                    'cols': cols,
                    'has_faculty': has_faculty,
                    'has_subject': has_subject,
                    'is_profile_only': has_faculty and not has_subject
                })

        # Process profile-only sheets first so faculty records exist before teaching allocations
        sorted_sheets = sorted(sheet_info, key=lambda x: 0 if x['is_profile_only'] else 1)
        for s_item in sorted_sheets:
            ws = s_item['ws']
            cols = s_item['cols']
            headers = s_item['headers']
            for r in range(2, ws.max_row + 1):
                row_dict = {headers[c - 1]: ws.cell(r, c).value for c in range(1, ws.max_column + 1)}
                raw_name = row_dict.get(cols['name']) if cols['name'] else None
                raw_fid = row_dict.get(cols['fid']) if cols['fid'] else None
                raw_desig = row_dict.get(cols['desig']) if cols['desig'] else "Faculty"
                raw_dept = row_dict.get(cols['dept']) if cols['dept'] else "CSE"
                raw_email = row_dict.get(cols['email']) if cols['email'] else ""

                fac_rec = add_or_get_faculty(raw_name, raw_desig, raw_dept, raw_email, raw_fid)
                if not fac_rec:
                    continue
                if s_item['has_subject']:
                    process_row_teaching(fac_rec, row_dict, cols)

    all_allocations = list(auto_matched) + list(unmatched)
    groups_dict = {}
    detected_semesters = set()
    semester_counts = {}

    for alloc in all_allocations:
        ay = alloc.get("academic_year") or default_ay
        sem = alloc.get("semester")
        sy = alloc.get("study_year")
        if sem:
            detected_semesters.add(sem)
            semester_counts[sem] = semester_counts.get(sem, 0) + 1
        else:
            semester_counts["Missing Semester"] = semester_counts.get("Missing Semester", 0) + 1

        unassigned_str = "unassigned"
        group_key = f"{ay}__{sem or unassigned_str}"
        if group_key not in groups_dict:
            year_name = f"Year {sy}" if sy else (f"Year {SEMESTER_TO_YEAR[sem]}" if sem in SEMESTER_TO_YEAR else "—")
            groups_dict[group_key] = {
                "group_id": group_key,
                "academic_year": ay,
                "semester": sem,
                "semester_label": sem if sem else "⚠️ Missing Semester (Action Required)",
                "study_year": sy,
                "study_year_name": year_name,
                "total_count": 0,
                "auto_matched_count": 0,
                "unmatched_count": 0,
                "error_count": 0,
                "faculty_names": set(),
                "allocations": []
            }
        g = groups_dict[group_key]
        g["total_count"] += 1
        if "subject_id" in alloc and alloc["subject_id"]:
            g["auto_matched_count"] += 1
        else:
            g["unmatched_count"] += 1
        if not alloc.get("is_valid", True):
            g["error_count"] += 1
        g["faculty_names"].add(alloc["faculty_name"])
        g["allocations"].append(alloc)

    def sem_sort_key(g):
        sem = g["semester"]
        ay = g["academic_year"]
        digits = ''.join(c for c in str(sem) if c.isdigit())
        num = int(digits) if digits else 99
        return (ay, num)

    grouped_by_semester = []
    for g in sorted(groups_dict.values(), key=sem_sort_key):
        g["faculty_count"] = len(g["faculty_names"])
        g["faculty_names"] = sorted(list(g["faculty_names"]))
        grouped_by_semester.append(g)

    total_errors = sum(1 for a in all_allocations if not a.get("is_valid", True))

    return {
        "faculty_records": faculty_records,
        "auto_matched": auto_matched,
        "unmatched": unmatched,
        "grouped_by_semester": grouped_by_semester,
        "summary": {
            "total_faculty": len(faculty_records),
            "total_unique_faculty": len(faculty_records),
            "new_faculty": sum(1 for f in faculty_records if not f["is_existing"]),
            "new_faculty_count": sum(1 for f in faculty_records if not f["is_existing"]),
            "existing_faculty": sum(1 for f in faculty_records if f["is_existing"]),
            "existing_faculty_matched": sum(1 for f in faculty_records if f["is_existing"]),
            "total_course_entries": len(all_allocations),
            "teaching_rows_detected": total_teaching_rows_detected,
            "valid_teaching_assignments": len(auto_matched),
            "auto_matched_count": len(auto_matched),
            "unmatched_teaching_assignments": len(unmatched),
            "unmatched_count": len(unmatched),
            "duplicate_teaching_assignments": duplicate_count,
            "invalid_rows_count": total_errors,
            "error_count": total_errors,
            "semesters_detected": sorted(list(detected_semesters)),
            "semester_breakdown": semester_counts,
            "academic_year": default_ay,
            "default_semester": default_sem
        },
        "available_subjects": subjects_catalogue
    }



# ==============================================================================
# WORKFLOW A & B: DEDICATED FACULTY DIRECTORY & SEMESTER TEACHING PARSERS
# ==============================================================================

FACULTY_TITLE_REGEX = re.compile(r'^(dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?|capt\.?|col\.?)\s+', re.IGNORECASE)

def get_faculty_title(name):
    m = re.match(r'^(dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?|capt\.?|col\.?)\b', str(name or '').strip(), re.IGNORECASE)
    return m.group(1).lower().replace('.', '') if m else ''

def clean_faculty_name(n):
    if not n:
        return ""
    n = FACULTY_TITLE_REGEX.sub('', str(n).strip())
    n = re.sub(r'[.,]', ' ', n)
    return " ".join(n.lower().split())

KNOWN_FACULTY_ALIASES = {
    "dr nk santosh": "dr n krishna santosh",
    "nk santosh": "n krishna santosh",
    "dr kl revathi": "dr k lakshmi revathi",
    "kl revathi": "k lakshmi revathi",
    "mr p satyendra": "mr paruchuri satyendra",
    "p satyendra": "paruchuri satyendra",
    "mrs g himaja": "mrs gadi himaja",
    "g himaja": "gadi himaja",
    "mr ar pratap": "mr a raghu vira pratap",
    "ar pratap": "a raghu vira pratap",
    "dr ashutosh s": "dr ashutosh satapathy",
    "ashutosh s": "ashutosh satapathy",
    "dr shaik gausia anjum": "dr ghousia anjum shaik",
    "dr g anjum shaik": "dr ghousia anjum shaik",
    "shaik gausia anjum": "ghousia anjum shaik",
    "g anjum shaik": "ghousia anjum shaik",
    "dr n malarvizhi": "dr malarvizhi n",
    "n malarvizhi": "malarvizhi n",
    "mrs g indra sree": "mrs g indrasree",
    "g indra sree": "g indrasree",
    "dr t bindu madhavi": "dr t bindhu madhavi",
    "t bindu madhavi": "t bindhu madhavi",
    "dr t bindhu madhavi": "dr t bindu madhavi",
    "t bindhu madhavi": "t bindu madhavi",
    "mr u prabu": "mr u prabu",
}

KNOWN_SUBJECT_ALIASES = {
    # 24MA201 in SEM3 is Probability & Statistics (catalog code 24MA203)
    "24MA201": "24MA203",
}

def derive_study_year_from_semester(semester_str):
    if not semester_str:
        return 2
    digits = re.findall(r'\d+', str(semester_str))
    if not digits:
        return 2
    sem_num = int(digits[0])
    if sem_num in [1, 2]:
        return 1
    elif sem_num in [3, 4]:
        return 2
    elif sem_num in [5, 6]:
        return 3
    elif sem_num in [7, 8]:
        return 4
    return 2

def normalize_semester_name(semester_str):
    if not semester_str:
        return "Semester 3"
    digits = re.findall(r'\d+', str(semester_str))
    if digits:
        return f"Semester {digits[0]}"
    return str(semester_str).strip()

def split_sections(sec_str):
    if not sec_str:
        return [None]
    raw = str(sec_str).strip()
    if not raw or raw.lower() in ("nan", "none", "null", "all"):
        return [None]
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    secs = []
    for p in parts:
        clean = re.sub(r'^(section|sec|cse[-\s]?)', '', p, flags=re.IGNORECASE).strip()
        m = re.search(r'\b([A-Z]\d?)\b', clean)
        if m:
            secs.append(m.group(1))
        elif clean:
            secs.append(clean)
    return secs if secs else [None]

def match_faculty_record(query_name, query_email, query_id, existing_faculty):
    """
    Matches query against existing faculty using the strict hierarchy:
    1. Faculty ID (if available)
    2. Normalized institutional email (if available)
    3. Exact normalized faculty name & verified aliases (with title disambiguation)
    4. Exact word-set match (handles reversed name order like 'Malarvizhi N' <-> 'N Malarvizhi')
    
    Prevents false matches:
    - Never uses single-initial or fuzzy initials matching.
    - Never matches an existing faculty member if both have differing institutional emails.
    - Uses title (Dr vs Mrs vs Mr vs Ms) to disambiguate identical clean names (e.g. Dr. K. Keerthi vs Mrs. K. Keerthi).
    - If no confident match is found, returns None so callers can request correction or create a new record.
    """
    if query_id is not None:
        q_id_str = str(query_id).strip()
        if q_id_str:
            for ef in existing_faculty:
                if str(ef.get("faculty_id", "")).strip() == q_id_str:
                    return ef

    q_em = str(query_email or "").strip().lower()
    if q_em and "@" in q_em:
        for ef in existing_faculty:
            ef_em = str(ef.get("email") or "").strip().lower()
            if ef_em:
                ef_emails = [e.strip() for e in ef_em.split(";")]
                if q_em in ef_emails:
                    return ef

    if not query_name:
        return None

    raw_clean = clean_faculty_name(query_name)
    raw_lower = str(query_name).strip().lower()
    q_title = get_faculty_title(query_name)

    def email_conflicts(ef):
        if not q_em or "@" not in q_em:
            return False
        ef_em = str(ef.get("email") or "").strip().lower()
        if not ef_em or "@" not in ef_em:
            return False
        ef_emails = [e.strip() for e in ef_em.split(";")]
        return q_em not in ef_emails

    # 1. Check verified aliases
    alias = KNOWN_FACULTY_ALIASES.get(raw_lower) or KNOWN_FACULTY_ALIASES.get(raw_clean)
    if alias:
        alias_clean = clean_faculty_name(alias)
        candidates = [ef for ef in existing_faculty if clean_faculty_name(ef.get("faculty_name", "")) == alias_clean and not email_conflicts(ef)]
        if len(candidates) == 1:
            return candidates[0]
        elif len(candidates) > 1:
            if q_title:
                for c in candidates:
                    if get_faculty_title(c.get("faculty_name", "")) == q_title:
                        return c
            return candidates[0]

    # 2. Exact clean normalized name match
    candidates = [ef for ef in existing_faculty if clean_faculty_name(ef.get("faculty_name", "")) == raw_clean and not email_conflicts(ef)]
    if len(candidates) == 1:
        return candidates[0]
    elif len(candidates) > 1:
        if q_title:
            for c in candidates:
                if get_faculty_title(c.get("faculty_name", "")) == q_title:
                    return c
        return candidates[0]

    # 3. Exact word set match (order-independent, e.g. 'Malarvizhi N' <-> 'N Malarvizhi' or 'Mohammed Ismail B' <-> 'B Mohammed Ismail')
    raw_words = set(raw_clean.split())
    if len(raw_words) >= 2:
        candidates = [ef for ef in existing_faculty if set(clean_faculty_name(ef.get("faculty_name", "")).split()) == raw_words and not email_conflicts(ef)]
        if len(candidates) == 1:
            return candidates[0]
        elif len(candidates) > 1:
            if q_title:
                for c in candidates:
                    if get_faculty_title(c.get("faculty_name", "")) == q_title:
                        return c
            return candidates[0]

    return None

def match_subject_record(query_code, query_name, subjects_catalogue, semester_hint=None):
    """
    Matches query against Subject Catalogue using:
    1. Exact subject code
    2. Verified subject aliases (e.g. 24MA201 -> 24MA203)
    3. Clean alphanumeric code
    4. Exact subject name in semester
    Does not guess or invent mappings.
    """
    if not query_code and not query_name:
        return None

    raw_code = str(query_code or "").strip().upper()
    raw_name = str(query_name or "").strip()

    # 1. Subject code alias
    if raw_code in KNOWN_SUBJECT_ALIASES:
        target = KNOWN_SUBJECT_ALIASES[raw_code]
        for s in subjects_catalogue:
            if str(s.get("subject_code", "")).strip().upper() == target:
                return s

    # 2. Exact code match
    if raw_code:
        for s in subjects_catalogue:
            if str(s.get("subject_code", "")).strip().upper() == raw_code:
                return s

        clean_code = re.sub(r'[^A-Z0-9]', '', raw_code)
        if clean_code:
            for s in subjects_catalogue:
                if re.sub(r'[^A-Z0-9]', '', str(s.get("subject_code", "")).strip().upper()) == clean_code:
                    return s

    # 3. Exact name match
    if raw_name:
        raw_name_clean = re.sub(r'[^a-z0-9]', '', raw_name.lower())
        for s in subjects_catalogue:
            s_name = str(s.get("subject_name", "")).strip()
            if s_name.lower() == raw_name.lower() or re.sub(r'[^a-z0-9]', '', s_name.lower()) == raw_name_clean:
                return s

    return None

def parse_faculty_directory_file(file_storage_or_path, filename):
    """
    Upload 1 Parser: Reads one master Excel/CSV file containing faculty details.
    Extracts: Faculty ID, Faculty Name, Designation, Department, Institutional Email.
    Deduplicates within file so each faculty member appears only once.
    """
    is_excel = filename.lower().endswith(('.xlsx', '.xls'))
    
    if is_excel:
        if hasattr(file_storage_or_path, 'seek'):
            file_storage_or_path.seek(0)
        wb = openpyxl.load_workbook(file_storage_or_path, data_only=True)
        target_ws = wb.worksheets[0]
        for ws in wb.worksheets:
            if 'faculty' in ws.title.lower():
                target_ws = ws
                break
        raw_rows = list(target_ws.iter_rows(values_only=True))
    else:
        if hasattr(file_storage_or_path, 'seek'):
            file_storage_or_path.seek(0)
            text = file_storage_or_path.read().decode('utf-8', errors='replace')
        else:
            with open(file_storage_or_path, 'r', encoding='utf-8', errors='replace') as f:
                text = f.read()
        raw_rows = list(csv.reader(io.StringIO(text)))

    if not raw_rows:
        return []

    # Detect header row
    header_idx = None
    name_idx = None
    desig_idx = None
    dept_idx = None
    email_idx = None
    id_idx = None

    for r_idx, row in enumerate(raw_rows[:15]):
        row_str = [str(c or "").strip().lower() for c in row]
        if any("faculty" in c or "name" in c for c in row_str):
            for c_idx, col in enumerate(row_str):
                if re.search(r'(faculty\s*name|staff\s*name|full\s*name|^name$)', col):
                    name_idx = c_idx
                elif re.search(r'(designation|post|role|cadre|title)', col):
                    desig_idx = c_idx
                elif re.search(r'(department|dept|branch)', col):
                    dept_idx = c_idx
                elif re.search(r'(institutional\s*email|official\s*email|email\s*id|^email$|mail)', col):
                    email_idx = c_idx
                elif re.search(r'(faculty\s*id|staff\s*id|emp\s*id|employee\s*id|s\.no|sl\.no)', col):
                    id_idx = c_idx
            if name_idx is not None:
                header_idx = r_idx
                break

    if header_idx is None:
        header_idx = 0
        name_idx = 1
        desig_idx = 2
        email_idx = 5

    records = []
    seen = set()

    for row in raw_rows[header_idx + 1:]:
        if not row or all(c is None or str(c).strip() == "" for c in row):
            continue
        
        name = str(row[name_idx]).strip() if name_idx is not None and name_idx < len(row) and row[name_idx] else ""
        if not name or name.lower() in ("none", "null", "nan", "faculty name", "name"):
            continue

        desig = str(row[desig_idx]).strip() if desig_idx is not None and desig_idx < len(row) and row[desig_idx] else "Faculty"
        if not desig or desig.lower() in ("none", "null", "nan"):
            desig = "Faculty"

        dept = str(row[dept_idx]).strip() if dept_idx is not None and dept_idx < len(row) and row[dept_idx] else "CSE"
        if not dept or dept.lower() in ("none", "null", "nan"):
            dept = "CSE"

        raw_email = str(row[email_idx]).strip() if email_idx is not None and email_idx < len(row) and row[email_idx] else ""
        found_emails = [e.lower() for e in re.findall(r'[\w\.-]+@[\w\.-]+', raw_email)]
        primary_email = found_emails[0] if found_emails else (raw_email.lower() if raw_email and "@" in raw_email else None)

        raw_id = None
        if id_idx is not None and id_idx < len(row) and row[id_idx] is not None:
            raw_id_str = str(row[id_idx]).strip()
            if raw_id_str and raw_id_str.lower() not in ("none", "null", "nan"):
                raw_id = raw_id_str

        norm_n = clean_faculty_name(name)
        dedup_key = primary_email or norm_n
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        records.append({
            "faculty_name": name,
            "designation": desig,
            "department": dept,
            "email": primary_email,
            "all_emails": found_emails,
            "raw_faculty_id": raw_id
        })

    return records

def parse_semester_teaching_file(file_storage_or_path, filename, default_ay, default_sem, existing_faculty, subjects_catalogue):
    """
    Upload 2 Parser: Reads semester teaching assignments Excel/CSV.
    Auto-derives Study Year from Semester.
    Matches faculty against Faculty Directory (no duplicates created).
    Matches subjects against Subject Catalogue.
    Extracts sections and returns unambiguous valid mappings + concise exception lists.
    """
    is_excel = filename.lower().endswith(('.xlsx', '.xls'))
    
    # Auto-detect semester from default_sem, filename, sheet name
    detected_sem = default_sem
    if not detected_sem:
        m_fn = re.search(r'sem(?:ester)?[\s_-]*([1-8])', filename, re.IGNORECASE)
        if m_fn:
            detected_sem = f"Semester {m_fn.group(1)}"
            
    detected_ay = default_ay or "2026-2027"
    
    if is_excel:
        if hasattr(file_storage_or_path, 'seek'):
            file_storage_or_path.seek(0)
        wb = openpyxl.load_workbook(file_storage_or_path, data_only=True)
        chosen_ws = wb.worksheets[0]
        for ws in wb.worksheets:
            ws_low = ws.title.lower()
            if any(k in ws_low for k in ["section-wise", "section wise", "sem4", "sem5", "sem3", "assignments"]):
                chosen_ws = ws
                break
        raw_rows = list(chosen_ws.iter_rows(values_only=True))
        if not detected_sem:
            m_ws = re.search(r'sem(?:ester)?[\s_-]*([1-8])', chosen_ws.title, re.IGNORECASE)
            if m_ws:
                detected_sem = f"Semester {m_ws.group(1)}"
    else:
        if hasattr(file_storage_or_path, 'seek'):
            file_storage_or_path.seek(0)
            text = file_storage_or_path.read().decode('utf-8', errors='replace')
        else:
            with open(file_storage_or_path, 'r', encoding='utf-8', errors='replace') as f:
                text = f.read()
        raw_rows = list(csv.reader(io.StringIO(text)))

    if not detected_sem:
        detected_sem = "Semester 3"
    
    detected_sem = normalize_semester_name(detected_sem)
    study_year = derive_study_year_from_semester(detected_sem)

    # Detect header row
    header_idx = None
    fac_name_idx = None
    sub_code_idx = None
    sub_name_idx = None
    sec_idx = None
    ay_idx = None
    sem_idx = None
    fid_idx = None
    email_idx = None

    for r_idx, row in enumerate(raw_rows[:15]):
        row_str = [str(c or "").strip().lower() for c in row]
        if any("faculty" in c or "name" in c or "subject" in c or "course" in c for c in row_str):
            for c_idx, col in enumerate(row_str):
                if re.search(r'(faculty\s*name|instructor|staff\s*name|^faculty$)', col):
                    fac_name_idx = c_idx
                elif re.search(r'(subject\s*code|course\s*code|sub\s*code|^code$)', col):
                    sub_code_idx = c_idx
                elif re.search(r'(subject\s*name|course\s*name|sub\s*name|^course$|^subject$)', col):
                    sub_name_idx = c_idx
                elif re.search(r'(sections?\s*taught|section|sec)', col):
                    sec_idx = c_idx
                elif re.search(r'(academic\s*year|^ay$)', col):
                    ay_idx = c_idx
                elif re.search(r'(^sem$|^semester$)', col):
                    sem_idx = c_idx
                elif re.search(r'(faculty\s*id|staff\s*id|emp\s*id)', col):
                    fid_idx = c_idx
                elif re.search(r'(email)', col):
                    email_idx = c_idx
            if fac_name_idx is not None or sub_code_idx is not None:
                header_idx = r_idx
                break

    valid_mappings = []
    unmatched_faculty = []
    unmatched_subjects = []
    invalid_rows = []
    seen_map = set()

    for r_idx, row in enumerate(raw_rows[header_idx + 1:], start=header_idx + 2):
        if not row or all(c is None or str(c).strip() == "" for c in row):
            continue

        raw_fac = str(row[fac_name_idx]).strip() if fac_name_idx is not None and fac_name_idx < len(row) and row[fac_name_idx] else ""
        raw_code = str(row[sub_code_idx]).strip() if sub_code_idx is not None and sub_code_idx < len(row) and row[sub_code_idx] else ""
        raw_name = str(row[sub_name_idx]).strip() if sub_name_idx is not None and sub_name_idx < len(row) and row[sub_name_idx] else ""
        raw_sec = str(row[sec_idx]).strip() if sec_idx is not None and sec_idx < len(row) and row[sec_idx] else ""
        raw_fid = str(row[fid_idx]).strip() if fid_idx is not None and fid_idx < len(row) and row[fid_idx] else None
        raw_email = str(row[email_idx]).strip() if email_idx is not None and email_idx < len(row) and row[email_idx] else None

        row_sem = str(row[sem_idx]).strip() if sem_idx is not None and sem_idx < len(row) and row[sem_idx] else detected_sem
        row_sem = normalize_semester_name(row_sem)
        row_sy = derive_study_year_from_semester(row_sem)
        row_ay = str(row[ay_idx]).strip() if ay_idx is not None and ay_idx < len(row) and row[ay_idx] else detected_ay

        if not raw_fac and not raw_code and not raw_name:
            continue

        if not raw_fac:
            invalid_rows.append({"row": r_idx, "reason": "Missing faculty name"})
            continue

        if not raw_code and not raw_name:
            invalid_rows.append({"row": r_idx, "faculty_name": raw_fac, "reason": "Missing subject code and name"})
            continue

        # Match faculty against directory
        matched_fac = match_faculty_record(raw_fac, raw_email, raw_fid, existing_faculty)
        if not matched_fac:
            unmatched_faculty.append({
                "row": r_idx,
                "faculty_name": raw_fac,
                "subject_code": raw_code,
                "section": raw_sec,
                "reason": "Faculty member not found in Faculty Directory"
            })
            continue

        # Match subject against catalogue
        matched_subj = match_subject_record(raw_code, raw_name, subjects_catalogue, semester_hint=row_sem)
        if not matched_subj:
            unmatched_subjects.append({
                "row": r_idx,
                "faculty_name": raw_fac,
                "subject_code": raw_code,
                "subject_name": raw_name,
                "section": raw_sec,
                "reason": "Subject code or name not found in Subject Catalogue"
            })
            continue

        # Split multiple sections e.g. "A, B" or "CSE C, CSE D"
        sections = split_sections(raw_sec)
        for sec in sections:
            m_key = (matched_fac["faculty_id"], matched_subj["subject_id"], row_ay, row_sem, sec)
            if m_key in seen_map:
                continue
            seen_map.add(m_key)

            valid_mappings.append({
                "faculty_id": matched_fac["faculty_id"],
                "faculty_name": matched_fac["faculty_name"],
                "subject_id": matched_subj["subject_id"],
                "subject_code": matched_subj["subject_code"],
                "subject_name": matched_subj["subject_name"],
                "academic_year": row_ay,
                "study_year": row_sy,
                "semester": row_sem,
                "section": sec,
            })

    return {
        "filename": filename,
        "academic_year": detected_ay,
        "semester": detected_sem,
        "study_year": study_year,
        "valid_mappings": valid_mappings,
        "unmatched_faculty": unmatched_faculty,
        "unmatched_subjects": unmatched_subjects,
        "invalid_rows": invalid_rows,
    }
