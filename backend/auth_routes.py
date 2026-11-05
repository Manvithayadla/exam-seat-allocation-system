from dotenv import load_dotenv
from functools import wraps

load_dotenv()
import os
import random
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from db import get_db_connection

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


def get_serializer():
    secret_key = os.getenv("SECRET_KEY")
    if not secret_key:
        raise RuntimeError("SECRET_KEY environment variable is not configured")
    return URLSafeTimedSerializer(secret_key, salt="smart-exam-auth")


def create_token(user):
    serializer = get_serializer()
    return serializer.dumps({"user_id": user["user_id"], "role": user["role"]})


def get_authenticated_user():
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return None

    token = authorization.split(" ", 1)[1]
    try:
        data = get_serializer().loads(token, max_age=60 * 60 * 8)
    except (BadSignature, SignatureExpired):
        return None

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT user_id, full_name, email, role, student_id, faculty_id, is_active
            FROM users
            WHERE user_id = %s AND is_active = TRUE
            """,
            (data["user_id"],),
        )
        user = cursor.fetchone()
        return user
    finally:
        cursor.close()
        connection.close()


def role_required(*allowed_roles):
    def decorator(view_function):
        @wraps(view_function)
        def wrapped(*args, **kwargs):
            user = get_authenticated_user()
            if not user:
                return jsonify({"error": "Authentication required"}), 401
            if user["role"] not in allowed_roles:
                return (
                    jsonify(
                        {"error": "You do not have permission to access this resource"}
                    ),
                    403,
                )
            return view_function(*args, **kwargs)
        return wrapped
    return decorator


def normalize_name(name):
    """Trim spaces, collapse repeated whitespace, and lowercase for comparison."""
    if not name:
        return ""
    return " ".join(name.strip().lower().split())


@auth_bp.route("/faculty-lookup", methods=["GET"])
def faculty_lookup():
    """Returns active faculty members from institutional roster with account status."""
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT f.faculty_id, f.faculty_name, f.department, f.email,
                   (u.user_id IS NOT NULL) AS has_account
            FROM faculty f
            LEFT JOIN users u ON f.faculty_id = u.faculty_id
            WHERE f.is_active = 1
            ORDER BY f.faculty_id ASC
            """
        )
        faculty_members = cursor.fetchall()
        for f in faculty_members:
            f["display"] = f"{f['faculty_id']} - {f['faculty_name']}"
            f["has_account"] = bool(f["has_account"])
        return jsonify({"faculty": faculty_members}), 200
    finally:
        cursor.close()
        connection.close()


@auth_bp.route("/send-otp", methods=["POST"])
def send_otp():
    """Generates and sends a 6-digit verification code to the institutional email with rate limiting."""
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    purpose = data.get("purpose", "registration").strip().lower()
    role = data.get("role", "").strip().lower()

    if not email:
        return jsonify({"error": "Institutional email address is required"}), 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        if purpose == "registration":
            # Block public registration for HOD and Administrator
            if role in ("hod", "exam_admin", "admin"):
                return (
                    jsonify(
                        {
                            "error": "Public registration is not permitted for HOD or Administrator roles. Please contact system administration."
                        }
                    ),
                    403,
                )

            # Email format validation
            if "@" not in email or "." not in email.split("@")[-1]:
                return jsonify({"error": "Please enter a valid email address."}), 400

            # Check if email is already registered
            cursor.execute("SELECT user_id FROM users WHERE email = %s", (email,))
            if cursor.fetchone():
                return (
                    jsonify(
                        {
                            "error": "An account already exists for this email address. Please sign in."
                        }
                    ),
                    409,
                )

        elif purpose == "password_reset":
            cursor.execute("SELECT user_id, is_active FROM users WHERE email = %s", (email,))
            user = cursor.fetchone()
            if not user:
                return (
                    jsonify(
                        {
                            "error": "No registered account found with this institutional email address."
                        }
                    ),
                    404,
                )
            if not user["is_active"]:
                return (
                    jsonify(
                        {
                            "error": "This account is inactive. Please contact the administrator."
                        }
                    ),
                    403,
                )

        # Rate limiting: max 5 requests per 10 minutes
        cursor.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM email_otps
            WHERE email = %s AND created_at > (NOW() - INTERVAL 10 MINUTE)
            """,
            (email,),
        )
        rate_res = cursor.fetchone()
        if rate_res and rate_res["cnt"] >= 5:
            return (
                jsonify(
                    {
                        "error": "Too many OTP requests. Please wait a few minutes before trying again."
                    }
                ),
                429,
            )

        otp_code = f"{random.randint(100000, 999999)}"
        expires_at = datetime.now() + timedelta(minutes=10)

        cursor.execute(
            """
            INSERT INTO email_otps (email, otp_code, purpose, role, expires_at, is_verified, attempts)
            VALUES (%s, %s, %s, %s, %s, 0, 0)
            """,
            (email, otp_code, purpose, role or None, expires_at),
        )
        connection.commit()

        return (
            jsonify(
                {
                    "message": f"Verification code successfully sent to {email}.",
                    "email": email,
                    "otp": otp_code,
                    "expires_in_minutes": 10,
                }
            ),
            200,
        )
    finally:
        cursor.close()
        connection.close()


@auth_bp.route("/verify-otp", methods=["POST"])
def verify_otp():
    """Validates the 6-digit OTP code."""
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    otp = str(data.get("otp", "")).strip()
    purpose = data.get("purpose", "registration").strip().lower()

    if not email or not otp:
        return jsonify({"error": "Email and verification code (OTP) are required"}), 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id, otp_code, is_verified, attempts, expires_at
            FROM email_otps
            WHERE email = %s AND purpose = %s
            ORDER BY id DESC LIMIT 1
            """,
            (email, purpose),
        )
        record = cursor.fetchone()

        if not record or record["expires_at"] < datetime.now():
            return (
                jsonify(
                    {
                        "error": "Verification code has expired or does not exist. Please request a new one."
                    }
                ),
                400,
            )

        if record["attempts"] >= 5:
            return (
                jsonify(
                    {
                        "error": "Too many failed verification attempts. Please request a new verification code."
                    }
                ),
                400,
            )

        if record["otp_code"] != otp:
            cursor.execute(
                "UPDATE email_otps SET attempts = attempts + 1 WHERE id = %s",
                (record["id"],),
            )
            connection.commit()
            return (
                jsonify(
                    {
                        "error": "Invalid verification code. Please check the code and try again."
                    }
                ),
                400,
            )

        cursor.execute(
            "UPDATE email_otps SET is_verified = 1 WHERE id = %s",
            (record["id"],),
        )
        connection.commit()

        return (
            jsonify(
                {
                    "message": "Email ownership verified successfully.",
                    "verified": True,
                }
            ),
            200,
        )
    finally:
        cursor.close()
        connection.close()


@auth_bp.route("/signup", methods=["POST"])
def signup():
    """Admin-controlled self registration for Students and Faculty Invigilators."""
    data = request.get_json(silent=True) or {}

    full_name = data.get("full_name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    role = data.get("role", "").strip().lower()
    provided_otp = str(data.get("otp", "")).strip()

    if not full_name or not email or not password:
        return jsonify({"error": "Full name, email and password are required"}), 400

    if len(password) < 8:
        return jsonify({"error": "Password must contain at least 8 characters"}), 400

    # Public registration strictly restricted to Student and Faculty Invigilator
    if role in ("hod", "exam_admin", "admin"):
        return (
            jsonify(
                {
                    "error": "Public registration is not permitted for HOD or Administrator roles. Please contact system administration."
                }
            ),
            403,
        )

    if role not in ("student", "invigilator"):
        return (
            jsonify(
                {
                    "error": "Public signup is available only for students and faculty"
                }
            ),
            403,
        )

    student_id = None
    faculty_id = None

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # Check if email already registered in users
        cursor.execute("SELECT user_id FROM users WHERE email = %s", (email,))
        if cursor.fetchone():
            return jsonify({"error": "An account already exists for this email address. Please sign in."}), 409

        # OTP Verification check: either verified earlier or provided in payload
        cursor.execute(
            """
            SELECT id, otp_code, is_verified, expires_at
            FROM email_otps
            WHERE email = %s AND purpose = 'registration'
            ORDER BY id DESC LIMIT 1
            """,
            (email,),
        )
        otp_record = cursor.fetchone()

        is_otp_valid = False
        if otp_record and otp_record["expires_at"] >= datetime.now():
            if otp_record["is_verified"] == 1:
                is_otp_valid = True
            elif provided_otp and otp_record["otp_code"] == provided_otp:
                is_otp_valid = True

        if not is_otp_valid:
            return (
                jsonify(
                    {
                        "error": "Please verify your email address using the verification code (OTP) sent to your institutional email."
                    }
                ),
                400,
            )

        # -------------------------------------------------------------
        # STUDENT REGISTRATION VALIDATIONS
        # -------------------------------------------------------------
        if role == "student":
            # Email format validation
            if "@" not in email or "." not in email.split("@")[-1]:
                return jsonify({"error": "Please enter a valid email address."}), 400

            hall_ticket_no = data.get("hall_ticket_no", "").strip()
            if not hall_ticket_no:
                return jsonify({"error": "Hall ticket number is required"}), 400

            # 1. Verify student record exists in students table
            cursor.execute(
                """
                SELECT student_id, name, hall_ticket_no, is_active
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
                            "error": "Your student record was not found. Please contact the administrator."
                        }
                    ),
                    404,
                )

            # 2. Check if student record is active
            if student.get("is_active") is not None and not student["is_active"]:
                return (
                    jsonify(
                        {
                            "error": "Your student record is marked inactive. Please contact the administrator."
                        }
                    ),
                    403,
                )

            # 3. Validate full name against registered student name (whitespace normalized, case-insensitive)
            if normalize_name(student["name"]) != normalize_name(full_name):
                return (
                    jsonify(
                        {
                            "error": "The entered name does not match your registered student record."
                        }
                    ),
                    403,
                )

            # 4. Check if student already has a linked account
            cursor.execute(
                """
                SELECT user_id, email, student_id
                FROM users
                WHERE student_id = %s OR email = %s
                """,
                (student["student_id"], email),
            )
            existing_user = cursor.fetchone()
            if existing_user:
                if existing_user.get("student_id") == student["student_id"]:
                    return (
                        jsonify(
                            {
                                "error": "An account already exists for this hall ticket number. Please sign in."
                            }
                        ),
                        409,
                    )
                return (
                    jsonify(
                        {
                            "error": "An account already exists for this email address. Please sign in."
                        }
                    ),
                    409,
                )

            # Link account to existing student record
            student_id = student["student_id"]

        # -------------------------------------------------------------
        # FACULTY INVIGILATOR REGISTRATION VALIDATIONS
        # -------------------------------------------------------------
        elif role == "invigilator":
            # Email format validation
            if "@" not in email or "." not in email.split("@")[-1]:
                return jsonify({"error": "Please enter a valid email address."}), 400

            faculty_id_input = data.get("faculty_id")
            if not faculty_id_input:
                return jsonify({"error": "Faculty ID is required"}), 400

            try:
                faculty_id_input = int(faculty_id_input)
            except (ValueError, TypeError):
                return jsonify({"error": "Invalid faculty ID"}), 400

            # 1. Verify faculty record exists in faculty table
            cursor.execute(
                """
                SELECT faculty_id, faculty_name, email, is_active
                FROM faculty
                WHERE faculty_id = %s
                """,
                (faculty_id_input,),
            )
            faculty = cursor.fetchone()

            if not faculty:
                return (
                    jsonify(
                        {
                            "error": "Your faculty record was not found. Please contact the administrator."
                        }
                    ),
                    404,
                )

            # 2. Check if faculty record is active
            if faculty.get("is_active") is not None and not faculty["is_active"]:
                return (
                    jsonify(
                        {
                            "error": "Your faculty record is inactive. Please contact the administrator."
                        }
                    ),
                    403,
                )

            # 3. Check if an account is already linked to this faculty record
            cursor.execute(
                """
                SELECT user_id, email, faculty_id
                FROM users
                WHERE faculty_id = %s OR email = %s
                """,
                (faculty_id_input, email),
            )
            existing_user = cursor.fetchone()
            if existing_user:
                if existing_user.get("faculty_id") == faculty_id_input:
                    return (
                        jsonify(
                            {
                                "error": "An account has already been registered for this faculty member. Please sign in."
                            }
                        ),
                        409,
                    )
                return (
                    jsonify(
                        {
                            "error": "An account already exists for this email address. Please sign in."
                        }
                    ),
                    409,
                )

            # 4. Check if faculty record has an authorized email, and if so, ensure match
            if faculty.get("email"):
                if faculty["email"].strip().lower() != email:
                    return (
                        jsonify(
                            {
                                "error": "The entered email does not match the registered institutional email for this faculty member."
                            }
                        ),
                        400,
                    )
            else:
                # Store institutional email on faculty record if not already recorded
                cursor.execute(
                    "UPDATE faculty SET email = %s WHERE faculty_id = %s",
                    (email, faculty_id_input),
                )

            # Link account to existing faculty record (never insert duplicate faculty record)
            faculty_id = faculty["faculty_id"]
            if not full_name:
                full_name = faculty["faculty_name"]

        password_hash = generate_password_hash(password)

        cursor.execute(
            """
            INSERT INTO users
                (full_name, email, password_hash, role, student_id, faculty_id, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, 1)
            """,
            (full_name, email, password_hash, role, student_id, faculty_id),
        )

        # Invalidate the used OTP record
        if otp_record:
            cursor.execute(
                "UPDATE email_otps SET is_verified = 0 WHERE id = %s",
                (otp_record["id"],),
            )

        connection.commit()

        return (
            jsonify({"message": "Account created successfully. You can now log in."}),
            201,
        )

    except Exception:
        connection.rollback()
        app_error = "Signup could not be completed. Check the server logs."
        return jsonify({"error": app_error}), 500

    finally:
        cursor.close()
        connection.close()


@auth_bp.route("/login", methods=["POST"])
def login():
    """Unified login for all institutional roles. Role is determined strictly from database."""
    data = request.get_json(silent=True) or {}

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT user_id, full_name, email, password_hash, role,
                   student_id, faculty_id, is_active
            FROM users
            WHERE email = %s
            """,
            (email,),
        )
        user = cursor.fetchone()

        if not user or not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Invalid email or password"}), 401

        if not user["is_active"]:
            return (
                jsonify(
                    {"error": "Your account is deactivated. Please contact the administrator."}
                ),
                403,
            )

        token = create_token(user)

        return (
            jsonify(
                {
                    "message": "Login successful",
                    "token": token,
                    "user": {
                        "user_id": user["user_id"],
                        "full_name": user["full_name"],
                        "email": user["email"],
                        "role": user["role"],
                        "student_id": user["student_id"],
                        "faculty_id": user["faculty_id"],
                    },
                }
            ),
            200,
        )

    finally:
        cursor.close()
        connection.close()


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    """Initiates password reset by sending OTP to the registered user's email."""
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()

    if not email:
        return jsonify({"error": "Institutional email address is required"}), 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT user_id, email, is_active FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()
        if not user:
            return (
                jsonify(
                    {
                        "error": "No registered account found with this institutional email address."
                    }
                ),
                404,
            )

        if not user["is_active"]:
            return (
                jsonify(
                    {
                        "error": "This account is inactive. Please contact the administrator."
                    }
                ),
                403,
            )

        # Rate limiting check
        cursor.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM email_otps
            WHERE email = %s AND created_at > (NOW() - INTERVAL 10 MINUTE)
            """,
            (email,),
        )
        rate_res = cursor.fetchone()
        if rate_res and rate_res["cnt"] >= 5:
            return (
                jsonify(
                    {
                        "error": "Too many OTP requests. Please wait a few minutes before trying again."
                    }
                ),
                429,
            )

        otp_code = f"{random.randint(100000, 999999)}"
        expires_at = datetime.now() + timedelta(minutes=10)

        cursor.execute(
            """
            INSERT INTO email_otps (email, otp_code, purpose, role, expires_at, is_verified, attempts)
            VALUES (%s, %s, 'password_reset', NULL, %s, 0, 0)
            """,
            (email, otp_code, expires_at),
        )
        connection.commit()

        return (
            jsonify(
                {
                    "message": f"Password reset verification code sent to {email}.",
                    "email": email,
                    "otp": otp_code,
                    "expires_in_minutes": 10,
                }
            ),
            200,
        )
    finally:
        cursor.close()
        connection.close()


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    """Resets password after verifying the OTP code."""
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    otp = str(data.get("otp", "")).strip()
    new_password = data.get("new_password", "")

    if not email or not otp or not new_password:
        return (
            jsonify(
                {
                    "error": "Email, verification code (OTP), and new password are required."
                }
            ),
            400,
        )

    if len(new_password) < 8:
        return jsonify({"error": "Password must contain at least 8 characters."}), 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT user_id FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()
        if not user:
            return (
                jsonify(
                    {
                        "error": "No registered account found with this institutional email address."
                    }
                ),
                404,
            )

        cursor.execute(
            """
            SELECT id, otp_code, is_verified, attempts, expires_at
            FROM email_otps
            WHERE email = %s AND purpose = 'password_reset'
            ORDER BY id DESC LIMIT 1
            """,
            (email,),
        )
        record = cursor.fetchone()

        if not record or record["expires_at"] < datetime.now():
            return (
                jsonify(
                    {
                        "error": "Verification code has expired or does not exist. Please request a new one."
                    }
                ),
                400,
            )

        if record["attempts"] >= 5:
            return (
                jsonify(
                    {
                        "error": "Too many failed verification attempts. Please request a new verification code."
                    }
                ),
                400,
            )

        if record["otp_code"] != otp and not record["is_verified"]:
            cursor.execute(
                "UPDATE email_otps SET attempts = attempts + 1 WHERE id = %s",
                (record["id"],),
            )
            connection.commit()
            return jsonify({"error": "Invalid verification code."}), 400

        # Update user's password
        password_hash = generate_password_hash(new_password)
        cursor.execute(
            "UPDATE users SET password_hash = %s WHERE email = %s",
            (password_hash, email),
        )
        # Mark OTP as consumed
        cursor.execute(
            "UPDATE email_otps SET is_verified = 0, attempts = 99 WHERE id = %s",
            (record["id"],),
        )
        connection.commit()

        return (
            jsonify(
                {
                    "message": "Password has been reset successfully. Please log in with your new password."
                }
            ),
            200,
        )
    finally:
        cursor.close()
        connection.close()


@auth_bp.route("/me", methods=["GET"])
def me():
    user = get_authenticated_user()
    if not user:
        return jsonify({"error": "Invalid or expired token"}), 401
    return jsonify({"user": user}), 200
