import { useState, useEffect, useMemo } from "react";
import api from "../services/api";
import { useAcademicCohort } from "../context/AcademicCohortContext";

const STUDY_YEAR_MAP = {
  1: { label: "First Year", semesters: ["Semester 1", "Semester 2"] },
  2: { label: "Second Year", semesters: ["Semester 3", "Semester 4"] },
  3: { label: "Third Year", semesters: ["Semester 5", "Semester 6"] },
  4: { label: "Fourth Year", semesters: ["Semester 7", "Semester 8"] },
};

// Helper: Generate next section letter (A, B, ... Z, AA, AB, ...)
function getNextSectionLetter(existingSections) {
  const letters = [];
  // Generate A-Z, then AA-ZZ
  for (let i = 0; i < 26; i++) {
    letters.push(String.fromCharCode(65 + i));
  }
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      letters.push(String.fromCharCode(65 + i) + String.fromCharCode(65 + j));
    }
  }
  const upperExisting = new Set(existingSections.map((s) => s.toUpperCase()));
  for (const l of letters) {
    if (!upperExisting.has(l)) return l;
  }
  return `SEC${existingSections.length + 1}`;
}

export default function DataManagement() {
  // -------------------------------------------------------------
  // 1. Academic Configuration State (Persistent Centralized Cohort)
  // -------------------------------------------------------------
  const {
    academicYear,
    setAcademicYear,
    studyYear,
    setStudyYear,
    selectedSemester,
    setSelectedSemester,
    availableSemesters: applicableSemesters,
    studyYearName,
  } = useAcademicCohort();
  const department = "CSE";

  // Global Status Banner
  const [statusMessage, setStatusMessage] = useState({ type: "", text: "" });

  // -------------------------------------------------------------
  // 2. Subject Catalogue State
  // -------------------------------------------------------------
  const [subjects, setSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  // Manual Add Modal
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [newSubCode, setNewSubCode] = useState("");
  const [newSubName, setNewSubName] = useState("");
  const [newSubCat, setNewSubCat] = useState("Core");
  const [savingSubject, setSavingSubject] = useState(false);

  // Edit Subject Modal State
  const [showEditSubjectModal, setShowEditSubjectModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [editSubCode, setEditSubCode] = useState("");
  const [editSubName, setEditSubName] = useState("");
  const [editSubDept, setEditSubDept] = useState("CSE");
  const [editSubCat, setEditSubCat] = useState("Core");
  const [editSubAy, setEditSubAy] = useState("2026-2027");
  const [editSubSy, setEditSubSy] = useState(3);
  const [editSubSem, setEditSubSem] = useState("Semester 5");
  const [savingEditSubject, setSavingEditSubject] = useState(false);
  const [editSubjectError, setEditSubjectError] = useState("");

  // Bulk Subject Selection & Deletion State
  const [selectedSubjectIds, setSelectedSubjectIds] = useState([]);
  const [showBulkSubjectDeleteModal, setShowBulkSubjectDeleteModal] = useState(false);
  const [bulkSubjectPreflight, setBulkSubjectPreflight] = useState(null);
  const [checkingBulkSubjectDependencies, setCheckingBulkSubjectDependencies] = useState(false);
  const [bulkSubjectProcessing, setBulkSubjectProcessing] = useState(false);
  const [bulkSubjectError, setBulkSubjectError] = useState("");

  // Delete Subject Modal State
  const [showDeleteSubjectModal, setShowDeleteSubjectModal] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState(null);
  const [subjectDependencies, setSubjectDependencies] = useState(null);
  const [checkingDependencies, setCheckingDependencies] = useState(false);
  const [deletingSubject, setDeletingSubject] = useState(false);
  const [archivingSubject, setArchivingSubject] = useState(false);
  const [deleteSubjectError, setDeleteSubjectError] = useState("");

  // Bulk Upload Modal
  const [showBulkSubjectModal, setShowBulkSubjectModal] = useState(false);
  const [subjectFile, setSubjectFile] = useState(null);
  const [subjectPreview, setSubjectPreview] = useState(null);
  const [parsingSubjects, setParsingSubjects] = useState(false);
  const [importingSubjects, setImportingSubjects] = useState(false);

  // -------------------------------------------------------------
  // 3. Dynamic Section Management & Section-wise Upload State
  // -------------------------------------------------------------
  const [configuredSections, setConfiguredSections] = useState(["A", "B", "C", "D", "E"]);
  const [sectionCounts, setSectionCounts] = useState({});
  const [totalCohortStudents, setTotalCohortStudents] = useState(0);
  const [loadingSections, setLoadingSections] = useState(false);
  const [activeSectionTab, setActiveSectionTab] = useState("A");

  // 5. Controlled Academic-Year Student Promotion State
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [promoFromAy, setPromoFromAy] = useState("2026-2027");
  const [promoToAy, setPromoToAy] = useState("2027-2028");
  const [promoFromSy, setPromoFromSy] = useState(3);
  const [promoSection, setPromoSection] = useState("ALL");
  const [promoPreview, setPromoPreview] = useState(null);
  const [loadingPromoPreview, setLoadingPromoPreview] = useState(false);
  const [executingPromo, setExecutingPromo] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [promoSuccess, setPromoSuccess] = useState("");

  // Section Renaming Modal
  const [renamingSection, setRenamingSection] = useState(null);
  const [newSectionName, setNewSectionName] = useState("");

  // Section-wise File Upload
  const [sectionFiles, setSectionFiles] = useState({});
  const [sectionPreviews, setSectionPreviews] = useState({});
  const [sectionLoading, setSectionLoading] = useState({});

  // Enrolled Students Roster State (Section 3)
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [loadingEnrolled, setLoadingEnrolled] = useState(false);
  const [selectedEnrolledIds, setSelectedEnrolledIds] = useState([]);
  // Individual Student Registration & Edit State
  const [isAddIndividualModalOpen, setIsAddIndividualModalOpen] = useState(false);
  const [indivHallTicket, setIndivHallTicket] = useState("");
  const [indivName, setIndivName] = useState("");
  const [indivSaving, setIndivSaving] = useState(false);
  const [indivError, setIndivError] = useState("");

  const [isEditStudentModalOpen, setIsEditStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [editStudentName, setEditStudentName] = useState("");
  const [editStudentDept, setEditStudentDept] = useState("CSE");
  const [editStudentSaving, setEditStudentSaving] = useState(false);
  const [editStudentError, setEditStudentError] = useState("");

  function openAddIndividualModal() {
    setIndivHallTicket("");
    setIndivName("");
    setIndivError("");
    setIsAddIndividualModalOpen(true);
  }

  async function handleSaveIndividualStudent(e) {
    e.preventDefault();
    if (!indivHallTicket.trim()) {
      setIndivError("Hall Ticket Number is required.");
      return;
    }
    if (!indivName.trim()) {
      setIndivError("Student Full Name is required.");
      return;
    }

    setIndivSaving(true);
    setIndivError("");
    try {
      const res = await api.addStudentIndividual({
        hall_ticket_no: indivHallTicket.trim().toUpperCase(),
        name: indivName.trim().toUpperCase(),
        section: activeSectionTab,
        department: department || "CSE",
        academic_year: academicYear,
        study_year: studyYear,
        semester: selectedSemester,
      });

      setStatusMessage({
        type: "success",
        text: res.message || `Student ${indivName.trim()} (${indivHallTicket.trim()}) registered in Section ${activeSectionTab}.`,
      });
      setIsAddIndividualModalOpen(false);
      await loadCohortSections();
      await loadBatches();
      await loadEnrolledStudents(activeSectionTab);
    } catch (err) {
      setIndivError(err.message || "Failed to add student. Please review duplicate and section constraints.");
    } finally {
      setIndivSaving(false);
    }
  }

  function openEditStudentModal(st) {
    setEditingStudent(st);
    setEditStudentName(st.name || "");
    setEditStudentDept(st.department || "CSE");
    setEditStudentError("");
    setIsEditStudentModalOpen(true);
  }

  async function handleSaveEditStudent(e) {
    e.preventDefault();
    if (!editStudentName.trim()) {
      setEditStudentError("Student name cannot be empty.");
      return;
    }

    setEditStudentSaving(true);
    setEditStudentError("");
    try {
      const res = await api.updateStudent(editingStudent.student_id, {
        name: editStudentName.trim().toUpperCase(),
        department: editStudentDept.trim().toUpperCase() || "CSE",
      });

      setStatusMessage({
        type: "success",
        text: res.message || `Student ${editingStudent.hall_ticket_no} updated successfully.`,
      });
      setIsEditStudentModalOpen(false);
      setEditingStudent(null);
      await loadEnrolledStudents(activeSectionTab);
    } catch (err) {
      setEditStudentError(err.message || "Failed to update student details.");
    } finally {
      setEditStudentSaving(false);
    }
  }

  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingSheet, setMappingSheet] = useState("");
  const [mappingHtCol, setMappingHtCol] = useState("");
  const [mappingNameCol, setMappingNameCol] = useState("");
  const [mappingSecCol, setMappingSecCol] = useState("");


  // -------------------------------------------------------------
  // 4. Upload History & Safe Deletion State
  // -------------------------------------------------------------
  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Deletion Modal (Pre-flight Check)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'section'|'batch'|'cohort', label: '', ... }
  const [preflightData, setPreflightData] = useState(null);
  const [checkingPreflight, setCheckingPreflight] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Clear Upload History Modal States
  const [showClearHistoryModal, setShowClearHistoryModal] = useState(false);
  const [clearScope, setClearScope] = useState("all"); // 'all'|'student'|'subject'|'academic_year'|'study_year_semester'|'section'
  const [clearAy, setClearAy] = useState("2026-2027");
  const [clearSy, setClearSy] = useState(3);
  const [clearSem, setClearSem] = useState("Semester 5");
  const [clearSec, setClearSec] = useState("A");
  const [clearCheckData, setClearCheckData] = useState(null);
  const [loadingClearCheck, setLoadingClearCheck] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);

  // -------------------------------------------------------------
  // Initial Data Fetching
  // -------------------------------------------------------------
  useEffect(() => {
    loadSubjects();
    loadCohortSections();
    loadBatches();
    if (activeSectionTab) {
      loadEnrolledStudents(activeSectionTab);
    }
  }, [academicYear, studyYear, selectedSemester, activeSectionTab]);

  // Load subjects
  async function loadSubjects() {
    setLoadingSubjects(true);
    try {
      const res = await api.getSubjects();
      setSubjects(Array.isArray(res.subjects) ? res.subjects : []);
    } catch (err) {
      console.warn("Could not load subjects:", err);
    } finally {
      setLoadingSubjects(false);
    }
  }

  // Load cohort sections and counts from database
  async function loadCohortSections() {
    setLoadingSections(true);
    setSectionCounts({});
    setTotalCohortStudents(0);
    try {
      const res = await api.getCohortSections({
        academic_year: academicYear,
        study_year: studyYear,
        department,
      });
      const dbSections = res.sections || [];
      const countsMap = {};
      const secNames = [];
      dbSections.forEach((s) => {
        countsMap[s.section] = s.student_count;
        secNames.push(s.section);
      });
      setSectionCounts(countsMap);
      setTotalCohortStudents(res.total_students || 0);

      // Merge existing sections with defaults
      setConfiguredSections((prev) => {
        const combined = Array.from(new Set([...prev, ...secNames]));
        return combined.length > 0 ? combined : ["A", "B", "C", "D"];
      });

      if (!activeSectionTab && secNames.length > 0) {
        setActiveSectionTab(secNames[0]);
      }
    } catch (err) {
      console.warn("Could not load cohort sections:", err);
      setSectionCounts({});
      setTotalCohortStudents(0);
    } finally {
      setLoadingSections(false);
    }
  }

  // Load upload history batches
  async function loadBatches() {
    setLoadingBatches(true);
    try {
      const res = await api.getStudentBatches({
        academic_year: academicYear,
        study_year: studyYear,
        department,
      });
      setBatches(res.batches || []);
    } catch (err) {
      console.warn("Could not load import batches:", err);
    } finally {
      setLoadingBatches(false);
    }
  }

  // Pre-flight check for clearing upload history
  async function fetchClearHistoryCheck(scope, ay, sy, sem, sec) {
    setLoadingClearCheck(true);
    try {
      const payload = {
        scope: scope || clearScope,
        academic_year: ay || clearAy,
        study_year: sy !== undefined ? sy : clearSy,
        semester: sem || clearSem,
        section: sec || clearSec,
      };
      const res = await api.checkClearUploadHistory(payload);
      setClearCheckData(res);
    } catch (err) {
      console.error("Error inspecting upload history:", err);
    } finally {
      setLoadingClearCheck(false);
    }
  }

  function openClearHistoryModal() {
    setClearScope("all");
    setClearAy(academicYear);
    setClearSy(studyYear);
    setClearSem(selectedSemester);
    setClearSec(activeSectionTab || "A");
    setShowClearHistoryModal(true);
    fetchClearHistoryCheck("all", academicYear, studyYear, selectedSemester, activeSectionTab || "A");
  }

  function handleScopeChange(newScope) {
    setClearScope(newScope);
    fetchClearHistoryCheck(newScope, clearAy, clearSy, clearSem, clearSec);
  }

  async function handleExecuteClearHistory() {
    setClearingHistory(true);
    try {
      const payload = {
        scope: clearScope,
        academic_year: clearAy,
        study_year: clearSy,
        semester: clearSem,
        section: clearSec,
      };
      const res = await api.clearUploadHistory(payload);
      setBanner({
        type: "success",
        title: "Upload History Cleared",
        message: res.message || `Cleared ${res.cleared_count} upload history log entries. Student and course data remain intact.`,
      });
      setShowClearHistoryModal(false);
      loadBatches();
    } catch (err) {
      setBanner({
        type: "danger",
        title: "Clear History Failed",
        message: err.message || "Failed to clear upload history.",
      });
    } finally {
      setClearingHistory(false);
    }
  }

  // Filter semester subjects
  const semesterSubjects = useMemo(() => {
    return subjects.filter((s) => {
      const semMatch =
        s.semester?.toLowerCase().replace(/\s+/g, "") ===
        selectedSemester.toLowerCase().replace(/\s+/g, "");
      const deptMatch =
        !s.department || s.department.toUpperCase() === "CSE";
      return semMatch && deptMatch;
    });
  }, [subjects, selectedSemester]);

  // -------------------------------------------------------------
  // Bulk Subject Selection & Deletion Handlers
  // -------------------------------------------------------------
  const selectedSubjectObjects = useMemo(() => {
    const set = new Set(selectedSubjectIds);
    return subjects.filter((s) => set.has(s.subject_id));
  }, [subjects, selectedSubjectIds]);

  const allCurrentSemesterSelected = useMemo(() => {
    if (semesterSubjects.length === 0) return false;
    return semesterSubjects.every((s) => selectedSubjectIds.includes(s.subject_id));
  }, [semesterSubjects, selectedSubjectIds]);

  const someCurrentSemesterSelected = useMemo(() => {
    return semesterSubjects.some((s) => selectedSubjectIds.includes(s.subject_id));
  }, [semesterSubjects, selectedSubjectIds]);

  function toggleSelectAllSemesterSubjects(e) {
    if (e.target.checked) {
      const currentIds = semesterSubjects.map((s) => s.subject_id);
      setSelectedSubjectIds((prev) => Array.from(new Set([...prev, ...currentIds])));
    } else {
      const currentSet = new Set(semesterSubjects.map((s) => s.subject_id));
      setSelectedSubjectIds((prev) => prev.filter((id) => !currentSet.has(id)));
    }
  }

  function toggleSelectSubject(subId) {
    setSelectedSubjectIds((prev) =>
      prev.includes(subId) ? prev.filter((id) => id !== subId) : [...prev, subId]
    );
  }

  async function handleOpenBulkSubjectDeleteModal() {
    if (selectedSubjectIds.length === 0) return;
    setShowBulkSubjectDeleteModal(true);
    setCheckingBulkSubjectDependencies(true);
    setBulkSubjectError("");
    setBulkSubjectPreflight(null);

    try {
      const res = await api.checkSubjectDeletion({ subject_ids: selectedSubjectIds });
      setBulkSubjectPreflight(res);
    } catch (err) {
      setBulkSubjectError(err.message || "Failed to inspect subject dependencies.");
    } finally {
      setCheckingBulkSubjectDependencies(false);
    }
  }

  async function handleExecuteBulkSubjectDelete(action = "delete_safe_only") {
    if (!bulkSubjectPreflight || selectedSubjectIds.length === 0) return;
    setBulkSubjectProcessing(true);
    setBulkSubjectError("");

    try {
      const payload = {
        subject_ids: selectedSubjectIds,
        action: action, // 'delete_safe_only', 'delete_safe_and_archive_protected', 'archive_all'
        delete_safe_only: action === "delete_safe_only",
        deleted_by: "admin",
      };

      const res = await api.bulkDeleteSubjects(payload);

      // Remove deleted/archived subjects from selectedSubjectIds
      const affectedIds = new Set([
        ...(res.deleted_subjects || []).map((s) => s.subject_id),
        ...(action === "delete_safe_and_archive_protected" || action === "archive_all"
          ? (res.archived_subjects || []).map((s) => s.subject_id)
          : [])
      ]);
      setSelectedSubjectIds((prev) => prev.filter((id) => !affectedIds.has(id)));

      setShowBulkSubjectDeleteModal(false);
      setStatusMessage({
        type: "success",
        text: res.message || "Bulk subject action completed successfully.",
      });
      loadSubjects();
    } catch (err) {
      setBulkSubjectError(err.message || "Failed to execute bulk deletion.");
    } finally {
      setBulkSubjectProcessing(false);
    }
  }

  // -------------------------------------------------------------
  // Subject Management Handlers
  // -------------------------------------------------------------
  async function handleAddSubjectManual(e) {
    e.preventDefault();
    if (!newSubCode.trim() || !newSubName.trim()) {
      setStatusMessage({ type: "danger", text: "Subject code and title are required." });
      return;
    }

    setSavingSubject(true);
    setStatusMessage({ type: "", text: "" });

    try {
      await api.createSubject({
        subject_code: newSubCode.trim().toUpperCase(),
        subject_name: newSubName.trim(),
        department: "CSE",
        academic_year: academicYear,
        study_year: studyYear,
        semester: selectedSemester,
        category: newSubCat,
      });

      setStatusMessage({
        type: "success",
        text: `Subject ${newSubCode.toUpperCase()} added to ${selectedSemester}.`,
      });
      setNewSubCode("");
      setNewSubName("");
      setShowAddSubjectModal(false);
      loadSubjects();
    } catch (err) {
      setStatusMessage({ type: "danger", text: err.message || "Failed to add subject." });
    } finally {
      setSavingSubject(false);
    }
  }

  function handleOpenEditModal(subject) {
    setEditingSubject(subject);
    setEditSubCode(subject.subject_code || "");
    setEditSubName(subject.subject_name || "");
    setEditSubDept(subject.department || "CSE");
    setEditSubCat(subject.category || "Core");
    setEditSubAy(subject.academic_year || academicYear || "2026-2027");
    const syNum = Number(subject.study_year) || studyYear || 3;
    setEditSubSy(syNum);
    setEditSubSem(subject.semester || selectedSemester || "Semester 5");
    setEditSubjectError("");
    setShowEditSubjectModal(true);
  }

  function handleEditStudyYearChange(e) {
    const syVal = Number(e.target.value);
    setEditSubSy(syVal);
    const available = STUDY_YEAR_MAP[syVal]?.semesters || [];
    if (!available.includes(editSubSem) && available.length > 0) {
      setEditSubSem(available[0]);
    }
  }

  async function handleUpdateSubjectSubmit(e) {
    e.preventDefault();
    setEditSubjectError("");

    if (!editSubCode.trim() || !editSubName.trim() || !editSubDept.trim() || !editSubAy.trim() || !editSubSem.trim()) {
      setEditSubjectError("All mandatory fields must be filled.");
      return;
    }

    const normCode = editSubCode.trim().toUpperCase();
    const normName = editSubName.trim();
    const normDept = editSubDept.trim().toUpperCase();
    const normAy = editSubAy.trim();
    const normSem = editSubSem.trim();
    const normSy = Number(editSubSy);

    // Frontend validation: Unique code check across subjects
    const codeConflict = subjects.find(
      (s) => s.subject_id !== editingSubject.subject_id && s.subject_code?.toUpperCase() === normCode
    );
    if (codeConflict) {
      setEditSubjectError(`Subject code '${normCode}' is already used by another course (${codeConflict.subject_name}).`);
      return;
    }

    // Frontend validation: Duplicate course within same academic year, department, and semester
    const duplicateCourse = subjects.find(
      (s) =>
        s.subject_id !== editingSubject.subject_id &&
        s.subject_name?.trim().toLowerCase() === normName.toLowerCase() &&
        (s.department || "CSE").toUpperCase() === normDept &&
        (s.semester || "").toLowerCase().replace(/\s+/g, "") === normSem.toLowerCase().replace(/\s+/g, "") &&
        (s.academic_year || academicYear) === normAy
    );
    if (duplicateCourse) {
      setEditSubjectError(`A course with title '${normName}' already exists in ${normDept} for ${normSem} (${normAy}).`);
      return;
    }

    setSavingEditSubject(true);
    try {
      await api.updateSubject(editingSubject.subject_id, {
        subject_code: normCode,
        subject_name: normName,
        department: normDept,
        category: editSubCat,
        academic_year: normAy,
        study_year: normSy,
        semester: normSem,
      });

      setStatusMessage({
        type: "success",
        text: `Course ${normCode} - ${normName} updated successfully.`,
      });
      setShowEditSubjectModal(false);
      setEditingSubject(null);
      loadSubjects();
    } catch (err) {
      setEditSubjectError(err.message || "Failed to update subject.");
    } finally {
      setSavingEditSubject(false);
    }
  }

  async function handleOpenDeleteModal(subject) {
    setSubjectToDelete(subject);
    setSubjectDependencies(null);
    setDeleteSubjectError("");
    setShowDeleteSubjectModal(true);
    setCheckingDependencies(true);
    try {
      const res = await api.getSubjectDependencies(subject.subject_id);
      setSubjectDependencies(res);
    } catch (err) {
      setDeleteSubjectError(err.message || "Failed to inspect course dependencies.");
    } finally {
      setCheckingDependencies(false);
    }
  }

  async function handleConfirmDeleteSubject() {
    if (!subjectToDelete) return;
    setDeletingSubject(true);
    setDeleteSubjectError("");
    try {
      const res = await api.deleteSubject(subjectToDelete.subject_id);
      setStatusMessage({
        type: "success",
        text: res.message || `Subject ${subjectToDelete.subject_code} deleted successfully.`,
      });
      setShowDeleteSubjectModal(false);
      setSubjectToDelete(null);
      setSubjectDependencies(null);
      loadSubjects();
    } catch (err) {
      setDeleteSubjectError(err.message || "Failed to delete subject.");
    } finally {
      setDeletingSubject(false);
    }
  }

  async function handleArchiveSubject() {
    if (!subjectToDelete) return;
    setArchivingSubject(true);
    setDeleteSubjectError("");
    try {
      const res = await api.archiveSubject(subjectToDelete.subject_id);
      setStatusMessage({
        type: "success",
        text: res.message || `Subject ${subjectToDelete.subject_code} archived successfully.`,
      });
      setShowDeleteSubjectModal(false);
      setSubjectToDelete(null);
      setSubjectDependencies(null);
      loadSubjects();
    } catch (err) {
      setDeleteSubjectError(err.message || "Failed to archive subject.");
    } finally {
      setArchivingSubject(false);
    }
  }

  // Subject Bulk Upload Preview
  async function handleSubjectFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubjectFile(file);
    setSubjectPreview(null);
    setParsingSubjects(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("academic_year", academicYear);
      formData.append("study_year", String(studyYear));
      formData.append("semester", selectedSemester);
      formData.append("department", department);

      const res = await api.previewSubjectUpload(formData);
      setSubjectPreview(res);
    } catch (err) {
      setStatusMessage({ type: "danger", text: err.message || "Failed to parse subject file." });
      setSubjectFile(null);
    } finally {
      setParsingSubjects(false);
    }
  }

  function handleSubjectCellChange(index, field, value) {
    if (!subjectPreview) return;
    const updated = [...subjectPreview.subjects];
    updated[index][field] = value;
    if (field === "category") {
      updated[index].is_uncertain = false;
      updated[index].detection_reason = "Manually selected by Administrator";
    }
    // Update validity
    const item = updated[index];
    item.is_valid = Boolean(item.subject_code.trim() && item.subject_name.trim());
    if (!item.is_valid) {
      item.error = "Subject Code and Name are required";
    } else {
      item.error = null;
    }
    setSubjectPreview({
      ...subjectPreview,
      subjects: updated,
      valid_records: updated.filter((s) => s.is_valid).length,
      invalid_records: updated.filter((s) => !s.is_valid).length,
    });
  }

  async function handleConfirmSubjectBulkImport() {
    if (!subjectPreview || !subjectPreview.subjects) return;
    setImportingSubjects(true);
    setStatusMessage({ type: "", text: "" });

    try {
      const validSubjects = subjectPreview.subjects.filter((s) => s.is_valid);
      const res = await api.bulkImportSubjects({ subjects: validSubjects });
      setStatusMessage({
        type: "success",
        text: res.message || `Imported ${res.imported_count} subject(s) successfully!`,
      });
      setShowBulkSubjectModal(false);
      setSubjectFile(null);
      setSubjectPreview(null);
      loadSubjects();
    } catch (err) {
      setStatusMessage({ type: "danger", text: err.message || "Bulk subject import failed." });
    } finally {
      setImportingSubjects(false);
    }
  }

  // -------------------------------------------------------------
  // Student Promotion Handlers
  async function openPromotionModal() {
    setPromoFromAy(academicYear);
    const parts = (academicYear || "2026-2027").split("-");
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      setPromoToAy(`${parseInt(parts[0]) + 1}-${parseInt(parts[1]) + 1}`);
    } else {
      setPromoToAy("2027-2028");
    }
    setPromoFromSy(studyYear);
    setPromoSection(activeSectionTab || "ALL");
    setPromoError("");
    setPromoSuccess("");
    setShowPromotionModal(true);
    await fetchPromoPreview(academicYear, studyYear, activeSectionTab || "ALL");
  }

  async function fetchPromoPreview(fromAy, fromSy, sec) {
    setLoadingPromoPreview(true);
    setPromoError("");
    try {
      const parts = (fromAy || "2026-2027").split("-");
      const nextAy = (parts.length === 2 && !isNaN(parts[0]))
        ? `${parseInt(parts[0]) + 1}-${parseInt(parts[1]) + 1}`
        : "2027-2028";
      const res = await api.previewStudentPromotion({
        from_academic_year: fromAy,
        to_academic_year: nextAy,
        from_study_year: fromSy,
        section: sec,
        department,
      });
      setPromoPreview(res);
      setPromoToAy(res.to_academic_year || nextAy);
    } catch (err) {
      setPromoError(err.message || "Failed to load promotion preview.");
      setPromoPreview(null);
    } finally {
      setLoadingPromoPreview(false);
    }
  }

  async function handleExecutePromotion() {
    if (!promoPreview || promoPreview.eligible_count === 0) return;
    setExecutingPromo(true);
    setPromoError("");
    setPromoSuccess("");
    try {
      const res = await api.executeStudentPromotion({
        from_academic_year: promoFromAy,
        to_academic_year: promoToAy,
        from_study_year: promoFromSy,
        section: promoSection,
        department,
        promoted_by: "admin",
      });
      setPromoSuccess(res.message);
      setStatusMessage({
        type: "success",
        text: res.message,
      });
      await loadCohortSections();
      if (activeSectionTab) {
        await loadEnrolledStudents(activeSectionTab);
      }
    } catch (err) {
      setPromoError(err.message || "Promotion execution failed.");
    } finally {
      setExecutingPromo(false);
    }
  }

  // Dynamic Section Management Handlers
  // -------------------------------------------------------------
  function handleAddSection() {
    const nextLetter = getNextSectionLetter(configuredSections);
    setConfiguredSections((prev) => [...prev, nextLetter]);
    setActiveSectionTab(nextLetter);
    setStatusMessage({
      type: "success",
      text: `Added Section ${nextLetter} to configuration. You can now upload candidates for Section ${nextLetter}.`,
    });
  }

  function handleRemoveSection(sec) {
    const count = sectionCounts[sec] || 0;
    if (count > 0) {
      if (
        !window.confirm(
          `Section ${sec} currently contains ${count} student records in MySQL. Removing it from this view will NOT delete the student records. Proceed?`
        )
      ) {
        return;
      }
    }
    setConfiguredSections((prev) => prev.filter((s) => s !== sec));
    if (activeSectionTab === sec) {
      const remaining = configuredSections.filter((s) => s !== sec);
      setActiveSectionTab(remaining[0] || "");
    }
  }

  function openRenameSection(sec) {
    setRenamingSection(sec);
    setNewSectionName(sec);
  }

  function handleSaveRenameSection(e) {
    e.preventDefault();
    const trimmed = newSectionName.trim().toUpperCase();
    if (!trimmed) return;
    if (configuredSections.includes(trimmed) && trimmed !== renamingSection) {
      alert(`Section "${trimmed}" already exists in configuration.`);
      return;
    }
    setConfiguredSections((prev) =>
      prev.map((s) => (s === renamingSection ? trimmed : s))
    );
    if (activeSectionTab === renamingSection) {
      setActiveSectionTab(trimmed);
    }
    setRenamingSection(null);
  }

  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // Enrolled Students Fetching & Bulk Selection Handlers
  // -------------------------------------------------------------
  async function loadEnrolledStudents(sec) {
    if (!sec) return;
    setLoadingEnrolled(true);
    try {
      const res = await api.getStudents({
        section: sec,
        semester: selectedSemester,
        study_year: studyYear,
        academic_year: academicYear,
        department,
      });
      setEnrolledStudents(Array.isArray(res.students) ? res.students : []);
    } catch (err) {
      console.warn("Could not load enrolled students:", err);
      setEnrolledStudents([]);
    } finally {
      setLoadingEnrolled(false);
    }
  }

  function toggleSelectEnrolled(id) {
    setSelectedEnrolledIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAllEnrolled() {
    if (selectedEnrolledIds.length === enrolledStudents.length) {
      setSelectedEnrolledIds([]);
    } else {
      setSelectedEnrolledIds(enrolledStudents.map((s) => s.student_id));
    }
  }

  async function handleReParseWithMapping(sec) {
    const file = sectionFiles[sec];
    if (!file) return;

    setSectionLoading((prev) => ({ ...prev, [sec]: true }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("section", sec);
      formData.append("academic_year", academicYear);
      formData.append("study_year", String(studyYear));
      formData.append("semester", selectedSemester);
      formData.append("department", department);
      if (mappingSheet) formData.append("sheet_name", mappingSheet);
      if (mappingHtCol !== "") formData.append("ht_col", String(mappingHtCol));
      if (mappingNameCol !== "") formData.append("name_col", String(mappingNameCol));
      if (mappingSecCol !== "") formData.append("sec_col", String(mappingSecCol));

      const res = await api.previewSectionRoster(formData);
      setSectionPreviews((prev) => ({ ...prev, [sec]: res }));
      setStatusMessage({
        type: "success",
        text: `Re-parsed roster with custom mapping: ${res.valid_records} valid candidates extracted.`,
      });
    } catch (err) {
      setStatusMessage({
        type: "danger",
        text: `Mapping failed: ${err.message || "Failed to parse with custom columns."}`,
      });
    } finally {
      setSectionLoading((prev) => ({ ...prev, [sec]: false }));
    }
  }

    // Section-wise Student Roster Upload Handlers
  // -------------------------------------------------------------
  async function handleSectionFileSelect(sec, e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSectionFiles((prev) => ({ ...prev, [sec]: file }));
    setSectionLoading((prev) => ({ ...prev, [sec]: true }));

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("section", sec);
      formData.append("academic_year", academicYear);
      formData.append("study_year", String(studyYear));
      formData.append("semester", selectedSemester);
      formData.append("department", department);

      const res = await api.previewSectionRoster(formData);
      setSectionPreviews((prev) => ({ ...prev, [sec]: res }));
    } catch (err) {
      setStatusMessage({
        type: "danger",
        text: `Section ${sec}: ${err.message || "Failed to parse roster file."}`,
      });
    } finally {
      setSectionLoading((prev) => ({ ...prev, [sec]: false }));
    }
  }

  function handleStudentCellChange(sec, index, field, value) {
    const preview = sectionPreviews[sec];
    if (!preview) return;
    const updated = [...preview.students];
    updated[index][field] = value;
    const item = updated[index];
    item.is_valid = Boolean(item.hall_ticket_no.trim() && item.name.trim());
    setSectionPreviews((prev) => ({
      ...prev,
      [sec]: {
        ...preview,
        students: updated,
        valid_records: updated.filter((s) => s.is_valid).length,
      },
    }));
  }

  async function handleSaveSectionRoster(sec) {
    const preview = sectionPreviews[sec];
    if (!preview || !preview.students) return;

    setSectionLoading((prev) => ({ ...prev, [sec]: true }));
    setStatusMessage({ type: "", text: "" });

    try {
      const validStudents = preview.students.filter((s) => s.is_valid);
      const res = await api.importSectionRoster({
        students: validStudents,
        section: sec,
        academic_year: academicYear,
        study_year: studyYear,
        semester: selectedSemester,
        department,
        filename: sectionFiles[sec]?.name || `Section_${sec}_Roster.xlsx`,
        uploaded_by: "admin",
      });

      setStatusMessage({
        type: "success",
        text: res.message || `Section ${sec}: Successfully imported ${validStudents.length} students!`,
      });

      // Clear preview for this section
      setSectionPreviews((prev) => {
        const next = { ...prev };
        delete next[sec];
        return next;
      });
      setSectionFiles((prev) => {
        const next = { ...prev };
        delete next[sec];
        return next;
      });

      loadCohortSections();
      loadBatches();
    } catch (err) {
      setStatusMessage({
        type: "danger",
        text: `Section ${sec} save failed: ${err.message}`,
      });
    } finally {
      setSectionLoading((prev) => ({ ...prev, [sec]: false }));
    }
  }

  // -------------------------------------------------------------
  // Safe Deletion Handlers (Pre-flight Dependency Check)
  // -------------------------------------------------------------
  async function openDeleteModal(target) {
    setDeleteTarget(target);
    setPreflightData(null);
    setConfirmForce(false);
    setShowDeleteModal(true);
    setCheckingPreflight(true);

    try {
      const res = await api.checkStudentDeletion(target);
      setPreflightData(res);
    } catch (err) {
      setPreflightData({
        student_count: 0,
        can_safe_delete: false,
        blocking_reason: err.message || "Failed to perform dependency pre-flight check.",
      });
    } finally {
      setCheckingPreflight(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setStatusMessage({ type: "", text: "" });

    try {
      const payload = {
        ...deleteTarget,
        force: confirmForce,
        deleted_by: "admin",
      };
      const res = await api.deleteStudents(payload);
      setStatusMessage({
        type: "success",
        text: res.message || "Students successfully deleted.",
      });
      setShowDeleteModal(false);
      setDeleteTarget(null);
      setPreflightData(null);

      // Refresh data
      loadCohortSections();
      loadBatches();
      if (activeSectionTab) {
        loadEnrolledStudents(activeSectionTab);
      }
      setSelectedEnrolledIds([]);
    } catch (err) {
      setStatusMessage({
        type: "danger",
        text: err.message || "Deletion failed. Please review dependency constraints.",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="data-management-page">
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: "16px" }}>
        <div>
          <h1 className="page-title">CSE Academic Data &amp; Roster Management</h1>
          <p className="page-subtitle">
            Configure academic cohorts, manage course catalogues, administer dynamic CSE sections, and review upload history with safe deletion controls.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span className="status-pill active" style={{ fontSize: "13px", padding: "6px 14px" }}>
            Total Cohort: {totalCohortStudents} Students ({configuredSections.length} Sections)
          </span>
        </div>
      </div>

      {/* Global Status Banner */}
      {statusMessage.text && (
        <div className={`alert alert-${statusMessage.type}`}>
          <span>{statusMessage.type === "success" ? "✅" : "⚠️"}</span>
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* =========================================================
          SECTION 1: ACADEMIC YEAR & COHORT SETUP
         ========================================================= */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">1. Academic Year &amp; Cohort Setup</h2>
            <p className="panel-subtitle">
              Configure the target academic session, study year, and semester terms.
            </p>
          </div>
        </div>

        <div className="form-row-3">
          {/* Academic Year */}
          <div className="form-group">
            <label className="form-label" htmlFor="ay-select">
              Academic Year <span className="form-label-required">*</span>
            </label>
            <select
              id="ay-select"
              className="form-control"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
            >
              <option value="2026-2027">2026–2027 (Active Term)</option>
              <option value="2025-2026">2025–2026</option>
              <option value="2027-2028">2027–2028</option>
            </select>
          </div>

          {/* Study Year */}
          <div className="form-group">
            <label className="form-label">
              Study Year <span className="form-label-required">*</span>
            </label>
            <div className="pill-selector-group">
              {[1, 2, 3, 4].map((yr) => (
                <button
                  key={yr}
                  type="button"
                  className={`pill-option-btn ${studyYear === yr ? "active" : ""}`}
                  onClick={() => setStudyYear(yr)}
                >
                  {STUDY_YEAR_MAP[yr].label}
                </button>
              ))}
            </div>
          </div>

          {/* Applicable Semester */}
          <div className="form-group">
            <label className="form-label">
              Applicable Semester <span className="form-label-required">*</span>
            </label>
            <div className="pill-selector-group">
              {applicableSemesters.map((sem) => (
                <button
                  key={sem}
                  type="button"
                  className={`pill-option-btn ${selectedSemester === sem ? "active" : ""}`}
                  onClick={() => setSelectedSemester(sem)}
                >
                  {sem}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          SECTION 2: SUBJECT CATALOGUE (MANUAL + BULK UPLOAD)
         ========================================================= */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              2. Subject Catalogue for {selectedSemester} ({STUDY_YEAR_MAP[studyYear].label})
            </h2>
            <p className="panel-subtitle">
              Theory subjects registered for examination allocation. Supports manual entry and CSV, Excel, or PDF bulk upload.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowBulkSubjectModal(true)}
            >
              📤 Upload Subjects (CSV/Excel/PDF)
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowAddSubjectModal(true)}
            >
              ➕ Add Subject Manually
            </button>
          </div>
        </div>

                {/* Bulk Selection Action Toolbar */}
        {selectedSubjectIds.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#eff6ff",
              border: "1.5px solid #bfdbfe",
              borderRadius: "8px",
              padding: "10px 16px",
              marginBottom: "14px",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  background: "var(--accent-blue)",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "20px",
                }}
              >
                {selectedSubjectIds.length} Selected
              </span>
              <span style={{ fontSize: "13px", color: "var(--primary-navy)", fontWeight: 600 }}>
                {selectedSubjectObjects.length} Course{selectedSubjectObjects.length !== 1 ? "s" : ""} selected for bulk action
              </span>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedSubjectIds([])}
              >
                Clear Selection
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={handleOpenBulkSubjectDeleteModal}
                style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                🗑️ Delete Selected ({selectedSubjectIds.length})
              </button>
            </div>
          </div>
        )}

        {loadingSubjects ? (
          <p className="form-helper" style={{ padding: "16px 0" }}>Loading subject catalogue...</p>
        ) : semesterSubjects.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📚</span>
            <h3>No Subjects Configured for {selectedSemester}</h3>
            <p>Use &quot;Add Subject Manually&quot; or &quot;Upload Subjects&quot; to populate courses.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "38px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={allCurrentSemesterSelected}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = !allCurrentSemesterSelected && someCurrentSemesterSelected;
                        }
                      }}
                      onChange={toggleSelectAllSemesterSubjects}
                      title="Select / deselect all subjects in this semester"
                      style={{ cursor: "pointer", width: "16px", height: "16px" }}
                    />
                  </th>
                  <th>Subject Code</th>
                  <th>Course Title</th>
                  <th>Department</th>
                  <th>Category</th>
                  <th>Semester</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {semesterSubjects.map((sub) => {
                  const isChecked = selectedSubjectIds.includes(sub.subject_id);
                  return (
                    <tr
                      key={sub.subject_id}
                      style={{
                        background: isChecked ? "#f0f7ff" : "inherit",
                        transition: "background 0.15s ease",
                      }}
                    >
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectSubject(sub.subject_id)}
                          style={{ cursor: "pointer", width: "16px", height: "16px" }}
                        />
                      </td>
                      <td>
                        <strong style={{ color: "var(--primary-navy)" }}>{sub.subject_code}</strong>
                      </td>
                    <td>{sub.subject_name}</td>
                    <td>
                      <span className="badge-cse">{sub.department || "CSE"}</span>
                    </td>
                    <td>
                      <span className="status-pill info">{sub.category || "Core"}</span>
                      {sub.is_active === 0 && (
                        <span className="status-pill warning" style={{ marginLeft: "6px", fontSize: "11px" }}>
                          Archived
                        </span>
                      )}
                    </td>
                    <td>{sub.semester}</td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                          onClick={() => handleOpenEditModal(sub)}
                          title="Edit subject details"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ color: "var(--danger)", borderColor: "#fecaca", display: "inline-flex", alignItems: "center", gap: "4px" }}
                          onClick={() => handleOpenDeleteModal(sub)}
                          title="Delete or archive subject"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* =========================================================
          SECTION 3: CSE SECTION MANAGEMENT & INDIVIDUAL STUDENT ROSTERS
         ========================================================= */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">3. CSE Dynamic Section Management &amp; Section-Wise Rosters</h2>
            <p className="panel-subtitle">
              Add or remove sections dynamically without fixed limits. Upload, preview, and validate rosters independently per section.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-navy"
              onClick={openPromotionModal}
              title="Promote enrolled candidates to next study year & academic year"
              style={{ background: "#2563eb", borderColor: "#1d4ed8" }}
            >
              🎓 Student Promotion
            </button>
            <button
              type="button"
              className="btn btn-navy"
              onClick={handleAddSection}
            >
              ➕ Add Section
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() =>
                openDeleteModal({
                  type: "cohort",
                  academic_year: academicYear,
                  study_year: studyYear,
                  department,
                  label: `All Sections (Cohort ${academicYear} Year ${studyYear})`,
                })
              }
            >
              🗑️ Delete Entire Cohort
            </button>
          </div>
        </div>

        {/* Section Cards / Pills Bar */}
        <div style={{ marginBottom: "16px" }}>
          <label className="form-label" style={{ fontWeight: 700, marginBottom: "8px" }}>
            Configured Sections &amp; Registered Candidate Counts:
          </label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {configuredSections.map((sec) => {
              const count = sectionCounts[sec] || 0;
              const isSelected = activeSectionTab === sec;
              return (
                <div
                  key={sec}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    minWidth: "160px",
                    gap: "8px",
                    background: isSelected ? "#0f172a" : "#f8fafc",
                    color: isSelected ? "#ffffff" : "#334155",
                    border: `1.5px solid ${isSelected ? "#0f172a" : "var(--border-color)"}`,
                    borderRadius: "8px",
                    padding: "8px 14px",
                    cursor: "pointer",
                    fontSize: "13px",
                    boxShadow: isSelected ? "0 2px 6px rgba(15, 23, 42, 0.15)" : "0 1px 2px rgba(0,0,0,0.04)",
                  }}
                  onClick={() => setActiveSectionTab(sec)}
                >
                  <strong style={{ fontWeight: 700 }}>Section {sec}</strong>
                  <span
                    style={{
                      background: isSelected ? "rgba(255,255,255,0.2)" : "#e2e8f0",
                      color: isSelected ? "#ffffff" : "#475569",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      fontSize: "11.5px",
                      fontWeight: 600,
                    }}
                  >
                    {count} {count === 1 ? "student" : "students"}
                  </span>
                  <button
                    type="button"
                    title={`Rename Section ${sec}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openRenameSection(sec);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: isSelected ? "#cbd5e1" : "var(--text-muted)",
                      cursor: "pointer",
                      padding: "0 2px",
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    title={`Remove Section ${sec} from view`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveSection(sec);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: isSelected ? "#fca5a5" : "#ef4444",
                      cursor: "pointer",
                      padding: "0 2px",
                      fontWeight: 700,
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Section Upload & Management Workspace */}
        {activeSectionTab && (
          <div
            style={{
              background: "#ffffff",
              border: "1.5px solid var(--border-color)",
              borderRadius: "10px",
              padding: "20px",
              marginTop: "12px",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                borderBottom: "1px solid var(--border-color)",
                paddingBottom: "12px",
              }}
            >
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--primary-navy)" }}>
                  Section {activeSectionTab} Shared Roster Management
                </h3>
                <p style={{ fontSize: "12.5px", color: "var(--text-muted)", margin: "2px 0 0" }}>
                  Shared Master Roster:{" "}
                  <strong>{enrolledStudents.length} candidates</strong> &bull; Shared across {applicableSemesters.join(" & ")} &bull; Year {studyYear} ({academicYear})
                </p>
              </div>

              {sectionCounts[activeSectionTab] > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ color: "var(--danger)", borderColor: "#fecaca" }}
                  onClick={() =>
                    openDeleteModal({
                      type: "section",
                      academic_year: academicYear,
                      study_year: studyYear,
                      department,
                      section: activeSectionTab,
                      label: `Section ${activeSectionTab} (${academicYear} Year ${studyYear})`,
                    })
                  }
                >
                  🗑️ Delete Entire Section {activeSectionTab} Data
                </button>
              )}
            </div>

            {/* PART 1: Enrolled Students Roster Table with Bulk Select & Delete */}
            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                }}
              >
                <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--primary-navy)", margin: 0 }}>
                  Enrolled Candidates in Section {activeSectionTab} ({enrolledStudents.length}) &bull; Shared Across {applicableSemesters.join(" & ")}
                </h4>

                {selectedEnrolledIds.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        background: "var(--accent-blue)",
                        color: "#ffffff",
                        fontSize: "11.5px",
                        fontWeight: 700,
                        padding: "3px 10px",
                        borderRadius: "20px",
                      }}
                    >
                      {selectedEnrolledIds.length} selected
                    </span>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() =>
                        openDeleteModal({
                          type: "selected",
                          student_ids: selectedEnrolledIds,
                          label: `${selectedEnrolledIds.length} Selected Candidate(s) (Section ${activeSectionTab})`,
                        })
                      }
                    >
                      🗑️ Delete Selected ({selectedEnrolledIds.length})
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setSelectedEnrolledIds([])}
                    >
                      Clear Selection
                    </button>
                  </div>
                )}
              </div>

              {loadingEnrolled ? (
                <p className="form-helper" style={{ padding: "16px 0" }}>Loading enrolled candidates...</p>
              ) : enrolledStudents.length === 0 ? (
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px dashed var(--border-color)",
                    borderRadius: "8px",
                    padding: "20px",
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: "13px",
                  }}
                >
                  No candidates currently registered in Section {activeSectionTab} for Year {studyYear} ({academicYear}). Upload a roster once to enroll candidates across both {applicableSemesters.join(" and ")}.
                </div>
              ) : (
                <div className="table-wrapper" style={{ maxHeight: "260px", overflowY: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: "36px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            aria-label="Select All Candidates"
                            checked={enrolledStudents.length > 0 && selectedEnrolledIds.length === enrolledStudents.length}
                            onChange={toggleSelectAllEnrolled}
                            style={{ cursor: "pointer" }}
                          />
                        </th>
                        <th>#</th>
                        <th>Hall Ticket No</th>
                        <th>Student Name</th>
                        <th>Section</th>
                        <th>Department</th>
                        <th>Status</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrolledStudents.map((st, idx) => {
                        const isSelected = selectedEnrolledIds.includes(st.student_id);
                        return (
                          <tr
                            key={st.student_id}
                            style={{ backgroundColor: isSelected ? "#f0fdf4" : "inherit" }}
                          >
                            <td style={{ textAlign: "center" }}>
                              <input
                                type="checkbox"
                                aria-label={`Select ${st.hall_ticket_no}`}
                                checked={isSelected}
                                onChange={() => toggleSelectEnrolled(st.student_id)}
                                style={{ cursor: "pointer" }}
                              />
                            </td>
                            <td>{idx + 1}</td>
                            <td>
                              <strong style={{ color: "var(--primary-navy)" }}>{st.hall_ticket_no}</strong>
                            </td>
                            <td>{st.name}</td>
                            <td>
                              <span className="badge-cse">Section {st.section || activeSectionTab}</span>
                            </td>
                            <td>{st.department || "CSE"}</td>
                            <td>
                              <span className="status-pill active">● Enrolled</span>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <div style={{ display: "inline-flex", gap: "6px" }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: "2px 8px", fontSize: "11px" }}
                                  onClick={() => openEditStudentModal(st)}
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  style={{ color: "var(--danger)", borderColor: "#fecaca", padding: "2px 8px", fontSize: "11px" }}
                                  onClick={() =>
                                    openDeleteModal({
                                      type: "selected",
                                      student_ids: [st.student_id],
                                      label: `${st.hall_ticket_no} – ${st.name}`,
                                    })
                                  }
                                >
                                  🗑️ Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* PART 2: Intelligent Excel / CSV Roster Upload */}
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "18px" }}>
              <div className="form-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                  <label className="form-label" style={{ fontWeight: 700, color: "var(--primary-navy)", margin: 0 }}>
                    Upload / Import Shared Roster for Section {activeSectionTab} (Year {studyYear} &bull; {academicYear} &bull; Shared for {applicableSemesters.join(" & ")})
                  </label>
                  <button
                    type="button"
                    className="btn btn-navy btn-sm"
                    onClick={openAddIndividualModal}
                  >
                    ➕ Add Student Individually
                  </button>
                </div>
                <div
                  className="dropzone-container"
                  onClick={() => document.getElementById(`roster-input-${activeSectionTab}`).click()}
                  style={{ padding: "24px 16px" }}
                >
                  <input
                    id={`roster-input-${activeSectionTab}`}
                    type="file"
                    accept=".csv,.xlsx,.xls,.pdf"
                    style={{ display: "none" }}
                    onChange={(e) => handleSectionFileSelect(activeSectionTab, e)}
                  />
                  <div className="dropzone-icon">📋</div>
                  <div className="dropzone-title">
                    {sectionFiles[activeSectionTab]
                      ? sectionFiles[activeSectionTab].name
                      : `Select or Drag & Drop Section ${activeSectionTab} File`}
                  </div>
                  <p className="dropzone-caption">
                    Upload once per academic year. Enrolled candidates are automatically shared across both {applicableSemesters.join(" and ")}, eliminating redundant semester-specific re-uploads. Supported: Excel (.xlsx, .xls), CSV, PDF.
                  </p>
                </div>
              </div>

              {/* Parsing Indicator */}
              {sectionLoading[activeSectionTab] && (
                <div className="alert alert-warning" style={{ marginTop: "12px" }}>
                  <span>⏳</span>
                  <span>Processing, detecting worksheet, and validating Section {activeSectionTab} candidates...</span>
                </div>
              )}

              {/* Preview of Section Roster */}
              {sectionPreviews[activeSectionTab] && (
                <div style={{ marginTop: "16px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "12px",
                      flexWrap: "wrap",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--primary-navy)", margin: 0 }}>
                        Section {activeSectionTab} Preview: {sectionPreviews[activeSectionTab].total_records} Extracted
                      </h4>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Worksheet: <strong>{sectionPreviews[activeSectionTab].detected_sheet || "Detected"}</strong> &bull; Columns: Hall Ticket (<strong>{sectionPreviews[activeSectionTab].detected_columns?.hall_ticket || "Detected"}</strong>), Name (<strong>{sectionPreviews[activeSectionTab].detected_columns?.name || "Detected"}</strong>)
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setMappingOpen(!mappingOpen)}
                      >
                        ⚙️ {mappingOpen ? "Hide Column Mapping" : "Adjust Column Mapping"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-success"
                        onClick={() => handleSaveSectionRoster(activeSectionTab)}
                        disabled={sectionLoading[activeSectionTab] || sectionPreviews[activeSectionTab].valid_records === 0}
                      >
                        💾 Save Section {activeSectionTab} Shared Roster ({sectionPreviews[activeSectionTab].valid_records} Valid)
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Chips */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                      gap: "8px",
                      marginBottom: "14px",
                    }}
                  >
                    <div style={{ background: "#f8fafc", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--primary-navy)" }}>{sectionPreviews[activeSectionTab].total_records}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Total Extracted</div>
                    </div>
                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#166534" }}>{sectionPreviews[activeSectionTab].valid_records}</div>
                      <div style={{ fontSize: "11px", color: "#166534" }}>Valid Candidates</div>
                    </div>
                    <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#c2410c" }}>{sectionPreviews[activeSectionTab].duplicate_records || 0}</div>
                      <div style={{ fontSize: "11px", color: "#c2410c" }}>Duplicates in File</div>
                    </div>
                    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#1e40af" }}>{sectionPreviews[activeSectionTab].db_duplicate_count || 0}</div>
                      <div style={{ fontSize: "11px", color: "#1e40af" }}>Already in DB</div>
                    </div>
                    <div style={{ background: (sectionPreviews[activeSectionTab].invalid_records || 0) > 0 ? "#fff1f2" : "#f8fafc", border: `1px solid ${(sectionPreviews[activeSectionTab].invalid_records || 0) > 0 ? "#fecaca" : "var(--border-color)"}`, borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: (sectionPreviews[activeSectionTab].invalid_records || 0) > 0 ? "#dc2626" : "var(--text-muted)" }}>{sectionPreviews[activeSectionTab].invalid_records || 0}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Invalid / Issues</div>
                    </div>
                    <div style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#475569" }}>{sectionPreviews[activeSectionTab].skipped_headings_count || 0}</div>
                      <div style={{ fontSize: "11px", color: "#475569" }}>Skipped Headings</div>
                    </div>
                  </div>

                  {/* Rejection Reasons Alert */}
                  {sectionPreviews[activeSectionTab].rejection_reasons?.length > 0 && (
                    <div className="alert alert-warning" style={{ marginBottom: "14px" }}>
                      <span>⚠️</span>
                      <div>
                        <strong>Rejected Records &amp; Validation Constraints:</strong>
                        <ul style={{ margin: "4px 0 0 16px", fontSize: "12px" }}>
                          {sectionPreviews[activeSectionTab].rejection_reasons.map((reason, rIdx) => (
                            <li key={rIdx}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Manual Column Mapping Tool */}
                  {mappingOpen && (
                    <div
                      style={{
                        background: "#f8fafc",
                        border: "1.5px solid var(--accent-blue)",
                        borderRadius: "8px",
                        padding: "14px 16px",
                        marginBottom: "14px",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--primary-navy)", marginBottom: "8px" }}>
                        🛠️ Manual Column &amp; Worksheet Mapping
                      </div>
                      <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 12px" }}>
                        If the workbook header was ambiguous or unusual, select the correct sheet and column positions below:
                      </p>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "12px" }}>
                        {sectionPreviews[activeSectionTab].available_sheets?.length > 0 && (
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: "11.5px" }}>Target Worksheet:</label>
                            <select
                              className="form-control"
                              value={mappingSheet || sectionPreviews[activeSectionTab].detected_sheet || ""}
                              onChange={(e) => setMappingSheet(e.target.value)}
                              style={{ fontSize: "12px", padding: "6px" }}
                            >
                              {sectionPreviews[activeSectionTab].available_sheets.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: "11.5px" }}>Hall Ticket Column # (0-indexed):</label>
                          <input
                            type="number"
                            className="form-control"
                            placeholder="e.g. 1"
                            value={mappingHtCol}
                            onChange={(e) => setMappingHtCol(e.target.value)}
                            style={{ fontSize: "12px", padding: "6px" }}
                          />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: "11.5px" }}>Student Name Column # (0-indexed):</label>
                          <input
                            type="number"
                            className="form-control"
                            placeholder="e.g. 2"
                            value={mappingNameCol}
                            onChange={(e) => setMappingNameCol(e.target.value)}
                            style={{ fontSize: "12px", padding: "6px" }}
                          />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: "11.5px" }}>Section Column # (Optional):</label>
                          <input
                            type="number"
                            className="form-control"
                            placeholder="e.g. 4"
                            value={mappingSecCol}
                            onChange={(e) => setMappingSecCol(e.target.value)}
                            style={{ fontSize: "12px", padding: "6px" }}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleReParseWithMapping(activeSectionTab)}
                        disabled={sectionLoading[activeSectionTab]}
                      >
                        Apply Mapping &amp; Re-parse
                      </button>
                    </div>
                  )}

                  {/* Preview Candidate Rows Table */}
                  <div className="table-wrapper" style={{ maxHeight: "280px", overflowY: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Row In File</th>
                          <th>Hall Ticket No</th>
                          <th>Student Name</th>
                          <th>Section</th>
                          <th>Department</th>
                          <th>Validation Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionPreviews[activeSectionTab].students.slice(0, 35).map((st, idx) => (
                          <tr key={idx} style={{ backgroundColor: st.is_valid ? "inherit" : "#fff1f2" }}>
                            <td>{idx + 1}</td>
                            <td style={{ fontSize: "11px", color: "var(--text-muted)" }}>Row {st.row_number || idx + 1}</td>
                            <td>
                              <input
                                type="text"
                                className="form-control"
                                style={{ padding: "4px 8px", fontSize: "12px", width: "140px" }}
                                value={st.hall_ticket_no}
                                onChange={(e) =>
                                  handleStudentCellChange(activeSectionTab, idx, "hall_ticket_no", e.target.value.toUpperCase())
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control"
                                style={{ padding: "4px 8px", fontSize: "12px" }}
                                value={st.name}
                                onChange={(e) =>
                                  handleStudentCellChange(activeSectionTab, idx, "name", e.target.value)
                                }
                              />
                            </td>
                            <td>
                              <span className="badge-cse">Section {st.section}</span>
                            </td>
                            <td>{st.department}</td>
                            <td>
                              {st.exists_in_db ? (
                                <span className="status-pill warning" title="Already exists in database">Already in DB</span>
                              ) : st.is_valid ? (
                                <span className="status-pill active">✓ Valid</span>
                              ) : (
                                <span className="status-pill danger" title={st.error}>
                                  ✕ {st.error}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="form-helper" style={{ marginTop: "8px" }}>
                    Showing first {Math.min(35, sectionPreviews[activeSectionTab].total_records)} rows. You may edit cell values above before saving.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* =========================================================
          SECTION 4: UPLOAD HISTORY & SAFE DELETION MANAGEMENT
         ========================================================= */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">4. Student Upload History &amp; Batch Auditing</h2>
            <p className="panel-subtitle">
              Audit trail of every imported candidate roster with batch identification, timestamp, record breakdown, and safe deletion.
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ borderColor: "#f59e0b", color: "#b45309" }}
              onClick={openClearHistoryModal}
              disabled={loadingBatches || batches.length === 0}
              title="Clear audit log entries from upload history without deleting student or course data"
            >
              🧹 Clear History
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={loadBatches}
              disabled={loadingBatches}
            >
              🔄 Refresh History
            </button>
          </div>
        </div>

        {loadingBatches ? (
          <p className="form-helper" style={{ padding: "16px 0" }}>Loading upload history...</p>
        ) : batches.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📁</span>
            <h3>No Upload History Batches Found</h3>
            <p>Import batches will appear here as section rosters are saved.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Batch ID / Code</th>
                  <th>Original Filename</th>
                  <th>Section</th>
                  <th>Academic Term</th>
                  <th>Uploaded At</th>
                  <th>Records</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const isDeleted = b.import_status === "deleted";
                  return (
                    <tr key={b.batch_id} style={{ opacity: isDeleted ? 0.6 : 1 }}>
                      <td>
                        <strong style={{ color: "var(--primary-navy)" }}>#{b.batch_id}</strong>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{b.batch_code}</div>
                      </td>
                      <td>
                        <strong>{b.filename}</strong>
                        {b.notes && (
                          <div style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
                            {b.notes}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge-cse">{b.section}</span>
                      </td>
                      <td>
                        {b.academic_year} &bull; Year {b.study_year} ({b.semester})
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        {String(b.upload_timestamp).slice(0, 19).replace("T", " ")}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--primary-navy)" }}>
                          {b.accepted_records}
                        </span>{" "}
                        / {b.total_records}
                      </td>
                      <td>
                        <span
                          className={`status-pill ${
                            isDeleted ? "danger" : b.import_status === "completed" ? "active" : "warning"
                          }`}
                        >
                          {isDeleted ? "● Deleted" : "● Active"}
                        </span>
                        {isDeleted && b.deleted_at && (
                          <div style={{ fontSize: "11px", color: "#dc2626", marginTop: "2px" }}>
                            {String(b.deleted_at).slice(0, 10)}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {!isDeleted ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ color: "var(--danger)", borderColor: "#fecaca" }}
                            onClick={() =>
                              openDeleteModal({
                                type: "batch",
                                batch_id: b.batch_id,
                                label: `Batch #${b.batch_id} (${b.filename} - Section ${b.section})`,
                              })
                            }
                          >
                            🗑️ Delete Batch
                          </button>
                        ) : (
                          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Archived</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* =========================================================
          MODAL: ADD SINGLE SUBJECT MANUALLY
         ========================================================= */}
      {showAddSubjectModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Add Course to {selectedSemester}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowAddSubjectModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSubjectManual}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="manual-code">
                    Course Code <span className="form-label-required">*</span>
                  </label>
                  <input
                    id="manual-code"
                    type="text"
                    className="form-control"
                    placeholder="e.g. 24CS501"
                    value={newSubCode}
                    onChange={(e) => setNewSubCode(e.target.value)}
                    required
                    disabled={savingSubject}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="manual-name">
                    Course Title <span className="form-label-required">*</span>
                  </label>
                  <input
                    id="manual-name"
                    type="text"
                    className="form-control"
                    placeholder="e.g. Theory of Computation"
                    value={newSubName}
                    onChange={(e) => setNewSubName(e.target.value)}
                    required
                    disabled={savingSubject}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select
                      className="form-control"
                      value={newSubCat}
                      onChange={(e) => setNewSubCat(e.target.value)}
                      disabled={savingSubject}
                    >
                      <option value="Core">Core Theory</option>
                      <option value="Professional Elective">Professional Elective (PE)</option>
                      <option value="Open Elective">Open Elective (OE)</option>
                      <option value="Laboratory">Laboratory</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <input type="text" className="form-control" value="CSE" disabled />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddSubjectModal(false)}
                  disabled={savingSubject}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-navy" disabled={savingSubject}>
                  {savingSubject ? "Saving..." : "Add Subject"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: EDIT SUBJECT DETAILS
         ========================================================= */}
      {showEditSubjectModal && editingSubject && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "560px" }}>
            <div className="modal-header">
              <h3 className="modal-title">
                ✏️ Edit Course: {editingSubject.subject_code}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setShowEditSubjectModal(false);
                  setEditingSubject(null);
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSubjectSubmit}>
              <div className="modal-body">
                {editSubjectError && (
                  <div className="alert alert-danger" style={{ marginBottom: "14px" }}>
                    <span>⚠️</span>
                    <span>{editSubjectError}</span>
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-sub-code">
                      Subject Code <span className="form-label-required">*</span>
                    </label>
                    <input
                      id="edit-sub-code"
                      type="text"
                      className="form-control"
                      placeholder="e.g. CS501"
                      value={editSubCode}
                      onChange={(e) => setEditSubCode(e.target.value.toUpperCase())}
                      required
                      disabled={savingEditSubject}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-sub-dept">
                      Department <span className="form-label-required">*</span>
                    </label>
                    <input
                      id="edit-sub-dept"
                      type="text"
                      className="form-control"
                      placeholder="e.g. CSE"
                      value={editSubDept}
                      onChange={(e) => setEditSubDept(e.target.value.toUpperCase())}
                      required
                      disabled={savingEditSubject}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="edit-sub-name">
                    Course Title <span className="form-label-required">*</span>
                  </label>
                  <input
                    id="edit-sub-name"
                    type="text"
                    className="form-control"
                    placeholder="e.g. Database Management Systems"
                    value={editSubName}
                    onChange={(e) => setEditSubName(e.target.value)}
                    required
                    disabled={savingEditSubject}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-sub-ay">
                      Academic Year <span className="form-label-required">*</span>
                    </label>
                    <input
                      id="edit-sub-ay"
                      type="text"
                      className="form-control"
                      placeholder="e.g. 2026-2027"
                      value={editSubAy}
                      onChange={(e) => setEditSubAy(e.target.value)}
                      required
                      disabled={savingEditSubject}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-sub-cat">
                      Category
                    </label>
                    <select
                      id="edit-sub-cat"
                      className="form-control"
                      value={editSubCat}
                      onChange={(e) => setEditSubCat(e.target.value)}
                      disabled={savingEditSubject}
                    >
                      <option value="Core">Core Theory</option>
                      <option value="Professional Elective">Professional Elective (PE)</option>
                      <option value="Open Elective">Open Elective (OE)</option>
                      <option value="Laboratory">Laboratory</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-sub-sy">
                      Study Year <span className="form-label-required">*</span>
                    </label>
                    <select
                      id="edit-sub-sy"
                      className="form-control"
                      value={editSubSy}
                      onChange={handleEditStudyYearChange}
                      disabled={savingEditSubject}
                    >
                      <option value={1}>1 - First Year</option>
                      <option value={2}>2 - Second Year</option>
                      <option value={3}>3 - Third Year</option>
                      <option value={4}>4 - Fourth Year</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-sub-sem">
                      Semester <span className="form-label-required">*</span>
                    </label>
                    <select
                      id="edit-sub-sem"
                      className="form-control"
                      value={editSubSem}
                      onChange={(e) => setEditSubSem(e.target.value)}
                      disabled={savingEditSubject}
                    >
                      {(STUDY_YEAR_MAP[editSubSy]?.semesters || [
                        "Semester 1", "Semester 2", "Semester 3", "Semester 4",
                        "Semester 5", "Semester 6", "Semester 7", "Semester 8"
                      ]).map((semName) => (
                        <option key={semName} value={semName}>
                          {semName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowEditSubjectModal(false);
                    setEditingSubject(null);
                  }}
                  disabled={savingEditSubject}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-navy"
                  disabled={savingEditSubject}
                >
                  {savingEditSubject ? "Saving Changes..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: SAFE DELETE / ARCHIVE SUBJECT
         ========================================================= */}
      {showDeleteSubjectModal && subjectToDelete && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "560px" }}>
            <div className="modal-header">
              <h3 className="modal-title">
                🗑️ Delete Subject: {subjectToDelete.subject_code}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setShowDeleteSubjectModal(false);
                  setSubjectToDelete(null);
                  setSubjectDependencies(null);
                  setDeleteSubjectError("");
                }}
                disabled={deletingSubject || archivingSubject}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div style={{ marginBottom: "16px", padding: "12px", background: "var(--bg-light)", borderRadius: "6px" }}>
                <div style={{ fontWeight: 600, fontSize: "15px", color: "var(--primary-navy)" }}>
                  {subjectToDelete.subject_name}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Code: <strong>{subjectToDelete.subject_code}</strong> &bull; Dept: <strong>{subjectToDelete.department || "CSE"}</strong> &bull; Category: <strong>{subjectToDelete.category || "Core"}</strong> &bull; Semester: <strong>{subjectToDelete.semester}</strong>
                </div>
              </div>

              {deleteSubjectError && (
                <div className="alert alert-danger" style={{ marginBottom: "12px" }}>
                  <span>⚠️</span>
                  <span>{deleteSubjectError}</span>
                </div>
              )}

              {checkingDependencies && (
                <div className="alert alert-warning" style={{ marginBottom: "12px" }}>
                  <span>⏳</span>
                  <span>Inspecting course relationships, examinations, and registrations...</span>
                </div>
              )}

              {!checkingDependencies && subjectDependencies && (
                <>
                  {subjectDependencies.can_delete ? (
                    <div className="alert alert-success" style={{ marginBottom: "14px" }}>
                      <span>✅</span>
                      <div>
                        <strong>Safe to Delete:</strong>
                        <div style={{ fontSize: "12px", marginTop: "2px" }}>
                          This course has no linked examinations or student registrations. It can be permanently removed from MySQL.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="alert alert-danger" style={{ marginBottom: "12px" }}>
                        <span>🚫</span>
                        <div>
                          <strong>Cannot Permanently Delete Course</strong>
                          <div style={{ fontSize: "12px", marginTop: "2px" }}>
                            This subject is referenced by existing academic records in the database. Deleting it would violate foreign key constraints and corrupt historical exam data.
                          </div>
                        </div>
                      </div>

                      <div style={{ background: "#fff1f2", border: "1px solid #fecaca", borderRadius: "6px", padding: "12px", marginBottom: "14px", fontSize: "12px" }}>
                        <strong style={{ color: "#991b1b" }}>Active Dependencies:</strong>
                        <ul style={{ margin: "6px 0 0 16px", color: "#7f1d1d" }}>
                          {subjectDependencies.blocking_reasons?.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                          ))}
                        </ul>

                        {subjectDependencies.exams && subjectDependencies.exams.length > 0 && (
                          <div style={{ marginTop: "10px" }}>
                            <div style={{ fontWeight: 600, color: "#991b1b" }}>Linked Examination Sessions:</div>
                            <div style={{ maxHeight: "100px", overflowY: "auto", marginTop: "4px" }}>
                              {subjectDependencies.exams.map((ex) => (
                                <div key={ex.exam_id} style={{ padding: "2px 0", borderBottom: "1px dashed #fca5a5" }}>
                                  #{ex.exam_id} &bull; {ex.exam_name} ({ex.exam_date || "Date N/A"} - {ex.session || "Session N/A"}) - <em>{ex.status}</em>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "0" }}>
                        💡 <strong>Recommended Action: Archive Course</strong><br />
                        Archiving deactivates this course so it won't appear in new exam scheduling while safely preserving all historical examinations, seating allocations, and registrations.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowDeleteSubjectModal(false);
                  setSubjectToDelete(null);
                  setSubjectDependencies(null);
                  setDeleteSubjectError("");
                }}
                disabled={deletingSubject || archivingSubject}
              >
                Cancel
              </button>

              {!checkingDependencies && subjectDependencies && (
                <>
                  {subjectDependencies.can_delete ? (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={handleConfirmDeleteSubject}
                      disabled={deletingSubject}
                    >
                      {deletingSubject ? "Deleting..." : "🗑️ Confirm Permanent Delete"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-warning"
                      style={{ background: "#d97706", color: "#fff", borderColor: "#b45309" }}
                      onClick={handleArchiveSubject}
                      disabled={archivingSubject}
                    >
                      {archivingSubject ? "Archiving..." : "📦 Archive Course (Safe)"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

            {/* =========================================================
          MODAL: BULK DELETE & ARCHIVE SUBJECTS (PREFLIGHT DEPENDENCY CHECK)
         ========================================================= */}
      {showBulkSubjectDeleteModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "720px", width: "95%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  🗑️ Bulk Subject Deletion &amp; Dependency Check
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                  Preflight inspection for active examinations, registrations, and historical records
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setShowBulkSubjectDeleteModal(false);
                  setBulkSubjectPreflight(null);
                  setBulkSubjectError("");
                }}
                disabled={bulkSubjectProcessing}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ overflowY: "auto", flex: 1 }}>
              {bulkSubjectError && (
                <div className="alert alert-danger" style={{ marginBottom: "14px" }}>
                  <span>⚠️</span>
                  <span>{bulkSubjectError}</span>
                </div>
              )}

              {checkingBulkSubjectDependencies && (
                <div className="alert alert-warning" style={{ marginBottom: "14px" }}>
                  <span>⏳</span>
                  <span>Inspecting dependencies across exam sessions, student enrollments, and teaching assignments for {selectedSubjectIds.length} course(s)...</span>
                </div>
              )}

              {!checkingBulkSubjectDependencies && bulkSubjectPreflight && (
                <>
                  {/* Summary Metric Badges */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginBottom: "16px" }}>
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Total Selected</div>
                      <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--primary-navy)", marginTop: "2px" }}>
                        {bulkSubjectPreflight.total_selected}
                      </div>
                    </div>

                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#166534", textTransform: "uppercase" }}>Safe to Delete</div>
                      <div style={{ fontSize: "20px", fontWeight: 800, color: "#15803d", marginTop: "2px" }}>
                        {bulkSubjectPreflight.safe_count}
                      </div>
                      <div style={{ fontSize: "11px", color: "#166534" }}>0 dependencies</div>
                    </div>

                    <div style={{ background: bulkSubjectPreflight.protected_count > 0 ? "#fef2f2" : "#f8fafc", border: `1px solid ${bulkSubjectPreflight.protected_count > 0 ? "#fecaca" : "#e2e8f0"}`, borderRadius: "8px", padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: bulkSubjectPreflight.protected_count > 0 ? "#991b1b" : "#64748b", textTransform: "uppercase" }}>Protected Courses</div>
                      <div style={{ fontSize: "20px", fontWeight: 800, color: bulkSubjectPreflight.protected_count > 0 ? "#dc2626" : "#64748b", marginTop: "2px" }}>
                        {bulkSubjectPreflight.protected_count}
                      </div>
                      <div style={{ fontSize: "11px", color: bulkSubjectPreflight.protected_count > 0 ? "#b91c1c" : "var(--text-muted)" }}>has exams / enrollments</div>
                    </div>
                  </div>

                  {/* Safe Subjects List */}
                  {bulkSubjectPreflight.safe_subjects && bulkSubjectPreflight.safe_subjects.length > 0 && (
                    <div style={{ marginBottom: "16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "12px 14px" }}>
                      <div style={{ fontWeight: 700, color: "#166534", fontSize: "13px", marginBottom: "6px" }}>
                        ✅ Eligible for Permanent Deletion ({bulkSubjectPreflight.safe_count})
                      </div>
                      <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#15803d" }}>
                        These courses have 0 examination sessions and 0 student course registrations. They will be cleanly and permanently deleted.
                      </p>
                      <div style={{ maxHeight: "140px", overflowY: "auto", background: "#ffffff", borderRadius: "6px", border: "1px solid #dcfce7" }}>
                        <table style={{ width: "100%", fontSize: "12px" }}>
                          <thead>
                            <tr style={{ textAlign: "left", background: "#f0fdf4", color: "#166534" }}>
                              <th style={{ padding: "6px 10px" }}>Code</th>
                              <th style={{ padding: "6px 10px" }}>Course Title</th>
                              <th style={{ padding: "6px 10px" }}>Semester</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkSubjectPreflight.safe_subjects.map((s) => (
                              <tr key={s.subject_id} style={{ borderTop: "1px solid #f0fdf4" }}>
                                <td style={{ padding: "5px 10px", fontWeight: 700, color: "var(--primary-navy)" }}>{s.subject_code}</td>
                                <td style={{ padding: "5px 10px" }}>{s.subject_name}</td>
                                <td style={{ padding: "5px 10px", color: "var(--text-muted)" }}>{s.semester}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Protected Subjects List */}
                  {bulkSubjectPreflight.protected_subjects && bulkSubjectPreflight.protected_subjects.length > 0 && (
                    <div style={{ marginBottom: "16px", background: "#fff1f2", border: "1.5px solid #fecaca", borderRadius: "8px", padding: "12px 14px" }}>
                      <div style={{ fontWeight: 700, color: "#991b1b", fontSize: "13px", marginBottom: "6px" }}>
                        🛡️ Protected Courses ({bulkSubjectPreflight.protected_count}) &mdash; Cannot Be Force-Deleted
                      </div>
                      <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#b91c1c", lineHeight: 1.5 }}>
                        Historical examination schedules, attendance registers, or student registrations reference these courses. To prevent database corruption and preserve historical records, they will be archived (deactivated) instead.
                      </p>
                      <div style={{ maxHeight: "150px", overflowY: "auto", background: "#ffffff", borderRadius: "6px", border: "1px solid #fee2e2" }}>
                        <table style={{ width: "100%", fontSize: "12px" }}>
                          <thead>
                            <tr style={{ textAlign: "left", background: "#fef2f2", color: "#991b1b" }}>
                              <th style={{ padding: "6px 10px" }}>Code</th>
                              <th style={{ padding: "6px 10px" }}>Course Title</th>
                              <th style={{ padding: "6px 10px" }}>Blocking Dependencies</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkSubjectPreflight.protected_subjects.map((s) => (
                              <tr key={s.subject_id} style={{ borderTop: "1px solid #fee2e2" }}>
                                <td style={{ padding: "5px 10px", fontWeight: 700, color: "#991b1b" }}>{s.subject_code}</td>
                                <td style={{ padding: "5px 10px" }}>{s.subject_name}</td>
                                <td style={{ padding: "5px 10px", color: "#b91c1c", fontSize: "11.5px" }}>
                                  {(s.blocking_reasons || []).join("; ") || "Active dependencies present"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-footer" style={{ borderTop: "1px solid var(--border-color)", padding: "12px 16px", display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowBulkSubjectDeleteModal(false);
                  setBulkSubjectPreflight(null);
                  setBulkSubjectError("");
                }}
                disabled={bulkSubjectProcessing}
              >
                Cancel
              </button>

              {!checkingBulkSubjectDependencies && bulkSubjectPreflight && (
                <>
                  {bulkSubjectPreflight.safe_count > 0 && bulkSubjectPreflight.protected_count === 0 && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => handleExecuteBulkSubjectDelete("delete_safe_only")}
                      disabled={bulkSubjectProcessing}
                      style={{ fontWeight: 600 }}
                    >
                      {bulkSubjectProcessing ? "Deleting..." : `🗑️ Permanently Delete All Selected (${bulkSubjectPreflight.safe_count})`}
                    </button>
                  )}

                  {bulkSubjectPreflight.safe_count > 0 && bulkSubjectPreflight.protected_count > 0 && (
                    <>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handleExecuteBulkSubjectDelete("delete_safe_only")}
                        disabled={bulkSubjectProcessing}
                        style={{ fontWeight: 600 }}
                      >
                        {bulkSubjectProcessing ? "Deleting..." : `🗑️ Delete Safe Records Only (${bulkSubjectPreflight.safe_count})`}
                      </button>
                      <button
                        type="button"
                        className="btn btn-warning"
                        onClick={() => handleExecuteBulkSubjectDelete("delete_safe_and_archive_protected")}
                        disabled={bulkSubjectProcessing}
                        style={{ background: "#d97706", borderColor: "#b45309", color: "#ffffff", fontWeight: 600 }}
                      >
                        {bulkSubjectProcessing ? "Processing..." : `🛡️ Delete Safe (${bulkSubjectPreflight.safe_count}) & Archive Protected (${bulkSubjectPreflight.protected_count})`}
                      </button>
                    </>
                  )}

                  {bulkSubjectPreflight.safe_count === 0 && bulkSubjectPreflight.protected_count > 0 && (
                    <button
                      type="button"
                      className="btn btn-warning"
                      onClick={() => handleExecuteBulkSubjectDelete("archive_all")}
                      disabled={bulkSubjectProcessing}
                      style={{ background: "#d97706", borderColor: "#b45309", color: "#ffffff", fontWeight: 600 }}
                    >
                      {bulkSubjectProcessing ? "Archiving..." : `⏸️ Archive Protected Courses Instead (${bulkSubjectPreflight.protected_count})`}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: SUBJECT CATALOGUE BULK UPLOAD (CSV, Excel, PDF)
         ========================================================= */}
      {showBulkSubjectModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "800px", width: "95%" }}>
            <div className="modal-header">
              <h3 className="modal-title">Bulk Upload Subjects (CSV / Excel / PDF)</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setShowBulkSubjectModal(false);
                  setSubjectPreview(null);
                  setSubjectFile(null);
                }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <p className="form-helper" style={{ marginBottom: "12px" }}>
                Upload a curriculum or course syllabus document. Columns extracted: Subject Code, Course Title, Department, Year, Semester, Category.
              </p>

              <div
                className="dropzone-container"
                onClick={() => document.getElementById("bulk-subject-file-input").click()}
                style={{ padding: "20px" }}
              >
                <input
                  id="bulk-subject-file-input"
                  type="file"
                  accept=".csv,.xlsx,.xls,.pdf"
                  style={{ display: "none" }}
                  onChange={handleSubjectFileSelect}
                />
                <div className="dropzone-icon">📑</div>
                <div className="dropzone-title">
                  {subjectFile ? subjectFile.name : "Select or Drop Curriculum Document"}
                </div>
                <p className="dropzone-caption">Accepts .csv, .xlsx, .xls, and .pdf documents.</p>
              </div>

              {parsingSubjects && (
                <div className="alert alert-warning" style={{ marginTop: "12px" }}>
                  <span>⏳</span>
                  <span>Extracting course structures from document...</span>
                </div>
              )}

              {subjectPreview && (
                <div style={{ marginTop: "16px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "10px",
                    }}
                  >
                    <div>
                      <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--primary-navy)" }}>
                        Document Preview: {subjectPreview.total_records} Courses Identified
                      </h4>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {subjectPreview.valid_records} valid &bull;{" "}
                        {subjectPreview.duplicate_records || 0} duplicates &bull;{" "}
                        {subjectPreview.invalid_records || 0} issues &bull;{" "}
                        {subjectPreview.db_duplicate_count || 0} already exist in MySQL
                      </span>
                    </div>
                  </div>

                  <div className="table-wrapper" style={{ maxHeight: "250px", overflowY: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Subject Code</th>
                          <th>Course Name</th>
                          <th>Department</th>
                          <th>Semester</th>
                          <th>Category</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subjectPreview.subjects.map((sub, idx) => (
                          <tr key={idx} style={{ backgroundColor: sub.is_valid ? "inherit" : "#fff1f2" }}>
                            <td>{idx + 1}</td>
                            <td>
                              <input
                                type="text"
                                className="form-control"
                                style={{ padding: "4px 8px", fontSize: "12px", width: "120px" }}
                                value={sub.subject_code}
                                onChange={(e) =>
                                  handleSubjectCellChange(idx, "subject_code", e.target.value.toUpperCase())
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control"
                                style={{ padding: "4px 8px", fontSize: "12px" }}
                                value={sub.subject_name}
                                onChange={(e) =>
                                  handleSubjectCellChange(idx, "subject_name", e.target.value)
                                }
                              />
                            </td>
                            <td>{sub.department}</td>
                            <td>{sub.semester}</td>
                            <td>
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                <select
                                  className="form-control"
                                  style={{ padding: "4px 8px", fontSize: "12px", minWidth: "135px" }}
                                  value={sub.category || "Core Theory"}
                                  onChange={(e) => handleSubjectCellChange(idx, "category", e.target.value)}
                                >
                                  <option value="Core Theory">Core Theory</option>
                                  <option value="Laboratory">Laboratory</option>
                                  <option value="Elective Theory">Elective Theory</option>
                                </select>
                                {sub.is_uncertain && (
                                  <span style={{ fontSize: "10px", color: "#b45309", fontWeight: 600 }}>
                                    ⚠️ Review Category
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              {sub.exists_in_db ? (
                                <span className="status-pill warning">Existing in DB</span>
                              ) : sub.is_valid ? (
                                <span className="status-pill active">Valid</span>
                              ) : (
                                <span className="status-pill danger">{sub.error}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowBulkSubjectModal(false);
                  setSubjectPreview(null);
                  setSubjectFile(null);
                }}
                disabled={importingSubjects}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-navy"
                onClick={handleConfirmSubjectBulkImport}
                disabled={!subjectPreview || subjectPreview.valid_records === 0 || importingSubjects}
              >
                {importingSubjects ? "Importing Courses..." : "Confirm & Import to Catalogue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: RENAME SECTION
         ========================================================= */}
      {renamingSection && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "420px" }}>
            <div className="modal-header">
              <h3 className="modal-title">Rename Section {renamingSection}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setRenamingSection(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveRenameSection}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="rename-sec-input">
                    New Section Name / Identifier <span className="form-label-required">*</span>
                  </label>
                  <input
                    id="rename-sec-input"
                    type="text"
                    className="form-control"
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value.toUpperCase())}
                    required
                    maxLength={10}
                    placeholder="e.g. A1, E, F"
                  />
                  <p className="form-helper" style={{ marginTop: "4px" }}>
                    Must be unique within this academic year and study year.
                  </p>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRenamingSection(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-navy">
                  Save Identifier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: SAFE DELETION CONFIRMATION & PRE-FLIGHT CHECK
         ========================================================= */}
      {showDeleteModal && deleteTarget && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "620px", width: "95%" }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: "var(--danger)" }}>
                🗑️ Confirm Student Data Deletion
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTarget(null);
                  setPreflightData(null);
                }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div
                style={{
                  background: "#fff1f2",
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "14px", color: "#991b1b" }}>
                  Target Scope: {deleteTarget.label}
                </div>
                <div style={{ fontSize: "12.5px", color: "#b91c1c", marginTop: "4px" }}>
                  Academic Year: <strong>{academicYear}</strong> &bull; Department: <strong>CSE</strong> &bull; Year:{" "}
                  <strong>{studyYear}</strong>
                </div>
              </div>

              {checkingPreflight ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: "24px", marginBottom: "8px" }}>⏳</div>
                  <p style={{ fontSize: "13.5px", color: "var(--text-muted)" }}>
                    Inspecting foreign-key dependencies across examinations, seating allocations, and candidate registrations...
                  </p>
                </div>
              ) : preflightData ? (
                <div>
                  {/* Pre-flight Metrics */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "10px",
                      marginBottom: "16px",
                    }}
                  >
                    <div
                      style={{
                        background: "#f8fafc",
                        border: "1px solid var(--border-color)",
                        borderRadius: "8px",
                        padding: "10px",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--primary-navy)" }}>
                        {preflightData.student_count}
                      </div>
                      <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>Affected Students</div>
                    </div>

                    <div
                      style={{
                        background: preflightData.exam_registrations_count > 0 ? "#fff7ed" : "#f8fafc",
                        border: `1px solid ${preflightData.exam_registrations_count > 0 ? "#fed7aa" : "var(--border-color)"}`,
                        borderRadius: "8px",
                        padding: "10px",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "18px",
                          fontWeight: 700,
                          color: preflightData.exam_registrations_count > 0 ? "#ea580c" : "var(--primary-navy)",
                        }}
                      >
                        {preflightData.exam_registrations_count}
                      </div>
                      <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>Exam Registrations</div>
                    </div>

                    <div
                      style={{
                        background: preflightData.seat_allocations_count > 0 ? "#fef2f2" : "#f8fafc",
                        border: `1px solid ${preflightData.seat_allocations_count > 0 ? "#fecaca" : "var(--border-color)"}`,
                        borderRadius: "8px",
                        padding: "10px",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "18px",
                          fontWeight: 700,
                          color: preflightData.seat_allocations_count > 0 ? "#dc2626" : "var(--primary-navy)",
                        }}
                      >
                        {preflightData.seat_allocations_count}
                      </div>
                      <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>Allocated Seats</div>
                    </div>
                  </div>

                  {/* Safety Status Block */}
                  {!preflightData.can_safe_delete ? (
                    <div className="alert alert-warning" style={{ marginBottom: "16px" }}>
                      <span>⚠️</span>
                      <div>
                        <strong>Deletion Blocked by Dependency Engine:</strong>
                        <p style={{ margin: "4px 0 0", fontSize: "12.5px" }}>
                          {preflightData.blocking_reason}
                        </p>
                        {preflightData.referenced_exams?.length > 0 && (
                          <div style={{ marginTop: "8px", fontSize: "11.5px" }}>
                            <strong>Active Referenced Examinations:</strong>
                            <ul style={{ margin: "2px 0 0 16px" }}>
                              {preflightData.referenced_exams.slice(0, 5).map((e) => (
                                <li key={e.exam_id}>
                                  {e.exam_name} ({e.exam_date || e.session})
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="alert alert-success" style={{ marginBottom: "16px" }}>
                      <span>✅</span>
                      <div>
                        <strong>Zero Examination Dependencies Detected:</strong>
                        <p style={{ margin: "2px 0 0", fontSize: "12.5px" }}>
                          These {preflightData.student_count} student records are safe to remove without impacting examination schedules or seating history.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Force Confirmation Option if Dependencies Exist */}
                  {!preflightData.can_safe_delete && (
                    <label
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px",
                        padding: "10px",
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "12.5px",
                        color: "#92400e",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={confirmForce}
                        onChange={(e) => setConfirmForce(e.target.checked)}
                        style={{ marginTop: "2px" }}
                      />
                      <span>
                        <strong>Override &amp; Clean Associated Records:</strong> I confirm that I want to remove these {preflightData.student_count} students and clean up their test examination registrations and seat allocations.
                      </span>
                    </label>
                  )}
                </div>
              ) : null}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTarget(null);
                  setPreflightData(null);
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmDelete}
                disabled={
                  checkingPreflight ||
                  deleting ||
                  !preflightData ||
                  preflightData.student_count === 0 ||
                  (!preflightData.can_safe_delete && !confirmForce)
                }
              >
                {deleting ? "Deleting Data..." : "Confirm Deletion"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: CLEAR UPLOAD HISTORY (AUDIT LOGS ONLY)
         ========================================================= */}
      {showClearHistoryModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "620px" }}>
            <div className="modal-header">
              <h3 className="modal-title">🧹 Clear Upload History</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowClearHistoryModal(false)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              {/* Critical Distinction Notice Box */}
              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "18px",
                }}
              >
                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "20px" }}>🛡️</span>
                  <div>
                    <strong style={{ color: "#1e40af", fontSize: "13px" }}>
                      CRITICAL DISTINCTION — AUDIT LOG REMOVAL ONLY:
                    </strong>
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#1e3a8a", lineHeight: 1.45 }}>
                      Clearing upload history <strong>only clears the upload logs and batch history records</strong>.
                      It will <strong>NEVER</strong> delete student records (such as your 352 CSE candidates), course catalog subjects, or examination seat allocations. All academic data remains 100% intact.
                    </p>
                  </div>
                </div>
              </div>

              {/* Scope Selection */}
              <div style={{ marginBottom: "16px" }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Select History Scope to Clear:</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "8px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", padding: "8px 12px", background: clearScope === "all" ? "#f0fdf4" : "#f8fafc", border: `1px solid ${clearScope === "all" ? "#86efac" : "#e2e8f0"}`, borderRadius: "6px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="clearScope"
                      checked={clearScope === "all"}
                      onChange={() => handleScopeChange("all")}
                    />
                    <span><strong>All Upload History</strong> (All Files)</span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", padding: "8px 12px", background: clearScope === "student" ? "#f0fdf4" : "#f8fafc", border: `1px solid ${clearScope === "student" ? "#86efac" : "#e2e8f0"}`, borderRadius: "6px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="clearScope"
                      checked={clearScope === "student"}
                      onChange={() => handleScopeChange("student")}
                    />
                    <span><strong>Student Rosters Only</strong></span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", padding: "8px 12px", background: clearScope === "subject" ? "#f0fdf4" : "#f8fafc", border: `1px solid ${clearScope === "subject" ? "#86efac" : "#e2e8f0"}`, borderRadius: "6px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="clearScope"
                      checked={clearScope === "subject"}
                      onChange={() => handleScopeChange("subject")}
                    />
                    <span><strong>Subject Catalogues Only</strong></span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", padding: "8px 12px", background: clearScope === "academic_year" ? "#f0fdf4" : "#f8fafc", border: `1px solid ${clearScope === "academic_year" ? "#86efac" : "#e2e8f0"}`, borderRadius: "6px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="clearScope"
                      checked={clearScope === "academic_year"}
                      onChange={() => handleScopeChange("academic_year")}
                    />
                    <span><strong>Specific Academic Year</strong></span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", padding: "8px 12px", background: clearScope === "study_year_semester" ? "#f0fdf4" : "#f8fafc", border: `1px solid ${clearScope === "study_year_semester" ? "#86efac" : "#e2e8f0"}`, borderRadius: "6px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="clearScope"
                      checked={clearScope === "study_year_semester"}
                      onChange={() => handleScopeChange("study_year_semester")}
                    />
                    <span><strong>Study Year &amp; Semester</strong></span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", padding: "8px 12px", background: clearScope === "section" ? "#f0fdf4" : "#f8fafc", border: `1px solid ${clearScope === "section" ? "#86efac" : "#e2e8f0"}`, borderRadius: "6px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="clearScope"
                      checked={clearScope === "section"}
                      onChange={() => handleScopeChange("section")}
                    />
                    <span><strong>Specific Section</strong></span>
                  </label>
                </div>
              </div>

              {/* Conditional Filters depending on chosen scope */}
              {clearScope === "academic_year" && (
                <div className="form-group" style={{ marginBottom: "16px" }}>
                  <label className="form-label">Academic Year to Clear:</label>
                  <select
                    className="form-control"
                    value={clearAy}
                    onChange={(e) => {
                      setClearAy(e.target.value);
                      fetchClearHistoryCheck("academic_year", e.target.value, clearSy, clearSem, clearSec);
                    }}
                  >
                    <option value="2026-2027">2026-2027</option>
                    <option value="2025-2026">2025-2026</option>
                    <option value="2024-2025">2024-2025</option>
                  </select>
                </div>
              )}

              {clearScope === "study_year_semester" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                  <div className="form-group">
                    <label className="form-label">Study Year:</label>
                    <select
                      className="form-control"
                      value={clearSy}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setClearSy(val);
                        fetchClearHistoryCheck("study_year_semester", clearAy, val, clearSem, clearSec);
                      }}
                    >
                      <option value={1}>Year 1</option>
                      <option value={2}>Year 2</option>
                      <option value={3}>Year 3</option>
                      <option value={4}>Year 4</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Semester:</label>
                    <select
                      className="form-control"
                      value={clearSem}
                      onChange={(e) => {
                        setClearSem(e.target.value);
                        fetchClearHistoryCheck("study_year_semester", clearAy, clearSy, e.target.value, clearSec);
                      }}
                    >
                      <option value="Semester 1">Semester 1</option>
                      <option value="Semester 2">Semester 2</option>
                      <option value="Semester 3">Semester 3</option>
                      <option value="Semester 4">Semester 4</option>
                      <option value="Semester 5">Semester 5</option>
                      <option value="Semester 6">Semester 6</option>
                      <option value="Semester 7">Semester 7</option>
                      <option value="Semester 8">Semester 8</option>
                    </select>
                  </div>
                </div>
              )}

              {clearScope === "section" && (
                <div className="form-group" style={{ marginBottom: "16px" }}>
                  <label className="form-label">Section to Clear:</label>
                  <select
                    className="form-control"
                    value={clearSec}
                    onChange={(e) => {
                      setClearSec(e.target.value);
                      fetchClearHistoryCheck("section", clearAy, clearSy, clearSem, e.target.value);
                    }}
                  >
                    {availableSections.map((sec) => (
                      <option key={sec} value={sec}>
                        Section {sec}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Pre-flight Audit Summary Box */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <strong style={{ fontSize: "13px", color: "var(--primary-navy)" }}>
                    Entries to be Cleared:
                  </strong>
                  {loadingClearCheck ? (
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Inspecting...</span>
                  ) : (
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 700,
                        color: clearCheckData?.matching_count > 0 ? "var(--primary-navy)" : "var(--text-muted)",
                      }}
                    >
                      {clearCheckData?.matching_count ?? 0} log entry/entries
                    </span>
                  )}
                </div>

                {clearCheckData && (
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    <div>
                      <strong>Affected Files:</strong>{" "}
                      {clearCheckData.filenames?.length > 0 ? clearCheckData.filenames.join(", ") : "None"}
                    </div>
                    <div>
                      <strong>Academic Terms:</strong>{" "}
                      {clearCheckData.academic_years?.join(", ") || "N/A"}{" "}
                      {clearCheckData.semesters?.length > 0 && `(${clearCheckData.semesters.join(", ")})`}
                    </div>
                    <div>
                      <strong>Sections:</strong>{" "}
                      {clearCheckData.sections?.length > 0 ? clearCheckData.sections.join(", ") : "None"}
                    </div>
                  </div>
                )}
              </div>

              {/* Requirement D.5 Direction Box */}
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "6px",
                  padding: "10px 14px",
                  fontSize: "12px",
                  color: "#92400e",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                }}
              >
                <span>
                  <strong>Want to delete actual student records?</strong> Use the Safe Student Roster Deletion tool.
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ whiteSpace: "nowrap", fontSize: "11px", padding: "4px 8px" }}
                  onClick={() => {
                    setShowClearHistoryModal(false);
                    openDeleteModal({
                      type: "section",
                      section: activeSectionTab,
                      label: `Section ${activeSectionTab} Roster`,
                    });
                  }}
                >
                  Go to Student Deletion
                </button>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowClearHistoryModal(false)}
                disabled={clearingHistory}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: "#d97706", borderColor: "#b45309" }}
                onClick={handleExecuteClearHistory}
                disabled={clearingHistory || loadingClearCheck || !clearCheckData || clearCheckData.matching_count === 0}
              >
                {clearingHistory ? "Clearing..." : "🧹 Clear Upload History Logs"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: CONTROLLED ACADEMIC-YEAR STUDENT PROMOTION
         ========================================================= */}
      {showPromotionModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "640px", width: "95%" }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: "var(--primary-navy)" }}>
                🎓 Controlled Academic-Year Student Promotion
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setShowPromotionModal(false);
                  setPromoPreview(null);
                  setPromoError("");
                  setPromoSuccess("");
                }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {promoSuccess ? (
                <div style={{ textAlign: "center", padding: "20px 10px" }}>
                  <div style={{ fontSize: "40px", marginBottom: "12px" }}>🎉</div>
                  <h4 style={{ fontSize: "16px", fontWeight: 700, color: "#166534", marginBottom: "8px" }}>
                    Cohort Promotion Completed Successfully!
                  </h4>
                  <p style={{ fontSize: "13px", color: "#15803d", marginBottom: "16px" }}>
                    {promoSuccess}
                  </p>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Historical examination records, previous seating charts, and past academic year registers remain 100% intact and queryable.
                  </p>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
                    Promote an entire cohort or section to the next academic year and study year. Master rosters are shared across both semesters of the target academic year.
                  </p>

                  {promoError && (
                    <div className="alert alert-danger" style={{ marginBottom: "14px", fontSize: "12.5px" }}>
                      <span>⚠️</span>
                      <span>{promoError}</span>
                    </div>
                  )}

                  {/* Promotion Configuration Controls */}
                  <div style={{ background: "#f8fafc", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 600 }}>Source Academic Year</label>
                        <select
                          className="form-control"
                          value={promoFromAy}
                          onChange={(e) => {
                            setPromoFromAy(e.target.value);
                            fetchPromoPreview(e.target.value, promoFromSy, promoSection);
                          }}
                          disabled={executingPromo}
                        >
                          <option value="2026-2027">2026–2027</option>
                          <option value="2025-2026">2025–2026</option>
                          <option value="2027-2028">2027–2028</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 600 }}>Target Academic Year</label>
                        <input
                          type="text"
                          className="form-control"
                          value={promoToAy}
                          onChange={(e) => setPromoToAy(e.target.value)}
                          disabled={executingPromo}
                          placeholder="e.g. 2027-2028"
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 600 }}>Source Study Year</label>
                        <select
                          className="form-control"
                          value={promoFromSy}
                          onChange={(e) => {
                            const syVal = parseInt(e.target.value);
                            setPromoFromSy(syVal);
                            fetchPromoPreview(promoFromAy, syVal, promoSection);
                          }}
                          disabled={executingPromo}
                        >
                          <option value={1}>1st Year (Semesters 1 & 2)</option>
                          <option value={2}>2nd Year (Semesters 3 & 4)</option>
                          <option value={3}>3rd Year (Semesters 5 & 6)</option>
                          <option value={4}>4th Year (Semesters 7 & 8)</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 600 }}>Target Section</label>
                        <select
                          className="form-control"
                          value={promoSection}
                          onChange={(e) => {
                            setPromoSection(e.target.value);
                            fetchPromoPreview(promoFromAy, promoFromSy, e.target.value);
                          }}
                          disabled={executingPromo}
                        >
                          <option value="ALL">All Sections (Entire Cohort)</option>
                          {configuredSections.map((s) => (
                            <option key={s} value={s}>Section {s}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Progression Flow Visualization */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "#eff6ff",
                      border: "1.5px solid #bfdbfe",
                      borderRadius: "8px",
                      padding: "12px 18px",
                      marginBottom: "16px",
                    }}
                  >
                    <div style={{ textAlign: "center", flex: 1 }}>
                      <div style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: 700, color: "#1e40af" }}>Current Level</div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--primary-navy)" }}>
                        {STUDY_YEAR_MAP[promoFromSy]?.label || `${promoFromSy}th Year`}
                      </div>
                      <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                        {STUDY_YEAR_MAP[promoFromSy]?.semesters?.join(" & ")} ({promoFromAy})
                      </div>
                    </div>

                    <div style={{ fontSize: "20px", color: "#2563eb", padding: "0 12px" }}>➔</div>

                    <div style={{ textAlign: "center", flex: 1 }}>
                      <div style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: 700, color: "#166534" }}>Promoted Level</div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: promoFromSy >= 4 ? "#b45309" : "#166534" }}>
                        {promoFromSy >= 4 ? "🎓 Graduated / Alumni" : (STUDY_YEAR_MAP[promoFromSy + 1]?.label || `${promoFromSy + 1}th Year`)}
                      </div>
                      <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                        {promoFromSy >= 4 ? "Degree Completed" : `${STUDY_YEAR_MAP[promoFromSy + 1]?.semesters?.join(" & ")} (${promoToAy})`}
                      </div>
                    </div>
                  </div>

                  {/* Pre-flight Eligibility Preview */}
                  {loadingPromoPreview ? (
                    <div style={{ textAlign: "center", padding: "16px 0", color: "var(--text-muted)", fontSize: "13px" }}>
                      ⏳ Analyzing candidate records and promotion eligibility...
                    </div>
                  ) : promoPreview ? (
                    <div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "10px",
                          padding: "8px 12px",
                          background: promoPreview.eligible_count > 0 ? "#f0fdf4" : "#fef2f2",
                          border: promoPreview.eligible_count > 0 ? "1px solid #bbf7d0" : "1px solid #fecaca",
                          borderRadius: "6px",
                        }}
                      >
                        <span style={{ fontSize: "13px", fontWeight: 600, color: promoPreview.eligible_count > 0 ? "#166534" : "#991b1b" }}>
                          Eligible Candidates for Promotion: <strong>{promoPreview.eligible_count}</strong>
                        </span>
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          Scope: {promoSection === "ALL" ? "All Sections" : `Section ${promoSection}`}
                        </span>
                      </div>

                      {/* Sample Candidate Preview */}
                      {promoPreview.sample_students && promoPreview.sample_students.length > 0 && (
                        <div style={{ maxHeight: "160px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "6px", marginBottom: "12px" }}>
                          <table style={{ margin: 0, fontSize: "12px" }}>
                            <thead>
                              <tr style={{ background: "#f8fafc" }}>
                                <th style={{ padding: "6px 10px" }}>Hall Ticket</th>
                                <th style={{ padding: "6px 10px" }}>Student Name</th>
                                <th style={{ padding: "6px 10px" }}>Section</th>
                              </tr>
                            </thead>
                            <tbody>
                              {promoPreview.sample_students.map((st) => (
                                <tr key={st.student_id}>
                                  <td style={{ padding: "6px 10px", fontWeight: 600 }}>{st.hall_ticket_no}</td>
                                  <td style={{ padding: "6px 10px" }}>{st.name}</td>
                                  <td style={{ padding: "6px 10px" }}>Sec {st.section}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div style={{ fontSize: "11.5px", color: "var(--text-muted)", background: "#f8fafc", padding: "8px 12px", borderRadius: "6px" }}>
                        🛡️ <strong>Safety Guarantee:</strong> A full historical snapshot is archived into <code>student_roster_history</code> prior to updating. All past examination registrations, seating allocations, and attendance registers remain unchanged.
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowPromotionModal(false);
                  setPromoPreview(null);
                  setPromoError("");
                  setPromoSuccess("");
                }}
                disabled={executingPromo}
              >
                {promoSuccess ? "Close" : "Cancel"}
              </button>

              {!promoSuccess && (
                <button
                  type="button"
                  className="btn btn-navy"
                  style={{ background: "#2563eb", borderColor: "#1d4ed8" }}
                  onClick={handleExecutePromotion}
                  disabled={executingPromo || loadingPromoPreview || !promoPreview || promoPreview.eligible_count === 0}
                >
                  {executingPromo
                    ? "Promoting Candidates..."
                    : `Promote ${promoPreview?.eligible_count || 0} Candidates ➔`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: ADD STUDENT INDIVIDUALLY
         ========================================================= */}
      {isAddIndividualModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "540px", width: "95%" }}>
            <div className="modal-header">
              <h3 className="modal-title">➕ Add Student Individually to Section {activeSectionTab}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsAddIndividualModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveIndividualStudent}>
              <div className="modal-body">
                {indivError && (
                  <div className="alert alert-danger" style={{ marginBottom: "14px", fontSize: "12.5px" }}>
                    <span>⚠️</span>
                    <span>{indivError}</span>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="indiv-ht">
                    Hall Ticket Number <span className="form-label-required">*</span>
                  </label>
                  <input
                    id="indiv-ht"
                    type="text"
                    className="form-control"
                    placeholder="e.g. 24EU04199"
                    value={indivHallTicket}
                    onChange={(e) => setIndivHallTicket(e.target.value.toUpperCase())}
                    required
                    disabled={indivSaving}
                  />
                  <small className="form-helper">
                    Must be unique within {academicYear} cohort across all sections.
                  </small>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="indiv-name">
                    Student Full Name <span className="form-label-required">*</span>
                  </label>
                  <input
                    id="indiv-name"
                    type="text"
                    className="form-control"
                    placeholder="e.g. KOTHA SAI VENKATA"
                    value={indivName}
                    onChange={(e) => setIndivName(e.target.value.toUpperCase())}
                    required
                    disabled={indivSaving}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Section (Locked)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={`Section ${activeSectionTab}`}
                      disabled
                      style={{ background: "#f1f5f9", fontWeight: 700, color: "var(--primary-navy)" }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <input
                      type="text"
                      className="form-control"
                      value={department || "CSE"}
                      disabled
                      style={{ background: "#f1f5f9" }}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Academic Year</label>
                    <input
                      type="text"
                      className="form-control"
                      value={academicYear}
                      disabled
                      style={{ background: "#f1f5f9" }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Semester</label>
                    <input
                      type="text"
                      className="form-control"
                      value={selectedSemester}
                      disabled
                      style={{ background: "#f1f5f9" }}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAddIndividualModalOpen(false)}
                  disabled={indivSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-navy"
                  disabled={indivSaving}
                >
                  {indivSaving ? "Saving..." : `Register in Section ${activeSectionTab}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: EDIT STUDENT DETAILS
         ========================================================= */}
      {isEditStudentModalOpen && editingStudent && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "500px", width: "95%" }}>
            <div className="modal-header">
              <h3 className="modal-title">✏️ Edit Student Details</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => { setIsEditStudentModalOpen(false); setEditingStudent(null); }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditStudent}>
              <div className="modal-body">
                {editStudentError && (
                  <div className="alert alert-danger" style={{ marginBottom: "14px", fontSize: "12.5px" }}>
                    <span>⚠️</span>
                    <span>{editStudentError}</span>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Hall Ticket Number (Locked)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editingStudent.hall_ticket_no}
                    disabled
                    style={{ background: "#f1f5f9", fontWeight: 700, color: "var(--primary-navy)" }}
                  />
                  <small className="form-helper">
                    Student ID and Hall Ticket Number are preserved to protect historical examination registrations.
                  </small>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="edit-st-name">
                    Student Full Name <span className="form-label-required">*</span>
                  </label>
                  <input
                    id="edit-st-name"
                    type="text"
                    className="form-control"
                    value={editStudentName}
                    onChange={(e) => setEditStudentName(e.target.value.toUpperCase())}
                    required
                    disabled={editStudentSaving}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editStudentDept}
                      onChange={(e) => setEditStudentDept(e.target.value.toUpperCase())}
                      disabled={editStudentSaving}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Section</label>
                    <input
                      type="text"
                      className="form-control"
                      value={`Section ${editingStudent.section || activeSectionTab}`}
                      disabled
                      style={{ background: "#f1f5f9" }}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setIsEditStudentModalOpen(false); setEditingStudent(null); }}
                  disabled={editStudentSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-navy"
                  disabled={editStudentSaving}
                >
                  {editStudentSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
