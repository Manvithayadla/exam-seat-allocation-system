import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

export default function Login({ onNavigateToRegister }) {
  const { login, authError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Forgot Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotError, setForgotError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const normEmail = email.trim().toLowerCase();
    if (!normEmail || !password) {
      setError("Please enter both your institutional email and password.");
      return;
    }

    setSubmitting(true);
    try {
      await login(normEmail, password);
    } catch (err) {
      setError(err.message || "Failed to sign in. Please verify your credentials.");
    } finally {
      setSubmitting(false);
    }
  }

  // Send OTP for Forgot Password
  async function handleSendForgotOtp() {
    setForgotError("");
    setForgotMessage("");

    const norm = forgotEmail.trim().toLowerCase();
    if (!norm) {
      setForgotError("Please enter your registered institutional email.");
      return;
    }

    setForgotLoading(true);
    try {
      const res = await api.forgotPassword(norm);
      setOtpSent(true);
      setForgotMessage(
        res.message || `Password reset verification code sent to ${norm}. (Valid 10 mins)`
      );
      if (res.otp) {
        setForgotOtp(res.otp);
      }
    } catch (err) {
      setForgotError(err.message || "Could not send verification code.");
    } finally {
      setForgotLoading(false);
    }
  }

  // Submit Password Reset
  async function handleResetPassword(e) {
    e.preventDefault();
    setForgotError("");
    setForgotMessage("");

    const norm = forgotEmail.trim().toLowerCase();
    if (!norm || !forgotOtp.trim() || !newPassword || !confirmNewPassword) {
      setForgotError("Please fill in all required fields.");
      return;
    }

    if (newPassword.length < 8) {
      setForgotError("New password must contain at least 8 characters.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setForgotError("Passwords do not match.");
      return;
    }

    setForgotLoading(true);
    try {
      const res = await api.resetPassword({
        email: norm,
        otp: forgotOtp.trim(),
        new_password: newPassword,
      });
      setForgotMessage(res.message || "Password reset successful! You can now sign in.");
      setTimeout(() => {
        setShowForgotModal(false);
        setEmail(norm);
        setPassword("");
        setForgotMessage("");
        setOtpSent(false);
        setForgotOtp("");
        setNewPassword("");
        setConfirmNewPassword("");
      }, 1800);
    } catch (err) {
      setForgotError(err.message || "Password reset failed. Please check your verification code.");
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card" style={{ maxWidth: "460px" }}>
        <div className="auth-header">
          <div className="auth-badge">🎓</div>
          <h1 className="auth-title">Smart Examination Portal</h1>
          <p className="auth-subtitle">
            Siddhartha Academy of Higher Education Deemed to be University
            <br />
            <strong>Department of Computer Science &amp; Engineering (CSE)</strong>
          </p>
        </div>

        <div className="auth-body">
          {(error || authError) && (
            <div className="alert alert-danger" style={{ marginBottom: "16px" }}>
              <span>⚠️</span>
              <span>{error || authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">
                Institutional Email Address <span className="form-label-required">*</span>
              </label>
              <input
                id="login-email"
                type="email"
                className="form-control"
                placeholder="e.g. admin@vrsec.ac.in or user@vrsiddhartha.ac.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={submitting}
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "4px",
                }}
              >
                <label className="form-label" htmlFor="login-password" style={{ marginBottom: 0 }}>
                  Password <span className="form-label-required">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotModal(true);
                    setForgotEmail(email);
                    setForgotError("");
                    setForgotMessage("");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent-blue)",
                    fontSize: "12px",
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  Forgot Password?
                </button>
              </div>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  className="form-control"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={submitting}
                  autoComplete="current-password"
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

            <button
              type="submit"
              className="btn btn-navy"
              style={{ width: "100%", marginTop: "12px", padding: "10px" }}
              disabled={submitting}
            >
              {submitting ? "Signing In..." : "Sign In to Portal"}
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
            New student or faculty invigilator?{" "}
            <button
              type="button"
              onClick={onNavigateToRegister}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent-blue)",
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Register Here
            </button>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
        >
          <div
            className="modal-content"
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "8px",
              maxWidth: "440px",
              width: "100%",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--primary-navy)" }}>
                🔐 Reset Account Password
              </h2>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "18px",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                }}
              >
                ✕
              </button>
            </div>

            {forgotError && (
              <div className="alert alert-danger" style={{ marginBottom: "12px", fontSize: "12.5px" }}>
                <span>⚠️</span>
                <span>{forgotError}</span>
              </div>
            )}

            {forgotMessage && (
              <div className="alert alert-success" style={{ marginBottom: "12px", fontSize: "12.5px" }}>
                <span>✅</span>
                <span>{forgotMessage}</span>
              </div>
            )}

            <form onSubmit={handleResetPassword}>
              <div className="form-group" style={{ marginBottom: "12px" }}>
                <label className="form-label">Registered Institutional Email</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="e.g. user@vrsec.ac.in"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    disabled={forgotLoading || otpSent}
                  />
                  <button
                    type="button"
                    className="btn btn-navy"
                    style={{ whiteSpace: "nowrap", fontSize: "12px", padding: "6px 12px" }}
                    onClick={handleSendForgotOtp}
                    disabled={forgotLoading || !forgotEmail.trim()}
                  >
                    {forgotLoading ? "..." : otpSent ? "Resend" : "Send OTP"}
                  </button>
                </div>
              </div>

              {otpSent && (
                <>
                  <div className="form-group" style={{ marginBottom: "12px" }}>
                    <label className="form-label">6-Digit Verification Code</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Enter OTP"
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(e.target.value.trim())}
                      maxLength={6}
                      required
                      disabled={forgotLoading}
                      style={{ letterSpacing: "2px", fontWeight: 600 }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: "12px" }}>
                    <label className="form-label">New Password (min 8 chars)</label>
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <input
                        type={showNewPassword ? "text" : "password"}
                        className="form-control"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                        disabled={forgotLoading}
                        style={{ paddingRight: "42px" }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        style={{
                          position: "absolute",
                          right: "10px",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "14px",
                          color: "var(--text-muted)",
                        }}
                      >
                        {showNewPassword ? "👁️" : "👁️‍🗨️"}
                      </button>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: "16px" }}>
                    <label className="form-label">Confirm New Password</label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="••••••••"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                      minLength={8}
                      disabled={forgotLoading}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-navy"
                    style={{ width: "100%", padding: "8px" }}
                    disabled={forgotLoading}
                  >
                    {forgotLoading ? "Resetting Password..." : "Reset Password"}
                  </button>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
