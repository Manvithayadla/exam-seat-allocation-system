import { useState, useEffect } from "react";
import "./App.css";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AcademicCohortProvider } from "./context/AcademicCohortContext";
import Sidebar from "./components/Sidebar";
import TopNavbar from "./components/TopNavbar";

// Auth Pages
import Login from "./pages/Login";
import Register from "./pages/Register";

// 5 Main Admin Sections
import SeatingArrangement from "./pages/SeatingArrangement";
import HallsCapacity from "./pages/HallsCapacity";
import FacultyData from "./pages/FacultyData";
import DataManagement from "./pages/DataManagement";
import Reports from "./pages/Reports";

// Role-Specific Views
import HodOverview from "./pages/HodOverview";
import InvigilatorSchedule from "./pages/InvigilatorSchedule";
import StudentSeatLookup from "./pages/StudentSeatLookup";

function AppShell() {
  const { user, loading, isAuthenticated, role, isAdmin, isHod, isInvigilator, isStudent } = useAuth();
  
  // Default landing page based on role
  const getDefaultPage = () => {
    if (isAdmin) return "seating";
    if (isHod) return "hod_overview";
    if (isInvigilator) return "invigilator_schedule";
    if (isStudent) return "student_seat";
    return "seating";
  };

  const [activePage, setActivePage] = useState("seating");
  const [authMode, setAuthMode] = useState("login"); // 'login' | 'register'

  // Reset to default page on login / user change
  useEffect(() => {
    if (user?.user_id) {
      setActivePage(getDefaultPage());
    }
  }, [user?.user_id, role]);

  const pageTitles = {
    seating: "Seating Arrangement & Invigilator Assignment",
    halls: "Halls Capacity & Seating Layout",
    faculty: "Faculty Data & Workload Quotas",
    data: "Academic Data, Courses & Student Roster",
    reports: "Reports & Document Generation",
    hod_overview: "CSE Department Examination Overview",
    invigilator_schedule: "My Duty Schedule",
    student_seat: "Candidate Seat Inquiry",
  };

  if (loading) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div className="auth-badge">⏳</div>
          <h2 style={{ fontSize: "18px", color: "var(--primary-navy)", marginBottom: "6px" }}>
            Smart Examination Portal
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            Verifying secure institutional credentials...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (authMode === "register") {
      return <Register onNavigateToLogin={() => setAuthMode("login")} />;
    }
    return <Login onNavigateToRegister={() => setAuthMode("register")} />;
  }

  return (
    <div className="app-shell">
      {/* Persistent Left Sidebar */}
      <Sidebar activePage={activePage} onNavigate={setActivePage} />

      {/* Main Viewport Content Pane */}
      <main className="main-viewport">
        <TopNavbar activePage={activePage} pageTitles={pageTitles} />

        {/* Dynamic Route Router */}
        {activePage === "seating" && (isAdmin || isHod) ? (
          <SeatingArrangement />
        ) : activePage === "halls" && isAdmin ? (
          <HallsCapacity />
        ) : activePage === "faculty" && (isAdmin || isHod) ? (
          <FacultyData />
        ) : activePage === "data" && isAdmin ? (
          <DataManagement />
        ) : activePage === "reports" && isAdmin ? (
          <Reports />
        ) : activePage === "hod_overview" && (isAdmin || isHod) ? (
          <HodOverview />
        ) : activePage === "invigilator_schedule" && (isAdmin || isInvigilator) ? (
          <InvigilatorSchedule />
        ) : activePage === "student_seat" && (isAdmin || isStudent) ? (
          <StudentSeatLookup />
        ) : (
          <div className="panel">
            <h2>Unauthorized Section</h2>
            <p className="form-helper">
              You do not have administrative credentials to view this page under role: <strong>{role}</strong>.
            </p>
            <button
              type="button"
              className="btn btn-navy"
              style={{ marginTop: "16px" }}
              onClick={() => setActivePage(getDefaultPage())}
            >
              Return to Main View
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AcademicCohortProvider>
        <AppShell />
      </AcademicCohortProvider>
    </AuthProvider>
  );
}
