import { createContext, useContext, useEffect, useState } from "react";
import api, {
  getStoredToken,
  setStoredToken,
  getStoredUser,
  setStoredUser,
  clearStoredAuth,
} from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    async function verifySession() {
      const activeToken = getStoredToken();
      if (!activeToken) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.getMe();
        if (response && response.user) {
          setUser(response.user);
          setStoredUser(response.user);
        }
      } catch (err) {
        console.warn("Session verification error:", err.message);
        clearStoredAuth();
        setToken("");
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    verifySession();

    function handleUnauthorized() {
      setToken("");
      setUser(null);
      setAuthError("Session expired. Please log in again.");
    }

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, []);

  async function login(email, password) {
    setAuthError("");
    const response = await api.login(email, password);
    if (!response || !response.token) {
      throw new Error("Invalid response from server during login.");
    }

    setToken(response.token);
    setUser(response.user);
    setStoredToken(response.token);
    setStoredUser(response.user);
    return response.user;
  }

  async function signup(payload) {
    setAuthError("");
    return await api.signup(payload);
  }

  function logout() {
    clearStoredAuth();
    setToken("");
    setUser(null);
    setAuthError("");
  }

  const role = user?.role || "";
  const isAdmin = role === "exam_admin";
  const isHod = role === "hod";
  const isInvigilator = role === "invigilator";
  const isStudent = role === "student";
  const hasManagementAccess = isAdmin || isHod;

  const value = {
    token,
    user,
    role,
    loading,
    authError,
    isAuthenticated: Boolean(token && user),
    isAdmin,
    isHod,
    isInvigilator,
    isStudent,
    hasManagementAccess,
    login,
    signup,
    logout,
    setAuthError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export default AuthContext;
