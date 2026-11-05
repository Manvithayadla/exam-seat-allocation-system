import ReassignInvigilatorModal from "../components/ReassignInvigilatorModal";
import { useState, useEffect, useMemo } from "react";
import { useAcademicCohort, STUDY_YEAR_MAP, ACADEMIC_YEARS } from "../context/AcademicCohortContext";

import api from "../services/api";



const EXAM_TYPES = [

  "Class Test 1",

  "Class Test 2",

  "Sessional 1",

  "Sessional 2",

];



export default function SeatingArrangement() {  // 1. Selector State (Synchronized to Global Academic Cohort)
  const {
    academicYear,
    setAcademicYear,
    studyYear,
    setStudyYear,
    selectedSemester: semester,
    setSelectedSemester: setSemester,
    availableSemesters: applicableSemesters,
    studyYearName,
    cohortLabel,
  } = useAcademicCohort();

  const [examType, setExamType] = useState("Sessional 1");

  // Pending Reassignments State
  const [pendingReassignments, setPendingReassignments] = useState([]);
  const [reassignFilter, setReassignFilter] = useState("pending");
  const [loadingReassignments, setLoadingReassignments] = useState(false);
  const [reassignModalTarget, setReassignModalTarget] = useState(null);

  useEffect(() => {
    loadPendingReassignments();
  }, [reassignFilter]);

  async function loadPendingReassignments() {
    setLoadingReassignments(true);
    try {
      const res = await api.getPendingReassignments(reassignFilter);
      setPendingReassignments(res.items || []);
    } catch (err) {
      console.warn("Could not load pending reassignments:", err);
    } finally {
      setLoadingReassignments(false);
    }
  }




  // 2. Schedule & Subject State

  const [subjects, setSubjects] = useState([]);

  const [selectedSubjectId, setSelectedSubjectId] = useState("");

  const [examDate, setExamDate] = useState(() => {

    const d = new Date();

    d.setDate(d.getDate() + 1);

    return d.toISOString().slice(0, 10);

  });

  const [startTime, setStartTime] = useState("09:30");
  const [endTime, setEndTime] = useState("12:30");




  // 3. Existing Scheduled Exams

  const [exams, setExams] = useState([]);

  const [selectedExamId, setSelectedExamId] = useState("");

  const [loadingExams, setLoadingExams] = useState(false);



  // 4. Seating Results & Invigilators

  const [allocations, setAllocations] = useState([]);
  const [unallocatedStudents, setUnallocatedStudents] = useState([]);

  const [assignments, setAssignments] = useState([]);

  const [conflicts, setConflicts] = useState(null);

  const [halls, setHalls] = useState([]);

  const [loadingSeating, setLoadingSeating] = useState(false);

  const [allocating, setAllocating] = useState(false);

  const [publishing, setPublishing] = useState(false);



  // Status & Feedback

  const [statusMessage, setStatusMessage] = useState({ type: "", text: "" });
  const [eligibleStudentsCount, setEligibleStudentsCount] = useState(0);

  // Manual Examination Hall Configuration State
  const [examHallsData, setExamHallsData] = useState(null);
  const [showHallConfigModal, setShowHallConfigModal] = useState(false);
  const [modalSelectedHallIds, setModalSelectedHallIds] = useState([]);
  const [modalHallSearch, setModalHallSearch] = useState("");
  const [savingHalls, setSavingHalls] = useState(false);

  // Examination Management & History States
  const [showDeleteExamModal, setShowDeleteExamModal] = useState(false);
  const [deleteExamCheck, setDeleteExamCheck] = useState(null);
  const [loadingDeleteCheck, setLoadingDeleteCheck] = useState(false);
  const [deletingExam, setDeletingExam] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Cancellation & Rescheduling States
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancellingExam, setCancellingExam] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [rescheduleStartTime, setRescheduleStartTime] = useState("09:30");
  const [rescheduleEndTime, setRescheduleEndTime] = useState("12:30");
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState("");







  // Initial load

  useEffect(() => {

    loadInitialData();

  }, []);



  async function loadInitialData() {

    setLoadingExams(true);

    try {

      const [subjectsRes, examsRes, hallsRes] = await Promise.all([

        api.getSubjects().catch(() => ({ subjects: [] })),

        api.getExams().catch(() => ({ exams: [] })),

        api.getHalls().catch(() => ({ halls: [] })),

      ]);



      const subList = Array.isArray(subjectsRes.subjects) ? subjectsRes.subjects : [];

      setSubjects(subList);



      const exList = Array.isArray(examsRes.exams) ? examsRes.exams : [];

      setExams(exList);



      setHalls(Array.isArray(hallsRes.halls) ? hallsRes.halls : []);



      if (exList.length > 0) {

        setSelectedExamId(String(exList[0].exam_id));

      }

    } catch (err) {

      console.warn("Error loading initial exam data:", err);

    } finally {

      setLoadingExams(false);

    }

  }



  // Filter CSE subjects for selected semester

  const availableSubjects = useMemo(() => {

    return subjects.filter((s) => {

      const semMatch =

        s.semester?.toLowerCase().replace(/\s+/g, "") ===

        semester.toLowerCase().replace(/\s+/g, "");

      const deptMatch = !s.department || s.department.toUpperCase() === "CSE";

      return semMatch && deptMatch;

    });

  }, [subjects, semester]);



  // Workspace Tabs, Filters & Archive State
  const [workspaceTab, setWorkspaceTab] = useState("active"); // "active" | "completed"
  const [completedViewMode, setCompletedViewMode] = useState("normal"); // "normal" | "archived"
  const [examSearchQuery, setExamSearchQuery] = useState("");
  const [filterAcademicYear, setFilterAcademicYear] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [filterExamType, setFilterExamType] = useState("");
  const [archivingExamId, setArchivingExamId] = useState(null);
  const [restoringExamId, setRestoringExamId] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteAcknowledge, setDeleteAcknowledge] = useState(false);

  // Group Examinations into Active, Completed, and Archived
  const activeExams = useMemo(() => {
    return exams.filter((e) => e.status !== "Completed" && e.status !== "Cancelled");
  }, [exams]);

  const completedAllExams = useMemo(() => {
    return exams.filter((e) => e.status === "Completed");
  }, [exams]);

  const completedNormalExams = useMemo(() => {
    return completedAllExams.filter((e) => !e.is_archived);
  }, [completedAllExams]);

  const archivedExams = useMemo(() => {
    return completedAllExams.filter((e) => Boolean(e.is_archived));
  }, [completedAllExams]);

  const cancelledExams = useMemo(() => {
    return exams.filter((e) => e.status === "Cancelled");
  }, [exams]);

  // Backward compatibility alias
  const completedExams = completedNormalExams;

  // Filter options derived dynamically from loaded exams
  const dynamicFilterOptions = useMemo(() => {
    const years = Array.from(new Set(exams.map((e) => e.academic_year).filter(Boolean)));
    const sems = Array.from(new Set(exams.map((e) => e.semester).filter(Boolean)));
    const types = Array.from(new Set(exams.map((e) => e.exam_type).filter(Boolean)));
    return { years, sems, types };
  }, [exams]);

  // Helper filter function
  const filterExamList = (list) => {
    return list.filter((ex) => {
      const q = examSearchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        String(ex.exam_id).includes(q) ||
        (ex.subject_code && ex.subject_code.toLowerCase().includes(q)) ||
        (ex.subject_name && ex.subject_name.toLowerCase().includes(q)) ||
        (ex.exam_name && ex.exam_name.toLowerCase().includes(q)) ||
        (ex.exam_type && ex.exam_type.toLowerCase().includes(q));

      const matchesYear = !filterAcademicYear || ex.academic_year === filterAcademicYear;
      const matchesSem =
        !filterSemester ||
        ex.semester?.toLowerCase().replace(/\s+/g, "") === filterSemester.toLowerCase().replace(/\s+/g, "");
      const matchesType = !filterExamType || ex.exam_type === filterExamType;

      return matchesSearch && matchesYear && matchesSem && matchesType;
    });
  };

  const filteredActiveExams = useMemo(() => filterExamList(activeExams), [activeExams, examSearchQuery, filterAcademicYear, filterSemester, filterExamType]);
  const filteredCompletedExams = useMemo(() => filterExamList(completedNormalExams), [completedNormalExams, examSearchQuery, filterAcademicYear, filterSemester, filterExamType]);
  const filteredArchivedExams = useMemo(() => filterExamList(archivedExams), [archivedExams, examSearchQuery, filterAcademicYear, filterSemester, filterExamType]);

  // Handle Archive Action
  async function handleArchiveExam(examId) {
    if (!examId) return;
    setArchivingExamId(examId);
    try {
      const res = await api.archiveExam(examId);
      setStatusMessage({
        type: "success",
        text: res.message || `Examination #${examId} archived successfully.`,
      });
      const exRes = await api.getExams();
      setExams(exRes.exams || []);
    } catch (err) {
      setStatusMessage({ type: "danger", text: err.message || "Failed to archive examination." });
    } finally {
      setArchivingExamId(null);
    }
  }

  // Handle Restore Action
  async function handleRestoreExam(examId) {
    if (!examId) return;
    setRestoringExamId(examId);
    try {
      const res = await api.restoreExam(examId);
      setStatusMessage({
        type: "success",
        text: res.message || `Examination #${examId} restored to completed list.`,
      });
      const exRes = await api.getExams();
      setExams(exRes.exams || []);
    } catch (err) {
      setStatusMessage({ type: "danger", text: err.message || "Failed to restore examination." });
    } finally {
      setRestoringExamId(null);
    }
  }

  // Handle Direct Report Download
  function handleDownloadReport(examId, reportType = "seating") {
    const backendBase = "http://127.0.0.1:5000";
    let url = "";
    if (reportType === "seating") {
      url = `${backendBase}/reports/seating-chart?exam_id=${examId}`;
    } else if (reportType === "attendance") {
      url = `${backendBase}/reports/attendance-sheet?exam_id=${examId}`;
    } else if (reportType === "faculty") {
      url = `${backendBase}/reports/daily-duty-register?exam_id=${examId}`;
    } else {
      url = `${backendBase}/reports/combined-pdf?exam_id=${examId}`;
    }
    window.open(url, "_blank");
  }

  // Check if scheduled end time has elapsed
  const isEndTimePassed = useMemo(() => {
    const cur = exams.find((e) => String(e.exam_id) === String(selectedExamId));
    if (!cur || !cur.exam_date || !cur.end_time) return false;
    try {
      const dStr = String(cur.exam_date).slice(0, 10);
      const tStr = String(cur.end_time).slice(0, 5);
      const examEnd = new Date(`${dStr}T${tStr}:00`);
      return new Date() > examEnd;
    } catch {
      return false;
    }
  }, [exams, selectedExamId]);

  // Open Pre-flight Examination Deletion Modal
  async function handleOpenDeleteModal(examId) {
    if (!examId) return;
    setShowDeleteExamModal(true);
    setLoadingDeleteCheck(true);
    setDeleteExamCheck(null);
    try {
      const res = await api.checkExamDeletion(examId);
      setDeleteExamCheck(res);
    } catch (err) {
      setStatusMessage({ type: "danger", text: err.message || "Failed to inspect examination dependencies." });
      setShowDeleteExamModal(false);
    } finally {
      setLoadingDeleteCheck(false);
    }
  }

  // Confirm and Execute Safe Examination Deletion
  async function handleConfirmDeleteExam() {
    if (!deleteExamCheck?.exam?.exam_id) return;
    const examId = deleteExamCheck.exam.exam_id;
    setDeletingExam(true);
    try {
      const res = await api.deleteExam(examId);
      setStatusMessage({
        type: "success",
        text: res.message || `Examination #${examId} deleted successfully.`,
      });
      setShowDeleteExamModal(false);
      setDeleteExamCheck(null);
      // Reload exam list
      const exRes = await api.getExams();
      const updatedExams = exRes.exams || [];
      setExams(updatedExams);
      // Select next available active exam or first exam
      const nextActive = updatedExams.find((e) => e.status !== "Completed" && e.status !== "Cancelled");
      if (nextActive) {
        setSelectedExamId(String(nextActive.exam_id));
      } else if (updatedExams.length > 0) {
        setSelectedExamId(String(updatedExams[0].exam_id));
      } else {
        setSelectedExamId("");
        setAllocations([]);
        setAssignments([]);
      }
    } catch (err) {
      setStatusMessage({ type: "danger", text: err.message || "Failed to delete examination." });
    } finally {
      setDeletingExam(false);
    }
  }

  // Cancel Examination Handler
  async function handleConfirmCancel() {
    if (!activeExam?.exam_id) return;
    if (!cancelReason.trim()) {
      setStatusMessage({ type: "danger", text: "Cancellation reason is required." });
      return;
    }
    setCancellingExam(true);
    try {
      const res = await api.cancelExam(activeExam.exam_id, cancelReason.trim());
      setStatusMessage({
        type: "success",
        text: res.message || `Examination #${activeExam.exam_id} has been cancelled.`,
      });
      setShowCancelModal(false);
      setCancelReason("");
      // Reload exams
      const exRes = await api.getExams();
      const updated = exRes.exams || [];
      setExams(updated);
      const nextActive = updated.find((e) => e.status !== "Completed" && e.status !== "Cancelled");
      if (nextActive) {
        setSelectedExamId(String(nextActive.exam_id));
      } else if (updated.length > 0) {
        setSelectedExamId(String(updated[0].exam_id));
      } else {
        setSelectedExamId("");
        setAllocations([]);
        setAssignments([]);
      }
    } catch (err) {
      setStatusMessage({ type: "danger", text: err.message || "Failed to cancel examination." });
    } finally {
      setCancellingExam(false);
    }
  }

  // Open Reschedule Modal for a Cancelled Examination
  function handleOpenRescheduleModal(cancelledExam) {
    setRescheduleTarget(cancelledExam);
    setRescheduleError("");
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setRescheduleDate(d.toISOString().slice(0, 10));
    setRescheduleStartTime(cancelledExam.start_time?.slice(0, 5) || "09:30");
    setRescheduleEndTime(cancelledExam.end_time?.slice(0, 5) || "12:30");
    setShowRescheduleModal(true);
  }

  // Confirm Reschedule Handler
  async function handleConfirmReschedule(e) {
    e.preventDefault();
    if (!rescheduleTarget) return;
    setRescheduleError("");

    const parseMins = (t) => {
      if (!t) return null;
      const parts = t.split(":");
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    };
    const sMin = parseMins(rescheduleStartTime);
    const eMin = parseMins(rescheduleEndTime);
    if (sMin !== null && eMin !== null && eMin <= sMin) {
      setRescheduleError("End time must be strictly later than start time.");
      return;
    }

    setRescheduling(true);
    try {
      const res = await api.rescheduleExam(rescheduleTarget.exam_id, {
        exam_date: rescheduleDate,
        start_time: rescheduleStartTime,
        end_time: rescheduleEndTime,
      });
      setStatusMessage({
        type: "success",
        text: res.message || `Examination rescheduled successfully as new Examination #${res.new_exam_id}.`,
      });
      setShowRescheduleModal(false);
      setShowHistoryModal(false);
      setRescheduleTarget(null);
      // Reload exams and select the new scheduled examination
      const exRes = await api.getExams();
      const updated = exRes.exams || [];
      setExams(updated);
      if (res.new_exam_id) {
        setSelectedExamId(String(res.new_exam_id));
      }
    } catch (err) {
      setRescheduleError(err.message || "Failed to reschedule examination.");
    } finally {
      setRescheduling(false);
    }
  }

  // Update Examination Status (e.g. Mark as Completed, Reopen)
  async function handleUpdateStatus(examId, newStatus) {
    if (!examId || !newStatus) return;
    setUpdatingStatus(true);
    setStatusMessage({ type: "", text: "" });
    try {
      const res = await api.updateExamStatus(examId, newStatus);
      setStatusMessage({
        type: "success",
        text: res.message || `Examination status updated to ${newStatus}.`,
      });
      // Refresh exam list
      const exRes = await api.getExams();
      setExams(exRes.exams || []);
    } catch (err) {
      setStatusMessage({ type: "danger", text: err.message || "Failed to update examination status." });
    } finally {
      setUpdatingStatus(false);
    }
  }

  // Load Seating Details when Selected Exam Changes

  useEffect(() => {

    if (!selectedExamId) {

      setAllocations([]);

      setAssignments([]);

      setConflicts(null);

      return;

    }

    loadSeatingResults(selectedExamId);

  }, [selectedExamId]);



  async function loadSeatingResults(examId) {
    setLoadingSeating(true);
    setStatusMessage({ type: "", text: "" });
    setUnallocatedStudents([]);

    try {
      const [allocRes, assignRes, conflictRes, studentsRes, hallsRes] = await Promise.all([
        api.getSeatAllocations(examId).catch(() => ({ allocations: [] })),
        api.getInvigilatorAssignments(examId).catch(() => ({ assignments: [] })),
        api.checkConflicts(examId).catch(() => null),
        api.getExamStudents(examId).catch(() => ({ total_students: 0, students: [] })),
        api.getExamHalls(examId).catch(() => null),
      ]);

      setAllocations(allocRes.allocations || []);
      setAssignments(assignRes.assignments || []);
      setConflicts(conflictRes);
      setEligibleStudentsCount(studentsRes.total_students ?? studentsRes.students?.length ?? 0);
      setExamHallsData(hallsRes);
      if (hallsRes && Array.isArray(hallsRes.selected_hall_ids)) {
        setModalSelectedHallIds(hallsRes.selected_hall_ids);
      }
    } catch (err) {
      console.warn("Could not load seating allocations:", err);
    } finally {
      setLoadingSeating(false);
    }
  }



  // Handle Create or Link Examination Session

  async function handleCreateExamSession(e) {

    e.preventDefault();

    if (!selectedSubjectId) {

      setStatusMessage({ type: "danger", text: "Please select a CSE course/subject first." });

      return;

    }



    const sub = subjects.find((s) => String(s.subject_id) === String(selectedSubjectId));

    const title = `${sub?.subject_code || "CSE"} - ${examType} (${semester})`;



    const parseMins = (t) => {
      if (!t) return null;
      const parts = t.split(":");
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    };
    const sMin = parseMins(startTime);
    const eMin = parseMins(endTime);
    if (!startTime || !endTime) {
      setStatusMessage({ type: "danger", text: "Both examination start time and end time are required." });
      return;
    }
    if (sMin !== null && eMin !== null && eMin <= sMin) {
      setStatusMessage({ type: "danger", text: "Invalid Timing: Examination end time must be strictly later than start time." });
      return;
    }

    setStatusMessage({ type: "", text: "" });

    try {
      const derivedSession = sMin < 780 ? "FN" : "AN";
      const res = await api.createExam({
        subject_id: parseInt(selectedSubjectId, 10),
        exam_name: title,
        exam_date: examDate,
        session: derivedSession,
        start_time: startTime,
        end_time: endTime,

        academic_year: academicYear,

        semester,

        study_year: studyYear,

        exam_type: examType,

        target_branch: "CSE",

        auto_allocate: false,

      });



      setStatusMessage({

        type: "success",

        text: `Examination "${title}" scheduled successfully. You can now allocate seats.`,

      });



      // Reload exams and select the newly created one

      const exRes = await api.getExams();

      setExams(exRes.exams || []);

      if (res.exam_id) {

        setSelectedExamId(String(res.exam_id));

      }

    } catch (err) {

      setStatusMessage({ type: "danger", text: err.message || "Failed to schedule examination." });

    }

  }



  // --- Manual Examination Hall Selection Handlers ---
  function openHallConfigModal() {
    if (examHallsData && Array.isArray(examHallsData.selected_hall_ids)) {
      setModalSelectedHallIds(examHallsData.selected_hall_ids);
    } else {
      setModalSelectedHallIds([]);
    }
    setModalHallSearch("");
    setShowHallConfigModal(true);
  }

  function toggleModalHall(hallId) {
    setModalSelectedHallIds((prev) =>
      prev.includes(hallId) ? prev.filter((id) => id !== hallId) : [...prev, hallId]
    );
  }

  function handleModalSelectAll() {
    const allAvailable = (examHallsData?.halls || [])
      .filter((h) => h.is_available)
      .map((h) => h.hall_id);
    setModalSelectedHallIds(allAvailable);
  }

  function handleModalClearAll() {
    setModalSelectedHallIds([]);
  }

  async function handleSaveHallsConfig(andAllocate = false) {
    if (!selectedExamId) return;
    setSavingHalls(true);
    try {
      const res = await api.saveExamHalls(selectedExamId, modalSelectedHallIds);
      // Reload halls data directly from backend
      const updatedHalls = await api.getExamHalls(selectedExamId);
      setExamHallsData(updatedHalls);

      if (!res.is_capacity_sufficient && andAllocate) {
        setStatusMessage({
          type: "danger",
          text: `Selected capacity (${res.total_selected_capacity} seats) is insufficient for ${res.eligible_student_count} candidates. Seat allocation cancelled until sufficient halls are chosen.`
        });
        setSavingHalls(false);
        return;
      }

      setShowHallConfigModal(false);
      setStatusMessage({
        type: res.is_capacity_sufficient ? "success" : "warning",
        text: res.warning || res.message || "Hall configuration saved successfully."
      });

      if (andAllocate && res.is_capacity_sufficient) {
        setTimeout(() => handleAllocateSeats(true), 150);
      }
    } catch (err) {
      setStatusMessage({ type: "danger", text: err.message || "Failed to save examination halls." });
    } finally {
      setSavingHalls(false);
    }
  }

  // Handle Automatic Seating Allocation & Invigilator Assignment
  async function handleAllocateSeats(forceReallocate = false) {
    if (!selectedExamId) {
      setStatusMessage({ type: "danger", text: "Please select an examination session first." });
      return;
    }

    // Verify hall configuration and capacity before proceeding
    if (!examHallsData || examHallsData.selected_halls_count === 0) {
      openHallConfigModal();
      setStatusMessage({
        type: "warning",
        text: "Please select examination halls before generating seat allocations."
      });
      return;
    }

    if (!examHallsData.is_capacity_sufficient) {
      openHallConfigModal();
      setStatusMessage({
        type: "danger",
        text: `Cannot allocate seats: Selected halls hold ${examHallsData.total_selected_capacity} seats, but ${examHallsData.eligible_student_count || eligibleStudentsCount || 0} candidates require seats (Deficit of ${Math.abs(examHallsData.capacity_difference)} seats). Please select additional halls.`
      });
      return;
    }

    const currentExam = exams.find((e) => String(e.exam_id) === String(selectedExamId));

    if (allocations && allocations.length > 0 && !forceReallocate) {
      let confirmMsg = "A seating arrangement already exists. Do you want to generate a new arrangement?";
      if (currentExam?.is_published || currentExam?.status === "Published") {
        confirmMsg = "Warning: This examination is already Published. Generating a new arrangement will archive the existing one and update student allotment passes. Do you want to proceed?";
      }
      if (!window.confirm(confirmMsg)) {
        return;
      }
      forceReallocate = true;
    }

    setAllocating(true);
    setStatusMessage({ type: "", text: "" });

    try {
      // 1. Run Seating Allocation
      let allocRes = await api.allocateSeats(selectedExamId, examHallsData?.selected_hall_ids || null, forceReallocate);

      if (allocRes.requires_confirmation && !forceReallocate) {
        let confirmMsg = allocRes.message || "A seating arrangement already exists. Do you want to generate a new arrangement?";
        if (currentExam?.is_published || currentExam?.status === "Published") {
          confirmMsg = "Warning: This examination is already Published. Generating a new arrangement will archive the existing one and update student allotment passes. Do you want to proceed?";
        }
        if (window.confirm(confirmMsg)) {
          allocRes = await api.allocateSeats(selectedExamId, examHallsData?.selected_hall_ids || null, true);
        } else {
          setAllocating(false);
          return;
        }
      }

      const totalEligible = allocRes.total_eligible ?? allocRes.total_students ?? 0;
      const allocatedSeatsCount = allocRes.total_allocated ?? allocRes.total_students ?? allocRes.allocations?.length ?? 0;
      const alreadyAllocatedCount = allocRes.already_allocated ?? 0;
      const newlyAllocatedCount = allocRes.newly_allocated ?? 0;
      const unallocatedList = allocRes.unallocated_students || [];
      const unallocatedCount = allocRes.unallocated_count ?? unallocatedList.length;

      setUnallocatedStudents(unallocatedList);

      // 2. Run Invigilator Assignment independently
      let invigSuccess = false;
      let invigMsg = "";
      try {
        const invigRes = await api.assignInvigilators(selectedExamId);
        const assignedCount = invigRes.assigned_count ?? invigRes.total_invigilators ?? 0;
        if (assignedCount > 0) {
          invigSuccess = true;
          invigMsg = ` and assigned ${assignedCount} faculty invigilator(s).`;
        } else {
          invigMsg = ` (Warning: 0 invigilators assigned - check faculty availability)`;
        }
      } catch (iErr) {
        invigMsg = ` (Warning: Invigilator assignment failed - ${iErr.message})`;
      }

      if (unallocatedCount > 0) {
        setStatusMessage({
          type: "warning",
          text: `Seat allocation completed with capacity deficit: ${allocatedSeatsCount} of ${totalEligible} eligible student(s) seated (${alreadyAllocatedCount} preserved, ${newlyAllocatedCount} newly seated). Warning: ${unallocatedCount} student(s) could not be allocated due to hall capacity constraints.${invigMsg}`,
        });
      } else {
        setStatusMessage({
          type: invigSuccess ? "success" : "info",
          text: `Seating arrangement successfully generated: All ${allocatedSeatsCount} students allocated across ${allocRes.selected_halls?.length || 'the'} examination room(s) with zero same-section neighbor conflicts${invigMsg}`,
        });
      }

      // Refresh results
      loadSeatingResults(selectedExamId);
      api.getExams().then((exRes) => setExams(exRes.exams || [])).catch(() => {});
    } catch (err) {
      setStatusMessage({
        type: "danger",
        text: err.message || "Failed to generate seating allocation. Check room capacity or student registrations.",
      });
    } finally {
      setAllocating(false);
    }
  }

  // Handle Seating Plan Publication to Students

  async function handleTogglePublish() {

    if (!selectedExamId) return;

    const isCurrentlyPublished = Boolean(activeExam?.is_published);

    const newStatus = !isCurrentlyPublished;

    setPublishing(true);

    setStatusMessage({ type: "", text: "" });



    try {

      await api.publishExam(selectedExamId, newStatus);

      setStatusMessage({

        type: "success",

        text: newStatus

          ? "Seating plan published successfully! Students can now look up their allocated halls and seats."

          : "Seating plan unpublished. Student lookups are now restricted.",

      });

      const exRes = await api.getExams();
      setExams(exRes.exams || []);

    } catch (err) {

      setStatusMessage({

        type: "danger",

        text: err.message || "Failed to update publication status.",

      });

    } finally {

      setPublishing(false);

    }

  }



  // Active examination details

  const activeExam = exams.find((e) => String(e.exam_id) === String(selectedExamId));



  // Group allocations by room / hall

  const hallGroups = useMemo(() => {

    const map = {};

    allocations.forEach((item) => {

      const hId = item.hall_id || 0;

      if (!map[hId]) {

        const foundHall = halls.find((h) => String(h.hall_id) === String(hId));

        map[hId] = {

          hall_id: hId,

          hall_name: item.hall_name || foundHall?.hall_name || `Hall ${hId}`,

          room_no: item.room_no || foundHall?.room_no || item.hall_name,

          capacity: item.capacity || foundHall?.capacity || "?",

          students: [],

        };

      }

      map[hId].students.push(item);

    });

    return Object.values(map);

  }, [allocations, halls]);



  return (

    <div className="seating-arrangement-page">

      <div className="page-header">

        <div>

          <h1 className="page-title">CSE Seating Arrangement &amp; Invigilator Assignment</h1>

          <p className="page-subtitle">

            Configure examination schedules for Class Tests and Sessionals, perform zero-conflict room seating, and assign faculty.

          </p>

        </div>

      </div>



      {statusMessage.text && (

        <div className={`alert alert-${statusMessage.type}`}>

          <span>{statusMessage.type === "success" ? "✅" : "⚠️"}</span>

          <span>{statusMessage.text}</span>

        </div>

      )}



            {/* =========================================================
          FEATURE: PENDING INVIGILATION REASSIGNMENTS SECTION
         ========================================================= */}
      {/* =========================================================
          FEATURE: PENDING INVIGILATION REASSIGNMENTS SECTION
         ========================================================= */}
      <section className="panel" style={{ borderLeft: "4px solid #dc2626", marginBottom: "24px" }}>
        <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "20px" }}>⚠️</span>
              <h2 className="panel-title" style={{ margin: 0, color: "#991b1b" }}>
                Pending Invigilation Reassignments
              </h2>
            </div>
            <p className="panel-subtitle" style={{ marginTop: "4px" }}>
              Faculty supervision duties declined by assigned invigilators requiring administrative replacement.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ display: "flex", background: "#f1f5f9", borderRadius: "8px", padding: "3px" }}>
              <button
                type="button"
                className={`table-action-btn ${reassignFilter === "pending" ? "primary" : "secondary"}`}
                style={{
                  padding: "5px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: reassignFilter === "pending" ? "#dc2626" : "transparent",
                  color: reassignFilter === "pending" ? "#ffffff" : "#475569",
                  borderColor: "transparent",
                }}
                onClick={() => setReassignFilter("pending")}
              >
                Pending
              </button>
              <button
                type="button"
                className={`table-action-btn ${reassignFilter === "reassigned" ? "primary" : "secondary"}`}
                style={{
                  padding: "5px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: reassignFilter === "reassigned" ? "#16a34a" : "transparent",
                  color: reassignFilter === "reassigned" ? "#ffffff" : "#475569",
                  borderColor: "transparent",
                }}
                onClick={() => setReassignFilter("reassigned")}
              >
                Reassigned
              </button>
              <button
                type="button"
                className={`table-action-btn ${reassignFilter === "all" ? "primary" : "secondary"}`}
                style={{
                  padding: "5px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: reassignFilter === "all" ? "var(--primary-navy)" : "transparent",
                  color: reassignFilter === "all" ? "#ffffff" : "#475569",
                  borderColor: "transparent",
                }}
                onClick={() => setReassignFilter("all")}
              >
                All
              </button>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={loadPendingReassignments}
              disabled={loadingReassignments}
              title="Refresh list"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {loadingReassignments ? (
          <p className="form-helper" style={{ padding: "16px 0" }}>Loading declined duties...</p>
        ) : pendingReassignments.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: "8px" }}>
            <span style={{ fontSize: "20px" }}>✅</span>
            <div style={{ fontWeight: 600, marginTop: "4px" }}>
              {reassignFilter === "pending"
                ? "No pending invigilation reassignments"
                : `No duties found under '${reassignFilter}' filter`}
            </div>
            <small style={{ color: "#94a3b8" }}>
              All examination supervision allocations are confirmed or resolved.
            </small>
          </div>
        ) : (
          <div className="table-responsive" style={{ maxHeight: "320px", overflowY: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Declining Faculty</th>
                  <th>Examination &amp; Course</th>
                  <th>Date &amp; Timing</th>
                  <th>Assigned Hall</th>
                  <th>Reason &amp; Comments</th>
                  <th>Time Elapsed</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingReassignments.map((item) => {
                  const isPending = item.reassignment_status === "Pending";
                  return (
                    <tr key={item.assignment_id}>
                      <td>
                        <strong>{item.faculty_name}</strong>
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                          {item.department} &bull; ID: {item.faculty_id}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.exam_name || item.subject_name}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                          {item.subject_code} &bull; {item.exam_type || "Exam"}
                        </div>
                      </td>
                      <td>
                        <div>📅 {item.exam_date}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                          ⏰ {item.start_time && item.end_time ? `${item.start_time.slice(0, 5)} - ${item.end_time.slice(0, 5)}` : item.session} ({item.session})
                        </div>
                      </td>
                      <td>
                        <strong>{item.hall_name}</strong>
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                          Room {item.room_no || item.hall_name}
                        </div>
                      </td>
                      <td style={{ maxWidth: "220px" }}>
                        <div style={{ color: "#b91c1c", fontWeight: 600, fontSize: "12px" }}>
                          &quot;{item.decline_reason || "Unspecified"}&quot;
                        </div>
                        {item.message_to_admin && (
                          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                            Note: {item.message_to_admin}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: "12px", color: "#64748b", whiteSpace: "nowrap" }}>
                        {item.time_elapsed || "Recently"}
                      </td>
                      <td>
                        <span
                          className={`status-pill ${isPending ? "danger" : "active"}`}
                          style={{ fontSize: "11px" }}
                        >
                          {isPending ? "● Pending Replacement" : `✓ Reassigned${item.replacement_faculty_name ? ` (${item.replacement_faculty_name})` : ""}`}
                        </span>
                      </td>
                      <td>
                        {isPending ? (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            style={{ padding: "4px 10px", fontSize: "11.5px", whiteSpace: "nowrap" }}
                            onClick={() => setReassignModalTarget(item)}
                          >
                            🔄 Reassign
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: "4px 10px", fontSize: "11.5px", whiteSpace: "nowrap" }}
                            onClick={() => setReassignModalTarget(item)}
                          >
                            Change Replacement
                          </button>
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

          PANEL 1: SCHEDULE CONFIGURATOR & SUBJECT SELECTION

         ========================================================= */}

      <section className="panel">

        <div className="panel-header">

          <div>

            <h2 className="panel-title">1. Examination Session &amp; Test Parameters</h2>

            <p className="panel-subtitle">

              Select term, test type (Class Test 1/2 or Sessional 1/2), course, and session timing.

            </p>

          </div>

        </div>

        <form onSubmit={handleCreateExamSession}>

          <div className="form-row-4">

            {/* Academic Year */}

            <div className="form-group">

              <label className="form-label">Academic Year</label>

              <select
                className="form-control"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
              >
                {(ACADEMIC_YEARS || ["2024-2025", "2025-2026", "2026-2027", "2027-2028"]).map((ay) => (
                  <option key={ay} value={ay}>{ay}</option>
                ))}
              </select>

            </div>

            {/* Study Year */}

            <div className="form-group">

              <label className="form-label">Study Year</label>

              <select
                className="form-control"
                value={studyYear}
                onChange={(e) => setStudyYear(parseInt(e.target.value, 10))}
              >
                {[1, 2, 3, 4].map((yr) => (
                  <option key={yr} value={yr}>
                    {STUDY_YEAR_MAP[yr]?.name || STUDY_YEAR_MAP[yr]?.label || `${yr}th Year`}
                  </option>
                ))}
              </select>

            </div>

            {/* Applicable Semester */}

            <div className="form-group">

              <label className="form-label">Semester</label>

              <select
                className="form-control"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
              >
                {applicableSemesters.map((sem) => (
                  <option key={sem} value={sem}>
                    {sem}
                  </option>
                ))}
              </select>

            </div>

            {/* Exam Type: Class Test 1, Class Test 2, Sessional 1, Sessional 2 */}

            <div className="form-group">

              <label className="form-label">Examination Type <span className="form-label-required">*</span></label>

              <select

                className="form-control"

                value={examType}

                onChange={(e) => setExamType(e.target.value)}

              >

                {EXAM_TYPES.map((type) => (

                  <option key={type} value={type}>

                    {type}

                  </option>

                ))}

              </select>

            </div>

          </div>

        <div className="form-row" style={{ marginTop: "12px" }}>

            {/* Subject Select */}

            <div className="form-group">

              <label className="form-label" htmlFor="exam-subject-select">

                CSE Subject / Course <span className="form-label-required">*</span>

              </label>

              <select

                id="exam-subject-select"

                className="form-control"

                value={selectedSubjectId}

                onChange={(e) => setSelectedSubjectId(e.target.value)}

                required

              >

                <option value="">-- Choose Subject for {semester} --</option>

                {availableSubjects.map((s) => (

                  <option key={s.subject_id} value={s.subject_id}>

                    {s.subject_code}: {s.subject_name}

                  </option>

                ))}

              </select>

            </div>



            {/* Date */}

            <div className="form-group">

              <label className="form-label" htmlFor="exam-date-input">

                Examination Date <span className="form-label-required">*</span>

              </label>

              <input

                id="exam-date-input"

                type="date"

                className="form-control"

                value={examDate}

                onChange={(e) => setExamDate(e.target.value)}

                required

              />

            </div>



            {/* Start Time (Manual Entry) */}
            <div className="form-group">
              <label className="form-label" htmlFor="exam-start-time">
                Start Time <span className="form-label-required">*</span>
              </label>
              <input
                id="exam-start-time"
                type="time"
                className="form-control"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>

            {/* End Time (Manual Entry) */}
            <div className="form-group">
              <label className="form-label" htmlFor="exam-end-time">
                End Time <span className="form-label-required">*</span>
              </label>
              <input
                id="exam-end-time"
                type="time"
                className="form-control"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>

          </div>


          <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>

            <button type="submit" className="btn btn-navy">

              📅 Schedule / Link Examination

            </button>

          </div>

        </form>

      </section>



      {/* =========================================================
      {/* =========================================================

          PANEL 2: ACTIVE & COMPLETED EXAMINATION WORKSPACE

         ========================================================= */}

      <section className="panel" id="workspace-main-panel">

        <div className="panel-header" style={{ marginBottom: "16px" }}>

          <div>

            <h2 className="panel-title">2. Seating &amp; Invigilator Allocation Workspace</h2>

            <p className="panel-subtitle">

              Manage live active examination seat allocations or review and audit conducted examination archives.

            </p>

          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ borderColor: "#cbd5e1", color: "var(--primary-navy)" }}
              onClick={() => setShowHistoryModal(true)}
              title="View examination history, cancellation records, and reschedule cancelled exams."
            >
              📜 Examination History &amp; Cancelled ({cancelledExams.length})
            </button>
          </div>

        </div>

        {/* 1. Visually Distinct Active and Completed Tabs */}
        <div className="workspace-tabs-bar">
          <button
            type="button"
            className={`workspace-tab-item ${workspaceTab === "active" ? "active" : ""}`}
            onClick={() => {
              setWorkspaceTab("active");
              const next = filteredActiveExams[0] || activeExams[0];
              if (next && (!selectedExamId || activeExam?.status === "Completed")) {
                setSelectedExamId(String(next.exam_id));
              }
            }}
          >
            <span className="tab-status-dot active"></span>
            <span className="tab-label">Active Examinations</span>
            <span className="workspace-badge active-badge">{activeExams.length}</span>
          </button>

          <button
            type="button"
            className={`workspace-tab-item ${workspaceTab === "completed" ? "active" : ""}`}
            onClick={() => {
              setWorkspaceTab("completed");
              const next = filteredCompletedExams[0] || completedNormalExams[0] || archivedExams[0];
              if (next && (!selectedExamId || activeExam?.status !== "Completed")) {
                setSelectedExamId(String(next.exam_id));
              }
            }}
          >
            <span className="tab-status-dot completed"></span>
            <span className="tab-label">Completed Examinations</span>
            <span className="workspace-badge completed-badge">{completedNormalExams.length}</span>
            {archivedExams.length > 0 && (
              <span className="workspace-badge archived-badge" title="Archived completed examinations">
                +{archivedExams.length} archived
              </span>
            )}
          </button>
        </div>

        {/* 2. Responsive Search & Filter Bar */}
        <div className="workspace-filter-bar">
          <div>
            <input
              type="text"
              className="form-control"
              placeholder="🔍 Search by subject, code, or exam ID..."
              value={examSearchQuery}
              onChange={(e) => setExamSearchQuery(e.target.value)}
            />
          </div>

          <div>
            <select
              className="form-control"
              value={filterAcademicYear}
              onChange={(e) => setFilterAcademicYear(e.target.value)}
            >
              <option value="">-- All Academic Years --</option>
              {dynamicFilterOptions.years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              className="form-control"
              value={filterSemester}
              onChange={(e) => setFilterSemester(e.target.value)}
            >
              <option value="">-- All Semesters --</option>
              {dynamicFilterOptions.sems.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              className="form-control"
              value={filterExamType}
              onChange={(e) => setFilterExamType(e.target.value)}
            >
              <option value="">-- All Exam Types --</option>
              {dynamicFilterOptions.types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (filterAcademicYear === academicYear && filterSemester === semester) {
                  setFilterAcademicYear("");
                  setFilterSemester("");
                } else {
                  setFilterAcademicYear(academicYear);
                  setFilterSemester(semester);
                }
              }}
              style={{
                background: filterAcademicYear === academicYear && filterSemester === semester ? "#eff6ff" : undefined,
                borderColor: filterAcademicYear === academicYear && filterSemester === semester ? "#3b82f6" : undefined,
                color: filterAcademicYear === academicYear && filterSemester === semester ? "#1d4ed8" : undefined,
                whiteSpace: "nowrap",
                height: "38px",
              }}
              title="Toggle filtering examination list to the currently active global cohort"
            >
              {filterAcademicYear === academicYear && filterSemester === semester ? "✓ Filtered to Active Cohort" : "🎯 Filter to Active Cohort"}
            </button>
          </div>

          </div>

        {/* =========================================================
            TAB 1: ACTIVE EXAMINATIONS VIEW
           ========================================================= */}
        {workspaceTab === "active" && (
          <div style={{ marginBottom: "20px" }}>
            <div style={{ overflowX: "auto", marginBottom: "16px" }}>
              <table className="workspace-data-table">
                <thead>
                  <tr>
                    <th style={{ width: "80px" }}>Exam ID</th>
                    <th>Subject &amp; Course Code</th>
                    <th>Exam Type</th>
                    <th>Semester</th>
                    <th>Date &amp; Timing</th>
                    <th>Status</th>
                    <th>Capacity &amp; Seats</th>
                    <th style={{ textAlign: "right", minWidth: "140px" }}>Workspace Selection</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActiveExams.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
                        No active examinations matching current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredActiveExams.map((ex) => {
                      const isSelected = String(selectedExamId) === String(ex.exam_id);
                      return (
                        <tr key={ex.exam_id} className={isSelected ? "selected-row" : ""}>
                          <td><strong>#{ex.exam_id}</strong></td>
                          <td>
                            <strong>{ex.subject_code}</strong> — {ex.subject_name || ex.exam_name}
                          </td>
                          <td>
                            <span className="status-pill info">{ex.exam_type || "Class Test"}</span>
                          </td>
                          <td>{ex.semester} ({ex.academic_year})</td>
                          <td>
                            📅 {String(ex.exam_date).slice(0, 10)}<br />
                            <small style={{ color: "var(--text-muted)" }}>
                              ⏰ {ex.start_time?.slice(0, 5)}–{ex.end_time?.slice(0, 5)} ({ex.session || "FN"})
                            </small>
                          </td>
                          <td>
                            <span className={`status-pill ${
                              ex.status === "Published" ? "published" :
                              ex.status === "In Progress" ? "info" : "warning"
                            }`}>
                              {ex.status === "Published" ? "✓ Published" :
                               ex.status === "In Progress" ? "⚡ In Progress" : "🕒 Scheduled"}
                            </span>
                          </td>
                          <td>
                            <strong style={{ color: ex.seat_allocation_count > 0 ? "var(--success)" : "var(--text-muted)" }}>
                              {ex.seat_allocation_count || 0}
                            </strong> / {ex.student_count || ex.expected_students || 0} Seated
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className={`btn btn-sm ${isSelected ? "btn-navy" : "btn-secondary"}`}
                              onClick={() => setSelectedExamId(String(ex.exam_id))}
                            >
                              {isSelected ? "✓ Active Workspace" : "Select & Manage"}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Active Workspace Action Controls Toolbar */}
            {activeExam && activeExam.status !== "Completed" && activeExam.status !== "Cancelled" && (
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                flexWrap: "wrap",
                background: "#ffffff",
                padding: "14px 18px",
                borderRadius: "10px",
                border: "1.5px solid #bfdbfe",
                boxShadow: "0 2px 8px rgba(37, 99, 235, 0.08)",
                marginBottom: "20px"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "20px" }}>🎯</span>
                  <div>
                    <strong style={{ fontSize: "14px", color: "var(--primary-navy)" }}>
                      Selected Active Exam: #{activeExam.exam_id} ({activeExam.subject_code} - {activeExam.subject_name || activeExam.exam_name})
                    </strong>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      Status: {activeExam.status} · {eligibleStudentsCount || activeExam.student_count || 0} Registered Candidates · {allocations.length} Seats Allocated
                    </div>
                    <div style={{ marginTop: "4px" }}>
                      <span style={{ background: "#e0e7ff", color: "#3730a3", border: "1px solid #c7d2fe", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        🔒 Examination Cohort: AY {activeExam.academic_year || "2026-2027"} • Year {activeExam.study_year || 3} ({activeExam.semester || "Semester 5"})
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  {/* Hall Configuration Status Pill */}
                  <div
                    onClick={openHallConfigModal}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 14px",
                      borderRadius: "8px",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      cursor: "pointer",
                      userSelect: "none",
                      border: !examHallsData || examHallsData.selected_halls_count === 0
                        ? "1.5px dashed #f59e0b"
                        : examHallsData.is_capacity_sufficient
                        ? "1.5px solid #10b981"
                        : "1.5px solid #ef4444",
                      background: !examHallsData || examHallsData.selected_halls_count === 0
                        ? "#fffbeb"
                        : examHallsData.is_capacity_sufficient
                        ? "#ecfdf5"
                        : "#fef2f2",
                      color: !examHallsData || examHallsData.selected_halls_count === 0
                        ? "#b45309"
                        : examHallsData.is_capacity_sufficient
                        ? "#065f46"
                        : "#991b1b",
                      transition: "all 0.15s ease",
                    }}
                    title="Click to configure and select examination halls for this session"
                  >
                    <span>🏛️</span>
                    <span>
                      {!examHallsData || examHallsData.selected_halls_count === 0
                        ? "Halls: Not Configured (Click to Select)"
                        : `${examHallsData.selected_halls_count} Halls (${examHallsData.total_selected_capacity} Seats / ${examHallsData.eligible_student_count || eligibleStudentsCount || 0} Candidates)`}
                    </span>
                    {examHallsData?.selected_halls_count > 0 && (
                      examHallsData.is_capacity_sufficient ? (
                        <span style={{ fontSize: "11px", background: "#059669", color: "#fff", padding: "1px 6px", borderRadius: "4px" }}>
                          ✓ Ready
                        </span>
                      ) : (
                        <span style={{ fontSize: "11px", background: "#dc2626", color: "#fff", padding: "1px 6px", borderRadius: "4px" }}>
                          ⚠️ Shortage
                        </span>
                      )
                    )}
                  </div>

                  {/* Configure Halls Button */}
                  <button
                    type="button"
                    className="btn btn-navy"
                    onClick={openHallConfigModal}
                    title="Select and configure specific halls for this examination session"
                  >
                    🏛️ Select Examination Halls
                  </button>

                  {/* Allocate Seats Button */}
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAllocateSeats}
                    disabled={allocating || !selectedExamId}
                    title="Generate automated seating arrangement directly fetching latest database students"
                  >
                    {allocating ? "Allocating..." : "⚡ Allocate Seats"}
                  </button>

                  {/* Publish / Unpublish Toggle */}
                  {selectedExamId && allocations.length > 0 && (
                    <button
                      type="button"
                      className={`btn ${activeExam?.is_published ? "btn-secondary" : "btn-success"}`}
                      onClick={handleTogglePublish}
                      disabled={publishing}
                      title={
                        activeExam?.is_published
                          ? "Click to unpublish seating plan"
                          : "Publish seating plan to students"
                      }
                    >
                      {publishing
                        ? "Updating..."
                        : activeExam?.is_published
                        ? "📢 Published (Unpublish)"
                        : "📢 Publish Seating Plan"}
                    </button>
                  )}

                  {/* Cancel Examination Button */}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ borderColor: "#fca5a5", color: "#b91c1c" }}
                    onClick={() => {
                      setCancelReason("");
                      setShowCancelModal(true);
                    }}
                    title="Cancel this examination with documented reason."
                  >
                    🚫 Cancel Examination
                  </button>

                  {/* Delete Examination Action */}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ borderColor: "#fecaca", color: "var(--danger)" }}
                    onClick={() => handleOpenDeleteModal(activeExam.exam_id)}
                    title="Delete this examination and clean up allocations"
                  >
                    🗑️ Delete Examination
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            TAB 2: COMPLETED EXAMINATIONS VIEW
           ========================================================= */}
        {workspaceTab === "completed" && (
          <div style={{ marginBottom: "20px" }}>
            {/* View Mode Toggle: Normal Completed vs Archived */}
            <div className="workspace-subtabs-group">
              <button
                type="button"
                className={`workspace-subtab-btn ${completedViewMode === "normal" ? "active" : ""}`}
                onClick={() => {
                  setCompletedViewMode("normal");
                  if (filteredCompletedExams.length > 0) {
                    setSelectedExamId(String(filteredCompletedExams[0].exam_id));
                  }
                }}
              >
                🏁 Conducted Examinations ({completedNormalExams.length})
              </button>
              <button
                type="button"
                className={`workspace-subtab-btn ${completedViewMode === "archived" ? "active" : ""}`}
                onClick={() => {
                  setCompletedViewMode("archived");
                  if (filteredArchivedExams.length > 0) {
                    setSelectedExamId(String(filteredArchivedExams[0].exam_id));
                  }
                }}
              >
                📦 Archived Examinations ({archivedExams.length})
              </button>
            </div>

            {/* Completed Examinations Data Table */}
            <div style={{ overflowX: "auto", marginBottom: "16px" }}>
              <table className="workspace-data-table">
                <thead>
                  <tr>
                    <th style={{ width: "70px" }}>Exam ID</th>
                    <th>Subject &amp; Code</th>
                    <th>Type</th>
                    <th>Semester</th>
                    <th>Date &amp; Session</th>
                    <th>Students</th>
                    <th>Status</th>
                    <th style={{ minWidth: "320px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(completedViewMode === "normal" ? filteredCompletedExams : filteredArchivedExams).length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
                        {completedViewMode === "normal"
                          ? "No completed examinations matching current filters."
                          : "No archived examinations found in the archive repository."}
                      </td>
                    </tr>
                  ) : (
                    (completedViewMode === "normal" ? filteredCompletedExams : filteredArchivedExams).map((ex) => {
                      const isSelected = String(selectedExamId) === String(ex.exam_id);
                      return (
                        <tr key={ex.exam_id} className={isSelected ? "selected-row" : ""}>
                          <td><strong>#{ex.exam_id}</strong></td>
                          <td>
                            <strong>{ex.subject_code}</strong> — {ex.subject_name || ex.exam_name}
                          </td>
                          <td>
                            <span className="status-pill info">{ex.exam_type || "Exam"}</span>
                          </td>
                          <td>{ex.semester} ({ex.academic_year})</td>
                          <td>
                            📅 {String(ex.exam_date).slice(0, 10)}<br />
                            <small style={{ color: "var(--text-muted)" }}>
                              ⏰ {ex.start_time?.slice(0, 5)}–{ex.end_time?.slice(0, 5)} ({ex.session || "FN"})
                            </small>
                          </td>
                          <td>
                            <strong>{ex.student_count || ex.expected_students || 0}</strong> Reg /{" "}
                            <strong style={{ color: "var(--success)" }}>{ex.seat_allocation_count || 0}</strong> Allocated
                          </td>
                          <td>
                            <span className={`status-pill ${ex.is_archived ? "default" : "active"}`}>
                              {ex.is_archived ? "📦 Archived" : "🏁 Conducted (Completed)"}
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div className="action-btn-row" style={{ justifyContent: "flex-end" }}>
                              {/* 1. View Examination */}
                              <button
                                type="button"
                                className={`btn ${isSelected ? "btn-navy" : "btn-secondary"}`}
                                onClick={() => setSelectedExamId(String(ex.exam_id))}
                                title="Select this examination to view full historical seating and invigilation details below"
                              >
                                {isSelected ? "✓ Viewing" : "👁️ View"}
                              </button>

                              {/* 2. View Seating Arrangement */}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                  setSelectedExamId(String(ex.exam_id));
                                  setTimeout(() => {
                                    document.getElementById("workspace-seating-section")?.scrollIntoView({ behavior: "smooth" });
                                  }, 150);
                                }}
                                title="View room-by-room bench seating layout"
                              >
                                🪑 Seating
                              </button>

                              {/* 3. View Invigilator Assignments */}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                  setSelectedExamId(String(ex.exam_id));
                                  setTimeout(() => {
                                    document.getElementById("workspace-invigilators-section")?.scrollIntoView({ behavior: "smooth" });
                                  }, 150);
                                }}
                                title="View assigned faculty invigilators"
                              >
                                👨‍🏫 Duties
                              </button>

                              {/* 4. View Reports */}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => handleDownloadReport(ex.exam_id, "seating")}
                                title="Preview Seating Arrangement PDF report in browser"
                              >
                                📑 Reports
                              </button>

                              {/* 5. Download Reports */}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ color: "#1e40af", borderColor: "#93c5fd" }}
                                onClick={() => handleDownloadReport(ex.exam_id, "combined")}
                                title="Download complete documentation PDF package"
                              >
                                📥 PDF
                              </button>

                              {/* 6. Archive or Restore */}
                              {!ex.is_archived ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => handleArchiveExam(ex.exam_id)}
                                  disabled={archivingExamId === ex.exam_id}
                                  title="Archive examination to hide from regular completed list while preserving all data"
                                >
                                  {archivingExamId === ex.exam_id ? "Archiving..." : "📦 Archive"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ color: "#166534", borderColor: "#86efac" }}
                                  onClick={() => handleRestoreExam(ex.exam_id)}
                                  disabled={restoringExamId === ex.exam_id}
                                  title="Restore archived examination back to regular completed examinations list"
                                >
                                  {restoringExamId === ex.exam_id ? "Restoring..." : "🔄 Restore"}
                                </button>
                              )}

                              {/* 7. Delete */}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ borderColor: "#fecaca", color: "var(--danger)" }}
                                onClick={() => handleOpenDeleteModal(ex.exam_id)}
                                title="Permanently delete this completed examination with verification"
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}


        {activeExam && (

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "20px", background: "#f8fafc", padding: "14px 18px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>

            <div>

              <span className="form-helper">Course:</span>{" "}

              <strong>{activeExam.subject_code} - {activeExam.subject_name}</strong>

            </div>

            <div>

              <span className="form-helper">Type:</span>{" "}

              <span className="status-pill info">{activeExam.exam_type || examType}</span>

            </div>

            <div>

              <span className="form-helper">Timing:</span>{" "}
              <strong>
                {activeExam.start_time && activeExam.end_time
                  ? `${activeExam.start_time.slice(0, 5)} – ${activeExam.end_time.slice(0, 5)} (${activeExam.session || "Custom"})`
                  : activeExam.session === "FN" ? "09:30 AM – 12:30 PM (FN)" : "01:30 PM – 04:30 PM (AN)"}
              </strong>

            </div>

            <div>
              <span className="form-helper">Permanent Cohort:</span>{" "}
              <span className="status-pill" style={{ background: "#e0e7ff", color: "#3730a3", border: "1px solid #c7d2fe" }}>
                🔒 AY {activeExam.academic_year || "2026-2027"} • Year {activeExam.study_year || 3} ({activeExam.semester || "Semester 5"})
              </span>
            </div>



            <div>

              <span className="form-helper">Registered Candidates:</span>{" "}

              <strong>{eligibleStudentsCount || activeExam.student_count || activeExam.expected_students || 0} students</strong>

            </div>

            <div>

              <span className="form-helper">Allocated Seats:</span>{" "}

              <strong style={{ color: "var(--success)" }}>{allocations.length} seated</strong>

            </div>

            <div>
              <span className="form-helper">Status:</span>{" "}
              <span className={`status-pill ${
                activeExam?.status === "Completed" ? "active" :
                activeExam?.status === "Published" ? "published" :
                activeExam?.status === "Cancelled" ? "danger" : "warning"
              }`}>
                {activeExam?.status === "Completed" ? "🏁 Conducted (Completed)" :
                 activeExam?.status === "Published" ? "✓ Published" :
                 activeExam?.status === "Cancelled" ? "✕ Cancelled" :
                 activeExam?.status === "In Progress" ? "⚡ In Progress" : "🕒 Scheduled"}
              </span>
            </div>

            <div>
              <span className="form-helper">Student Visibility:</span>{" "}
              <span className={`status-pill ${activeExam?.is_published ? "active" : "warning"}`}>
                {activeExam?.is_published ? "📢 Published to Students" : "🔒 Unpublished (Draft)"}
              </span>
            </div>
          </div>
        )}

        {/* Completed Examination Read-Only Notice Banner */}
        {activeExam?.status === "Completed" && (
          <div className="alert alert-info" style={{ marginBottom: "20px", background: "#f0fdf4", borderColor: "#86efac", color: "#166534", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "22px" }}>🏁</span>
              <div>
                <strong>Examination Conducted &amp; Marked Completed</strong>
                <p style={{ margin: "2px 0 0", fontSize: "12.5px" }}>
                  This examination has concluded. Previous seating arrangements, room breakdowns, student roll lists, and invigilator schedules are preserved below in read-only mode for academic history.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleUpdateStatus(activeExam.exam_id, "Scheduled")}
              disabled={updatingStatus}
              title="Re-open examination if further seat adjustments are needed."
            >
              🔄 Reopen Examination
            </button>
          </div>
        )}





        {/* Unallocated Students Warning Banner if any students could not be seated */}
        {unallocatedStudents && unallocatedStudents.length > 0 && (
          <div className="alert alert-warning" style={{ marginBottom: "20px", background: "#fffbeb", borderColor: "#fef3c7" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, marginBottom: "8px", color: "#92400e" }}>
              <span style={{ fontSize: "18px" }}>⚠️</span>
              <span>Capacity Deficit: {unallocatedStudents.length} Eligible Student(s) Could Not Be Allocated</span>
            </div>
            <p style={{ fontSize: "13px", color: "#78350f", marginBottom: "12px" }}>
              The following eligible students could not be seated due to insufficient examination room capacity. Please add additional examination halls to seat these candidates.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ fontSize: "12.5px", background: "#ffffff", borderRadius: "6px" }}>
                <thead>
                  <tr>
                    <th>Hall Ticket No</th>
                    <th>Student Name</th>
                    <th>Section</th>
                    <th>Department</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {unallocatedStudents.map((us) => (
                    <tr key={us.student_id}>
                      <td><strong>{us.hall_ticket_no}</strong></td>
                      <td>{us.name}</td>
                      <td>{us.section}</td>
                      <td>{us.department}</td>
                      <td style={{ color: "var(--danger)", fontSize: "12px" }}>{us.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Conflicts Warning / Alert Banner */}

        {conflicts && (conflicts.total_hard_conflicts > 0 || (conflicts.seating_conflicts && conflicts.seating_conflicts.length > 0)) && (

          <div className={`alert ${conflicts.total_hard_conflicts > 0 ? "alert-danger" : "alert-warning"}`} style={{ marginBottom: "20px" }}>

            <span>{conflicts.total_hard_conflicts > 0 ? "🚨" : "⚠️"}</span>

            <div>

              <strong>

                {conflicts.total_hard_conflicts > 0

                  ? `${conflicts.total_hard_conflicts} Critical Hard Conflict(s) Detected:`

                  : `${conflicts.seating_conflicts?.length || 0} Seating Adjacency Notice(s):`}

              </strong>

              <ul style={{ margin: "6px 0 0 18px", fontSize: "12.5px" }}>

                {conflicts.duplicate_seats?.map((ds, i) => (

                  <li key={`ds-${i}`}>

                    <strong>Double-Seating:</strong> Candidates {ds.student_1} ({ds.student_1_ht}) and {ds.student_2} ({ds.student_2_ht}) assigned to same seat in {ds.hall_name} (Row {ds.row_no}, Col {ds.column_no})

                  </li>

                ))}

                {conflicts.teaching_conflicts?.map((tc, i) => (

                  <li key={`tc-${i}`}>

                    <strong>Teaching Conflict:</strong> Faculty {tc.faculty_name} assigned to invigilate their own subject ({tc.subject_name || tc.subject_code}) in {tc.hall_name}

                  </li>

                ))}

                {conflicts.unverified_teaching_allocations?.map((uta, i) => (

                  <li key={`uta-${i}`}>

                    <strong>Unverified Teaching Allocation:</strong> Subject {uta.subject_code} - {uta.subject_name} has no faculty mapped in faculty_subjects database table. Admin verification advised.

                  </li>

                ))}

                {conflicts.invigilator_conflicts?.map((ic, i) => (

                  <li key={`ic-${i}`}>

                    <strong>Double Booking:</strong> Faculty {ic.faculty_name} assigned to multiple halls ({ic.halls}) on {ic.exam_date} ({ic.session})

                  </li>

                ))}

                {conflicts.student_overlaps?.map((so, i) => (

                  <li key={`so-${i}`}>

                    <strong>Session Collision:</strong> Candidate {so.student_name} ({so.hall_ticket_no}) scheduled in multiple overlapping exams ({so.exam_1} &amp; {so.exam_2})

                  </li>

                ))}

                {conflicts.seating_conflicts?.map((sc, i) => (

                  <li key={`sc-${i}`}>

                    <strong>Adjacency:</strong> Candidates {sc.student_1} ({sc.section_1 || sc.department}) and {sc.student_2} ({sc.section_2 || sc.department}) seated adjacent in {sc.hall_name} (Row {sc.row_1}, Col {sc.column_1})

                  </li>

                ))}

              </ul>

            </div>

          </div>

        )}



        {/* Seating Results Display */}

        <div id="workspace-seating-section"></div>
        {loadingSeating ? (

          <p className="form-helper" style={{ padding: "24px 0" }}>Loading seating and invigilator arrangements...</p>

        ) : allocations.length === 0 ? (

          <div className="empty-state">

            <span className="empty-icon">🪑</span>

            <h3>No Seating Allocation Generated</h3>

            <p>

              Click &quot;⚡ Allocate Seats&quot; above to distribute registered CSE candidates across available examination halls.

            </p>

          </div>

        ) : (

          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

            {hallGroups.map((group) => {

              const assignedFac = assignments.find((asg) => String(asg.hall_id) === String(group.hall_id));



              // Group students into bench pairs (L & R)

              const benches = [];

              for (let i = 0; i < group.students.length; i += 2) {

                benches.push({

                  benchNo: Math.floor(i / 2) + 1,

                  left: group.students[i] || null,

                  right: group.students[i + 1] || null,

                });

              }



              return (

                <div key={group.hall_id} style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>

                  {/* Hall Header Bar */}

                  <div style={{ background: "#f1f5f9", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", flexWrap: "wrap", gap: "10px" }}>

                    <div>

                      <strong style={{ fontSize: "15px", color: "var(--primary-navy)" }}>

                        Room {group.room_no || group.hall_name}

                      </strong>

                      <span className="form-helper" style={{ marginLeft: "10px" }}>

                        Capacity: <strong>{group.students.length} / {group.capacity} Seats Utilized</strong>

                      </span>

                    </div>



                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>

                      <span className="form-helper">Invigilator:</span>

                      <strong style={{ color: "var(--primary-navy)", background: "#ffffff", padding: "4px 10px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>

                        {assignedFac?.faculty_name || "Faculty Assigned"}

                      </strong>

                      {assignedFac?.is_teaching_conflict && (
                        <span style={{ background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5", fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "6px" }}>
                          🚨 Teaching Conflict: Faculty teaches this course!
                        </span>
                      )}

                      {assignedFac?.status === "declined" && (
                        <span style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d", fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "6px" }}>
                          ⚠️ Declined Duty
                        </span>
                      )}

                      {assignedFac && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{
                            padding: "3px 8px",
                            fontSize: "11.5px",
                            fontWeight: 600,
                            background: assignedFac.is_teaching_conflict ? "#dc2626" : undefined,
                            color: assignedFac.is_teaching_conflict ? "#ffffff" : undefined,
                            borderColor: assignedFac.is_teaching_conflict ? "#b91c1c" : undefined,
                          }}
                          onClick={() => setReassignModalTarget(assignedFac)}
                          title={assignedFac.is_teaching_conflict ? "Reassign to resolve teaching conflict" : "Reassign Invigilator"}
                        >
                          🔄 {assignedFac.is_teaching_conflict ? "Resolve Conflict" : "Reassign"}
                        </button>
                      )}

                    </div>

                  </div>



                  {/* Benches Grid */}

                  <div style={{ padding: "16px" }}>

                    <div className="benches-grid">
                      {benches.map((b) => (
                        <div key={b.benchNo} className="bench-box">
                          <div className="bench-box-header">BENCH #{b.benchNo}</div>
                          <div className="bench-seats-duo">
                            <div className={`bench-half-seat ${b.left ? "occupied" : "vacant"}`}>
                              {b.left ? (
                                <>
                                  <div className="bench-seat-pos-tag">SEAT 1 (L)</div>
                                  <span className="bench-ticket-no">{b.left.hall_ticket_no}</span>
                                  <span className="bench-stud-name" title={b.left.student_name}>
                                    {b.left.student_name}
                                  </span>
                                  <span className="badge-cse" style={{ fontSize: "10px", width: "fit-content", marginTop: "4px" }}>
                                    {b.left.section ? `Sec ${b.left.section}` : "Sec —"}
                                  </span>
                                </>
                              ) : (
                                <div className="bench-vacant-text">
                                  <span className="bench-seat-pos-tag">SEAT 1 (L)</span>
                                  <span>Vacant</span>
                                </div>
                              )}
                            </div>

                            <div className={`bench-half-seat ${b.right ? "occupied" : "vacant"}`}>
                              {b.right ? (
                                <>
                                  <div className="bench-seat-pos-tag">SEAT 2 (R)</div>
                                  <span className="bench-ticket-no">{b.right.hall_ticket_no}</span>
                                  <span className="bench-stud-name" title={b.right.student_name}>
                                    {b.right.student_name}
                                  </span>
                                  <span className="badge-cse" style={{ fontSize: "10px", width: "fit-content", marginTop: "4px" }}>
                                    {b.right.section ? `Sec ${b.right.section}` : "Sec —"}
                                  </span>
                                </>
                              ) : (
                                <div className="bench-vacant-text">
                                  <span className="bench-seat-pos-tag">SEAT 2 (R)</span>
                                  <span>Vacant</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>

                </div>

              );

            })}

          </div>

        )}

      </section>


      {/* =========================================================
          MODAL 1: CANCEL EXAMINATION
         ========================================================= */}
      {showCancelModal && activeExam && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "540px" }}>
            <div className="modal-header">
              <h3 className="modal-title">🚫 Cancel Scheduled Examination</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowCancelModal(false)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border-color)", marginBottom: "16px", fontSize: "13px" }}>
                <div><strong>Examination ID:</strong> #{activeExam.exam_id}</div>
                <div><strong>Subject:</strong> {activeExam.subject_code} - {activeExam.subject_name || activeExam.exam_name}</div>
                <div><strong>Date &amp; Time:</strong> {String(activeExam.exam_date).slice(0, 10)} &bull; {activeExam.start_time?.slice(0, 5)} – {activeExam.end_time?.slice(0, 5)}</div>
                <div><strong>Current Status:</strong> <span className="status-pill warning">{activeExam.status}</span></div>
              </div>

              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label" htmlFor="cancellation-reason">
                  Cancellation Reason <span className="form-label-required">*</span>
                </label>
                <textarea
                  id="cancellation-reason"
                  className="form-control"
                  rows={3}
                  placeholder="e.g., Unscheduled institutional holiday, departmental request, or emergency rescheduling..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  required
                />
              </div>

              <div className="alert alert-warning" style={{ fontSize: "12.5px" }}>
                <span>🛡️</span>
                <div>
                  <strong>Preservation Guarantee:</strong> The examination record will be preserved in the historical audit log with its cancellation timestamp and reason. It will be removed from Active Examinations and can be rescheduled at any time.
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCancelModal(false)}
                disabled={cancellingExam}
              >
                Keep Active
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmCancel}
                disabled={cancellingExam || !cancelReason.trim()}
              >
                {cancellingExam ? "Cancelling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: EXAMINATION HISTORY & CANCELLED EXAMINATIONS
         ========================================================= */}
      {showHistoryModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "800px" }}>
            <div className="modal-header">
              <h3 className="modal-title">📜 Examination History &amp; Cancelled Sessions</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowHistoryModal(false)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: "65vh", overflowY: "auto" }}>
              <div style={{ marginBottom: "14px", fontSize: "13px", color: "var(--text-secondary)" }}>
                Audited history of cancelled and completed examinations. Cancelled examinations can be rescheduled into new scheduled examination sessions.
              </div>

              <h4 style={{ fontSize: "14px", fontWeight: 700, margin: "16px 0 8px", color: "#b91c1c" }}>
                🚫 Cancelled Examinations ({cancelledExams.length})
              </h4>

              {cancelledExams.length === 0 ? (
                <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "6px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                  No cancelled examinations found.
                </div>
              ) : (
                <div className="table-wrapper">
                  <table style={{ fontSize: "12.5px" }}>
                    <thead>
                      <tr>
                        <th>Exam ID</th>
                        <th>Course / Subject</th>
                        <th>Original Date &amp; Time</th>
                        <th>Cancellation Reason &amp; Timestamp</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cancelledExams.map((ce) => (
                        <tr key={ce.exam_id}>
                          <td><strong>#{ce.exam_id}</strong></td>
                          <td>
                            <strong>{ce.subject_code}</strong>
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{ce.subject_name || ce.exam_name}</div>
                            <span className="status-pill danger" style={{ marginTop: "2px" }}>Cancelled</span>
                          </td>
                          <td>
                            <div>{String(ce.exam_date).slice(0, 10)}</div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{ce.start_time?.slice(0, 5)} – {ce.end_time?.slice(0, 5)}</div>
                          </td>
                          <td>
                            <div style={{ fontStyle: "italic", color: "#7f1d1d" }}>"{ce.cancellation_reason || "No reason specified"}"</div>
                            {ce.cancelled_at && (
                              <div style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "2px" }}>
                                {String(ce.cancelled_at).slice(0, 19).replace("T", " ")}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: "6px", alignItems: "center", justifyContent: "flex-end" }}>
                              {ce.rescheduled_to ? (
                                <span className="status-pill active" title={`Rescheduled to Exam #${ce.rescheduled_to}`}>
                                  Rescheduled &rarr; #{ce.rescheduled_to}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => handleOpenRescheduleModal(ce)}
                                >
                                  🔄 Reschedule
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                style={{ borderColor: "#fecaca", color: "var(--danger)" }}
                                onClick={() => {
                                  setShowHistoryModal(false);
                                  handleOpenDeleteModal(ce.exam_id);
                                }}
                                title="Delete this cancelled examination"
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h4 style={{ fontSize: "14px", fontWeight: 700, margin: "24px 0 8px", color: "#15803d" }}>
                🏁 Completed Examinations ({completedExams.length})
              </h4>

              {completedExams.length === 0 ? (
                <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "6px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                  No completed examinations found.
                </div>
              ) : (
                <div className="table-wrapper">
                  <table style={{ fontSize: "12.5px" }}>
                    <thead>
                      <tr>
                        <th>Exam ID</th>
                        <th>Course / Subject</th>
                        <th>Conducted Date</th>
                        <th>Allocations</th>
                        <th style={{ textAlign: "right" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedExams.map((co) => (
                        <tr key={co.exam_id}>
                          <td><strong>#{co.exam_id}</strong></td>
                          <td>
                            <strong>{co.subject_code}</strong> - {co.subject_name || co.exam_name}
                          </td>
                          <td>{String(co.exam_date).slice(0, 10)} ({co.start_time?.slice(0, 5)}–{co.end_time?.slice(0, 5)})</td>
                          <td><strong style={{ color: "var(--success)" }}>{co.seat_allocation_count || 0} seated</strong></td>
                          <td style={{ textAlign: "right" }}>
                            <span className="status-pill active">Conducted (Read-Only)</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowHistoryModal(false)}
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 3: RESCHEDULE CANCELLED EXAMINATION
         ========================================================= */}
      {showRescheduleModal && rescheduleTarget && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "580px" }}>
            <div className="modal-header">
              <h3 className="modal-title">🔄 Reschedule Examination</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowRescheduleModal(false)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmReschedule}>
              <div className="modal-body">
                {/* Original Pre-filled Exam Metadata Card */}
                <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border-color)", marginBottom: "16px", fontSize: "13px" }}>
                  <div style={{ fontWeight: 600, color: "var(--primary-navy)", marginBottom: "6px" }}>
                    Original Cancelled Examination Details:
                  </div>
                  <div><strong>Cancelled Exam:</strong> #{rescheduleTarget.exam_id} &bull; {rescheduleTarget.subject_code} - {rescheduleTarget.subject_name || rescheduleTarget.exam_name}</div>
                  <div><strong>Examination Type:</strong> {rescheduleTarget.exam_type}</div>
                  <div><strong>Academic Term:</strong> {rescheduleTarget.academic_year} &bull; Year {rescheduleTarget.study_year} ({rescheduleTarget.semester})</div>
                  <div><strong>Previous Date:</strong> {String(rescheduleTarget.exam_date).slice(0, 10)}</div>
                  <div style={{ color: "#b91c1c", marginTop: "4px" }}><strong>Cancellation Reason:</strong> "{rescheduleTarget.cancellation_reason || 'N/A'}"</div>
                </div>

                {rescheduleError && (
                  <div className="alert alert-danger" style={{ marginBottom: "14px" }}>
                    <span>⚠️</span>
                    <div>{rescheduleError}</div>
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: "14px" }}>
                  <label className="form-label" htmlFor="reschedule-date">
                    New Examination Date <span className="form-label-required">*</span>
                  </label>
                  <input
                    id="reschedule-date"
                    type="date"
                    className="form-control"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="reschedule-start">
                      New Start Time <span className="form-label-required">*</span>
                    </label>
                    <input
                      id="reschedule-start"
                      type="time"
                      className="form-control"
                      value={rescheduleStartTime}
                      onChange={(e) => setRescheduleStartTime(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="reschedule-end">
                      New End Time <span className="form-label-required">*</span>
                    </label>
                    <input
                      id="reschedule-end"
                      type="time"
                      className="form-control"
                      value={rescheduleEndTime}
                      onChange={(e) => setRescheduleEndTime(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="alert alert-info" style={{ fontSize: "12px", background: "#f0fdf4", borderColor: "#86efac", color: "#166534" }}>
                  <span>ℹ️</span>
                  <div>
                    <strong>Audit Linkage:</strong> A new Scheduled examination will be created with original course metadata, linked to #{rescheduleTarget.exam_id}. The original cancelled record will remain untouched.
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowRescheduleModal(false)}
                  disabled={rescheduling}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={rescheduling}
                >
                  {rescheduling ? "Scheduling..." : "Save Rescheduled Examination"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: PRE-FLIGHT EXAMINATION DELETION CONFIRMATION
         ========================================================= */}
      {/* =========================================================
          MODAL: COMPREHENSIVE EXAMINATION PERMANENT DELETION
         ========================================================= */}
      {showDeleteExamModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "680px", width: "95%" }}>
            <div className="modal-header" style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "24px" }}>⚠️</span>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, color: "var(--danger)" }}>
                    Permanent Examination Deletion: #{deleteExamCheck?.exam?.exam_id || ""}
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                    Review all associated examination records before confirming permanent irreversible deletion.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => {
                  setShowDeleteExamModal(false);
                  setDeleteExamCheck(null);
                  setDeleteConfirmText("");
                  setDeleteAcknowledge(false);
                }}
              >
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ padding: "20px 24px" }}>
              {loadingDeleteCheck ? (
                <div style={{ padding: "30px 0", textAlign: "center", color: "var(--text-muted)" }}>
                  <div style={{ fontSize: "24px", marginBottom: "8px" }}>⏳</div>
                  Checking database dependencies and institutional retention rules...
                </div>
              ) : deleteExamCheck ? (
                <div>
                  {/* Examination Summary Details Table */}
                  <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse", marginBottom: "16px" }}>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 8px", color: "var(--text-muted)", width: "190px" }}>Examination ID:</td>
                        <td style={{ padding: "6px 8px", fontWeight: 700 }}>#{deleteExamCheck.exam.exam_id}</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>Subject Name &amp; Code:</td>
                        <td style={{ padding: "6px 8px", fontWeight: 700 }}>
                          {deleteExamCheck.exam.subject_code} — {deleteExamCheck.exam.subject_name || deleteExamCheck.exam.exam_name}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>Examination Date &amp; Time:</td>
                        <td style={{ padding: "6px 8px", fontWeight: 600 }}>
                          📅 {deleteExamCheck.exam.exam_date} · ⏰ {deleteExamCheck.exam.start_time?.slice(0, 5)}–{deleteExamCheck.exam.end_time?.slice(0, 5)} ({deleteExamCheck.exam.session})
                        </td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>Examination Type:</td>
                        <td style={{ padding: "6px 8px" }}>
                          <span className="status-pill info">{deleteExamCheck.exam.exam_type}</span>
                        </td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>Academic Cohort:</td>
                        <td style={{ padding: "6px 8px" }}>
                          {deleteExamCheck.exam.academic_year} · Year {deleteExamCheck.exam.study_year} ({deleteExamCheck.exam.semester})
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>Completion Status:</td>
                        <td style={{ padding: "6px 8px" }}>
                          <span className={`status-pill ${deleteExamCheck.exam.status === "Completed" ? "active" : deleteExamCheck.exam.status === "Cancelled" ? "danger" : "warning"}`}>
                            {deleteExamCheck.exam.status}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Dependent Records Overview */}
                  <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid var(--border-color)", marginBottom: "16px" }}>
                    <div style={{ fontWeight: 700, fontSize: "12px", marginBottom: "10px", color: "var(--primary-navy)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Affected Records to be Purged:
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px", textAlign: "center" }}>
                      <div style={{ background: "#fff", padding: "10px 6px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--primary-navy)" }}>
                          {deleteExamCheck.dependencies.registrations}
                        </div>
                        <div style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "2px" }}>Registered Students</div>
                      </div>
                      <div style={{ background: "#fff", padding: "10px 6px", borderRadius: "8px", border: `1px solid ${deleteExamCheck.dependencies.seat_allocations > 0 ? "#fca5a5" : "#e2e8f0"}` }}>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: deleteExamCheck.dependencies.seat_allocations > 0 ? "var(--danger)" : "var(--success)" }}>
                          {deleteExamCheck.dependencies.seat_allocations}
                        </div>
                        <div style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "2px" }}>Allocated Seats</div>
                      </div>
                      <div style={{ background: "#fff", padding: "10px 6px", borderRadius: "8px", border: `1px solid ${deleteExamCheck.dependencies.invigilator_assignments > 0 ? "#fca5a5" : "#e2e8f0"}` }}>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: deleteExamCheck.dependencies.invigilator_assignments > 0 ? "var(--danger)" : "var(--success)" }}>
                          {deleteExamCheck.dependencies.invigilator_assignments}
                        </div>
                        <div style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "2px" }}>Invigilator Duties</div>
                      </div>
                      <div style={{ background: "#fff", padding: "10px 6px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--primary-navy)" }}>
                          {deleteExamCheck.dependencies.attendance_records ?? deleteExamCheck.dependencies.seat_allocations}
                        </div>
                        <div style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "2px" }}>Attendance Records</div>
                      </div>
                      <div style={{ background: "#fff", padding: "10px 6px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--primary-navy)" }}>
                          {deleteExamCheck.dependencies.associated_reports ?? 3}
                        </div>
                        <div style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "2px" }}>Associated Reports</div>
                      </div>
                    </div>
                  </div>

                  {/* Safety Guarantees Notice */}
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "12px 14px", marginBottom: "16px", fontSize: "12px", color: "#166534" }}>
                    <div style={{ fontWeight: 700, marginBottom: "4px" }}>🛡️ Institutional Data Protection Guarantee:</div>
                    <ul style={{ margin: 0, paddingLeft: "18px", lineHeight: "1.5" }}>
                      <li>Master student records (students database) will strictly remain untouched.</li>
                      <li>Master faculty profiles and department records will not be deleted.</li>
                      <li>Shared examination halls and classroom catalogues remain completely intact.</li>
                      <li>Other scheduled and conducted examinations are unaffected.</li>
                    </ul>
                  </div>

                  {/* Blocking Notice or Deletion Requirements */}
                  {!deleteExamCheck.can_delete ? (
                    <div className="alert alert-danger" style={{ marginBottom: "14px" }}>
                      <span>⛔</span>
                      <div>
                        <strong>Deletion Blocked:</strong>
                        <div style={{ marginTop: "3px", fontSize: "12.5px" }}>{deleteExamCheck.blocking_reason}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: "8px", padding: "14px", marginBottom: "14px" }}>
                      <div style={{ color: "#991b1b", fontWeight: 700, fontSize: "13px", marginBottom: "8px" }}>
                        ⚠️ Explicit Confirmation Required:
                      </div>

                      {/* Checkbox Acknowledgment */}
                      <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", fontSize: "13px", color: "#7f1d1d", marginBottom: "12px" }}>
                        <input
                          type="checkbox"
                          style={{ marginTop: "3px", width: "16px", height: "16px" }}
                          checked={deleteAcknowledge}
                          onChange={(e) => setDeleteAcknowledge(e.target.checked)}
                        />
                        <span>
                          I have reviewed all affected records above and acknowledge that <strong>permanent deletion cannot be undone</strong>.
                        </span>
                      </label>

                      {/* Typed Confirmation Input */}
                      <div style={{ fontSize: "12.5px", color: "#991b1b", marginBottom: "6px" }}>
                        To confirm deletion, please type the exact examination ID <strong>{deleteExamCheck.exam.exam_id}</strong> below:
                      </div>
                      <input
                        type="text"
                        className="form-control"
                        placeholder={`Type ${deleteExamCheck.exam.exam_id} to confirm`}
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        style={{ borderColor: deleteConfirmText.trim() === String(deleteExamCheck.exam.exam_id) ? "#16a34a" : "#fca5a5", fontWeight: 700 }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <p>Failed to load examination details.</p>
              )}
            </div>

            <div className="modal-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                {deleteExamCheck?.exam?.exam_id && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      handleArchiveExam(deleteExamCheck.exam.exam_id);
                      setShowDeleteExamModal(false);
                    }}
                    title="Safely archive this examination instead of permanent deletion."
                  >
                    📦 Archive Instead
                  </button>
                )}
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowDeleteExamModal(false);
                    setDeleteExamCheck(null);
                    setDeleteConfirmText("");
                    setDeleteAcknowledge(false);
                  }}
                  disabled={deletingExam}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleConfirmDeleteExam}
                  disabled={
                    deletingExam ||
                    !deleteExamCheck?.can_delete ||
                    !deleteAcknowledge ||
                    deleteConfirmText.trim() !== String(deleteExamCheck?.exam?.exam_id)
                  }
                >
                  {deletingExam ? "Deleting..." : "🗑️ Permanently Delete Examination"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: MANUAL EXAMINATION HALL SELECTION & CAPACITY VALIDATION
         ========================================================= */}
      {showHallConfigModal && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal-card" style={{ maxWidth: "880px", width: "95%" }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🏛️</span> Manual Examination Hall Selection
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "var(--text-muted)" }}>
                  Exam #{activeExam?.exam_id}: <strong>{activeExam?.subject_code} - {activeExam?.subject_name || activeExam?.exam_name}</strong>
                  {" • "}📅 {String(activeExam?.exam_date).slice(0, 10)} ({activeExam?.session || "FN"})
                </p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowHallConfigModal(false)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto", padding: "18px 24px" }}>
              {(() => {
                const reqStudents = examHallsData?.eligible_student_count || eligibleStudentsCount || 0;
                const allHalls = examHallsData?.halls || [];
                const selectedHalls = allHalls.filter((h) => modalSelectedHallIds.includes(h.hall_id));
                const totalCap = selectedHalls.reduce((acc, h) => acc + (h.capacity || 0), 0);
                const diff = totalCap - reqStudents;
                const isSufficient = totalCap >= reqStudents;

                return (
                  <div>
                    {/* Capacity Summary Dashboard */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                      gap: "12px",
                      marginBottom: "16px"
                    }}>
                      <div className="panel" style={{ padding: "12px 16px", margin: 0 }}>
                        <div style={{ fontSize: "11.5px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                          Candidates Requiring Seats
                        </div>
                        <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--primary-navy)", marginTop: "4px" }}>
                          👥 {reqStudents}
                        </div>
                      </div>

                      <div className="panel" style={{ padding: "12px 16px", margin: 0 }}>
                        <div style={{ fontSize: "11.5px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                          Selected Halls
                        </div>
                        <div style={{ fontSize: "22px", fontWeight: 800, color: "#2563eb", marginTop: "4px" }}>
                          🏛️ {modalSelectedHallIds.length} <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-muted)" }}>/ {allHalls.length}</span>
                        </div>
                      </div>

                      <div className="panel" style={{ padding: "12px 16px", margin: 0 }}>
                        <div style={{ fontSize: "11.5px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                          Combined Capacity
                        </div>
                        <div style={{ fontSize: "22px", fontWeight: 800, color: "#0891b2", marginTop: "4px" }}>
                          🪑 {totalCap} <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-muted)" }}>Seats</span>
                        </div>
                      </div>

                      <div
                        className="panel"
                        style={{
                          padding: "12px 16px",
                          margin: 0,
                          border: isSufficient ? "1.5px solid #10b981" : "1.5px solid #ef4444",
                          background: isSufficient ? "#ecfdf5" : "#fef2f2"
                        }}
                      >
                        <div style={{ fontSize: "11.5px", color: isSufficient ? "#065f46" : "#991b1b", textTransform: "uppercase", fontWeight: 700 }}>
                          Capacity Status
                        </div>
                        <div style={{ fontSize: "15px", fontWeight: 800, color: isSufficient ? "#047857" : "#b91c1c", marginTop: "6px" }}>
                          {isSufficient ? (
                            <span>✓ Sufficient (+{diff} surplus)</span>
                          ) : (
                            <span>⚠️ Deficit of {Math.abs(diff)} seats</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Insufficient Warning Alert Banner */}
                    {!isSufficient && (
                      <div className="alert alert-danger" style={{ marginBottom: "16px", fontSize: "13px", display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "20px" }}>⚠️</span>
                        <div>
                          <strong>Insufficient Hall Capacity:</strong> Selected halls accommodate <strong>{totalCap}</strong> candidates, but <strong>{reqStudents}</strong> candidates require seats.
                          Seat allocation will be blocked until sufficient halls are selected.
                        </div>
                      </div>
                    )}

                    {/* Search and Action Toolbar */}
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                      marginBottom: "14px"
                    }}>
                      <div style={{ flex: 1, minWidth: "220px" }}>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Search halls by name or room number..."
                          value={modalHallSearch}
                          onChange={(e) => setModalHallSearch(e.target.value)}
                          style={{ padding: "7px 12px", fontSize: "13px" }}
                        />
                      </div>

                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={handleModalSelectAll}
                        >
                          Select All Available
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={handleModalClearAll}
                        >
                          Clear Selection
                        </button>
                      </div>
                    </div>

                    {/* Halls Table */}
                    <div style={{ overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: "8px" }}>
                      <table className="workspace-data-table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th style={{ width: "40px", textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={
                                  allHalls.length > 0 &&
                                  allHalls.filter((h) => h.is_available).every((h) => modalSelectedHallIds.includes(h.hall_id))
                                }
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    handleModalSelectAll();
                                  } else {
                                    handleModalClearAll();
                                  }
                                }}
                              />
                            </th>
                            <th>Hall Name</th>
                            <th>Room No</th>
                            <th>Capacity</th>
                            <th>Grid Layout</th>
                            <th>Availability &amp; Booking Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allHalls
                            .filter((h) => {
                              if (!modalHallSearch) return true;
                              const q = modalHallSearch.toLowerCase();
                              return (
                                h.hall_name.toLowerCase().includes(q) ||
                                (h.room_no && h.room_no.toLowerCase().includes(q))
                              );
                            })
                            .map((h) => {
                              const isSelected = modalSelectedHallIds.includes(h.hall_id);
                              const isDisabled = !h.is_available && !isSelected;

                              return (
                                <tr
                                  key={h.hall_id}
                                  className={isSelected ? "selected-row" : ""}
                                  style={{
                                    opacity: isDisabled ? 0.6 : 1,
                                    cursor: isDisabled ? "not-allowed" : "pointer"
                                  }}
                                  onClick={(e) => {
                                    if (e.target.tagName !== "INPUT" && !isDisabled) {
                                      toggleModalHall(h.hall_id);
                                    }
                                  }}
                                >
                                  <td style={{ textAlign: "center" }}>
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      disabled={isDisabled}
                                      onChange={() => toggleModalHall(h.hall_id)}
                                    />
                                  </td>
                                  <td>
                                    <strong>{h.hall_name}</strong>
                                    {h.is_currently_allocated && (
                                      <span style={{ fontSize: "10.5px", background: "#dbeafe", color: "#1e40af", padding: "1px 6px", borderRadius: "4px", marginLeft: "6px" }}>
                                        Currently Used
                                      </span>
                                    )}
                                  </td>
                                  <td>{h.room_no || h.hall_name}</td>
                                  <td>
                                    <strong>{h.capacity}</strong> Seats
                                  </td>
                                  <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                                    {h.rows_count} rows × {h.columns_count} cols
                                  </td>
                                  <td>
                                    {h.conflict_reason ? (
                                      <span className="status-pill danger" title={h.conflict_reason}>
                                        ⚠️ {h.conflict_reason}
                                      </span>
                                    ) : !h.is_active ? (
                                      <span className="status-pill secondary">Inactive</span>
                                    ) : (
                                      <span className="status-pill success">✓ Available</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="modal-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Selected: <strong>{modalSelectedHallIds.length}</strong> Halls (
                {examHallsData?.halls
                  ?.filter((h) => modalSelectedHallIds.includes(h.hall_id))
                  .reduce((sum, h) => sum + (h.capacity || 0), 0) || 0} Seats)
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowHallConfigModal(false)}
                  disabled={savingHalls}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleSaveHallsConfig(false)}
                  disabled={savingHalls}
                >
                  {savingHalls ? "Saving..." : "Save Hall Selection"}
                </button>

                <button
                  type="button"
                  className="btn btn-success"
                  onClick={() => handleSaveHallsConfig(true)}
                  disabled={
                    savingHalls ||
                    (examHallsData?.halls
                      ?.filter((h) => modalSelectedHallIds.includes(h.hall_id))
                      .reduce((sum, h) => sum + (h.capacity || 0), 0) || 0) <
                      (examHallsData?.eligible_student_count || eligibleStudentsCount || 0)
                  }
                  title={
                    (examHallsData?.halls
                      ?.filter((h) => modalSelectedHallIds.includes(h.hall_id))
                      .reduce((sum, h) => sum + (h.capacity || 0), 0) || 0) <
                    (examHallsData?.eligible_student_count || eligibleStudentsCount || 0)
                      ? "Capacity is insufficient for candidates"
                      : "Save hall selection and immediately allocate seats"
                  }
                >
                  {savingHalls ? "Processing..." : "⚡ Save & Allocate Seats"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reassignment Modal */}
      <ReassignInvigilatorModal
        isOpen={Boolean(reassignModalTarget)}
        assignment={reassignModalTarget}
        onClose={() => setReassignModalTarget(null)}
        onSuccess={() => {
          setReassignModalTarget(null);
          loadPendingReassignments();
          if (selectedExamId) {
            loadAllocationsAndAssignments(selectedExamId);
          }
        }}
      />
    </div>
  );
}