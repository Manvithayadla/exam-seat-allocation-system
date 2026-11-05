import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

export default function Register({ onNavigateToLogin }) {
  const { signup } = useAuth();
  const [role, setRole] = useState("student"); // Only 'student' | 'invigilator' permitted

  // Form Fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [hallTicketNo, setHallTicketNo] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Faculty Invigilator Lookup
  const [facultyList, setFacultyList] = useState([]);
  const [loadingFaculty, setLoadingFaculty] = useState(false);
  const [facultySearch, setFacultySearch] = useState("");
  const [selectedFacultyId, setSelectedFacultyId] = useState("");
  const [selectedFaculty, setSelectedFaculty] = useState(null);

  // OTP Verification State
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpMessage, setOtpMessage] = useState("");
  const [otpError, setOtpError] = useState("");

  // Form State
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load faculty lookup when invigilator role is chosen
  useEffect(() => {
    if (role === "invigilator" && facultyList.length === 0) {
      loadFacultyLookup();
    }
  }, [role]);

  async function loadFacultyLookup() {
    setLoadingFaculty(true);
    try {
      const res = await api.getFacultyLookup();
      const list = Array.isArray(res.faculty) ? res.faculty : [];
      setFacultyList(list);
    } catch (err) {
      console.warn("Could not load faculty directory:", err);
    } finally {
      setLoadingFaculty(false);
    }
  }

  function handleRoleChange(newRole) {
    setRole(newRole);
    setError("");
    setSuccess("");
    setOtpSent(false);
    setOtpCode("");
    setOtpVerified(false);
    setOtpMessage("");
    setOtpError("");
    setFullName("");
    setEmail("");
    setHallTicketNo("");
    setSelectedFacultyId("");
    setSelectedFaculty(null);
  }

  function handleFacultySelect(e) {
    const facId = e.target.value;
    setSelectedFacultyId(facId);
    setError("");
    setOtpSent(false);
    setOtpCode("");
    setOtpVerified(false);
    setOtpMessage("");
    setOtpError("");

    if (!facId) {
      setSelectedFaculty(null);
      setFullName("");
      setEmail("");
      return;
    }

    const found = facultyList.find((f) => String(f.faculty_id) === String(facId));
    if (found) {
      setSelectedFaculty(found);
      setFullName(found.faculty_name);
      if (found.email) {
        setEmail(found.email);
      } else {
        const cleanName = found.faculty_name
          .replace(/Dr\.|Prof\.|Mr\.|Mrs\.|Ms\./gi, "")
          .trim()
          .toLowerCase();
        const parts = cleanName.split(/\s+/).filter(Boolean);
        let suggested = "faculty@vrsiddhartha.ac.in";
        if (parts.length >= 2) {
          suggested = `${parts[0][0]}.${parts[parts.length - 1]}@vrsiddhartha.ac.in`;
        } else if (parts.length === 1) {
          suggested = `${parts[0]}@vrsiddhartha.ac.in`;
        }
        setEmail(suggested);
      }
    } else {
      setSelectedFaculty(null);
    }
  }

  // Filtered faculty list
  const filteredFaculty = facultyList.filter((f) => {
    if (!facultySearch.trim()) return true;
    const q = facultySearch.toLowerCase();
    const idStr = String(f.faculty_id);
    const nameStr = (f.faculty_name || "").toLowerCase();
    const deptStr = (f.department || "").toLowerCase();
    return idStr.includes(q) || nameStr.includes(q) || deptStr.includes(q);
  });

  // Email format check helper
  const isEmailDomainValid = () => {
    if (!email) return true;
    const lower = email.trim().toLowerCase();
    return lower.includes("@") && lower.includes(".");
  };

  // Trigger Send OTP
  async function handleSendOtp() {
    setOtpError("");
    setOtpMessage("");
    setError("");

    const normEmail = email.trim().toLowerCase();
    if (!normEmail) {
      setOtpError("Please enter your institutional email before requesting a verification code.");
      return;
    }

    if (!normEmail.includes("@") || !normEmail.includes(".")) {
      setOtpError("Please enter a valid email address.");
      return;
    }

    setSendingOtp(true);
    try {
      const res = await api.sendOtp({
        email: normEmail,
        role: role,
        purpose: "registration",
      });
      setOtpSent(true);
      setOtpMessage(
        res.message || `Verification code sent to ${normEmail}. (Valid for 10 minutes)`
      );
      // Auto-fill OTP in testing/demo environments if returned
      if (res.otp) {
        setOtpCode(res.otp);
      }
    } catch (err) {
      setOtpError(err.message || "Failed to send verification code. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  }

  // Trigger Verify OTP
  async function handleVerifyOtp() {
    setOtpError("");
    setOtpMessage("");

    if (!otpCode.trim()) {
      setOtpError("Please enter the 6-digit verification code.");
      return;
    }

    setVerifyingOtp(true);
    try {
      const res = await api.verifyOtp({
        email: email.trim().toLowerCase(),
        otp: otpCode.trim(),
        purpose: "registration",
      });
      setOtpVerified(true);
      setOtpMessage("✓ Institutional email successfully verified!");
    } catch (err) {
      setOtpError(err.message || "Invalid or expired verification code.");
    } finally {
      setVerifyingOtp(false);
    }
  }

  // Handle Form Submission
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setError("Please fill in all required fields.");
      return;
    }

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Password and Confirm Password do not match.");
      return;
    }

    const normEmail = email.trim().toLowerCase();

    if (role === "student") {
      if (!hallTicketNo.trim()) {
        setError("Hall ticket number is required for student registration.");
        return;
      }
    }

    if (role === "invigilator") {
      if (!selectedFacultyId) {
        setError("Please select your Faculty record from the dropdown.");
        return;
      }
      if (selectedFaculty?.email && selectedFaculty.email.toLowerCase() !== normEmail) {
        setError(
          `The entered email does not match the registered institutional email for this faculty member (${selectedFaculty.email}).`
        );
        return;
      }
    }

    if (!otpVerified && !otpCode.trim()) {
      setError("Please verify your email address using the verification code (OTP) sent to your institutional email.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        full_name: fullName.trim(),
        email: normEmail,
        password,
        role,
        otp: otpCode.trim(),
        hall_ticket_no: role === "student" ? hallTicketNo.trim().toUpperCase() : undefined,
        faculty_id: role === "invigilator" ? parseInt(selectedFacultyId, 10) : undefined,
      };

      await signup(payload);
      setSuccess("Account registered successfully! You may now sign in.");
      setTimeout(() => {
        onNavigateToLogin();
      }, 1500);
    } catch (err) {
      setError(err.message || "Registration failed. Please check your details.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card" style={{ maxWidth: "520px" }}>
        <div className="auth-header">
          <div className="auth-badge">📝</div>
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">
            Siddhartha Academy of Higher Education &bull; CSE Department
          </p>
        </div>

        <div className="auth-body">
          {error && (
            <div className="alert alert-danger" style={{ marginBottom: "16px" }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="alert alert-success" style={{ marginBottom: "16px" }}>
              <span>✅</span>
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Role Selector: Strictly Student & Faculty Invigilator */}
            <div className="form-group">
              <label className="form-label">Select Your Role</label>
              <div className="pill-selector-group">
                <button
                  type="button"
                  className={`pill-option-btn ${role === "student" ? "active" : ""}`}
                  onClick={() => handleRoleChange("student")}
                >
                  🎓 Student
                </button>
                <button
                  type="button"
                  className={`pill-option-btn ${role === "invigilator" ? "active" : ""}`}
                  onClick={() => handleRoleChange("invigilator")}
                >
                  👨‍🏫 Faculty Invigilator
                </button>
              </div>
              <p className="form-helper" style={{ marginTop: "4px", fontSize: "11.5px" }}>
                {role === "student"
                  ? "For enrolled students with an active record in the institutional CSE roster."
                  : "For appointed CSE faculty members. Must pre-exist in the faculty directory."}
              </p>
            </div>

            {/* FACULTY INVIGILATOR: Searchable dropdown */}
            {role === "invigilator" && (
              <div className="form-group">
                <label className="form-label" htmlFor="reg-faculty-id">
                  Faculty Member <span className="form-label-required">*</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="🔍 Type to filter faculty by ID or name..."
                  value={facultySearch}
                  onChange={(e) => setFacultySearch(e.target.value)}
                  disabled={submitting || loadingFaculty}
                  style={{ marginBottom: "6px", fontSize: "12.5px" }}
                />
                <select
                  id="reg-faculty-id"
                  className="form-control"
                  value={selectedFacultyId}
                  onChange={handleFacultySelect}
                  required
                  disabled={submitting || loadingFaculty}
                >
                  <option value="">
                    {loadingFaculty
                      ? "-- Loading faculty roster... --"
                      : "-- Select Faculty ID & Name --"}
                  </option>
                  {filteredFaculty.map((fac) => (
                    <option
                      key={fac.faculty_id}
                      value={fac.faculty_id}
                      disabled={fac.has_account}
                    >
                      {fac.faculty_id} - {fac.faculty_name} ({fac.department || "CSE"})
                      {fac.has_account ? " [Already Registered]" : ""}
                    </option>
                  ))}
                </select>
                {selectedFaculty && (
                  <p
                    className="form-helper"
                    style={{ marginTop: "4px", color: "var(--accent-blue)", fontWeight: 500 }}
                  >
                    ✓ Linked: #{selectedFaculty.faculty_id} &bull; {selectedFaculty.faculty_name}
                  </p>
                )}
              </div>
            )}

            {/* STUDENT: Hall Ticket Number */}
            {role === "student" && (
              <div className="form-group">
                <label className="form-label" htmlFor="reg-ticket">
                  Roll Number / Hall Ticket Number <span className="form-label-required">*</span>
                </label>
                <input
                  id="reg-ticket"
                  type="text"
                  className="form-control"
                  placeholder="e.g. 24EU04001"
                  value={hallTicketNo}
                  onChange={(e) => setHallTicketNo(e.target.value.toUpperCase())}
                  required
                  disabled={submitting}
                />
                <p className="form-helper" style={{ fontSize: "11.5px" }}>
                  Must match your official university hall ticket number.
                </p>
              </div>
            )}

            {/* Full Name Field */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-fullname">
                Full Name <span className="form-label-required">*</span>
              </label>
              <input
                id="reg-fullname"
                type="text"
                className="form-control"
                placeholder={role === "student" ? "e.g. AKUNURI TANAVYA" : "e.g. Dr. M. Suresh"}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                readOnly={role === "invigilator" && Boolean(selectedFaculty)}
                disabled={submitting}
                style={{
                  backgroundColor:
                    role === "invigilator" && selectedFaculty ? "#f8fafc" : "#ffffff",
                }}
              />
              {role === "student" ? (
                <span className="form-helper" style={{ fontSize: "11.5px" }}>
                  Must exactly match the name in your academic roster.
                </span>
              ) : selectedFaculty ? (
                <span className="form-helper" style={{ fontSize: "11.5px" }}>
                  Auto-populated from institutional faculty roster.
                </span>
              ) : null}
            </div>

            {/* Institutional Email Address */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-email">
                Institutional Email Address <span className="form-label-required">*</span>
              </label>
              <input
                id="reg-email"
                type="email"
                className="form-control"
                placeholder="e.g. user@institution.edu or name@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setOtpVerified(false);
                }}
                required
                readOnly={role === "invigilator" && Boolean(selectedFaculty?.email)}
                disabled={submitting}
                style={{
                  backgroundColor:
                    role === "invigilator" && selectedFaculty?.email ? "#f8fafc" : "#ffffff",
                }}
              />
              <p className="form-helper" style={{ marginTop: "4px", fontSize: "11.5px" }}>
                A 6-digit verification code (OTP) will be sent to this email to verify ownership.
              </p>
            </div>

            {/* OTP Email Verification Section */}
            <div
              style={{
                backgroundColor: "#f1f5f9",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "12px",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <span style={{ fontSize: "12.5px", fontWeight: 600, color: "#1e293b" }}>
                  📧 Email Ownership Verification
                </span>
                {otpVerified ? (
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#166534",
                      backgroundColor: "#dcfce7",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      fontWeight: 600,
                    }}
                  >
                    ✓ Verified
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-navy"
                    style={{ fontSize: "11.5px", padding: "4px 10px" }}
                    onClick={handleSendOtp}
                    disabled={sendingOtp || !email.trim() || !isEmailDomainValid() || otpVerified}
                  >
                    {sendingOtp
                      ? "Sending Code..."
                      : otpSent
                      ? "Resend Code"
                      : "Send Verification Code"}
                  </button>
                )}
              </div>

              {otpMessage && (
                <p
                  style={{
                    fontSize: "11.5px",
                    color: otpVerified ? "#166534" : "#0369a1",
                    marginBottom: "6px",
                  }}
                >
                  {otpMessage}
                </p>
              )}

              {otpError && (
                <p style={{ fontSize: "11.5px", color: "#dc2626", marginBottom: "6px" }}>
                  ⚠️ {otpError}
                </p>
              )}

              {otpSent && !otpVerified && (
                <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Enter 6-digit code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.trim())}
                    maxLength={6}
                    disabled={verifyingOtp}
                    style={{ maxWidth: "160px", letterSpacing: "2px", fontWeight: 600 }}
                  />
                  <button
                    type="button"
                    className="btn btn-navy"
                    onClick={handleVerifyOtp}
                    disabled={verifyingOtp || otpCode.trim().length !== 6}
                    style={{ fontSize: "12px", padding: "6px 12px" }}
                  >
                    {verifyingOtp ? "Verifying..." : "Verify Code"}
                  </button>
                </div>
              )}
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-password">
                Password <span className="form-label-required">*</span>
              </label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  className="form-control"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={submitting}
                  style={{ paddingRight: "42px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: "10px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "16px",
                    color: "var(--text-muted)",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {showPassword ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="reg-confirm-password">
                Confirm Password <span className="form-label-required">*</span>
              </label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  id="reg-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  className="form-control"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={submitting}
                  style={{ paddingRight: "42px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  title={showConfirmPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: "10px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "16px",
                    color: "var(--text-muted)",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {showConfirmPassword ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p style={{ fontSize: "11.5px", color: "#dc2626", marginTop: "4px" }}>
                  ⚠️ Passwords do not match.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-navy"
              style={{ width: "100%", marginTop: "12px", padding: "10px" }}
              disabled={submitting}
            >
              {submitting ? "Registering Account..." : "Complete Registration"}
            </button>
          </form>

          <div
            style={{
              marginTop: "20px",
              textAlign: "center",
              fontSize: "12.5px",
              color: "var(--text-muted)",
            }}
          >
            Already have an account?{" "}
            <button
              type="button"
              onClick={onNavigateToLogin}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent-blue)",
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
