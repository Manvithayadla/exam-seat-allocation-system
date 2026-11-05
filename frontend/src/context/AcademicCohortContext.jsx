import { createContext, useContext, useState, useEffect, useMemo } from "react";

export const STUDY_YEAR_MAP = {
  1: { name: "1st Year", label: "1st Year", semesters: ["Semester 1", "Semester 2"] },
  2: { name: "2nd Year", label: "2nd Year", semesters: ["Semester 3", "Semester 4"] },
  3: { name: "3rd Year", label: "3rd Year", semesters: ["Semester 5", "Semester 6"] },
  4: { name: "4th Year", label: "4th Year", semesters: ["Semester 7", "Semester 8"] },
};

export const ACADEMIC_YEARS = [
  "2024-2025",
  "2025-2026",
  "2026-2027",
  "2027-2028",
];

const STORAGE_KEYS = {
  ACADEMIC_YEAR: "smart_exam_academic_year",
  STUDY_YEAR: "smart_exam_study_year",
  SEMESTER: "smart_exam_selected_semester",
};

const AcademicCohortContext = createContext(null);

export function AcademicCohortProvider({ children }) {
  // 1. Academic Year (persisted)
  const [academicYear, setAcademicYearState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ACADEMIC_YEAR);
      return saved && saved.trim() ? saved.trim() : "2026-2027";
    } catch {
      return "2026-2027";
    }
  });

  // 2. Study Year (persisted: 1, 2, 3, or 4)
  const [studyYear, setStudyYearState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.STUDY_YEAR);
      const parsed = parseInt(saved, 10);
      return [1, 2, 3, 4].includes(parsed) ? parsed : 2;
    } catch {
      return 2;
    }
  });

  // 3. Selected Semester (persisted, validated against study year)
  const [selectedSemester, setSelectedSemesterState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SEMESTER);
      const validSems = STUDY_YEAR_MAP[studyYear]?.semesters || ["Semester 3", "Semester 4"];
      if (saved && validSems.includes(saved)) {
        return saved;
      }
      return validSems[0];
    } catch {
      return "Semester 3";
    }
  });

  // Set Academic Year with persistence
  const setAcademicYear = (ay) => {
    if (!ay) return;
    const clean = String(ay).trim();
    setAcademicYearState(clean);
    try {
      localStorage.setItem(STORAGE_KEYS.ACADEMIC_YEAR, clean);
    } catch (e) {
      console.warn("Could not persist academic year to localStorage", e);
    }
  };

  // Set Study Year with persistence and automatic semester synchronization
  const setStudyYear = (sy) => {
    const num = parseInt(sy, 10);
    if (![1, 2, 3, 4].includes(num)) return;
    setStudyYearState(num);
    try {
      localStorage.setItem(STORAGE_KEYS.STUDY_YEAR, String(num));
    } catch (e) {
      console.warn("Could not persist study year to localStorage", e);
    }

    // Check if current semester is valid for the new study year
    const validSems = STUDY_YEAR_MAP[num]?.semesters || [];
    if (!validSems.includes(selectedSemester)) {
      const fallbackSem = validSems[0] || "Semester 1";
      setSelectedSemesterState(fallbackSem);
      try {
        localStorage.setItem(STORAGE_KEYS.SEMESTER, fallbackSem);
      } catch (e) {
        console.warn("Could not persist semester to localStorage", e);
      }
    }
  };

  // Set Selected Semester with persistence
  const setSelectedSemester = (sem) => {
    if (!sem) return;
    const clean = String(sem).trim();
    // Validate that semester belongs to current study year
    const validSems = STUDY_YEAR_MAP[studyYear]?.semesters || [];
    if (validSems.includes(clean)) {
      setSelectedSemesterState(clean);
      try {
        localStorage.setItem(STORAGE_KEYS.SEMESTER, clean);
      } catch (e) {
        console.warn("Could not persist semester to localStorage", e);
      }
    } else {
      // If semester belongs to another study year, update study year as well
      for (const [syKey, info] of Object.entries(STUDY_YEAR_MAP)) {
        if (info.semesters.includes(clean)) {
          const newSy = parseInt(syKey, 10);
          setStudyYearState(newSy);
          setSelectedSemesterState(clean);
          try {
            localStorage.setItem(STORAGE_KEYS.STUDY_YEAR, String(newSy));
            localStorage.setItem(STORAGE_KEYS.SEMESTER, clean);
          } catch (e) {
            console.warn("Could not persist cohort update", e);
          }
          break;
        }
      }
    }
  };

  // Quick switch whole cohort at once
  const setCohort = ({ academic_year, study_year, semester }) => {
    if (academic_year) setAcademicYear(academic_year);
    if (study_year !== undefined) setStudyYear(study_year);
    if (semester) setSelectedSemester(semester);
  };

  const availableSemesters = useMemo(() => {
    return STUDY_YEAR_MAP[studyYear]?.semesters || ["Semester 3", "Semester 4"];
  }, [studyYear]);

  const studyYearName = useMemo(() => {
    return STUDY_YEAR_MAP[studyYear]?.name || `${studyYear}th Year`;
  }, [studyYear]);

  const cohortLabel = useMemo(() => {
    return `AY ${academicYear} • ${studyYearName} (${selectedSemester})`;
  }, [academicYear, studyYearName, selectedSemester]);

  const value = {
    academicYear,
    setAcademicYear,
    studyYear,
    setStudyYear,
    selectedSemester,
    setSelectedSemester,
    availableSemesters,
    studyYearName,
    cohortLabel,
    setCohort,
    STUDY_YEAR_MAP,
    ACADEMIC_YEARS,
    department: "CSE",
  };

  return (
    <AcademicCohortContext.Provider value={value}>
      {children}
    </AcademicCohortContext.Provider>
  );
}

export function useAcademicCohort() {
  const ctx = useContext(AcademicCohortContext);
  if (!ctx) {
    throw new Error("useAcademicCohort must be used within an AcademicCohortProvider");
  }
  return ctx;
}

export default AcademicCohortContext;
