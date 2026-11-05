import ReassignInvigilatorModal from "../components/ReassignInvigilatorModal";



import { useState, useEffect, useMemo } from "react";



import api from "../services/api";







const YEAR_SEMESTER_MAP = {



  "1st Year": ["Semester 1", "Semester 2"],



  "2nd Year": ["Semester 3", "Semester 4"],



  "3rd Year": ["Semester 5", "Semester 6"],



  "4th Year": ["Semester 7", "Semester 8"],



};







const ALL_SEMESTERS = [



  "Semester 1", "Semester 2",



  "Semester 3", "Semester 4",



  "Semester 5", "Semester 6",



  "Semester 7", "Semester 8",



];







const ACADEMIC_YEARS = [



  "2024-2025",



  "2025-2026",



  "2026-2027",



  "2027-2028",



  "2028-2029",



];







export default function FacultyData() {



  const [activeTab, setActiveTab] = useState("roster"); // 'roster' (Faculty Directory) | 'allocation' (Teaching Assignments)



  const [facultyList, setFacultyList] = useState([]);



  const [subjectsList, setSubjectsList] = useState([]);



  const [loading, setLoading] = useState(false);



  const [statusMessage, setStatusMessage] = useState({ type: "", text: "" });







  // Modal State (Add / Edit Faculty)



  const [isModalOpen, setIsModalOpen] = useState(false);



  const [editingFaculty, setEditingFaculty] = useState(null);



  const [saving, setSaving] = useState(false);







  // Form Fields (Faculty Directory)



  const [facultyName, setFacultyName] = useState("");



  const [designation, setDesignation] = useState("");



  const [department, setDepartment] = useState("CSE");



  const [email, setEmail] = useState("");



  const [isActive, setIsActive] = useState(true);







    // Modal 1: Import Faculty Directory State

  const [isUploadDirectoryModalOpen, setIsUploadDirectoryModalOpen] = useState(false);

  const [dirFile, setDirFile] = useState(null);

  const [dirUploading, setDirUploading] = useState(false);

  const [dirResult, setDirResult] = useState(null);

  const [dirError, setDirError] = useState("");

  const [isFacultyDetailModalOpen, setIsFacultyDetailModalOpen] = useState(false);

  const [facultyDetailTab, setFacultyDetailTab] = useState("matched"); // "matched" | "new"

  const [facultyDetailSearch, setFacultyDetailSearch] = useState("");



  // Modal 2: Import Semester Teaching Assignments State

  const [isUploadSemesterModalOpen, setIsUploadSemesterModalOpen] = useState(false);

  const [semFile, setSemFile] = useState(null);

  const [semUploading, setSemUploading] = useState(false);

  const [semResult, setSemResult] = useState(null);

  const [semError, setSemError] = useState("");

  const [semAcademicYear, setSemAcademicYear] = useState("2026-2027");

  const [semTargetSemester, setSemTargetSemester] = useState("");



  // Upload Modal State



  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);



  const [uploadFile, setUploadFile] = useState(null);



  const [uploading, setUploading] = useState(false);



  const [uploadResult, setUploadResult] = useState(null);



  const [uploadReplaceMode, setUploadReplaceMode] = useState(false);



  const [uploadReplaceConfirmed, setUploadReplaceConfirmed] = useState(false);



  const [uploadAcademicYear, setUploadAcademicYear] = useState("2026-2027");



  const [uploadSemester, setUploadSemester] = useState("");







  // Duties & Reassignment State



  const [dutiesList, setDutiesList] = useState([]);



  const [loadingDuties, setLoadingDuties] = useState(false);



  const [reassignModalOpen, setReassignModalOpen] = useState(false);



  const [reassignItem, setReassignItem] = useState(null);







  // Bulk selection & deletion state



  const [selectedFacultyIds, setSelectedFacultyIds] = useState([]);



  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);



  const [bulkPreflightData, setBulkPreflightData] = useState(null);



  const [checkingBulkPreflight, setCheckingBulkPreflight] = useState(false);



  const [bulkProcessing, setBulkProcessing] = useState(false);



  const [bulkModalError, setBulkModalError] = useState("");







  // Bulk Status Modal State (Activate / Deactivate)



  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);



  const [bulkStatusAction, setBulkStatusAction] = useState("activate"); // 'activate' | 'deactivate'



  const [bulkStatusTargetFaculty, setBulkStatusTargetFaculty] = useState([]);



  const [bulkStatusProcessing, setBulkStatusProcessing] = useState(false);



  const [bulkStatusError, setBulkStatusError] = useState("");







  // Upload Preview & Auto-Match State



  const [previewLoading, setPreviewLoading] = useState(false);



  const [uploadPreviewData, setUploadPreviewData] = useState(null);



  const [previewTab, setPreviewTab] = useState("matched"); // 'matched' | 'unmatched' | 'faculty'



  const [unmatchedUserMappings, setUnmatchedUserMappings] = useState({}); // { [tempId]: selectedSubjectId }



  const [importingMappings, setImportingMappings] = useState(false);







  // =========================================================================



  // SECTION 2: TEACHING SUBJECT MAPPING STATE



  // =========================================================================



  const [filterAcademicYear, setFilterAcademicYear] = useState("ALL");



  const [filterStudyYear, setFilterStudyYear] = useState("ALL");



  const [filterSemester, setFilterSemester] = useState("ALL");



  const [allocationView, setAllocationView] = useState("faculty"); // 'faculty' | 'subject'



  const [allocationsData, setAllocationsData] = useState({ allocations: [], faculty_summary: [], subject_summary: [] });



  const [loadingAllocations, setLoadingAllocations] = useState(false);

  // Bulk Selection and Advanced Filtering for Teaching Mappings
  const [selectedMappingIds, setSelectedMappingIds] = useState([]);
  const [showBulkDeleteMappingModal, setShowBulkDeleteMappingModal] = useState(false);
  const [bulkDeletingMappings, setBulkDeletingMappings] = useState(false);
  const [filterFacultyText, setFilterFacultyText] = useState("");
  const [filterSubjectCode, setFilterSubjectCode] = useState("ALL");
  const [filterSection, setFilterSection] = useState("ALL");







  // Modal: Map Faculty to Subject



  const [isAllocModalOpen, setIsAllocModalOpen] = useState(false);



  const [allocFacultyId, setAllocFacultyId] = useState("");



  const [modalAcademicYear, setModalAcademicYear] = useState("2026-2027");



  const [modalStudyYear, setModalStudyYear] = useState("3rd Year");



  const [modalSemester, setModalSemester] = useState("Semester 5");



  const [allocSubjectIds, setAllocSubjectIds] = useState([]);



  const [subjectSearchFilter, setSubjectSearchFilter] = useState("");



  const [savingAlloc, setSavingAlloc] = useState(false);







  useEffect(() => {



    loadFaculty();



    loadAllDuties();



    loadSubjects();



  }, []);







  useEffect(() => {



    if (activeTab === "allocation") {



      loadAllocations();



    }



  }, [activeTab, filterAcademicYear, filterStudyYear, filterSemester]);







  async function loadSubjects() {



    try {



      const res = await api.getSubjects();



      setSubjectsList(Array.isArray(res.subjects) ? res.subjects : []);



    } catch (err) {



      console.warn("Could not load subject catalogue:", err);



    }



  }







  async function loadFaculty() {



    setLoading(true);



    try {



      const res = await api.getFaculty();



      setFacultyList(Array.isArray(res.faculty) ? res.faculty : []);



    } catch (err) {



      console.warn("Could not load faculty:", err);



      setStatusMessage({ type: "danger", text: "Failed to load faculty roster." });



    } finally {



      setLoading(false);



    }



  }







  async function loadAllDuties() {



    setLoadingDuties(true);



    try {



      const res = await api.getInvigilatorAssignments();



      setDutiesList(Array.isArray(res.assignments) ? res.assignments : []);



    } catch (err) {



      console.warn("Could not load invigilator duties:", err);



    } finally {



      setLoadingDuties(false);



    }



  }







  async function loadAllocations() {



    setLoadingAllocations(true);



    try {



      const params = {};



      if (filterAcademicYear && filterAcademicYear !== "ALL") params.academic_year = filterAcademicYear;



      if (filterStudyYear && filterStudyYear !== "ALL") params.study_year = filterStudyYear;



      if (filterSemester && filterSemester !== "ALL") params.semester = filterSemester;







      const res = await api.getFacultySubjectAllocations(params);



      setAllocationsData({



        allocations: res.allocations || [],



        faculty_summary: res.faculty_summary || [],



        subject_summary: res.subject_summary || [],



      });



    } catch (err) {



      console.warn("Failed to load subject allocations:", err);



    } finally {



      setLoadingAllocations(false);



    }



  }







  // =========================================================================



  // STUDY YEAR & SEMESTER DYNAMIC HANDLERS (FILTERS)



  // =========================================================================



  function handleFilterStudyYearChange(e) {



    const newYear = e.target.value;



    setFilterStudyYear(newYear);



    // Reset semester filter whenever study year changes



    setFilterSemester("ALL");



  }







  // Valid semester options for the filter bar



  const availableFilterSemesters = useMemo(() => {



    if (filterStudyYear === "ALL" || !filterStudyYear) {



      return ALL_SEMESTERS;



    }



    return YEAR_SEMESTER_MAP[filterStudyYear] || ALL_SEMESTERS;



  }, [filterStudyYear]);







  // Valid semester options for the modal



  const availableModalSemesters = useMemo(() => {



    return YEAR_SEMESTER_MAP[modalStudyYear] || ["Semester 1", "Semester 2"];



  }, [modalStudyYear]);







  // When study year changes in modal:



  function handleModalStudyYearChange(e) {



    const newYear = e.target.value;



    setModalStudyYear(newYear);



    // Clear previously selected semester and default to first valid semester of new year



    const validSems = YEAR_SEMESTER_MAP[newYear] || [];



    setModalSemester(validSems[0] || "");



  }







  // Filtered subject catalogue in modal



  const modalAvailableSubjects = useMemo(() => {



    let list = subjectsList;



    if (subjectSearchFilter.trim()) {



      const q = subjectSearchFilter.toLowerCase();



      list = list.filter(



        (s) =>



          (s.subject_code && s.subject_code.toLowerCase().includes(q)) ||



          (s.subject_name && s.subject_name.toLowerCase().includes(q))



      );



    }



    return list;



  }, [subjectsList, subjectSearchFilter]);







  // =========================================================================



  // FACULTY DIRECTORY CRUD



  // =========================================================================



  function openAddModal() {



    setEditingFaculty(null);



    setFacultyName("");



    setDesignation("");



    setDepartment("CSE");



    setEmail("");



    setIsActive(true);



    setIsModalOpen(true);



  }







  function openEditModal(fac) {



    setEditingFaculty(fac);



    setFacultyName(fac.faculty_name || "");



    setDesignation(fac.designation || "");



    setDepartment(fac.department || "CSE");



    setEmail(fac.email || "");



    setIsActive(fac.is_active === undefined || Number(fac.is_active) === 1);



    setIsModalOpen(true);



  }







  async function handleSubmit(e) {



    e.preventDefault();



    if (!facultyName.trim()) {



      alert("Faculty Name is required.");



      return;



    }







    setSaving(true);



    setStatusMessage({ type: "", text: "" });







    const payload = {



      faculty_name: facultyName.trim(),



      designation: designation.trim(),



      department: department.trim(),



      email: email.trim().toLowerCase(),



      is_active: isActive ? 1 : 0,



    };







    try {



      if (editingFaculty) {



        await api.updateFaculty(editingFaculty.faculty_id, payload);



        setStatusMessage({ type: "success", text: `Faculty member "${facultyName}" updated successfully.` });



      } else {



        await api.createFaculty(payload);



        setStatusMessage({ type: "success", text: `Faculty member "${facultyName}" added successfully.` });



      }



      setIsModalOpen(false);



      loadFaculty();



    } catch (err) {



      alert(err.message || "Failed to save faculty record.");



    } finally {



      setSaving(false);



    }



  }







  async function handleToggleStatus(fac) {



    const currentActive = fac.is_active === undefined || Number(fac.is_active) === 1;



    const newStatus = !currentActive;







    try {



      await api.updateFaculty(fac.faculty_id, {



        faculty_name: fac.faculty_name,



        designation: fac.designation,



        department: fac.department,



        email: fac.email,



        is_active: newStatus ? 1 : 0,



      });



      setStatusMessage({



        type: "success",



        text: `Status for ${fac.faculty_name} changed to ${newStatus ? "Active" : "Inactive"}.`,



      });



      loadFaculty();



    } catch (err) {



      alert(err.message || "Failed to update faculty status.");



    }



  }







  async function handleDeleteFaculty(fac) {



    const confirmMsg =



      `Are you sure you want to permanently delete faculty member "${fac.faculty_name}"?\n\n` +



      `• Historical examination duty records and attendance sheets will be permanently preserved with an indelible identity snapshot.\n` +



      `• Any linked institutional login account will be safely unlinked and deactivated without deleting user credentials.\n` +



      `• The faculty master record will be permanently deleted from the active Faculty Directory.\n\n` +



      `Click OK to confirm permanent deletion.`;



    if (!window.confirm(confirmMsg)) {



      return;



    }







    try {



      const res = await api.deleteFaculty(fac.faculty_id);



      const histNote = res?.preserved_records_count ? ` (${res.preserved_records_count} historical duty records preserved)` : "";



      setStatusMessage({



        type: "success",



        text: `Faculty member "${fac.faculty_name}" permanently deleted successfully${histNote}.`



      });



      loadFaculty();



    } catch (err) {



      alert(err.message || "Failed to delete faculty member.");



    }



  }







  // =========================================================================



  // BULK SELECTION & DELETION



  // =========================================================================



  function toggleSelectAllFaculty(e) {



    if (e.target.checked) {



      setSelectedFacultyIds(facultyList.map((f) => f.faculty_id));



    } else {



      setSelectedFacultyIds([]);



    }



  }







  function toggleSelectFaculty(facId) {



    setSelectedFacultyIds((prev) =>



      prev.includes(facId) ? prev.filter((id) => id !== facId) : [...prev, facId]



    );



  }







  // Breakdown of selected faculty by active status



  const selectedFacultyObjects = useMemo(() => {



    const set = new Set(selectedFacultyIds);



    return facultyList.filter((f) => set.has(f.faculty_id));



  }, [facultyList, selectedFacultyIds]);







  const selectedActiveFaculty = useMemo(() => {



    return selectedFacultyObjects.filter(



      (f) => f.is_active === 1 || f.is_active === true || f.is_active === undefined



    );



  }, [selectedFacultyObjects]);







  const selectedInactiveFaculty = useMemo(() => {



    return selectedFacultyObjects.filter(



      (f) => f.is_active === 0 || f.is_active === false



    );



  }, [selectedFacultyObjects]);







  function openBulkStatusModal(action) {



    const targets = action === "activate" ? selectedInactiveFaculty : selectedActiveFaculty;



    if (targets.length === 0) return;



    setBulkStatusAction(action);



    setBulkStatusTargetFaculty(targets);



    setBulkStatusError("");



    setShowBulkStatusModal(true);



  }







  async function handleExecuteBulkStatus() {



    if (bulkStatusTargetFaculty.length === 0) return;



    setBulkStatusProcessing(true);



    setBulkStatusError("");







    const idsToUpdate = bulkStatusTargetFaculty.map((f) => f.faculty_id);



    try {



      const res = await api.bulkUpdateFacultyStatus({



        faculty_ids: idsToUpdate,



        action: bulkStatusAction,



      });







      setStatusMessage({



        type: "success",



        text: res.message || `Successfully ${bulkStatusAction}d ${idsToUpdate.length} faculty member(s).`,



      });







      const updatedSet = new Set(idsToUpdate);



      setSelectedFacultyIds((prev) => prev.filter((id) => !updatedSet.has(id)));







      setShowBulkStatusModal(false);



      setBulkStatusTargetFaculty([]);



      loadFaculty();



    } catch (err) {



      setBulkStatusError(err.message || `Failed to ${bulkStatusAction} faculty.`);



    } finally {



      setBulkStatusProcessing(false);



    }



  }







    const handleUpdateAllocationSemester = (tempId, newSemester) => {

    setUploadPreviewData((prev) => {

      if (!prev) return prev;



      const validate = (sy, sem) => {

        if (!sem) return { isValid: false, errType: "missing_semester", msg: "Semester information is missing. Please select a valid semester." };

        if (!sy) {

          const inferred = {

            "Semester 1": 1, "Semester 2": 1,

            "Semester 3": 2, "Semester 4": 2,

            "Semester 5": 3, "Semester 6": 3,

            "Semester 7": 4, "Semester 8": 4,

          }[sem] || null;

          return { isValid: true, errType: null, msg: null, inferredSy: inferred };

        }

        const validSems = {

          1: ["Semester 1", "Semester 2"],

          2: ["Semester 3", "Semester 4"],

          3: ["Semester 5", "Semester 6"],

          4: ["Semester 7", "Semester 8"],

        }[sy] || [];

        if (!validSems.includes(sem)) {

          return {

            isValid: false,

            errType: "year_semester_mismatch",

            msg: `Study Year ${sy} does not correspond with ${sem} (Expected ${validSems.join(" or ")}).`,

            inferredSy: sy

          };

        }

        return { isValid: true, errType: null, msg: null, inferredSy: sy };

      };



      const updateAlloc = (item) => {

        if (item.temp_id !== tempId) return item;

        let sy = item.study_year;

        if (!sy && newSemester) {

          sy = {

            "Semester 1": 1, "Semester 2": 1,

            "Semester 3": 2, "Semester 4": 2,

            "Semester 5": 3, "Semester 6": 3,

            "Semester 7": 4, "Semester 8": 4,

          }[newSemester] || null;

        }

        const v = validate(sy, newSemester);

        return {

          ...item,

          semester: newSemester || null,

          study_year: v.inferredSy || sy,

          is_valid: v.isValid,

          validation_error: v.msg,

          validation_error_type: v.errType,

        };

      };



      const updatedMatched = (prev.auto_matched || []).map(updateAlloc);

      const updatedUnmatched = (prev.unmatched || []).map(updateAlloc);



      const allAllocs = [...updatedMatched, ...updatedUnmatched];

      const groups = {};

      let totalErr = 0;

      const detectedSems = new Set();

      const semBreakdown = {};



      allAllocs.forEach((a) => {

        if (!a.is_valid) totalErr++;

        const sem = a.semester;

        const ay = a.academic_year || prev.summary?.academic_year || uploadAcademicYear;

        if (sem) {

          detectedSems.add(sem);

          semBreakdown[sem] = (semBreakdown[sem] || 0) + 1;

        } else {

          semBreakdown["Missing Semester"] = (semBreakdown["Missing Semester"] || 0) + 1;

        }



        const gKey = `${ay}__${sem || "unassigned"}`;

        if (!groups[gKey]) {

          groups[gKey] = {

            group_id: gKey,

            academic_year: ay,

            semester: sem,

            semester_label: sem || "⚠️ Missing Semester (Action Required)",

            study_year: a.study_year,

            study_year_name: a.study_year ? `Year ${a.study_year}` : "—",

            total_count: 0,

            auto_matched_count: 0,

            unmatched_count: 0,

            error_count: 0,

            faculty_names: new Set(),

            allocations: [],

          };

        }

        groups[gKey].total_count++;

        if (a.subject_id) groups[gKey].auto_matched_count++;

        else groups[gKey].unmatched_count++;

        if (!a.is_valid) groups[gKey].error_count++;

        groups[gKey].faculty_names.add(a.faculty_name);

        groups[gKey].allocations.push(a);

      });



      const sortedGroups = Object.values(groups)

        .map((g) => ({

          ...g,

          faculty_count: g.faculty_names.size,

          faculty_names: Array.from(g.faculty_names).sort(),

        }))

        .sort((a, b) => {

          const numA = parseInt((a.semester || "").replace(/\\D/g, ""), 10) || 99;

          const numB = parseInt((b.semester || "").replace(/\\D/g, ""), 10) || 99;

          return numA - numB;

        });



      return {

        ...prev,

        auto_matched: updatedMatched,

        unmatched: updatedUnmatched,

        grouped_by_semester: sortedGroups,

        summary: {

          ...prev.summary,

          error_count: totalErr,

          semesters_detected: Array.from(detectedSems).sort(),

          semester_breakdown: semBreakdown,

        },

      };

    });

  };





    // =========================================================================

  // UPLOAD WORKFLOW 1 & 2 HANDLERS

  // =========================================================================

  async function handleUploadDirectory(e) {

    if (e) e.preventDefault();

    if (!dirFile) {

      setDirError("Please select a master faculty file (.xlsx, .xls, .csv).");

      return;

    }

    setDirUploading(true);

    setDirError("");

    setDirResult(null);

    try {

      const res = await api.uploadFacultyDirectory(dirFile);

      setDirResult(res);

      setStatusMessage({

        type: "success",

        text: res.message || "Faculty Directory imported successfully.",

      });

      loadFaculty();

    } catch (err) {

      setDirError(err.message || "Failed to import Faculty Directory.");

    } finally {

      setDirUploading(false);

    }

  }



  async function handleUploadSemesterTeaching(e) {

    if (e) e.preventDefault();

    if (!semFile) {

      setSemError("Please select a semester teaching file (.xlsx, .xls, .csv).");

      return;

    }

    setSemUploading(true);

    setSemError("");

    setSemResult(null);

    try {

      const res = await api.uploadSemesterTeaching(semFile, semAcademicYear, semTargetSemester);

      setSemResult(res);

      setStatusMessage({

        type: "success",

        text: res.message || "Semester teaching assignments processed successfully.",

      });

      loadFaculty();

      loadSubjects();

      loadAllocations();

    } catch (err) {

      setSemError(err.message || "Failed to process semester teaching assignments.");

    } finally {

      setSemUploading(false);

    }

  }



  function handleDownloadExceptions(res) {

    if (!res) return;

    const rows = [

      ["Category", "Faculty Name", "Subject Code", "Subject Name", "Semester", "Section", "Reason"]

    ];



    (res.unmatched_faculty || []).forEach((item) => {

      rows.push([

        "Unmatched Faculty",

        `"${(item.faculty_name || "").replace(/"/g, '""')}"`,

        `"${(item.subject_code || "").replace(/"/g, '""')}"`,

        `"${(item.subject_name || "").replace(/"/g, '""')}"`,

        `"${(item.semester || "").replace(/"/g, '""')}"`,

        `"${(item.section || "").replace(/"/g, '""')}"`,

        `"${(item.reason || "Faculty not found in Faculty Directory").replace(/"/g, '""')}"`

      ]);

    });



    (res.unmatched_subjects || []).forEach((item) => {

      rows.push([

        "Unmatched Subject",

        `"${(item.faculty_name || "").replace(/"/g, '""')}"`,

        `"${(item.subject_code || "").replace(/"/g, '""')}"`,

        `"${(item.subject_name || "").replace(/"/g, '""')}"`,

        `"${(item.semester || "").replace(/"/g, '""')}"`,

        `"${(item.section || "").replace(/"/g, '""')}"`,

        `"${(item.reason || "Subject not found in Subject Catalogue").replace(/"/g, '""')}"`

      ]);

    });



    (res.invalid_rows || []).forEach((item) => {

      rows.push([

        "Invalid Row",

        `"${(item.faculty_name || "").replace(/"/g, '""')}"`,

        `"${(item.subject_code || "").replace(/"/g, '""')}"`,

        `"${(item.subject_name || "").replace(/"/g, '""')}"`,

        `"${(item.semester || "").replace(/"/g, '""')}"`,

        `"${(item.section || "").replace(/"/g, '""')}"`,

        `"${(item.reason || "Missing mandatory fields").replace(/"/g, '""')}"`

      ]);

    });



    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);

    const link = document.createElement("a");

    link.setAttribute("href", encodedUri);

    const semTag = (res.semester || semTargetSemester || "semester").replace(/[^a-zA-Z0-9_-]/g, "_");

    link.setAttribute("download", `teaching_assignment_exceptions_${semTag}.csv`);

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

  }



  async function handleGeneratePreview(fileToPreview = uploadFile) {



    if (!fileToPreview) {



      alert("Please select a valid CSV or Excel file (.xlsx, .xls) first.");



      return;



    }



    setPreviewLoading(true);



    setUploadResult(null);



    try {



      const res = await api.uploadFacultyPreview(fileToPreview, uploadAcademicYear, uploadSemester);



      setUploadPreviewData(res);



      setPreviewTab((res.grouped_by_semester && res.grouped_by_semester.length > 0) ? "grouped" : (res.auto_matched && res.auto_matched.length > 0 ? "matched" : "faculty"));



      setUnmatchedUserMappings({});



    } catch (err) {



      alert(err.message || "Failed to analyze workbook.");



    } finally {



      setPreviewLoading(false);



    }



  }







  async function handleConfirmImportWithMappings() {



    if (!uploadPreviewData) return;



    if (uploadReplaceMode && !uploadReplaceConfirmed) {



      alert("Please confirm the directory replacement acknowledgment checkbox before proceeding.");



      return;



    }



    if (uploadPreviewData.summary?.error_count > 0) {

      const proceed = window.confirm(

        `There are ${uploadPreviewData.summary.error_count} allocation(s) with missing semester or Year-Semester mismatch issues.\n\n` +

        `Would you like to proceed and import? (You can cancel and assign valid semesters in the preview table first).`

      );

      if (!proceed) {

        setPreviewTab('errors');

        return;

      }

    }









    setImportingMappings(true);



    try {



      const reviewed = [];



      if (uploadPreviewData.unmatched && uploadPreviewData.unmatched.length > 0) {



        uploadPreviewData.unmatched.forEach((u) => {



          const chosenSubId = unmatchedUserMappings[u.temp_id];



          if (chosenSubId && chosenSubId !== "SKIP") {



            reviewed.push({



              faculty_name: u.faculty_name,



              faculty_id: u.faculty_id,



              email: u.email,



              course_name: u.course_name,



              classification: u.classification,



              subject_id: parseInt(chosenSubId, 10),



              academic_year: u.academic_year || uploadAcademicYear,



              semester: u.semester || subjectsList.find((s) => String(s.subject_id) === String(chosenSubId))?.semester || uploadSemester,



              study_year: u.study_year,



            });



          }



        });



      }







      const payload = {



        faculty_records: uploadPreviewData.faculty_records || [],



        auto_matched: uploadPreviewData.auto_matched || [],



        reviewed_mappings: reviewed,



        replace_existing: uploadReplaceMode,



        academic_year: uploadAcademicYear,



        semester: uploadSemester,



      };







      const res = await api.bulkImportFacultyMappings(payload);



      setUploadResult(res);



      setStatusMessage({



        type: "success",



        text: res.message || "Faculty records and teaching mappings imported successfully.",



      });







      setUploadPreviewData(null);



      loadFaculty();



      loadAllocations();



    } catch (err) {



      alert(err.message || "Failed to complete import.");



    } finally {



      setImportingMappings(false);



    }



  }







  async function openBulkDeleteModal() {



    if (selectedFacultyIds.length === 0) return;



    setBulkModalError("");



    setCheckingBulkPreflight(true);



    setShowBulkDeleteModal(true);







    try {



      const res = await api.checkFacultyDeletion({ faculty_ids: selectedFacultyIds });



      setBulkPreflightData(res);



    } catch (err) {



      setBulkModalError(err.message || "Failed to inspect faculty dependencies.");



    } finally {



      setCheckingBulkPreflight(false);



    }



  }







  async function handleExecuteBulkFaculty(action = "delete", safeOnly = false, protectedOnly = false) {



    setBulkProcessing(true);



    setBulkModalError("");







    let idsToProcess = selectedFacultyIds;



    if (safeOnly) {



      idsToProcess = (bulkPreflightData?.safe_faculty_ids && bulkPreflightData.safe_faculty_ids.length > 0)



        ? bulkPreflightData.safe_faculty_ids



        : (bulkPreflightData?.safe_faculty || []).map((f) => f.faculty_id);



    } else if (protectedOnly) {



      idsToProcess = (bulkPreflightData?.blocked_faculty_ids && bulkPreflightData.blocked_faculty_ids.length > 0)



        ? bulkPreflightData.blocked_faculty_ids



        : (bulkPreflightData?.blocked_faculty || []).map((f) => f.faculty_id);



    }







    try {



      const res = await api.bulkDeleteFaculty({



        faculty_ids: idsToProcess,



        action: action,



        delete_safe_only: safeOnly,



        force_safe_only: safeOnly,



      });







      setStatusMessage({



        type: "success",



        text: res.message || `Successfully processed ${idsToProcess.length} faculty member(s).`,



      });







      setShowBulkDeleteModal(false);



      setBulkPreflightData(null);



      setSelectedFacultyIds([]);



      loadFaculty();



      loadAllocations();



    } catch (err) {



      setBulkModalError(err.message || "Operation failed.");



    } finally {



      setBulkProcessing(false);



    }



  }







  // =========================================================================



  // EXCEL / CSV ROSTER UPLOAD (MERGE & REPLACE WORKFLOWS)



  // =========================================================================



  async function handleUploadSubmit(e) {



    e.preventDefault();



    if (!uploadFile) {



      alert("Please select a valid CSV or Excel file (.xlsx, .xls).");



      return;



    }



    if (uploadReplaceMode && !uploadReplaceConfirmed) {



      alert("Please confirm the directory replacement acknowledgment checkbox before proceeding.");



      return;



    }



    if (uploadPreviewData.summary?.error_count > 0) {

      const proceed = window.confirm(

        `There are ${uploadPreviewData.summary.error_count} allocation(s) with missing semester or Year-Semester mismatch issues.\n\n` +

        `Would you like to proceed and import? (You can cancel and assign valid semesters in the preview table first).`

      );

      if (!proceed) {

        setPreviewTab('errors');

        return;

      }

    }









    setUploading(true);



    setUploadResult(null);







    try {



      const res = await api.uploadFaculty(



        uploadFile,



        uploadReplaceMode,



        uploadAcademicYear,



        uploadSemester



      );



      setUploadResult(res);



      setStatusMessage({



        type: "success",



        text: res.message || `Successfully processed faculty records (${res.newly_added || 0} added, ${res.matched_existing || 0} linked).`,



      });



      loadFaculty();



      loadAllocations();



    } catch (err) {



      setStatusMessage({ type: "danger", text: err.message || "Failed to upload faculty file." });



    } finally {



      setUploading(false);



    }



  }







  // =========================================================================



  // TEACHING SUBJECT ALLOCATION HANDLERS



  // =========================================================================



  function openAllocationModal(preselectedFacultyId = "") {



    setAllocFacultyId(preselectedFacultyId ? String(preselectedFacultyId) : "");



    setAllocSubjectIds([]);



    setSubjectSearchFilter("");



    setModalAcademicYear(filterAcademicYear !== "ALL" ? filterAcademicYear : "2026-2027");



    const currentSy = filterStudyYear !== "ALL" ? filterStudyYear : "3rd Year";



    setModalStudyYear(currentSy);



    const validSems = YEAR_SEMESTER_MAP[currentSy] || ["Semester 5", "Semester 6"];



    setModalSemester(validSems[0] || "Semester 5");



    setIsAllocModalOpen(true);



  }







  async function handleSaveAllocation(e) {



    e.preventDefault();



    if (!allocFacultyId) {



      alert("Please select a faculty member.");



      return;



    }



    if (allocSubjectIds.length === 0) {



      alert("Please select at least one course/subject.");



      return;



    }



    if (!modalSemester) {



      alert("Please select a valid semester before proceeding.");



      return;



    }







    setSavingAlloc(true);



    try {



      const res = await api.saveFacultySubjectAllocations({



        faculty_id: parseInt(allocFacultyId, 10),



        subject_ids: allocSubjectIds.map((id) => parseInt(id, 10)),



        academic_year: modalAcademicYear,



        study_year: modalStudyYear,



        semester: modalSemester,



      });



      setStatusMessage({ type: "success", text: res.message });



      setIsAllocModalOpen(false);



      loadAllocations();



    } catch (err) {



      alert(err.message || "Failed to save teaching allocation.");



    } finally {



      setSavingAlloc(false);



    }



  }







  async function handleRemoveAllocation(allocationId, courseName, facultyName) {



    if (!window.confirm(`Remove teaching assignment of "${courseName}" for ${facultyName}?`)) return;



    try {



      const res = await api.deleteFacultySubjectAllocation(allocationId);



      setStatusMessage({ type: "success", text: res.message });



      loadAllocations();



    } catch (err) {



      alert(err.message || "Failed to remove teaching assignment.");



    }



  }

  // =========================================================================
  // TEACHING MAPPINGS BULK SELECTION, FILTERING & AUDITED DELETION
  // =========================================================================
  const availableAllocationSubjects = useMemo(() => {
    const map = new Map();
    (allocationsData.allocations || []).forEach((a) => {
      if (a.subject_code && !map.has(a.subject_code)) {
        map.set(a.subject_code, `${a.subject_code} - ${a.subject_name}`);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [allocationsData.allocations]);

  const availableAllocationSections = useMemo(() => {
    const s = new Set();
    (allocationsData.allocations || []).forEach((a) => {
      if (a.section) s.add(String(a.section).trim().toUpperCase());
    });
    return Array.from(s).sort();
  }, [allocationsData.allocations]);

  const filteredFacultySummary = useMemo(() => {
    const qFac = filterFacultyText.trim().toLowerCase();
    return (allocationsData.faculty_summary || [])
      .map((fac) => {
        const matchesFac =
          !qFac ||
          (fac.faculty_name && fac.faculty_name.toLowerCase().includes(qFac)) ||
          (fac.email && fac.email.toLowerCase().includes(qFac)) ||
          (fac.faculty_id && String(fac.faculty_id).toLowerCase().includes(qFac));

        const subjects = (fac.subjects || []).filter((sub) => {
          if (filterSubjectCode !== "ALL" && sub.subject_code !== filterSubjectCode) return false;
          if (filterSection !== "ALL") {
            const sec = (sub.section || "").trim().toUpperCase();
            if (sec !== filterSection.toUpperCase()) return false;
          }
          return true;
        });

        if (subjects.length === 0) return null;
        if (qFac && !matchesFac && subjects.length === 0) return null;

        return { ...fac, subjects };
      })
      .filter(Boolean);
  }, [allocationsData.faculty_summary, filterFacultyText, filterSubjectCode, filterSection]);

  const filteredSubjectSummary = useMemo(() => {
    const qFac = filterFacultyText.trim().toLowerCase();
    return (allocationsData.subject_summary || [])
      .map((sub) => {
        if (filterSubjectCode !== "ALL" && sub.subject_code !== filterSubjectCode) return null;

        const facultyList = (sub.faculty || []).filter((f) => {
          if (filterSection !== "ALL") {
            const sec = (f.section || "").trim().toUpperCase();
            if (sec !== filterSection.toUpperCase()) return false;
          }
          if (qFac) {
            const matchesFac =
              (f.faculty_name && f.faculty_name.toLowerCase().includes(qFac)) ||
              (f.email && f.email.toLowerCase().includes(qFac)) ||
              (f.faculty_id && String(f.faculty_id).toLowerCase().includes(qFac));
            if (!matchesFac) return false;
          }
          return true;
        });

        if (facultyList.length === 0) return null;
        return { ...sub, faculty: facultyList };
      })
      .filter(Boolean);
  }, [allocationsData.subject_summary, filterFacultyText, filterSubjectCode, filterSection]);

  const displayedMappingIds = useMemo(() => {
    const ids = [];
    if (allocationView === "faculty") {
      filteredFacultySummary.forEach((fac) => {
        (fac.subjects || []).forEach((sub) => {
          if (sub.allocation_id) ids.push(sub.allocation_id);
        });
      });
    } else {
      filteredSubjectSummary.forEach((sub) => {
        (sub.faculty || []).forEach((f) => {
          if (f.allocation_id) ids.push(f.allocation_id);
        });
      });
    }
    return Array.from(new Set(ids));
  }, [allocationView, filteredFacultySummary, filteredSubjectSummary]);

  const isAllDisplayedSelected =
    displayedMappingIds.length > 0 &&
    displayedMappingIds.every((id) => selectedMappingIds.includes(id));

  const handleToggleSelectAll = () => {
    if (isAllDisplayedSelected) {
      setSelectedMappingIds((prev) => prev.filter((id) => !displayedMappingIds.includes(id)));
    } else {
      setSelectedMappingIds((prev) => Array.from(new Set([...prev, ...displayedMappingIds])));
    }
  };

  const toggleMappingSelection = (allocationId) => {
    setSelectedMappingIds((prev) =>
      prev.includes(allocationId) ? prev.filter((id) => id !== allocationId) : [...prev, allocationId]
    );
  };

  const selectedMappingsDetails = useMemo(() => {
    const map = new Map();
    (allocationsData.allocations || []).forEach((a) => {
      map.set(a.id, a);
    });
    (allocationsData.faculty_summary || []).forEach((fac) => {
      (fac.subjects || []).forEach((sub) => {
        if (!map.has(sub.allocation_id)) {
          map.set(sub.allocation_id, {
            id: sub.allocation_id,
            faculty_id: fac.faculty_id,
            faculty_name: fac.faculty_name,
            email: fac.email,
            department: fac.department,
            designation: fac.designation,
            subject_id: sub.subject_id,
            subject_code: sub.subject_code,
            subject_name: sub.subject_name,
            academic_year: sub.academic_year,
            study_year: sub.study_year,
            semester: sub.semester,
            section: sub.section,
          });
        }
      });
    });
    return selectedMappingIds.map((id) => map.get(id)).filter(Boolean);
  }, [selectedMappingIds, allocationsData]);

  const handleConfirmBulkDelete = async () => {
    if (selectedMappingIds.length === 0) return;
    setBulkDeletingMappings(true);
    try {
      const res = await api.bulkDeleteFacultySubjectAllocations(selectedMappingIds);
      setStatusMessage({
        type: "success",
        text: `Bulk Deletion Complete: ${res.deleted_count || selectedMappingIds.length} teaching assignment mapping(s) successfully deleted and archived.`,
      });
      setShowBulkDeleteMappingModal(false);
      setSelectedMappingIds([]);
      await loadAllocations();
    } catch (err) {
      alert(err.message || "Failed to bulk delete teaching assignment mappings.");
    } finally {
      setBulkDeletingMappings(false);
    }
  };









  return (



    <div className="page-container">



      {/* Page Header */}



      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>



        <div>



          <h1 className="page-title">Faculty Management &amp; Teaching Assignments</h1>



          <p className="page-subtitle">



            Manage institutional faculty records and semester teaching subject allocations. The invigilator assignment engine strictly prevents faculty from supervising examinations for subjects they teach.



          </p>



        </div>







        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>



          <button

            type="button"

            className="btn btn-secondary"

            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}

            onClick={() => {

              setDirFile(null);

              setDirResult(null);

              setDirError("");

              setIsUploadDirectoryModalOpen(true);

            }}

          >

            📁 Import Faculty Directory

          </button>

          <button

            type="button"

            className="btn btn-secondary"

            style={{ display: "inline-flex", alignItems: "center", gap: "6px", borderColor: "#3b82f6", color: "#1d4ed8", background: "#eff6ff" }}

            onClick={() => {

              setSemFile(null);

              setSemResult(null);

              setSemError("");

              setIsUploadSemesterModalOpen(true);

            }}

          >

            📚 Import Semester Teaching Assignments

          </button>



          <button



            type="button"



            className="btn btn-navy"



            onClick={openAddModal}



          >



            ➕ Add Faculty Member



          </button>



        </div>



      </div>







      {/* Global Status Banner */}



      {statusMessage.text && (



        <div



          className={`alert alert-${statusMessage.type}`}



          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}



        >



          <span>{statusMessage.text}</span>



          <button



            type="button"



            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px" }}



            onClick={() => setStatusMessage({ type: "", text: "" })}



          >



            ✕



          </button>



        </div>



      )}







      {/* TWO PRIMARY TABS */}



      <div



        className="tab-navigation"



        style={{



          display: "flex",



          gap: "8px",



          borderBottom: "2px solid #e2e8f0",



          marginBottom: "20px",



        }}



      >



        <button



          type="button"



          className="tab-btn"



          onClick={() => setActiveTab("roster")}



          style={{



            padding: "10px 20px",



            fontSize: "14px",



            fontWeight: 700,



            cursor: "pointer",



            background: "none",



            border: "none",



            borderBottom: activeTab === "roster" ? "3px solid var(--primary-navy)" : "3px solid transparent",



            color: activeTab === "roster" ? "var(--primary-navy)" : "var(--text-muted)",



          }}



        >



          👥 Faculty Directory



        </button>







        <button



          type="button"



          className="tab-btn"



          onClick={() => setActiveTab("allocation")}



          style={{



            padding: "10px 20px",



            fontSize: "14px",



            fontWeight: 700,



            cursor: "pointer",



            background: "none",



            border: "none",



            borderBottom: activeTab === "allocation" ? "3px solid var(--primary-navy)" : "3px solid transparent",



            color: activeTab === "allocation" ? "var(--primary-navy)" : "var(--text-muted)",



          }}



        >



          📚 Teaching Assignments



        </button>



      </div>







      {/* =========================================================================



          SECTION 1: FACULTY DIRECTORY



         ========================================================================= */}



      {activeTab === "roster" && (



        <section className="panel">



          <div className="panel-header">



            <div>



              <h2 className="panel-title">Institutional Faculty Directory (CSE)</h2>



              <p className="panel-subtitle">



                Master list of faculty members, official designations, institutional email addresses, and invigilation eligibility.



              </p>



            </div>



          </div>







          {selectedFacultyIds.length > 0 && (



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



                  {selectedFacultyIds.length} Selected



                </span>



                <span style={{ fontSize: "13px", color: "var(--primary-navy)", fontWeight: 600 }}>



                  {selectedActiveFaculty.length > 0 && (



                    <span style={{ color: "#166534", marginRight: "8px" }}>



                      🟢 {selectedActiveFaculty.length} Active



                    </span>



                  )}



                  {selectedActiveFaculty.length > 0 && selectedInactiveFaculty.length > 0 && " · "}



                  {selectedInactiveFaculty.length > 0 && (



                    <span style={{ color: "#92400e" }}>



                      ⏸️ {selectedInactiveFaculty.length} Inactive



                    </span>



                  )}



                </span>



              </div>



              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>



                <button



                  type="button"



                  className="btn btn-secondary btn-sm"



                  onClick={() => setSelectedFacultyIds([])}



                >



                  Clear Selection



                </button>



                {selectedInactiveFaculty.length > 0 && (



                  <button



                    type="button"



                    className="btn btn-sm"



                    style={{ background: "#16a34a", color: "#ffffff", borderColor: "#15803d", fontWeight: 600 }}



                    onClick={() => openBulkStatusModal("activate")}



                  >



                    ✅ Activate Selected ({selectedInactiveFaculty.length})



                  </button>



                )}



                {selectedActiveFaculty.length > 0 && (



                  <button



                    type="button"



                    className="btn btn-sm"



                    style={{ background: "#d97706", color: "#ffffff", borderColor: "#b45309", fontWeight: 600 }}



                    onClick={() => openBulkStatusModal("deactivate")}



                  >



                    ⏸️ Deactivate Selected ({selectedActiveFaculty.length})



                  </button>



                )}



                <button



                  type="button"



                  className="btn btn-danger btn-sm"



                  onClick={openBulkDeleteModal}



                >



                  🗑️ Delete / Deactivate Selected



                </button>



              </div>



            </div>



          )}







          {loading ? (



            <p className="form-helper" style={{ padding: "16px 0" }}>Loading faculty data...</p>



          ) : facultyList.length === 0 ? (



            <p className="form-helper" style={{ padding: "16px 0" }}>No faculty records found. Import the CSE Faculty Excel/CSV workbook or click &quot;Add Faculty Member&quot;.</p>



          ) : (



            <div className="table-wrapper">



              <table>



                <thead>



                  <tr>



                    <th style={{ width: "36px", textAlign: "center" }}>



                      <input



                        type="checkbox"



                        aria-label="Select All Faculty"



                        checked={selectedFacultyIds.length > 0 && selectedFacultyIds.length === facultyList.length}



                        onChange={toggleSelectAllFaculty}



                        style={{ cursor: "pointer" }}



                      />



                    </th>



                    <th style={{ width: "40px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isAllDisplayedSelected}
                        onChange={handleToggleSelectAll}
                        title={isAllDisplayedSelected ? "Deselect all displayed mappings" : "Select all displayed mappings"}
                        style={{ cursor: "pointer", accentColor: "var(--primary-navy)" }}
                      />
                    </th>
                    <th>#</th>



                    <th>Faculty Name &amp; Designation</th>



                    <th>Department</th>



                    <th>Institutional Email</th>



                    <th>Supervision Duties</th>



                    <th>Status</th>



                    <th style={{ textAlign: "right" }}>Actions</th>



                  </tr>



                </thead>



                <tbody>



                  {facultyList.map((fac, idx) => {



                    const active = fac.is_active === undefined || Number(fac.is_active) === 1;



                    const duties = fac.total_duties || fac.duties_count || 0;



                    const isSelected = selectedFacultyIds.includes(fac.faculty_id);







                    return (



                      <tr



                        key={fac.faculty_id}



                        style={{ backgroundColor: isSelected ? "#eff6ff" : "inherit" }}



                      >



                        <td style={{ textAlign: "center" }}>



                          <input



                            type="checkbox"



                            aria-label={`Select ${fac.faculty_name}`}



                            checked={isSelected}



                            onChange={() => toggleSelectFaculty(fac.faculty_id)}



                            style={{ cursor: "pointer" }}



                          />



                        </td>



                        <td>{idx + 1}</td>



                        <td>



                          <strong style={{ fontSize: "14px", color: "var(--primary-navy)" }}>



                            {fac.faculty_name}



                          </strong>



                          {fac.designation && (



                            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>



                              {fac.designation}



                            </div>



                          )}



                        </td>



                        <td>



                          <span className="badge-cse">{fac.department || "CSE"}</span>



                        </td>



                        <td>



                          <span className="form-helper" style={{ wordBreak: "break-all" }}>{fac.email || "—"}</span>



                        </td>



                        <td>



                          <strong style={{ color: "var(--accent-blue)" }}>{duties} Duties</strong>



                        </td>



                        <td>



                          <span className={`status-pill ${active ? "active" : "inactive"}`}>



                            {active ? "● Available" : "○ Inactive"}



                          </span>



                        </td>



                        <td style={{ textAlign: "right" }}>



                          <div style={{ display: "inline-flex", gap: "6px" }}>



                            <button



                              type="button"



                              className="btn btn-secondary btn-sm"



                              onClick={() => openEditModal(fac)}



                            >



                              ✏️ Edit



                            </button>



                            <button



                              type="button"



                              className="btn btn-secondary btn-sm"



                              onClick={() => handleToggleStatus(fac)}



                              style={{ color: active ? "var(--warning)" : "var(--success)" }}



                            >



                              {active ? "Deactivate" : "Activate"}



                            </button>



                            <button



                              type="button"



                              className="btn btn-secondary btn-sm"



                              onClick={() => handleDeleteFaculty(fac)}



                              style={{ color: "var(--danger)", borderColor: "#fecaca" }}



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



      )}







      {/* =========================================================================



          SECTION 2: TEACHING SUBJECT MAPPING



         ========================================================================= */}



      {activeTab === "allocation" && (



        <section className="panel">



          <div className="panel-header" style={{ flexWrap: "wrap", gap: "12px" }}>



            <div>



              <h2 className="panel-title">Teaching Assignments &amp; Invigilator Exclusion Rules</h2>



              <p className="panel-subtitle">



                Map faculty members to the subjects they teach across Academic Years, Study Years (1st&ndash;4th Year), and Semesters (1&ndash;8). Faculty are strictly excluded from supervising examinations for courses they teach in that specific academic year and semester.



              </p>



            </div>







            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>



              <button



                type="button"



                className="btn btn-navy"



                onClick={() => openAllocationModal()}



              >



                ➕ Map Faculty to Subject



              </button>



            </div>



          </div>







          {/* Dynamic Filter Controls */}



          <div
            className="card"
            style={{
              background: "#f8fafc",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              padding: "14px 18px",
              marginBottom: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {/* Top Row: Primary Cohort & Search Filters */}
            <div style={{ display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap" }}>
              {/* Academic Year Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--primary-navy)" }}>Academic Year:</span>
                <select
                  className="form-control"
                  style={{ width: "auto", padding: "4px 10px", fontSize: "13px" }}
                  value={filterAcademicYear}
                  onChange={(e) => setFilterAcademicYear(e.target.value)}
                >
                  <option value="ALL">All Academic Years</option>
                  {ACADEMIC_YEARS.map((ay) => (
                    <option key={ay} value={ay}>{ay}</option>
                  ))}
                </select>
              </div>

              {/* Study Year Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--primary-navy)" }}>Study Year:</span>
                <select
                  className="form-control"
                  style={{ width: "auto", padding: "4px 10px", fontSize: "13px" }}
                  value={filterStudyYear}
                  onChange={handleFilterStudyYearChange}
                >
                  <option value="ALL">All Study Years</option>
                  <option value="1st Year">1st Year (Sem 1 &amp; 2)</option>
                  <option value="2nd Year">2nd Year (Sem 3 &amp; 4)</option>
                  <option value="3rd Year">3rd Year (Sem 5 &amp; 6)</option>
                  <option value="4th Year">4th Year (Sem 7 &amp; 8)</option>
                </select>
              </div>

              {/* Dynamic Semester Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--primary-navy)" }}>Semester:</span>
                <select
                  className="form-control"
                  style={{ width: "auto", padding: "4px 10px", fontSize: "13px" }}
                  value={filterSemester}
                  onChange={(e) => setFilterSemester(e.target.value)}
                >
                  <option value="ALL">All Semesters</option>
                  {availableFilterSemesters.map((sem) => (
                    <option key={sem} value={sem}>{sem}</option>
                  ))}
                </select>
              </div>

              {/* Faculty Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--primary-navy)" }}>Faculty:</span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Filter by name / email..."
                  value={filterFacultyText}
                  onChange={(e) => setFilterFacultyText(e.target.value)}
                  style={{ width: "180px", padding: "4px 8px", fontSize: "12.5px" }}
                />
              </div>

              {/* Subject Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--primary-navy)" }}>Subject:</span>
                <select
                  className="form-control"
                  style={{ width: "auto", maxWidth: "210px", padding: "4px 8px", fontSize: "12.5px" }}
                  value={filterSubjectCode}
                  onChange={(e) => setFilterSubjectCode(e.target.value)}
                >
                  <option value="ALL">All Subjects</option>
                  {availableAllocationSubjects.map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Second Row: Section Filter and View Switcher side-by-side */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              {/* Section Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--primary-navy)" }}>Section:</span>
                <select
                  className="form-control"
                  style={{ width: "auto", minWidth: "120px", padding: "4px 8px", fontSize: "12.5px" }}
                  value={filterSection}
                  onChange={(e) => setFilterSection(e.target.value)}
                >
                  <option value="ALL">All Sections</option>
                  {availableAllocationSections.map((sec) => (
                    <option key={sec} value={sec}>Section {sec}</option>
                  ))}
                </select>
              </div>

              {/* View Switcher: Positioned to the right of Section */}
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  className={`btn btn-sm ${allocationView === "faculty" ? "btn-navy" : "btn-secondary"}`}
                  style={{ padding: "5px 14px", fontSize: "12.5px", fontWeight: 600 }}
                  onClick={() => setAllocationView("faculty")}
                >
                  👨‍🏫 Faculty-Wise View
                </button>

                <button
                  type="button"
                  className={`btn btn-sm ${allocationView === "subject" ? "btn-navy" : "btn-secondary"}`}
                  style={{ padding: "5px 14px", fontSize: "12.5px", fontWeight: 600 }}
                  onClick={() => setAllocationView("subject")}
                >
                  📖 Subject-Wise View
                </button>
              </div>
            </div>
          </div>

          {/* Bulk Action Toolbar */}
          {selectedMappingIds.length > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 16px",
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: "8px",
                marginBottom: "14px",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "18px" }}>📌</span>
                <div>
                  <span style={{ fontWeight: 700, color: "var(--primary-navy)", fontSize: "13.5px" }}>
                    Selected: <span style={{ color: "#2563eb", fontSize: "14px" }}>{selectedMappingIds.length}</span> teaching mapping{selectedMappingIds.length !== 1 ? "s" : ""}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", marginLeft: "8px" }}>
                    ({displayedMappingIds.length} currently visible)
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: "4px 12px", fontSize: "12.5px" }}
                  onClick={() => setSelectedMappingIds([])}
                >
                  Clear Selection
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  style={{
                    padding: "4px 14px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  onClick={() => setShowBulkDeleteMappingModal(true)}
                >
                  <span>🗑️</span> Delete Selected ({selectedMappingIds.length})
                </button>
              </div>
            </div>
          )}

          {loadingAllocations ? (



            <p className="form-helper" style={{ padding: "16px 0" }}>Loading teaching assignments...</p>



          ) : allocationsData.allocations.length === 0 ? (



            <div



              style={{



                background: "#f8fafc",



                border: "1px dashed var(--border-color)",



                borderRadius: "8px",



                padding: "24px",



                textAlign: "center",



                color: "var(--text-muted)",



              }}



            >



              No teaching assignments found matching the current filters. Click <strong>➕ Map Faculty to Subject</strong> to create a new assignment.



            </div>



          ) : allocationView === "faculty" ? (



            /* Faculty-Wise View */



            <div className="table-wrapper">



              <table>



                <thead>



                  <tr>



                    <th>#</th>



                    <th>Faculty Member</th>



                    <th>Designation &amp; Department</th>



                    <th>Allocated Subject(s) &amp; Term</th>



                    <th style={{ textAlign: "right" }}>Actions</th>



                  </tr>



                </thead>



                <tbody>



                  {filteredFacultySummary.map((fac, idx) => (



                    <tr key={fac.faculty_id}>
                      <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                        <input
                          type="checkbox"
                          checked={
                            fac.subjects.length > 0 &&
                            fac.subjects.every((s) => selectedMappingIds.includes(s.allocation_id))
                          }
                          onChange={() => {
                            const facIds = fac.subjects.map((s) => s.allocation_id);
                            const allSelected = facIds.every((id) => selectedMappingIds.includes(id));
                            if (allSelected) {
                              setSelectedMappingIds((prev) => prev.filter((id) => !facIds.includes(id)));
                            } else {
                              setSelectedMappingIds((prev) => Array.from(new Set([...prev, ...facIds])));
                            }
                          }}
                          title={`Select all mappings for ${fac.faculty_name}`}
                          style={{ cursor: "pointer", accentColor: "var(--primary-navy)" }}
                        />
                      </td>
                      <td>{idx + 1}</td>



                      <td>



                        <strong style={{ color: "var(--primary-navy)", fontSize: "14px" }}>



                          {fac.faculty_name}



                        </strong>



                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{fac.email || "—"}</div>



                      </td>



                      <td>



                        <div>{fac.designation || "Faculty"}</div>



                        <span className="badge-cse" style={{ fontSize: "11px", marginTop: "2px" }}>{fac.department || "CSE"}</span>



                      </td>



                      <td>



                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>



                          {fac.subjects.map((sub) => (



                            <span



                              key={sub.allocation_id}



                              style={{



                                display: "inline-flex",



                                alignItems: "center",



                                gap: "6px",



                                background: "#eff6ff",



                                border: "1px solid #bfdbfe",



                                borderRadius: "6px",



                                padding: "4px 8px",



                                fontSize: "12px",



                                color: "#1e40af",



                              }}



                            >



                              <input
                                type="checkbox"
                                checked={selectedMappingIds.includes(sub.allocation_id)}
                                onChange={() => toggleMappingSelection(sub.allocation_id)}
                                style={{ cursor: "pointer", accentColor: "var(--primary-navy)", marginRight: "4px" }}
                                title={`Select ${sub.subject_code} mapping for ${fac.faculty_name}`}
                              />
                              <strong>{sub.subject_code}</strong>: {sub.subject_name}



                              <span style={{ fontSize: "11px", color: "#64748b", background: "#f1f5f9", padding: "1px 5px", borderRadius: "4px" }}>



                                {sub.academic_year || "2026-2027"} &bull; {sub.semester}{sub.section ? ` (${sub.section})` : ""}



                              </span>



                              <button



                                type="button"



                                style={{



                                  border: "none",



                                  background: "none",



                                  color: "#dc2626",



                                  cursor: "pointer",



                                  fontSize: "13px",



                                  lineHeight: 1,



                                  padding: 0,



                                }}



                                title="Remove teaching assignment"



                                onClick={() => handleRemoveAllocation(sub.allocation_id, sub.subject_code, fac.faculty_name)}



                              >



                                ✕



                              </button>



                            </span>



                          ))}



                        </div>



                      </td>



                      <td style={{ textAlign: "right" }}>



                        <button



                          type="button"



                          className="btn btn-secondary btn-sm"



                          onClick={() => openAllocationModal(fac.faculty_id)}



                        >



                          ➕ Map Subject



                        </button>



                      </td>



                    </tr>



                  ))}



                </tbody>



              </table>



            </div>



          ) : (



            /* Subject-Wise View */



            <div className="table-wrapper">



              <table>



                <thead>



                  <tr>



                    <th style={{ width: "40px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isAllDisplayedSelected}
                        onChange={handleToggleSelectAll}
                        title={isAllDisplayedSelected ? "Deselect all displayed mappings" : "Select all displayed mappings"}
                        style={{ cursor: "pointer", accentColor: "var(--primary-navy)" }}
                      />
                    </th>
                    <th>Subject Code</th>



                    <th>Subject Title</th>



                    <th>Assigned Faculty Member(s)</th>



                    <th>Invigilation Restriction Status</th>



                  </tr>



                </thead>



                <tbody>



                  {filteredSubjectSummary.map((sub) => (



                    <tr key={sub.subject_id}>
                      <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                        <input
                          type="checkbox"
                          checked={
                            sub.faculty.length > 0 &&
                            sub.faculty.every((f) => selectedMappingIds.includes(f.allocation_id))
                          }
                          onChange={() => {
                            const subIds = sub.faculty.map((f) => f.allocation_id);
                            const allSelected = subIds.every((id) => selectedMappingIds.includes(id));
                            if (allSelected) {
                              setSelectedMappingIds((prev) => prev.filter((id) => !subIds.includes(id)));
                            } else {
                              setSelectedMappingIds((prev) => Array.from(new Set([...prev, ...subIds])));
                            }
                          }}
                          title={`Select all faculty mappings for ${sub.subject_code}`}
                          style={{ cursor: "pointer", accentColor: "var(--primary-navy)" }}
                        />
                      </td>
                      <td>
                        <strong style={{ color: "var(--primary-navy)" }}>{sub.subject_code}</strong>



                      </td>



                      <td>{sub.subject_name}</td>



                      <td>



                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>



                          {sub.faculty.map((f) => (



                            <span



                              key={f.allocation_id}



                              style={{



                                display: "inline-flex",



                                alignItems: "center",



                                gap: "6px",



                                background: "#f0fdf4",



                                border: "1px solid #bbf7d0",



                                borderRadius: "6px",



                                padding: "4px 8px",



                                fontSize: "12px",



                                color: "#166534",



                              }}



                            >
                              <input
                                type="checkbox"
                                checked={selectedMappingIds.includes(f.allocation_id)}
                                onChange={() => toggleMappingSelection(f.allocation_id)}
                                style={{ cursor: "pointer", accentColor: "var(--primary-navy)", marginRight: "4px" }}
                                title={`Select ${f.faculty_name} mapping for ${sub.subject_code}`}
                              />
                              👨‍🏫 {f.faculty_name} ({f.designation || "Faculty"})



                              <span style={{ fontSize: "11px", color: "#475569", background: "#ffffff", padding: "1px 5px", borderRadius: "4px", border: "1px solid #e2e8f0" }}>



                                {f.academic_year || "2026-2027"} &bull; {f.semester}{f.section ? ` (${f.section})` : ""}



                              </span>



                              <button



                                type="button"



                                style={{



                                  border: "none",



                                  background: "none",



                                  color: "#dc2626",



                                  cursor: "pointer",



                                  fontSize: "13px",



                                  lineHeight: 1,



                                  padding: 0,



                                }}



                                title="Remove teaching assignment"



                                onClick={() => handleRemoveAllocation(f.allocation_id, sub.subject_code, f.faculty_name)}



                              >



                                ✕



                              </button>



                            </span>



                          ))}



                        </div>



                      </td>



                      <td>



                        <span className="status-pill active" style={{ fontSize: "11.5px" }}>



                          🛡️ {sub.faculty.length} Teacher(s) Excluded from Supervision



                        </span>



                      </td>



                    </tr>



                  ))}



                </tbody>



              </table>



            </div>



          )}



        </section>



      )}







      {/* =========================================================



          MODAL: MAP FACULTY TO SUBJECT (TEACHING ALLOCATION)



         ========================================================= */}



      {/* =========================================================

          MODAL: ALLOCATE TEACHING ASSIGNMENT

         ========================================================= */}

      {isAllocModalOpen && (

        <div className="modal-backdrop">

          <div className="modal-card" style={{ maxWidth: "580px", width: "95%" }}>

            <div className="modal-header">

              <h3 className="modal-title">Map Faculty to Teaching Subject</h3>

              <button

                type="button"

                className="modal-close-btn"

                onClick={() => setIsAllocModalOpen(false)}

              >

                ✕

              </button>

            </div>



            <form onSubmit={handleSaveAllocation}>

              <div className="modal-body">

                {/* Faculty Selection */}

                <div className="form-group">

                  <label className="form-label">

                    Faculty Member <span className="form-label-required">*</span>

                  </label>

                  <select

                    className="form-control"

                    value={allocFacultyId}

                    onChange={(e) => setAllocFacultyId(e.target.value)}

                    required

                  >

                    <option value="">-- Choose Faculty Member --</option>

                    {facultyList.map((f) => (

                      <option key={f.faculty_id} value={f.faculty_id}>

                        {f.faculty_name} ({f.designation || f.department || "Faculty"})

                      </option>

                    ))}

                  </select>

                </div>



                {/* Term Selection: Academic Year, Study Year, Dynamic Semester */}

                <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>

                  <div className="form-group">

                    <label className="form-label">Academic Year <span className="form-label-required">*</span></label>

                    <select

                      className="form-control"

                      value={modalAcademicYear}

                      onChange={(e) => setModalAcademicYear(e.target.value)}

                      required

                    >

                      {ACADEMIC_YEARS.map((ay) => (

                        <option key={ay} value={ay}>{ay}</option>

                      ))}

                    </select>

                  </div>



                  <div className="form-group">

                    <label className="form-label">Study Year <span className="form-label-required">*</span></label>

                    <select

                      className="form-control"

                      value={modalStudyYear}

                      onChange={handleModalStudyYearChange}

                      required

                    >

                      <option value="1st Year">1st Year</option>

                      <option value="2nd Year">2nd Year</option>

                      <option value="3rd Year">3rd Year</option>

                      <option value="4th Year">4th Year</option>

                    </select>

                  </div>



                  <div className="form-group">

                    <label className="form-label">Semester <span className="form-label-required">*</span></label>

                    <select

                      className="form-control"

                      value={modalSemester}

                      onChange={(e) => setModalSemester(e.target.value)}

                      required

                    >

                      {availableModalSemesters.map((sem) => (

                        <option key={sem} value={sem}>{sem}</option>

                      ))}

                    </select>

                  </div>

                </div>



                {/* Subject Selection */}

                <div className="form-group">

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>

                    <label className="form-label" style={{ margin: 0 }}>

                      Select Subject(s) to Assign <span className="form-label-required">*</span>

                    </label>

                    <input

                      type="text"

                      className="form-control"

                      placeholder="🔍 Filter subjects by code or name..."

                      value={subjectSearchFilter}

                      onChange={(e) => setSubjectSearchFilter(e.target.value)}

                      style={{ width: "240px", padding: "3px 8px", fontSize: "12px" }}

                    />

                  </div>



                  <div

                    style={{

                      maxHeight: "220px",

                      overflowY: "auto",

                      border: "1px solid var(--border-color)",

                      borderRadius: "6px",

                      padding: "8px 12px",

                      background: "#f8fafc",

                    }}

                  >

                    {modalAvailableSubjects.length === 0 ? (

                      <div style={{ padding: "12px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>

                        No subjects match your search filter.

                      </div>

                    ) : (

                      modalAvailableSubjects.map((s) => {

                        const isChecked = allocSubjectIds.includes(String(s.subject_id));

                        return (

                          <label

                            key={s.subject_id}

                            style={{

                              display: "flex",

                              alignItems: "center",

                              gap: "8px",

                              padding: "6px 0",

                              borderBottom: "1px solid #f1f5f9",

                              fontSize: "13px",

                              cursor: "pointer",

                            }}

                          >

                            <input

                              type="checkbox"

                              checked={isChecked}

                              onChange={() => {

                                const sidStr = String(s.subject_id);

                                setAllocSubjectIds((prev) =>

                                  prev.includes(sidStr)

                                    ? prev.filter((x) => x !== sidStr)

                                    : [...prev, sidStr]

                                );

                              }}

                            />

                            <span>

                              <strong>{s.subject_code}</strong> &bull; {s.subject_name}{" "}

                              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>

                                ({s.semester})

                              </span>

                            </span>

                          </label>

                        );

                      })

                    )}

                  </div>

                  <small className="form-helper" style={{ marginTop: "6px", display: "block" }}>

                    Faculty teaching these subjects for {modalAcademicYear} ({modalSemester}) will be strictly prohibited from invigilating examinations of these subjects.

                  </small>

                </div>

              </div>



              <div className="modal-footer">

                <button

                  type="button"

                  className="btn btn-secondary"

                  onClick={() => setIsAllocModalOpen(false)}

                  disabled={savingAlloc}

                >

                  Cancel

                </button>

                <button

                  type="submit"

                  className="btn btn-navy"

                  disabled={savingAlloc || !allocFacultyId || allocSubjectIds.length === 0 || !modalSemester}

                >

                  {savingAlloc ? "Saving..." : "Save Teaching Assignment"}

                </button>

              </div>

            </form>

          </div>

        </div>

      )}



      {/* =========================================================

          MODAL: ADD / EDIT FACULTY

         ========================================================= */}

      {isModalOpen && (

        <div className="modal-backdrop">

          <div className="modal-card">

            <div className="modal-header">

              <h3 className="modal-title">

                {editingFaculty ? `Edit Faculty #${editingFaculty.faculty_id}` : "Add Faculty Member"}

              </h3>

              <button

                type="button"

                className="modal-close-btn"

                onClick={() => setIsModalOpen(false)}

              >

                ✕

              </button>

            </div>



            <form onSubmit={handleSubmit}>

              <div className="modal-body">

                <div className="form-group">

                  <label className="form-label" htmlFor="fac-name">

                    Full Name <span className="form-label-required">*</span>

                  </label>

                  <input

                    id="fac-name"

                    type="text"

                    className="form-control"

                    placeholder="e.g. Dr. D. Rajeswara Rao"

                    value={facultyName}

                    onChange={(e) => setFacultyName(e.target.value)}

                    required

                    disabled={saving}

                  />

                </div>



                <div className="form-group">

                  <label className="form-label" htmlFor="fac-desig">

                    Designation

                  </label>

                  <input

                    id="fac-desig"

                    type="text"

                    className="form-control"

                    placeholder="e.g. Professor &amp; HOD / Associate Professor"

                    value={designation}

                    onChange={(e) => setDesignation(e.target.value)}

                    disabled={saving}

                  />

                </div>



                <div className="form-row">

                  <div className="form-group">

                    <label className="form-label" htmlFor="fac-dept">

                      Department

                    </label>

                    <input

                      id="fac-dept"

                      type="text"

                      className="form-control"

                      value={department}

                      onChange={(e) => setDepartment(e.target.value)}

                      disabled={saving}

                    />

                  </div>



                  <div className="form-group">

                    <label className="form-label" htmlFor="fac-email">

                      Institutional Email

                    </label>

                    <input

                      id="fac-email"

                      type="email"

                      className="form-control"

                      placeholder="e.g. name@vrsiddhartha.ac.in"

                      value={email}

                      onChange={(e) => setEmail(e.target.value)}

                      disabled={saving}

                    />

                  </div>

                </div>



                <div className="form-group">

                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13.5px" }}>

                    <input

                      type="checkbox"

                      checked={isActive}

                      onChange={(e) => setIsActive(e.target.checked)}

                      disabled={saving}

                    />

                    <span>Available for Examination Invigilation Supervision</span>

                  </label>

                </div>

              </div>



              <div className="modal-footer">

                <button

                  type="button"

                  className="btn btn-secondary"

                  onClick={() => setIsModalOpen(false)}

                  disabled={saving}

                >

                  Cancel

                </button>

                <button

                  type="submit"

                  className="btn btn-navy"

                  disabled={saving}

                >

                  {saving ? "Saving..." : editingFaculty ? "Save Changes" : "Create Faculty"}

                </button>

              </div>

            </form>

          </div>

        </div>

      )}



      {/* =========================================================

          MODAL 1: IMPORT MASTER FACULTY DIRECTORY

         ========================================================= */}

      {isUploadDirectoryModalOpen && (

        <div className="modal-backdrop">

          <div className="modal-card" style={{ maxWidth: "620px", width: "95%" }}>

            <div className="modal-header">

              <div>

                <h3 className="modal-title">📁 Import Master Faculty Directory</h3>

                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>

                  Upload institutional faculty master file (Faculty ID, Name, Designation, Department, Email)

                </p>

              </div>

              <button

                type="button"

                className="modal-close-btn"

                onClick={() => {

                  setIsUploadDirectoryModalOpen(false);

                  setDirFile(null);

                  setDirResult(null);

                  setDirError("");

                }}

                disabled={dirUploading}

              >

                ✕

              </button>

            </div>



            <div className="modal-body">

              <div

                style={{

                  background: "#eff6ff",

                  border: "1px solid #bfdbfe",

                  borderRadius: "8px",

                  padding: "12px 14px",

                  marginBottom: "16px",

                  fontSize: "12.5px",

                  color: "#1e40af",

                  lineHeight: 1.5,

                }}

              >

                <strong>💡 Master Directory Sync Rules:</strong>

                <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>

                  <li>Matches existing records using <strong>Faculty ID &rarr; Email &rarr; Normalized Name</strong>.</li>

                  <li>Reuses existing faculty IDs; <strong>never creates duplicate faculty records</strong>.</li>

                  <li><strong>100% Preserved:</strong> User login accounts, roles, and historical examination duty records.</li>

                  <li>Department defaults to <strong>CSE</strong> if unspecified.</li>

                </ul>

              </div>



              <div className="form-group" style={{ marginBottom: "16px" }}>

                <label className="form-label" style={{ fontWeight: 600 }}>

                  Select Master Faculty File (.xlsx, .xls, .csv) <span className="form-label-required">*</span>

                </label>

                <input

                  type="file"

                  className="form-control"

                  accept=".xlsx,.xls,.csv"

                  onChange={(e) => {

                    setDirFile(e.target.files[0] || null);

                    setDirResult(null);

                    setDirError("");

                  }}

                  disabled={dirUploading}

                />

                <span className="form-helper">

                  Expected columns: Faculty ID (optional), Faculty Name, Designation, Department, Institutional Email

                </span>

              </div>



              {dirError && (

                <div

                  style={{

                    background: "#fef2f2",

                    border: "1px solid #fecaca",

                    borderRadius: "8px",

                    padding: "10px 14px",

                    marginBottom: "14px",

                    color: "#991b1b",

                    fontSize: "13px",

                  }}

                >

                  ⚠️ {dirError}

                </div>

              )}



              {dirResult && (

                <div

                  style={{

                    background: "#f0fdf4",

                    border: "1px solid #bbf7d0",

                    borderRadius: "8px",

                    padding: "14px 16px",

                    marginBottom: "14px",

                  }}

                >

                  <div style={{ fontWeight: 700, color: "#166534", marginBottom: "8px", fontSize: "14px" }}>

                    ✅ {dirResult.message || "Faculty Directory Imported Successfully"}

                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "13px" }}>

                    <div style={{ background: "#ffffff", padding: "8px 12px", borderRadius: "6px", border: "1px solid #dcfce7" }}>

                      <span style={{ color: "var(--text-muted)", fontSize: "11px", display: "block" }}>FILE RECORDS</span>

                      <strong style={{ fontSize: "16px", color: "var(--primary-navy)" }}>{dirResult.total_records}</strong>

                    </div>

                    <div style={{ background: "#ffffff", padding: "8px 12px", borderRadius: "6px", border: "1px solid #dcfce7" }}>

                      <span style={{ color: "var(--text-muted)", fontSize: "11px", display: "block" }}>MATCHED &amp; PRESERVED</span>

                      <strong style={{ fontSize: "16px", color: "#15803d" }}>{dirResult.matched_existing}</strong>

                    </div>

                    <div style={{ background: "#ffffff", padding: "8px 12px", borderRadius: "6px", border: "1px solid #dcfce7" }}>

                      <span style={{ color: "var(--text-muted)", fontSize: "11px", display: "block" }}>NEW FACULTY CREATED</span>

                      <strong style={{ fontSize: "16px", color: "#2563eb" }}>{dirResult.newly_added}</strong>

                    </div>

                    <div style={{ background: "#ffffff", padding: "8px 12px", borderRadius: "6px", border: "1px solid #dcfce7" }}>

                      <span style={{ color: "var(--text-muted)", fontSize: "11px", display: "block" }}>TOTAL ACTIVE IN DIRECTORY</span>

                      <strong style={{ fontSize: "16px", color: "var(--primary-navy)" }}>{dirResult.imported_total}</strong>

                    </div>

                  </div>



                  {/* Clickable View Details for Matched & Newly Added Faculty */}

                  <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>

                    <button

                      type="button"

                      className="btn"

                      style={{

                        padding: "10px 14px",

                        fontSize: "12.5px",

                        fontWeight: 700,

                        display: "inline-flex",

                        alignItems: "center",

                        justifyContent: "center",

                        gap: "6px",

                        background: "#f0fdf4",

                        border: "1.5px solid #86efac",

                        color: "#166534",

                        borderRadius: "6px",

                        cursor: "pointer",

                        transition: "all 0.2s ease",

                      }}

                      onClick={() => {

                        setFacultyDetailTab("matched");

                        setFacultyDetailSearch("");

                        setIsFacultyDetailModalOpen(true);

                      }}

                      title="View all matched and preserved faculty records"

                    >

                      🛡️ View Matched Faculty ({dirResult.matched_existing ?? (dirResult.matched_faculty || []).length})

                    </button>

                    <button

                      type="button"

                      className="btn"

                      style={{

                        padding: "10px 14px",

                        fontSize: "12.5px",

                        fontWeight: 700,

                        display: "inline-flex",

                        alignItems: "center",

                        justifyContent: "center",

                        gap: "6px",

                        background: "#eff6ff",

                        border: "1.5px solid #93c5fd",

                        color: "#1e40af",

                        borderRadius: "6px",

                        cursor: "pointer",

                        transition: "all 0.2s ease",

                      }}

                      onClick={() => {

                        setFacultyDetailTab("new");

                        setFacultyDetailSearch("");

                        setIsFacultyDetailModalOpen(true);

                      }}

                      title="View all newly created faculty records"

                    >

                      ✨ View Newly Added Faculty ({dirResult.newly_added ?? dirResult.inserted_new ?? (dirResult.newly_added_faculty || []).length})

                    </button>

                  </div>

                </div>

              )}

            </div>



            <div className="modal-footer" style={{ borderTop: "1px solid var(--border-color)", padding: "12px 16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>

              <button

                type="button"

                className="btn btn-secondary"

                onClick={() => {

                  setIsUploadDirectoryModalOpen(false);

                  setDirFile(null);

                  setDirResult(null);

                  setDirError("");

                }}

                disabled={dirUploading}

              >

                {dirResult ? "Done" : "Cancel"}

              </button>

              <button

                type="button"

                className="btn btn-primary"

                onClick={handleUploadDirectory}

                disabled={!dirFile || dirUploading}

                style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}

              >

                {dirUploading ? "Syncing Directory..." : "📁 Upload & Sync Directory"}

              </button>

            </div>

          </div>

        </div>

      )}



      {/* =========================================================

          MODAL: VIEW MATCHED & PRESERVED / NEWLY ADDED FACULTY DETAILS

         ========================================================= */}

      {isFacultyDetailModalOpen && dirResult && (

        <div className="modal-backdrop" style={{ zIndex: 1200 }}>

          <div

            className="modal-card modal-lg"

            style={{

              maxWidth: "940px",

              width: "95%",

              maxHeight: "90vh",

              display: "flex",

              flexDirection: "column",

            }}

          >

            <div

              className="modal-header"

              style={{

                display: "flex",

                justifyContent: "space-between",

                alignItems: "center",

                padding: "16px 20px",

                borderBottom: "1px solid var(--border-color)",

              }}

            >

              <div>

                <h3

                  className="modal-title"

                  style={{

                    display: "flex",

                    alignItems: "center",

                    gap: "8px",

                    fontSize: "18px",

                    fontWeight: 700,

                    margin: 0,

                    color: "var(--primary-navy)",

                  }}

                >

                  {facultyDetailTab === "matched" ? (

                    <>

                      <span>🛡️ Matched &amp; Preserved Faculty Records</span>

                      <span className="badge badge-success" style={{ fontSize: "12px", padding: "3px 8px" }}>

                        {(dirResult.matched_faculty || []).length}

                      </span>

                    </>

                  ) : (

                    <>

                      <span>✨ Newly Added Faculty Records</span>

                      <span className="badge badge-info" style={{ fontSize: "12px", padding: "3px 8px" }}>

                        {(dirResult.newly_added_faculty || []).length}

                      </span>

                    </>

                  )}

                </h3>

                <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "var(--text-muted)" }}>

                  {facultyDetailTab === "matched"

                    ? "Existing faculty records preserved in database. Existing IDs, accounts, and historical exam records remain untouched."

                    : "Newly created faculty master records stored in database with newly assigned Faculty IDs."}

                </p>

              </div>

              <button

                type="button"

                className="btn-close"

                onClick={() => setIsFacultyDetailModalOpen(false)}

                style={{

                  background: "transparent",

                  border: "none",

                  fontSize: "22px",

                  cursor: "pointer",

                  color: "#64748b",

                  lineHeight: 1,

                }}

                aria-label="Close"

              >

                &times;

              </button>

            </div>



            <div className="modal-body" style={{ padding: "16px 20px", flex: 1, overflowY: "auto" }}>

              {/* Tab Selector & Search Toolbar */}

              <div

                style={{

                  display: "flex",

                  justifyContent: "space-between",

                  alignItems: "center",

                  gap: "12px",

                  marginBottom: "16px",

                  flexWrap: "wrap",

                }}

              >

                {/* Tabs */}

                <div style={{ display: "inline-flex", background: "#f1f5f9", padding: "3px", borderRadius: "8px", gap: "4px" }}>

                  <button

                    type="button"

                    onClick={() => {

                      setFacultyDetailTab("matched");

                      setFacultyDetailSearch("");

                    }}

                    style={{

                      border: "none",

                      padding: "6px 14px",

                      borderRadius: "6px",

                      fontSize: "13px",

                      fontWeight: 600,

                      cursor: "pointer",

                      background: facultyDetailTab === "matched" ? "#ffffff" : "transparent",

                      color: facultyDetailTab === "matched" ? "#15803d" : "#64748b",

                      boxShadow: facultyDetailTab === "matched" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",

                      transition: "all 0.15s ease",

                    }}

                  >

                    🛡️ Matched &amp; Preserved ({(dirResult.matched_faculty || []).length})

                  </button>

                  <button

                    type="button"

                    onClick={() => {

                      setFacultyDetailTab("new");

                      setFacultyDetailSearch("");

                    }}

                    style={{

                      border: "none",

                      padding: "6px 14px",

                      borderRadius: "6px",

                      fontSize: "13px",

                      fontWeight: 600,

                      cursor: "pointer",

                      background: facultyDetailTab === "new" ? "#ffffff" : "transparent",

                      color: facultyDetailTab === "new" ? "#1d4ed8" : "#64748b",

                      boxShadow: facultyDetailTab === "new" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",

                      transition: "all 0.15s ease",

                    }}

                  >

                    ✨ Newly Added ({(dirResult.newly_added_faculty || []).length})

                  </button>

                </div>



                {/* Search Bar */}

                <div style={{ position: "relative", minWidth: "260px", flex: "1", maxWidth: "380px" }}>

                  <input

                    type="text"

                    className="form-control"

                    placeholder="Search by name, ID, email, designation..."

                    value={facultyDetailSearch}

                    onChange={(e) => setFacultyDetailSearch(e.target.value)}

                    style={{

                      paddingLeft: "32px",

                      fontSize: "13px",

                      height: "36px",

                      borderRadius: "6px",

                      border: "1px solid #cbd5e1",

                      width: "100%",

                    }}

                  />

                  <span

                    style={{

                      position: "absolute",

                      left: "10px",

                      top: "50%",

                      transform: "translateY(-50%)",

                      fontSize: "14px",

                      color: "#94a3b8",

                      pointerEvents: "none",

                    }}

                  >

                    🔍

                  </span>

                  {facultyDetailSearch && (

                    <button

                      type="button"

                      onClick={() => setFacultyDetailSearch("")}

                      style={{

                        position: "absolute",

                        right: "8px",

                        top: "50%",

                        transform: "translateY(-50%)",

                        background: "none",

                        border: "none",

                        color: "#94a3b8",

                        cursor: "pointer",

                        fontSize: "14px",

                      }}

                    >

                      &times;

                    </button>

                  )}

                </div>

              </div>



              {/* Table Render */}

              {(() => {

                const activeList = facultyDetailTab === "matched"

                  ? (dirResult.matched_faculty || [])

                  : (dirResult.newly_added_faculty || []);



                const q = facultyDetailSearch.trim().toLowerCase();

                const filtered = activeList.filter((item) => {

                  if (!q) return true;

                  return (

                    String(item.faculty_id || "").toLowerCase().includes(q) ||

                    String(item.faculty_name || "").toLowerCase().includes(q) ||

                    String(item.designation || "").toLowerCase().includes(q) ||

                    String(item.department || "").toLowerCase().includes(q) ||

                    String(item.email || "").toLowerCase().includes(q) ||

                    String(item.match_method || "").toLowerCase().includes(q) ||

                    String(item.import_action || "").toLowerCase().includes(q)

                  );

                });



                if (filtered.length === 0) {

                  return (

                    <div style={{ padding: "36px 16px", textAlign: "center", color: "var(--text-muted)", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>

                      <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔎</div>

                      <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--primary-navy)" }}>No faculty records found</div>

                      <div style={{ fontSize: "12.5px" }}>

                        {facultyDetailSearch

                          ? `No records match "${facultyDetailSearch}". Try adjusting your search query.`

                          : "No records to display in this category."}

                      </div>

                    </div>

                  );

                }



                return (

                  <div className="table-responsive" style={{ border: "1px solid var(--border-color)", borderRadius: "6px", overflow: "hidden" }}>

                    <table className="table" style={{ margin: 0, fontSize: "12.5px" }}>

                      <thead>

                        <tr style={{ background: "#f8fafc" }}>

                          <th style={{ width: "90px", padding: "10px 12px" }}>Faculty ID</th>

                          <th style={{ padding: "10px 12px" }}>Faculty Name</th>

                          <th style={{ padding: "10px 12px" }}>Designation</th>

                          <th style={{ width: "80px", padding: "10px 12px" }}>Dept</th>

                          <th style={{ padding: "10px 12px" }}>Institutional Email</th>

                          <th style={{ width: "130px", padding: "10px 12px" }}>Match Method</th>

                          <th style={{ width: "190px", padding: "10px 12px" }}>Import Action</th>

                        </tr>

                      </thead>

                      <tbody>

                        {filtered.map((item, idx) => {

                          const isUpdated = item.import_action === "Existing record updated";

                          const isNew = item.import_action === "New record created";

                          return (

                            <tr key={`${item.faculty_id}-${idx}`} style={{ borderBottom: "1px solid #f1f5f9" }}>

                              <td style={{ padding: "10px 12px" }}>

                                <span

                                  style={{

                                    fontFamily: "monospace",

                                    fontWeight: 700,

                                    background: "#e2e8f0",

                                    color: "#1e293b",

                                    padding: "2px 7px",

                                    borderRadius: "4px",

                                    fontSize: "11.5px",

                                  }}

                                >

                                  #{item.faculty_id}

                                </span>

                              </td>

                              <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--primary-navy)" }}>

                                {item.faculty_name}

                              </td>

                              <td style={{ padding: "10px 12px", color: "var(--text-color)" }}>

                                {item.designation || "Faculty"}

                              </td>

                              <td style={{ padding: "10px 12px" }}>

                                <span className="badge badge-neutral" style={{ fontSize: "11px" }}>

                                  {item.department || "CSE"}

                                </span>

                              </td>

                              <td style={{ padding: "10px 12px" }}>

                                <span style={{ fontFamily: "monospace", color: "#334155", fontSize: "11.5px" }}>

                                  {item.email || "—"}

                                </span>

                              </td>

                              <td style={{ padding: "10px 12px" }}>

                                {item.match_method === "Faculty ID" ? (

                                  <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600 }}>

                                    🆔 ID Match

                                  </span>

                                ) : item.match_method === "Email" ? (

                                  <span style={{ background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600 }}>

                                    ✉️ Email Match

                                  </span>

                                ) : item.match_method === "Name" ? (

                                  <span style={{ background: "#f3e8ff", color: "#6b21a8", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600 }}>

                                    👤 Name Match

                                  </span>

                                ) : (

                                  <span style={{ background: "#f1f5f9", color: "#64748b", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 500 }}>

                                    — New Record

                                  </span>

                                )}

                              </td>

                              <td style={{ padding: "10px 12px" }}>

                                {isUpdated ? (

                                  <span style={{ background: "#fef3c7", color: "#92400e", padding: "3px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>

                                    ✏️ Existing record updated

                                  </span>

                                ) : isNew ? (

                                  <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "3px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>

                                    ➕ New record created

                                  </span>

                                ) : (

                                  <span style={{ background: "#ecfdf5", color: "#047857", padding: "3px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>

                                    🛡️ Existing record unchanged

                                  </span>

                                )}

                              </td>

                            </tr>

                          );

                        })}

                      </tbody>

                    </table>

                  </div>

                );

              })()}

            </div>



            <div

              className="modal-footer"

              style={{

                borderTop: "1px solid var(--border-color)",

                padding: "12px 20px",

                display: "flex",

                justifyContent: "space-between",

                alignItems: "center",

                background: "#f8fafc",

                borderBottomLeftRadius: "var(--radius-lg)",

                borderBottomRightRadius: "var(--radius-lg)",

              }}

            >

              <div style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>

                Showing{" "}

                <strong>

                  {(() => {

                    const activeList = facultyDetailTab === "matched"

                      ? (dirResult.matched_faculty || [])

                      : (dirResult.newly_added_faculty || []);

                    const q = facultyDetailSearch.trim().toLowerCase();

                    return activeList.filter((item) => {

                      if (!q) return true;

                      return (

                        String(item.faculty_id || "").toLowerCase().includes(q) ||

                        String(item.faculty_name || "").toLowerCase().includes(q) ||

                        String(item.designation || "").toLowerCase().includes(q) ||

                        String(item.department || "").toLowerCase().includes(q) ||

                        String(item.email || "").toLowerCase().includes(q) ||

                        String(item.match_method || "").toLowerCase().includes(q) ||

                        String(item.import_action || "").toLowerCase().includes(q)

                      );

                    }).length;

                  })()}

                </strong>{" "}

                of{" "}

                <strong>

                  {(facultyDetailTab === "matched"

                    ? (dirResult.matched_faculty || [])

                    : (dirResult.newly_added_faculty || [])

                  ).length}

                </strong>{" "}

                faculty members

              </div>

              <button

                type="button"

                className="btn btn-secondary"

                onClick={() => setIsFacultyDetailModalOpen(false)}

                style={{ padding: "6px 16px", fontSize: "13px" }}

              >

                Close Details

              </button>

            </div>

          </div>

        </div>

      )}



      {/* =========================================================

          MODAL 2: IMPORT SEMESTER TEACHING ASSIGNMENTS

         ========================================================= */}

      {isUploadSemesterModalOpen && (

        <div className="modal-backdrop">

          <div className="modal-card" style={{ maxWidth: "720px", width: "95%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

            <div className="modal-header">

              <div>

                <h3 className="modal-title">📚 Import Semester Teaching Assignments</h3>

                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>

                  Upload semester faculty allocations (e.g. SEM3, SEM4, SEM5). Matches automatically and preserves all other semesters.

                </p>

              </div>

              <button

                type="button"

                className="modal-close-btn"

                onClick={() => {

                  setIsUploadSemesterModalOpen(false);

                  setSemFile(null);

                  setSemResult(null);

                  setSemError("");

                }}

                disabled={semUploading}

              >

                ✕

              </button>

            </div>



            <div className="modal-body" style={{ overflowY: "auto", flex: 1 }}>

              {/* Controls: Academic Year & Target Semester */}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>

                <div>

                  <label className="form-label" style={{ fontSize: "12px", marginBottom: "4px", fontWeight: 600 }}>

                    Academic Year <span className="form-label-required">*</span>

                  </label>

                  <select

                    className="form-control"

                    value={semAcademicYear}

                    onChange={(e) => setSemAcademicYear(e.target.value)}

                    disabled={semUploading}

                  >

                    {ACADEMIC_YEARS.map((ay) => (

                      <option key={ay} value={ay}>{ay}</option>

                    ))}

                  </select>

                </div>



                <div>

                  <label className="form-label" style={{ fontSize: "12px", marginBottom: "4px", fontWeight: 600 }}>

                    Target Semester

                  </label>

                  <select

                    className="form-control"

                    value={semTargetSemester}

                    onChange={(e) => setSemTargetSemester(e.target.value)}

                    disabled={semUploading}

                  >

                    <option value="">-- Auto-Detect From File / Dynamic --</option>

                    <option value="Semester 1">Semester 1 (1st Year)</option>

                    <option value="Semester 2">Semester 2 (1st Year)</option>

                    <option value="Semester 3">Semester 3 (2nd Year)</option>

                    <option value="Semester 4">Semester 4 (2nd Year)</option>

                    <option value="Semester 5">Semester 5 (3rd Year)</option>

                    <option value="Semester 6">Semester 6 (3rd Year)</option>

                    <option value="Semester 7">Semester 7 (4th Year)</option>

                    <option value="Semester 8">Semester 8 (4th Year)</option>

                  </select>

                </div>

              </div>



              {/* Study Year Derivation Banner */}

              <div

                style={{

                  background: "#f8fafc",

                  border: "1px solid #e2e8f0",

                  borderRadius: "6px",

                  padding: "8px 12px",

                  marginBottom: "14px",

                  fontSize: "12px",

                  color: "#475569",

                  display: "flex",

                  alignItems: "center",

                  justifyContent: "space-between",

                  flexWrap: "wrap",

                  gap: "6px",

                }}

              >

                <span>

                  <strong>Study Year Derivation:</strong> Sem 1&ndash;2 &rarr; 1st Year &bull; Sem 3&ndash;4 &rarr; 2nd Year &bull; Sem 5&ndash;6 &rarr; 3rd Year &bull; Sem 7&ndash;8 &rarr; 4th Year

                </span>

                <span

                  style={{

                    background: "#e0f2fe",

                    color: "#0369a1",

                    padding: "2px 8px",

                    borderRadius: "4px",

                    fontWeight: 600,

                  }}

                >

                  {semTargetSemester

                    ? `${semTargetSemester} → ${YEAR_SEMESTER_MAP["1st Year"].includes(semTargetSemester) ? "1st Year" : YEAR_SEMESTER_MAP["2nd Year"].includes(semTargetSemester) ? "2nd Year" : YEAR_SEMESTER_MAP["3rd Year"].includes(semTargetSemester) ? "3rd Year" : "4th Year"}`

                    : "Auto-detected dynamically"}

                </span>

              </div>



              {/* File Input */}

              <div className="form-group" style={{ marginBottom: "14px" }}>

                <label className="form-label" style={{ fontWeight: 600 }}>

                  Select Semester Workbook (.xlsx, .xls, .csv) <span className="form-label-required">*</span>

                </label>

                <input

                  type="file"

                  className="form-control"

                  accept=".xlsx,.xls,.csv"

                  onChange={(e) => {

                    setSemFile(e.target.files[0] || null);

                    setSemResult(null);

                    setSemError("");

                  }}

                  disabled={semUploading}

                />

                <span className="form-helper">

                  Supports core semester sheets (e.g. SEM3, SEM4, SEM5). Reads Faculty Name, Subject Code, Subject Name, Section, and Semester.

                </span>

              </div>



              {semError && (

                <div

                  style={{

                    background: "#fef2f2",

                    border: "1px solid #fecaca",

                    borderRadius: "8px",

                    padding: "10px 14px",

                    marginBottom: "14px",

                    color: "#991b1b",

                    fontSize: "13px",

                  }}

                >

                  ⚠️ {semError}

                </div>

              )}



              {/* Minimal Feedback Result Display (Requirement G) */}

              {semResult && (

                <div style={{ marginTop: "10px" }}>

                  {/* Status Banner */}

                  <div

                    style={{

                      background: semResult.saved_mappings_count > 0 ? "#f0fdf4" : "#fffbeb",

                      border: `1px solid ${semResult.saved_mappings_count > 0 ? "#bbf7d0" : "#fde68a"}`,

                      borderRadius: "8px",

                      padding: "12px 16px",

                      marginBottom: "12px",

                      display: "flex",

                      justifyContent: "space-between",

                      alignItems: "center",

                      flexWrap: "wrap",

                      gap: "10px",

                    }}

                  >

                    <div>

                      <div style={{ fontWeight: 700, color: semResult.saved_mappings_count > 0 ? "#166534" : "#92400e", fontSize: "14px" }}>

                        {semResult.saved_mappings_count > 0 ? "✅ Teaching Assignments Mapped Successfully" : "⚠️ Upload Processed with Notices"}

                      </div>

                      <div style={{ fontSize: "12px", color: semResult.saved_mappings_count > 0 ? "#15803d" : "#78350f", marginTop: "2px" }}>

                        {semResult.message || `Processed ${semResult.total_rows || 0} rows for ${semResult.semester || semTargetSemester || "semester"}`}

                      </div>

                    </div>



                    {/* Download Exception List Button */}

                    {((semResult.unmatched_faculty && semResult.unmatched_faculty.length > 0) ||

                      (semResult.unmatched_subjects && semResult.unmatched_subjects.length > 0) ||

                      (semResult.invalid_rows && semResult.invalid_rows.length > 0)) && (

                      <button

                        type="button"

                        className="btn btn-sm btn-secondary"

                        onClick={() => handleDownloadExceptions(semResult)}

                        style={{

                          background: "#ffffff",

                          border: "1.5px solid #f59e0b",

                          color: "#b45309",

                          fontWeight: 700,

                          display: "inline-flex",

                          alignItems: "center",

                          gap: "6px",

                        }}

                      >

                        📥 Download Exception List (CSV)

                      </button>

                    )}

                  </div>



                  {/* Concise Stat Cards */}

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px", marginBottom: "14px" }}>

                    <div style={{ background: "#ffffff", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 12px", textAlign: "center" }}>

                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#166534", textTransform: "uppercase" }}>Mapped</div>

                      <div style={{ fontSize: "20px", fontWeight: 800, color: "#15803d", marginTop: "2px" }}>{semResult.saved_mappings_count || 0}</div>

                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>saved to DB</div>

                    </div>



                    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px 12px", textAlign: "center" }}>

                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Duplicates</div>

                      <div style={{ fontSize: "20px", fontWeight: 800, color: "#475569", marginTop: "2px" }}>{semResult.duplicate_mappings_skipped || 0}</div>

                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>skipped cleanly</div>

                    </div>



                    <div style={{ background: "#ffffff", border: `1px solid ${semResult.unmatched_faculty?.length ? "#fde68a" : "#e2e8f0"}`, borderRadius: "8px", padding: "10px 12px", textAlign: "center" }}>

                      <div style={{ fontSize: "11px", fontWeight: 700, color: semResult.unmatched_faculty?.length ? "#b45309" : "#64748b", textTransform: "uppercase" }}>Unmatched Faculty</div>

                      <div style={{ fontSize: "20px", fontWeight: 800, color: semResult.unmatched_faculty?.length ? "#d97706" : "#64748b", marginTop: "2px" }}>{semResult.unmatched_faculty?.length || 0}</div>

                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>external / missing</div>

                    </div>



                    <div style={{ background: "#ffffff", border: `1px solid ${semResult.unmatched_subjects?.length ? "#fecaca" : "#e2e8f0"}`, borderRadius: "8px", padding: "10px 12px", textAlign: "center" }}>

                      <div style={{ fontSize: "11px", fontWeight: 700, color: semResult.unmatched_subjects?.length ? "#b91c1c" : "#64748b", textTransform: "uppercase" }}>Unmatched Subjects</div>

                      <div style={{ fontSize: "20px", fontWeight: 800, color: semResult.unmatched_subjects?.length ? "#dc2626" : "#64748b", marginTop: "2px" }}>{semResult.unmatched_subjects?.length || 0}</div>

                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>code not found</div>

                    </div>

                  </div>



                  {/* Collapsible Unmatched Items Details */}

                  {semResult.unmatched_faculty && semResult.unmatched_faculty.length > 0 && (

                    <details style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", padding: "8px 12px", marginBottom: "8px" }}>

                      <summary style={{ cursor: "pointer", fontWeight: 600, color: "#92400e", fontSize: "12.5px" }}>

                        ⚠️ View Unmatched Faculty ({semResult.unmatched_faculty.length}) &mdash; External department or missing from Faculty Directory

                      </summary>

                      <div style={{ marginTop: "8px", maxHeight: "150px", overflowY: "auto" }}>

                        <table style={{ width: "100%", fontSize: "11.5px" }}>

                          <thead>

                            <tr style={{ textAlign: "left", color: "#78350f" }}>

                              <th>Faculty Name</th>

                              <th>Subject</th>

                              <th>Section</th>

                              <th>Reason</th>

                            </tr>

                          </thead>

                          <tbody>

                            {semResult.unmatched_faculty.map((u, i) => (

                              <tr key={i} style={{ borderTop: "1px solid #fef3c7" }}>

                                <td style={{ fontWeight: 600 }}>{u.faculty_name}</td>

                                <td>{u.subject_code} - {u.subject_name}</td>

                                <td>{u.section || "—"}</td>

                                <td style={{ color: "#92400e" }}>{u.reason || "Not found in directory"}</td>

                              </tr>

                            ))}

                          </tbody>

                        </table>

                      </div>

                    </details>

                  )}



                  {semResult.unmatched_subjects && semResult.unmatched_subjects.length > 0 && (

                    <details style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", padding: "8px 12px", marginBottom: "8px" }}>

                      <summary style={{ cursor: "pointer", fontWeight: 600, color: "#991b1b", fontSize: "12.5px" }}>

                        ⚠️ View Unmatched Subjects ({semResult.unmatched_subjects.length}) &mdash; Subject codes not found in Subject Catalogue

                      </summary>

                      <div style={{ marginTop: "8px", maxHeight: "150px", overflowY: "auto" }}>

                        <table style={{ width: "100%", fontSize: "11.5px" }}>

                          <thead>

                            <tr style={{ textAlign: "left", color: "#991b1b" }}>

                              <th>Code</th>

                              <th>Subject Name</th>

                              <th>Faculty</th>

                              <th>Reason</th>

                            </tr>

                          </thead>

                          <tbody>

                            {semResult.unmatched_subjects.map((u, i) => (

                              <tr key={i} style={{ borderTop: "1px solid #fee2e2" }}>

                                <td style={{ fontWeight: 700 }}>{u.subject_code}</td>

                                <td>{u.subject_name}</td>

                                <td>{u.faculty_name}</td>

                                <td style={{ color: "#991b1b" }}>{u.reason || "Not found in catalogue"}</td>

                              </tr>

                            ))}

                          </tbody>

                        </table>

                      </div>

                    </details>

                  )}

                </div>

              )}

            </div>



            <div className="modal-footer" style={{ borderTop: "1px solid var(--border-color)", padding: "12px 16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>

              <button

                type="button"

                className="btn btn-secondary"

                onClick={() => {

                  setIsUploadSemesterModalOpen(false);

                  setSemFile(null);

                  setSemResult(null);

                  setSemError("");

                }}

                disabled={semUploading}

              >

                {semResult ? "Done" : "Cancel"}

              </button>

              <button

                type="button"

                className="btn btn-primary"

                onClick={handleUploadSemesterTeaching}

                disabled={!semFile || semUploading}

                style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}

              >

                {semUploading ? "Mapping Automatically..." : "⚡ Upload & Map Automatically"}

              </button>

            </div>

          </div>

        </div>

      )}



      {/* =========================================================

          MODAL: UPLOAD FACULTY & AUTOMATIC TEACHING ALLOCATIONS

         ========================================================= */}

      {isUploadModalOpen && (

        <div className="modal-backdrop">

          <div className="modal-card" style={{ maxWidth: uploadPreviewData ? "880px" : "640px", width: "95%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

            <div className="modal-header">

              <div>

                <h3 className="modal-title">Import Faculty &amp; Teaching Allocations</h3>

                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>

                  Automatic faculty matching (ID &rarr; Email &rarr; Name) and subject matching (Code &rarr; Aliases)

                </p>

              </div>

              <button

                type="button"

                className="modal-close-btn"

                onClick={() => {

                  setIsUploadModalOpen(false);

                  setUploadResult(null);

                  setUploadFile(null);

                  setUploadPreviewData(null);

                  setUploadReplaceMode(false);

                  setUploadReplaceConfirmed(false);

                }}

                disabled={uploading || importingMappings || previewLoading}

              >

                ✕

              </button>

            </div>



            <div className="modal-body" style={{ overflowY: "auto", flex: 1 }}>

              {/* Import Workflow Selection */}

              <div style={{ marginBottom: "16px", padding: "12px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--border-color)" }}>

                <label className="form-label" style={{ marginBottom: "8px", fontWeight: 700 }}>

                  Select Import Workflow:

                </label>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>

                  <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer", fontSize: "13px" }}>

                    <input

                      type="radio"

                      name="importMode"

                      checked={!uploadReplaceMode}

                      onChange={() => {

                        setUploadReplaceMode(false);

                        setUploadReplaceConfirmed(false);

                      }}

                      style={{ marginTop: "2px" }}

                    />

                    <div>

                      <strong>Update &amp; Merge Directory (Standard)</strong>

                      <div style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>

                        Matches existing faculty by Faculty ID, normalized email, or name. Updates profiles and adds teaching allocations without removing existing records.

                      </div>

                    </div>

                  </label>



                  <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer", fontSize: "13px" }}>

                    <input

                      type="radio"

                      name="importMode"

                      checked={uploadReplaceMode}

                      onChange={() => setUploadReplaceMode(true)}

                      style={{ marginTop: "2px" }}

                    />

                    <div>

                      <strong style={{ color: "#b45309" }}>Replace Existing Faculty Directory</strong>

                      <div style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>

                        Replaces current active faculty roster with this workbook. Purges safe unreferenced records, archives protected records, and updates teaching mappings.

                      </div>

                    </div>

                  </label>

                </div>

              </div>



              {/* Replace Mode Warning & Acknowledgment */}

              {uploadReplaceMode && (

                <div

                  style={{

                    background: "#fffbeb",

                    border: "1.5px solid #fde68a",

                    borderRadius: "8px",

                    padding: "12px 14px",

                    marginBottom: "16px",

                  }}

                >

                  <div style={{ fontWeight: 700, color: "#92400e", fontSize: "13px", marginBottom: "6px" }}>

                    ⚠️ Complete Directory Replacement Mode

                  </div>

                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "#92400e", lineHeight: 1.5 }}>

                    <li>Faculty records with <strong>zero dependencies</strong> will be permanently deleted.</li>

                    <li>Protected faculty (with past examination history or user logins) will be <strong>archived and deactivated</strong> (<code>is_active = 0</code>).</li>

                    <li>Historical examination attendance sheets, duty logs, and staff logins remain <strong>100% preserved</strong>.</li>

                    <li>New faculty records and matched teaching allocations will be created as active.</li>

                  </ul>



                  <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", cursor: "pointer" }}>

                    <input

                      type="checkbox"

                      checked={uploadReplaceConfirmed}

                      onChange={(e) => setUploadReplaceConfirmed(e.target.checked)}

                    />

                    <span style={{ fontSize: "12.5px", fontWeight: 600, color: "#78350f" }}>

                      I confirm that I want to replace the current faculty directory with this workbook.

                    </span>

                  </label>

                </div>

              )}



              {/* Target Academic Year & Semester */}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>

                <div>

                  <label className="form-label" style={{ fontSize: "12px", marginBottom: "4px" }}>

                    Academic Year for Mappings:

                  </label>

                  <select

                    className="form-control"

                    style={{ fontSize: "12.5px" }}

                    value={uploadAcademicYear}

                    onChange={(e) => setUploadAcademicYear(e.target.value)}

                  >

                    {ACADEMIC_YEARS.map((ay) => (

                      <option key={ay} value={ay}>{ay}</option>

                    ))}

                  </select>

                </div>

                <div>

                  <label className="form-label" style={{ fontSize: "12px", marginBottom: "4px" }}>

                    Fallback Default Semester (Optional):

                  </label>

                  <select

                    className="form-control"

                    style={{ fontSize: "12.5px" }}

                    value={uploadSemester}

                    onChange={(e) => setUploadSemester(e.target.value)}

                  >

                    <option value="">-- None (Read from File Rows) --</option>

                    {ALL_SEMESTERS.map((sem) => (

                      <option key={sem} value={sem}>{sem}</option>

                    ))}

                  </select>

                </div>

              </div>



              {/* File Input */}

              <div className="form-group" style={{ marginBottom: "14px" }}>

                <label className="form-label">

                  Select Faculty Workbook (.xlsx, .xls, .csv) <span className="form-label-required">*</span>

                </label>

                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>

                  <input

                    type="file"

                    className="form-control"

                    accept=".xlsx,.xls,.csv"

                    onChange={(e) => {

                      const file = e.target.files[0] || null;

                      setUploadFile(file);

                      setUploadResult(null);

                      setUploadPreviewData(null);

                    }}

                    required

                    disabled={uploading || importingMappings || previewLoading}

                    style={{ flex: 1 }}

                  />

                  {uploadFile && !uploadPreviewData && (

                    <button

                      type="button"

                      className="btn btn-primary"

                      onClick={() => handleGeneratePreview(uploadFile)}

                      disabled={previewLoading}

                      style={{ whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "6px" }}

                    >

                      {previewLoading ? "Analyzing..." : "⚡ Auto-Match & Preview"}

                    </button>

                  )}

                </div>

              </div>



              {/* PREVIEW CONTAINER */}

              {uploadPreviewData && (

                <div style={{ marginTop: "16px", border: "1.5px solid #bfdbfe", borderRadius: "8px", overflow: "hidden" }}>

                  {/* Summary Bar */}

                  <div style={{ background: "#eff6ff", padding: "12px 16px", borderBottom: "1px solid #bfdbfe", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>

                    <div>

                      <div style={{ fontWeight: 700, fontSize: "13.5px", color: "var(--primary-navy)" }}>

                        📊 Intelligent Matching Analysis

                      </div>

                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>

                        Found <strong>{uploadPreviewData.summary?.total_unique_faculty || uploadPreviewData.summary?.total_faculty}</strong> unique faculty ({uploadPreviewData.summary?.new_faculty_count ?? uploadPreviewData.summary?.new_faculty} new, {uploadPreviewData.summary?.existing_faculty_matched ?? uploadPreviewData.summary?.existing_faculty} existing) &bull; <strong>{uploadPreviewData.summary?.teaching_rows_detected || uploadPreviewData.summary?.total_course_entries}</strong> teaching assignment rows detected

                      </div>

                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>

                      {uploadPreviewData.summary?.semesters_detected?.length > 0 && (

                        <span style={{ background: "#e0e7ff", color: "#3730a3", fontSize: "12px", fontWeight: 700, padding: "4px 10px", borderRadius: "20px" }}>

                          📅 {uploadPreviewData.summary.semesters_detected.length} Semester{uploadPreviewData.summary.semesters_detected.length > 1 ? "s" : ""} Detected

                        </span>

                      )}

                      <span style={{ background: "#dcfce7", color: "#166534", fontSize: "12px", fontWeight: 700, padding: "4px 10px", borderRadius: "20px" }}>

                        ✅ {uploadPreviewData.summary?.auto_matched_count} Auto-Matched

                      </span>

                      {uploadPreviewData.summary?.unmatched_count > 0 && (

                        <span style={{ background: "#fef3c7", color: "#92400e", fontSize: "12px", fontWeight: 700, padding: "4px 10px", borderRadius: "20px" }}>

                          ⚠️ {uploadPreviewData.summary?.unmatched_count} Unmatched

                        </span>

                      )}

                      {uploadPreviewData.summary?.error_count > 0 && (

                        <span style={{ background: "#fee2e2", color: "#991b1b", fontSize: "12px", fontWeight: 700, padding: "4px 10px", borderRadius: "20px" }}>

                          🚨 {uploadPreviewData.summary.error_count} Issue{uploadPreviewData.summary.error_count > 1 ? "s" : ""}

                        </span>

                      )}

                    </div>

                  </div>



                  {/* Preview Navigation Tabs */}

                  <div style={{ display: "flex", borderBottom: "1px solid var(--border-color)", background: "#ffffff", overflowX: "auto" }}>

                    <button

                      type="button"

                      onClick={() => setPreviewTab("grouped")}

                      style={{

                        padding: "10px 16px",

                        border: "none",

                        background: previewTab === "grouped" ? "#f8fafc" : "transparent",

                        borderBottom: previewTab === "grouped" ? "2px solid var(--accent-blue)" : "none",

                        fontWeight: previewTab === "grouped" ? 700 : 500,

                        color: previewTab === "grouped" ? "var(--primary-navy)" : "var(--text-muted)",

                        cursor: "pointer",

                        fontSize: "12.5px",

                        whiteSpace: "nowrap"

                      }}

                    >

                      📂 Grouped by Semester ({uploadPreviewData.grouped_by_semester?.length || 0})

                    </button>

                    <button

                      type="button"

                      onClick={() => setPreviewTab("matched")}

                      style={{

                        padding: "10px 16px",

                        border: "none",

                        background: previewTab === "matched" ? "#f8fafc" : "transparent",

                        borderBottom: previewTab === "matched" ? "2px solid var(--accent-blue)" : "none",

                        fontWeight: previewTab === "matched" ? 700 : 500,

                        color: previewTab === "matched" ? "var(--primary-navy)" : "var(--text-muted)",

                        cursor: "pointer",

                        fontSize: "12.5px",

                        whiteSpace: "nowrap"

                      }}

                    >

                      🎯 Auto-Matched ({uploadPreviewData.auto_matched?.length || 0})

                    </button>

                    <button

                      type="button"

                      onClick={() => setPreviewTab("unmatched")}

                      style={{

                        padding: "10px 16px",

                        border: "none",

                        background: previewTab === "unmatched" ? "#f8fafc" : "transparent",

                        borderBottom: previewTab === "unmatched" ? "2px solid var(--accent-blue)" : "none",

                        fontWeight: previewTab === "unmatched" ? 700 : 500,

                        color: previewTab === "unmatched" ? "var(--primary-navy)" : "var(--text-muted)",

                        cursor: "pointer",

                        fontSize: "12.5px"

                      }}

                    >

                      ⚠️ Unmatched Review ({uploadPreviewData.unmatched?.length || 0})

                    </button>

                    <button

                      type="button"

                      onClick={() => setPreviewTab("faculty")}

                      style={{

                        padding: "10px 16px",

                        border: "none",

                        background: previewTab === "faculty" ? "#f8fafc" : "transparent",

                        borderBottom: previewTab === "faculty" ? "2px solid var(--accent-blue)" : "none",

                        fontWeight: previewTab === "faculty" ? 700 : 500,

                        color: previewTab === "faculty" ? "var(--primary-navy)" : "var(--text-muted)",

                        cursor: "pointer",

                        fontSize: "12.5px",

                        whiteSpace: "nowrap"

                      }}

                    >

                      👥 Faculty Roster ({uploadPreviewData.faculty_records?.length || 0})

                    </button>

                    {uploadPreviewData.summary?.error_count > 0 && (

                      <button

                        type="button"

                        onClick={() => setPreviewTab("errors")}

                        style={{

                          padding: "10px 16px",

                          border: "none",

                          background: previewTab === "errors" ? "#fef2f2" : "transparent",

                          borderBottom: previewTab === "errors" ? "2px solid #ef4444" : "none",

                          fontWeight: 700,

                          color: "#991b1b",

                          cursor: "pointer",

                          fontSize: "12.5px",

                          whiteSpace: "nowrap"

                        }}

                      >

                        🚨 Semester Issues ({uploadPreviewData.summary.error_count})

                      </button>

                    )}

                  </div>



                  {/* TAB: GROUPED BY ACADEMIC YEAR & SEMESTER */}

                  {previewTab === "grouped" && (

                    <div style={{ maxHeight: "360px", overflowY: "auto", padding: "10px", display: "flex", flexDirection: "column", gap: "14px" }}>

                      {(!uploadPreviewData.grouped_by_semester || uploadPreviewData.grouped_by_semester.length === 0) ? (

                        <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px 0", fontSize: "13px" }}>

                          No allocations grouped. Please check the file.

                        </p>

                      ) : (

                        uploadPreviewData.grouped_by_semester.map((grp) => (

                          <div

                            key={grp.group_id}

                            style={{

                              border: grp.error_count > 0 ? "1.5px solid #fca5a5" : "1.5px solid #bfdbfe",

                              borderRadius: "8px",

                              background: "#ffffff",

                              overflow: "hidden",

                              boxShadow: "0 1px 3px rgba(0,0,0,0.05)"

                            }}

                          >

                            {/* Group Card Header */}

                            <div

                              style={{

                                padding: "10px 14px",

                                background: grp.error_count > 0 ? "#fef2f2" : "#f0f9ff",

                                borderBottom: grp.error_count > 0 ? "1px solid #fca5a5" : "1px solid #bae6fd",

                                display: "flex",

                                justifyContent: "space-between",

                                alignItems: "center",

                                flexWrap: "wrap",

                                gap: "8px"

                              }}

                            >

                              <div>

                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>

                                  <strong style={{ fontSize: "13.5px", color: grp.error_count > 0 ? "#991b1b" : "var(--primary-navy)" }}>

                                    {grp.semester ? `📅 ${grp.academic_year} — ${grp.semester}` : `⚠️ ${grp.academic_year} — Missing Semester (Action Required)`}

                                  </strong>

                                  {grp.study_year && (

                                    <span style={{ fontSize: "11px", background: "#e2e8f0", color: "#334155", padding: "1px 7px", borderRadius: "10px", fontWeight: 600 }}>

                                      Year {grp.study_year}

                                    </span>

                                  )}

                                </div>

                                <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", marginTop: "2px" }}>

                                  {grp.faculty_count} Faculty: {grp.faculty_names.slice(0, 3).join(", ")}{grp.faculty_names.length > 3 ? ` +${grp.faculty_names.length - 3} more` : ""}

                                </div>

                              </div>



                              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>

                                <span style={{ background: "#ffffff", border: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "12px", color: "#334155" }}>

                                  {grp.total_count} Allocation{grp.total_count > 1 ? "s" : ""}

                                </span>

                                <span style={{ background: "#dcfce7", color: "#166534", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "12px" }}>

                                  ✅ {grp.auto_matched_count} Matched

                                </span>

                                {grp.unmatched_count > 0 && (

                                  <span style={{ background: "#fef3c7", color: "#92400e", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "12px" }}>

                                    ⚠️ {grp.unmatched_count} Unmatched

                                  </span>

                                )}

                                {grp.error_count > 0 && (

                                  <span style={{ background: "#fee2e2", color: "#991b1b", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "12px" }}>

                                    🚨 {grp.error_count} Issue{grp.error_count > 1 ? "s" : ""}

                                  </span>

                                )}

                              </div>

                            </div>



                            {/* Group Allocations Table */}

                            <div style={{ padding: "6px" }}>

                              <table className="data-table" style={{ width: "100%", fontSize: "11.5px", margin: 0 }}>

                                <thead>

                                  <tr>

                                    <th style={{ width: "22%" }}>Faculty Member</th>

                                    <th style={{ width: "20%" }}>Course in File</th>

                                    <th style={{ width: "26%" }}>Catalogue Subject</th>

                                    <th style={{ width: "15%" }}>Semester</th>

                                    <th style={{ width: "17%" }}>Validation Status</th>

                                  </tr>

                                </thead>

                                <tbody>

                                  {grp.allocations.map((a) => (

                                    <tr key={a.temp_id} style={!a.is_valid ? { background: "#fff5f5" } : {}}>

                                      <td>

                                        <div style={{ fontWeight: 600 }}>{a.faculty_name}</div>

                                        {a.email && <div style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>{a.email}</div>}

                                      </td>

                                      <td style={{ color: "var(--text-secondary)", fontSize: "11px" }}>

                                        {a.course_name}

                                      </td>

                                      <td>

                                        {a.subject_code ? (

                                          <div>

                                            <strong style={{ color: "var(--primary-navy)" }}>[{a.subject_code}]</strong> {a.subject_name}

                                          </div>

                                        ) : (

                                          <select

                                            className="form-control"

                                            style={{ fontSize: "11px", padding: "2px 4px" }}

                                            value={unmatchedUserMappings[a.temp_id] || ""}

                                            onChange={(e) => {

                                              const val = e.target.value;

                                              setUnmatchedUserMappings((prev) => ({ ...prev, [a.temp_id]: val }));

                                            }}

                                          >

                                            <option value="">-- Select Catalogue Subject --</option>

                                            <option value="SKIP">[Skip Allocation]</option>

                                            {subjectsList.map((s) => (

                                              <option key={s.subject_id} value={s.subject_id}>

                                                [{s.subject_code}] {s.subject_name} ({s.semester})

                                              </option>

                                            ))}

                                          </select>

                                        )}

                                      </td>

                                      <td>

                                        <select

                                          className="form-control"

                                          style={{

                                            fontSize: "11px",

                                            padding: "2px 4px",

                                            borderColor: !a.semester ? "#ef4444" : (!a.is_valid ? "#f59e0b" : "#cbd5e1"),

                                            background: !a.semester ? "#fef2f2" : "#ffffff",

                                            fontWeight: a.semester ? 600 : 400

                                          }}

                                          value={a.semester || ""}

                                          onChange={(e) => handleUpdateAllocationSemester(a.temp_id, e.target.value)}

                                        >

                                          <option value="">-- Missing --</option>

                                          {ALL_SEMESTERS.map((sem) => (

                                            <option key={sem} value={sem}>{sem}</option>

                                          ))}

                                        </select>

                                      </td>

                                      <td>

                                        {a.is_valid ? (

                                          <span style={{ background: "#dcfce7", color: "#166534", fontSize: "10.5px", fontWeight: 600, padding: "2px 6px", borderRadius: "10px", display: "inline-block" }}>

                                            ✅ Valid (Yr {a.study_year})

                                          </span>

                                        ) : (

                                          <div style={{ background: "#fee2e2", color: "#991b1b", fontSize: "10.5px", padding: "3px 6px", borderRadius: "6px", lineHeight: 1.25 }}>

                                            {a.validation_error_type === "missing_semester" ? (

                                              <span><strong>🚨 Missing:</strong> Select Sem</span>

                                            ) : (

                                              <span><strong>⚠️ Year Mismatch:</strong> Yr {a.study_year} vs {a.semester}</span>

                                            )}

                                          </div>

                                        )}

                                      </td>

                                    </tr>

                                  ))}

                                </tbody>

                              </table>

                            </div>

                          </div>

                        ))

                      )}

                    </div>

                  )}



                  {/* TAB: ISSUES / ERRORS ONLY */}

                  {previewTab === "errors" && (

                    <div style={{ maxHeight: "320px", overflowY: "auto", padding: "8px" }}>

                      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", padding: "8px 12px", marginBottom: "10px", fontSize: "12px", color: "#92400e" }}>

                        ⚡ <strong>Action Required:</strong> The allocations below have missing semester data or Study Year / Semester mismatches. Please assign the correct semester to resolve them before confirming import.

                      </div>

                      <table className="data-table" style={{ width: "100%", fontSize: "11.5px", margin: 0 }}>

                        <thead>

                          <tr>

                            <th>Faculty Member</th>

                            <th>Course Mentioned</th>

                            <th>Study Year</th>

                            <th>Assign Semester</th>

                            <th>Validation Issue</th>

                          </tr>

                        </thead>

                        <tbody>

                          {[...(uploadPreviewData.auto_matched || []), ...(uploadPreviewData.unmatched || [])]

                            .filter((a) => !a.is_valid)

                            .map((a) => (

                              <tr key={a.temp_id} style={{ background: "#fef2f2" }}>

                                <td style={{ fontWeight: 600 }}>{a.faculty_name}</td>

                                <td>{a.course_name}</td>

                                <td>

                                  <span style={{ fontWeight: 600 }}>Year {a.study_year || "—"}</span>

                                </td>

                                <td>

                                  <select

                                    className="form-control"

                                    style={{ fontSize: "11.5px", padding: "3px 6px", borderColor: "#ef4444", fontWeight: 600 }}

                                    value={a.semester || ""}

                                    onChange={(e) => handleUpdateAllocationSemester(a.temp_id, e.target.value)}

                                  >

                                    <option value="">-- Select Semester --</option>

                                    {ALL_SEMESTERS.map((sem) => (

                                      <option key={sem} value={sem}>{sem}</option>

                                    ))}

                                  </select>

                                </td>

                                <td>

                                  <span style={{ color: "#991b1b", fontSize: "11px", fontWeight: 600 }}>

                                    {a.validation_error || "Invalid semester"}

                                  </span>

                                </td>

                              </tr>

                            ))}

                        </tbody>

                      </table>

                    </div>

                  )}



                  {/* TAB 1: AUTO-MATCHED ALLOCATIONS */}

                  {previewTab === "matched" && (

                    <div style={{ maxHeight: "280px", overflowY: "auto", padding: "8px" }}>

                      {uploadPreviewData.auto_matched?.length === 0 ? (

                        <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px 0", fontSize: "13px" }}>

                          No automatic matches identified. Please check the Unmatched Review tab.

                        </p>

                      ) : (

                        <table className="data-table" style={{ width: "100%", fontSize: "12px", margin: 0 }}>

                          <thead>

                            <tr>

                              <th>Faculty Member</th>

                              <th>Course Mentioned</th>

                              <th>Matched Catalogue Subject</th>

                              <th>Semester</th>

                              <th style={{ textAlign: "center" }}>Match Type</th>

                            </tr>

                          </thead>

                          <tbody>

                            {uploadPreviewData.auto_matched.map((m) => (

                              <tr key={m.temp_id}>

                                <td style={{ fontWeight: 600 }}>{m.faculty_name}</td>

                                <td style={{ color: "var(--text-muted)", fontSize: "11.5px" }}>{m.course_name}</td>

                                <td>

                                  <strong style={{ color: "var(--primary-navy)" }}>[{m.subject_code}]</strong> {m.subject_name}

                                </td>

                                <td>{m.semester}</td>

                                <td style={{ textAlign: "center" }}>

                                  <span style={{

                                    fontSize: "11px",

                                    padding: "2px 8px",

                                    borderRadius: "12px",

                                    background: m.match_type === "code" ? "#dbeafe" : (m.match_confidence === "exact" ? "#dcfce7" : "#fef3c7"),

                                    color: m.match_type === "code" ? "#1e40af" : (m.match_confidence === "exact" ? "#166534" : "#92400e"),

                                    fontWeight: 600

                                  }}>

                                    {m.match_type === "code" ? "Code Match" : (m.match_confidence === "exact" ? "Exact Name" : "Fuzzy Alias")}

                                  </span>

                                </td>

                              </tr>

                            ))}

                          </tbody>

                        </table>

                      )}

                    </div>

                  )}



                  {/* TAB 2: UNMATCHED COURSES REVIEW */}

                  {previewTab === "unmatched" && (

                    <div style={{ maxHeight: "280px", overflowY: "auto", padding: "8px" }}>

                      {uploadPreviewData.unmatched?.length === 0 ? (

                        <p style={{ textAlign: "center", color: "#166534", padding: "20px 0", fontSize: "13px", fontWeight: 600 }}>

                          🎉 100% of detected courses were successfully auto-matched to catalogue subjects!

                        </p>

                      ) : (

                        <div>

                          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>

                            The courses below could not be auto-matched to current catalogue subjects. You may optionally select a catalogue subject for each, or leave unmapped.

                          </p>

                          <table className="data-table" style={{ width: "100%", fontSize: "12px", margin: 0 }}>

                            <thead>

                              <tr>

                                <th>Faculty Member</th>

                                <th>Course in File</th>

                                <th>Classification</th>

                                <th style={{ minWidth: "220px" }}>Map to Catalogue Subject (Optional)</th>

                              </tr>

                            </thead>

                            <tbody>

                              {uploadPreviewData.unmatched.map((u) => (

                                <tr key={u.temp_id}>

                                  <td style={{ fontWeight: 600 }}>{u.faculty_name}</td>

                                  <td>{u.course_name}</td>

                                  <td style={{ fontSize: "11px", color: "var(--text-muted)" }}>{u.classification}</td>

                                  <td>

                                    <select

                                      className="form-control"

                                      style={{ fontSize: "11.5px", padding: "3px 6px" }}

                                      value={unmatchedUserMappings[u.temp_id] || ""}

                                      onChange={(e) => {

                                        const val = e.target.value;

                                        setUnmatchedUserMappings((prev) => ({

                                          ...prev,

                                          [u.temp_id]: val,

                                        }));

                                      }}

                                    >

                                      <option value="">-- Leave Unmapped --</option>

                                      <option value="SKIP">[Skip / Do Not Map]</option>

                                      {subjectsList.map((s) => (

                                        <option key={s.subject_id} value={s.subject_id}>

                                          [{s.subject_code}] {s.subject_name} ({s.semester})

                                        </option>

                                      ))}

                                    </select>

                                  </td>

                                </tr>

                              ))}

                            </tbody>

                          </table>

                        </div>

                      )}

                    </div>

                  )}



                  {/* TAB 3: FACULTY ROSTER */}

                  {previewTab === "faculty" && (

                    <div style={{ maxHeight: "280px", overflowY: "auto", padding: "8px" }}>

                      <table className="data-table" style={{ width: "100%", fontSize: "12px", margin: 0 }}>

                        <thead>

                          <tr>

                            <th>#</th>

                            <th>Faculty Name</th>

                            <th>Designation</th>

                            <th>Department</th>

                            <th>Email</th>

                            <th style={{ textAlign: "center" }}>Match Status</th>

                          </tr>

                        </thead>

                        <tbody>

                          {uploadPreviewData.faculty_records?.map((fac, idx) => (

                            <tr key={idx}>

                              <td>{idx + 1}</td>

                              <td style={{ fontWeight: 600 }}>{fac.faculty_name}</td>

                              <td style={{ color: "var(--text-muted)" }}>{fac.designation || "Faculty"}</td>

                              <td>{fac.department || "CSE"}</td>

                              <td style={{ fontSize: "11.5px", fontFamily: "monospace" }}>{fac.email || "—"}</td>

                              <td style={{ textAlign: "center" }}>

                                <span style={{

                                  fontSize: "11px",

                                  padding: "2px 8px",

                                  borderRadius: "12px",

                                  background: fac.is_existing ? "#dcfce7" : "#f3e8ff",

                                  color: fac.is_existing ? "#166534" : "#6b21a8",

                                  fontWeight: 600

                                }}>

                                  {fac.is_existing ? "Linked Existing" : "New Faculty"}

                                </span>

                              </td>

                            </tr>

                          ))}

                        </tbody>

                      </table>

                    </div>

                  )}

                </div>

              )}



              {/* Upload Result Notification */}

              {uploadResult && (

                <div

                  style={{

                    background: "#f0fdf4",

                    border: "1px solid #bbf7d0",

                    borderRadius: "8px",

                    padding: "12px 16px",

                    marginTop: "16px",

                  }}

                >

                  <div style={{ fontWeight: 700, color: "#166534", marginBottom: "6px" }}>

                    ✅ {uploadResult.replace_mode ? "Faculty Directory Replaced Successfully" : "Import Processed Successfully"}

                  </div>

                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#166534", lineHeight: 1.6 }}>

                    <li>Total Active Faculty in Workbook: <strong>{uploadResult.imported_total || uploadResult.imported_faculty_count || uploadResult.total_records}</strong></li>

                    <li>Newly Added Records: <strong>{uploadResult.newly_added}</strong></li>

                    <li>Matched / Reactivated Records: <strong>{uploadResult.matched_existing || uploadResult.reactivated_existing}</strong></li>

                    {uploadResult.replace_mode && (

                      <>

                        <li>Unreferenced Records Purged: <strong>{uploadResult.purged_count}</strong></li>

                        <li>Protected Records Archived (Kept Safe): <strong>{uploadResult.archived_count}</strong></li>

                      </>

                    )}

                    <li>Teaching Assignments Mapped: <strong>{uploadResult.saved_mappings_count || uploadResult.teaching_mappings_count || uploadResult.suggested_matches || 0}</strong></li>

                  </ul>

                </div>

              )}

            </div>



            <div className="modal-footer" style={{ borderTop: "1px solid var(--border-color)", padding: "12px 16px" }}>

              <button

                type="button"

                className="btn btn-secondary"

                onClick={() => {

                  setIsUploadModalOpen(false);

                  setUploadResult(null);

                  setUploadFile(null);

                  setUploadPreviewData(null);

                  setUploadReplaceMode(false);

                  setUploadReplaceConfirmed(false);

                }}

                disabled={uploading || importingMappings || previewLoading}

              >

                Close

              </button>



              {uploadPreviewData ? (

                <button

                  type="button"

                  className={uploadReplaceMode ? "btn btn-warning" : "btn btn-navy"}

                  style={uploadReplaceMode ? { background: "#d97706", borderColor: "#b45309", color: "#ffffff", fontWeight: 700 } : { fontWeight: 700 }}

                  onClick={handleConfirmImportWithMappings}

                  disabled={importingMappings || (uploadReplaceMode && !uploadReplaceConfirmed)}

                >

                  {importingMappings

                    ? "Importing & Mapping..."

                    : `Confirm & Import (${uploadPreviewData.faculty_records?.length || 0} Faculty, ${(uploadPreviewData.auto_matched?.length || 0) + Object.values(unmatchedUserMappings).filter((v) => v && v !== "SKIP").length} Teaching Assignments)`}

                </button>

              ) : (

                <button

                  type="button"

                  className={uploadReplaceMode ? "btn btn-warning" : "btn btn-navy"}

                  style={uploadReplaceMode ? { background: "#d97706", borderColor: "#b45309", color: "#ffffff" } : {}}

                  onClick={handleUploadSubmit}

                  disabled={uploading || !uploadFile || (uploadReplaceMode && !uploadReplaceConfirmed)}

                >

                  {uploading

                    ? (uploadReplaceMode ? "Replacing Faculty Directory..." : "Processing Workbook...")

                    : (uploadReplaceMode ? "⚠️ Replace Faculty Directory" : "Direct Import (Auto-Map Everything)")}

                </button>

              )}

            </div>

          </div>

        </div>

      )}



      {/* =========================================================

          MODAL: REASSIGN INVIGILATOR

         ========================================================= */}

      <ReassignInvigilatorModal

        isOpen={reassignModalOpen}

        assignment={reassignItem}

        onClose={() => {

          setReassignModalOpen(false);

          setReassignItem(null);

        }}

        onSuccess={() => {

          setReassignModalOpen(false);

          setReassignItem(null);

          loadAllDuties();

          loadFaculty();

        }}

      />



{/* =========================================================

          MODAL: CONFIRM BULK FACULTY ACTIVATION / DEACTIVATION

         ========================================================= */}

      {showBulkStatusModal && (

        <div className="modal-backdrop">

          <div className="modal-card" style={{ maxWidth: "600px", width: "95%" }}>

            <div className="modal-header">

              <h3 className="modal-title">

                {bulkStatusAction === "activate"

                  ? "Confirm Bulk Faculty Activation"

                  : "Confirm Bulk Faculty Deactivation"}

              </h3>

              <button

                type="button"

                className="modal-close-btn"

                onClick={() => {

                  setShowBulkStatusModal(false);

                  setBulkStatusTargetFaculty([]);

                  setBulkStatusError("");

                }}

                disabled={bulkStatusProcessing}

              >

                ✕

              </button>

            </div>



            <div className="modal-body">

              {bulkStatusError && (

                <div className="alert alert-danger" style={{ marginBottom: "14px" }}>

                  <span>❌</span>

                  <div>

                    <strong>Status Update Failed:</strong>

                    <p style={{ margin: "2px 0 0", fontSize: "12.5px" }}>{bulkStatusError}</p>

                  </div>

                </div>

              )}



              {bulkStatusAction === "deactivate" ? (

                <div

                  style={{

                    background: "#fffbeb",

                    border: "1.5px solid #fde68a",

                    borderRadius: "8px",

                    padding: "12px 14px",

                    marginBottom: "14px",

                  }}

                >

                  <div style={{ fontWeight: 700, color: "#92400e", marginBottom: "4px" }}>

                    ⚠️ Consequences of Faculty Deactivation

                  </div>

                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12.5px", color: "#92400e", lineHeight: 1.5 }}>

                    <li>Selected faculty members will be <strong>excluded</strong> from future automatic invigilator assignments, manual duty allocations, and reassignments.</li>

                    <li>Their institutional login accounts and historical examination duty records remain <strong>safely preserved</strong>.</li>

                    <li>You can restore their duty eligibility at any time using the <em>Activate Selected</em> option.</li>

                  </ul>

                </div>

              ) : (

                <div

                  style={{

                    background: "#f0fdf4",

                    border: "1.5px solid #bbf7d0",

                    borderRadius: "8px",

                    padding: "12px 14px",

                    marginBottom: "14px",

                  }}

                >

                  <div style={{ fontWeight: 700, color: "#166534", marginBottom: "4px" }}>

                    ✅ Consequences of Faculty Activation

                  </div>

                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12.5px", color: "#166534", lineHeight: 1.5 }}>

                    <li>Immediately restores full eligibility for examination invigilator assignment algorithms.</li>

                    <li>Allows these faculty members to be selected for manual duties, reassignments, and notifications.</li>

                    <li>Any associated institutional login credentials will be reactivated.</li>

                  </ul>

                </div>

              )}



              <div style={{ marginBottom: "8px", fontSize: "13px", fontWeight: 600, color: "var(--primary-navy)" }}>

                Affected Faculty Members ({bulkStatusTargetFaculty.length}):

              </div>



              <div style={{ maxHeight: "240px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "6px" }}>

                <table className="data-table" style={{ width: "100%", fontSize: "12px", margin: 0 }}>

                  <thead>

                    <tr>

                      <th style={{ width: "40px" }}>#</th>

                      <th>Faculty Name</th>

                      <th>Designation</th>

                      <th>Email</th>

                      <th style={{ textAlign: "center" }}>Status</th>

                    </tr>

                  </thead>

                  <tbody>

                    {bulkStatusTargetFaculty.map((fac, idx) => (

                      <tr key={fac.faculty_id}>

                        <td>{idx + 1}</td>

                        <td style={{ fontWeight: 600 }}>{fac.faculty_name}</td>

                        <td style={{ color: "var(--text-muted)" }}>{fac.designation || "Faculty"}</td>

                        <td style={{ fontSize: "11.5px", fontFamily: "monospace" }}>{fac.email || "—"}</td>

                        <td style={{ textAlign: "center" }}>

                          <span className={`status-badge ${fac.is_active ? "status-success" : "status-danger"}`}>

                            {fac.is_active ? "Active" : "Inactive"}

                          </span>

                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

            </div>



            <div className="modal-footer">

              <button

                type="button"

                className="btn btn-secondary"

                onClick={() => {

                  setShowBulkStatusModal(false);

                  setBulkStatusTargetFaculty([]);

                  setBulkStatusError("");

                }}

                disabled={bulkStatusProcessing}

              >

                Cancel

              </button>

              <button

                type="button"

                className="btn"

                style={

                  bulkStatusAction === "activate"

                    ? { background: "#16a34a", color: "#ffffff", borderColor: "#15803d", fontWeight: 600 }

                    : { background: "#d97706", color: "#ffffff", borderColor: "#b45309", fontWeight: 600 }

                }

                onClick={handleExecuteBulkStatus}

                disabled={bulkStatusProcessing}

              >

                {bulkStatusProcessing

                  ? "Updating Status..."

                  : bulkStatusAction === "activate"

                  ? `Confirm Activation (${bulkStatusTargetFaculty.length})`

                  : `Confirm Deactivation (${bulkStatusTargetFaculty.length})`}

              </button>

            </div>

          </div>

        </div>

      )}



      {/* =========================================================

          MODAL: BULK DELETE & HISTORICAL RECORD PRESERVATION

         ========================================================= */}

      {showBulkDeleteModal && (

        <div className="modal-backdrop">

          <div className="modal-card" style={{ maxWidth: "680px", width: "95%" }}>

            <div className="modal-header">

              <h3 className="modal-title" style={{ color: "var(--danger)" }}>

                🗑️ Bulk Faculty Selection &amp; Deletion

              </h3>

              <button

                type="button"

                className="modal-close-btn"

                onClick={() => {

                  setShowBulkDeleteModal(false);

                  setBulkPreflightData(null);

                  setBulkModalError("");

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

                  padding: "12px 16px",

                  marginBottom: "16px",

                }}

              >

                <div style={{ fontWeight: 700, fontSize: "14px", color: "#991b1b" }}>

                  Target: {selectedFacultyIds.length} Faculty Member(s) Selected

                </div>

                <div style={{ fontSize: "12px", color: "#b91c1c", marginTop: "2px" }}>

                  Department: <strong>CSE</strong> &bull; Total Selected: <strong>{selectedFacultyIds.length}</strong>

                </div>

              </div>



              {bulkModalError && (

                <div className="alert alert-danger" style={{ marginBottom: "16px" }}>

                  <span>❌</span>

                  <div>

                    <strong>Operation Failed:</strong>

                    <p style={{ margin: "4px 0 0", fontSize: "12.5px" }}>{bulkModalError}</p>

                  </div>

                </div>

              )}



              {checkingBulkPreflight ? (

                <div style={{ textAlign: "center", padding: "32px 0" }}>

                  <div style={{ fontSize: "28px", marginBottom: "8px" }}>⏳</div>

                  <p style={{ fontSize: "13.5px", color: "var(--text-muted)" }}>

                    Inspecting active duty rosters, completed exam histories, and institutional login accounts...

                  </p>

                </div>

              ) : bulkPreflightData ? (

                <div>

                  {/* Category Summary Cards */}

                  <div

                    style={{

                      display: "grid",

                      gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",

                      gap: "8px",

                      marginBottom: "16px",

                    }}

                  >

                    <div style={{ background: "#f8fafc", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "10px 6px", textAlign: "center" }}>

                      <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--primary-navy)" }}>

                        {bulkPreflightData.total_selected || bulkPreflightData.faculty_count}

                      </div>

                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Total Selected</div>

                    </div>



                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 6px", textAlign: "center" }}>

                      <div style={{ fontSize: "18px", fontWeight: 700, color: "#166534" }}>

                        {bulkPreflightData.safe_count || 0}

                      </div>

                      <div style={{ fontSize: "11px", color: "#166534", marginTop: "2px", fontWeight: 600 }}>Safe to Delete</div>

                    </div>



                    <div style={{ background: (bulkPreflightData.historical_preserved_count > 0) ? "#f5f3ff" : "#f8fafc", border: `1px solid ${(bulkPreflightData.historical_preserved_count > 0) ? "#ddd6fe" : "var(--border-color)"}`, borderRadius: "8px", padding: "10px 6px", textAlign: "center" }}>

                      <div style={{ fontSize: "18px", fontWeight: 700, color: (bulkPreflightData.historical_preserved_count > 0) ? "#7c3aed" : "var(--text-muted)" }}>

                        {bulkPreflightData.historical_preserved_count || 0}

                      </div>

                      <div style={{ fontSize: "11px", color: (bulkPreflightData.historical_preserved_count > 0) ? "#7c3aed" : "var(--text-muted)", marginTop: "2px", fontWeight: 600 }}>History Preserved</div>

                    </div>



                    <div style={{ background: (bulkPreflightData.login_unlinked_count > 0) ? "#fffbeb" : "#f8fafc", border: `1px solid ${(bulkPreflightData.login_unlinked_count > 0) ? "#fde68a" : "var(--border-color)"}`, borderRadius: "8px", padding: "10px 6px", textAlign: "center" }}>

                      <div style={{ fontSize: "18px", fontWeight: 700, color: (bulkPreflightData.login_unlinked_count > 0) ? "#b45309" : "var(--text-muted)" }}>

                        {bulkPreflightData.login_unlinked_count || 0}

                      </div>

                      <div style={{ fontSize: "11px", color: (bulkPreflightData.login_unlinked_count > 0) ? "#b45309" : "var(--text-muted)", marginTop: "2px" }}>Logins Unlinked</div>

                    </div>



                    <div style={{ background: (bulkPreflightData.blocked_duty_count > 0) ? "#fef2f2" : "#f8fafc", border: `1px solid ${(bulkPreflightData.blocked_duty_count > 0) ? "#fecaca" : "var(--border-color)"}`, borderRadius: "8px", padding: "10px 6px", textAlign: "center" }}>

                      <div style={{ fontSize: "18px", fontWeight: 700, color: (bulkPreflightData.blocked_duty_count > 0) ? "#dc2626" : "var(--text-muted)" }}>

                        {bulkPreflightData.blocked_duty_count || 0}

                      </div>

                      <div style={{ fontSize: "11px", color: (bulkPreflightData.blocked_duty_count > 0) ? "#dc2626" : "var(--text-muted)", marginTop: "2px" }}>Active Duties</div>

                    </div>

                  </div>



                  {/* Historical Preservation Banner */}

                  {(bulkPreflightData.historical_preserved_count > 0 || bulkPreflightData.eligible_history_count > 0) && (

                    <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "8px", padding: "12px 14px", marginBottom: "14px" }}>

                      <div style={{ fontWeight: 600, color: "#6d28d9", fontSize: "13px" }}>

                        🏛️ Safe Historical Record Preservation: {bulkPreflightData.historical_preserved_count || 0} Past Duty Record(s) Preserved

                      </div>

                      <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#5b21b6", lineHeight: 1.5 }}>

                        An indelible snapshot (faculty name, designation, original ID, email) is automatically attached to all completed duty registers and examination logs before faculty master records are removed. Past examination reports, attendance sheets, and duty registers will continue displaying the original faculty details accurately.

                      </p>

                    </div>

                  )}



                  {/* Login Account Unlinking Banner */}

                  {bulkPreflightData.login_unlinked_count > 0 && (

                    <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px" }}>

                      <div style={{ fontWeight: 600, color: "#92400e", fontSize: "12.5px" }}>

                        🔑 Account Safety: {bulkPreflightData.login_unlinked_count} Institutional Login Account(s) Will Be Safely Unlinked

                      </div>

                      <p style={{ margin: "3px 0 0", fontSize: "11.5px", color: "#78350f" }}>

                        User authentication accounts will not be deleted. Faculty master associations are safely cleared and accounts deactivated.

                      </p>

                    </div>

                  )}



                  {/* Active Duty Guard Alert */}

                  {bulkPreflightData.blocked_duty_count > 0 && (

                    <div className="alert alert-warning" style={{ marginBottom: "14px" }}>

                      <span>⚠️</span>

                      <div>

                        <strong>Upcoming Duty Guard Active:</strong>

                        <p style={{ margin: "4px 0 0", fontSize: "12.5px" }}>

                          {bulkPreflightData.blocking_reason}

                        </p>

                      </div>

                    </div>

                  )}



                  {/* Faculty Member Breakdown Table/List */}

                  <div style={{ marginBottom: "14px" }}>

                    <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--primary-navy)", marginBottom: "6px" }}>

                      Selected Faculty Members &amp; Dependency Status:

                    </div>

                    <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "8px", background: "#ffffff" }}>

                      {(bulkPreflightData.faculty_preview || []).map((fac) => {

                        const isSafe = fac.category === "safe" || fac.category === "eligible_with_history";

                        return (

                          <div

                            key={fac.faculty_id}

                            style={{

                              padding: "8px 12px",

                              borderBottom: "1px solid #f1f5f9",

                              display: "flex",

                              justifyContent: "space-between",

                              alignItems: "center",

                              gap: "8px",

                              background: isSafe ? "#ffffff" : "#fffbfb",

                            }}

                          >

                            <div style={{ flex: 1, minWidth: 0 }}>

                              <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--primary-navy)" }}>

                                {fac.faculty_name} <span style={{ color: "var(--text-muted)", fontSize: "11.5px", fontWeight: 400 }}>({fac.department})</span>

                              </div>

                              <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", marginTop: "2px" }}>

                                {fac.email} {fac.designation && `· ${fac.designation}`}

                              </div>

                              {fac.blocking_reason && (

                                <div style={{ fontSize: "11.5px", color: "#dc2626", marginTop: "3px" }}>

                                  ⚠️ {fac.blocking_reason}

                                </div>

                              )}

                            </div>

                            <span

                              style={{

                                fontSize: "11px",

                                padding: "2px 8px",

                                borderRadius: "10px",

                                fontWeight: 700,

                                whiteSpace: "nowrap",

                                background: isSafe ? (fac.category === "eligible_with_history" ? "#ede9fe" : "#dcfce7") : "#fee2e2",

                                color: isSafe ? (fac.category === "eligible_with_history" ? "#6d28d9" : "#15803d") : "#b91c1c",

                              }}

                            >

                              {fac.category_label || (isSafe ? "Safe to Delete" : "Protected")}

                            </span>

                          </div>

                        );

                      })}

                    </div>

                  </div>

                </div>

              ) : null}

            </div>



            <div className="modal-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>

              <button

                type="button"

                className="btn btn-secondary"

                onClick={() => {

                  setShowBulkDeleteModal(false);

                  setBulkPreflightData(null);

                  setBulkModalError("");

                }}

                disabled={bulkProcessing}

              >

                Cancel

              </button>



              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>

                {bulkPreflightData?.blocked_duty_count > 0 && (

                  <button

                    type="button"

                    className="btn btn-secondary"

                    style={{ background: "#475569", color: "#ffffff", borderColor: "#334155" }}

                    onClick={() => handleExecuteBulkFaculty("deactivate", false, true)}

                    disabled={checkingBulkPreflight || bulkProcessing}

                    title="Deactivate only the faculty members with active upcoming duties"

                  >

                    {bulkProcessing ? "Processing..." : `🛡️ Deactivate Blocked Only (${bulkPreflightData.blocked_duty_count})`}

                  </button>

                )}



                {bulkPreflightData?.blocked_duty_count > 0 && bulkPreflightData?.safe_count > 0 && (

                  <button

                    type="button"

                    className="btn btn-warning"

                    style={{ background: "#f59e0b", color: "#ffffff", borderColor: "#d97706" }}

                    onClick={() => handleExecuteBulkFaculty("delete", true)}

                    disabled={checkingBulkPreflight || bulkProcessing}

                    title="Permanently delete eligible records with history preservation"

                  >

                    {bulkProcessing ? "Deleting..." : `Delete Safe Records Only (${bulkPreflightData.safe_count})`}

                  </button>

                )}



                {bulkPreflightData?.can_safe_delete && (

                  <button

                    type="button"

                    className="btn btn-danger"

                    onClick={() => handleExecuteBulkFaculty("delete")}

                    disabled={checkingBulkPreflight || bulkProcessing}

                  >

                    {bulkProcessing ? "Deleting..." : `🗑️ Permanently Delete Selected (${bulkPreflightData.safe_count})`}

                  </button>

                )}

              </div>

            </div>

          </div>

        </div>

      )}

      {/* Bulk Teaching Assignment Deletion Confirmation Modal */}
      {showBulkDeleteMappingModal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
        >
          <div
            className="modal-container"
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "800px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "16px 24px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#fff1f2",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "22px" }}>🗑️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#9f1239" }}>
                    Bulk Teaching Assignment Deletion
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#881337" }}>
                    Total Selected Mappings: <strong>{selectedMappingIds.length}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !bulkDeletingMappings && setShowBulkDeleteMappingModal(false)}
                style={{
                  border: "none",
                  background: "none",
                  fontSize: "20px",
                  color: "#9f1239",
                  cursor: "pointer",
                }}
                disabled={bulkDeletingMappings}
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              {/* Safeguards Alert */}
              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "16px",
                  fontSize: "12.5px",
                  color: "#1e40af",
                  lineHeight: 1.5,
                }}
              >
                <strong>🛡️ Database Rules &amp; Safeguards:</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: "20px" }}>
                  <li>Only the selected teaching assignment records will be removed.</li>
                  <li>Faculty master profiles in the Directory and user login accounts remain <strong>100% safe &amp; untouched</strong>.</li>
                  <li>Subject catalogue records and examination schedules will <strong>never</strong> be deleted.</li>
                  <li>Historical records are preserved and safely archived for compliance.</li>
                </ul>
              </div>

              {/* Selected Mappings Table */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
                <div
                  style={{
                    padding: "8px 14px",
                    background: "#f8fafc",
                    borderBottom: "1px solid #e2e8f0",
                    fontWeight: 600,
                    fontSize: "13px",
                    color: "#334155",
                  }}
                >
                  Selected Teaching Assignments to Delete ({selectedMappingsDetails.length})
                </div>
                <div style={{ maxHeight: "280px", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9", textAlign: "left", color: "#475569" }}>
                        <th style={{ padding: "8px 12px" }}>#</th>
                        <th style={{ padding: "8px 12px" }}>Faculty Name</th>
                        <th style={{ padding: "8px 12px" }}>Subject Code &amp; Title</th>
                        <th style={{ padding: "8px 12px" }}>Academic Year</th>
                        <th style={{ padding: "8px 12px" }}>Semester</th>
                        <th style={{ padding: "8px 12px" }}>Section</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedMappingsDetails.map((m, idx) => (
                        <tr key={m.id || idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "8px 12px", color: "#64748b" }}>{idx + 1}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--primary-navy)" }}>
                            {m.faculty_name}
                            <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 400 }}>{m.email || m.designation || "Faculty"}</div>
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <strong style={{ color: "#0369a1" }}>{m.subject_code}</strong>
                            <div style={{ fontSize: "11px", color: "#475569" }}>{m.subject_name}</div>
                          </td>
                          <td style={{ padding: "8px 12px", color: "#334155" }}>
                            {m.academic_year || "2026-2027"}
                          </td>
                          <td style={{ padding: "8px 12px", color: "#334155" }}>
                            {m.semester}
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
                              {m.section ? `Section ${m.section}` : "All Sections"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "14px 24px",
                borderTop: "1px solid #e2e8f0",
                background: "#f8fafc",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowBulkDeleteMappingModal(false)}
                disabled={bulkDeletingMappings}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}
                onClick={handleConfirmBulkDelete}
                disabled={bulkDeletingMappings}
              >
                {bulkDeletingMappings ? (
                  <span>Deleting Mappings...</span>
                ) : (
                  <>
                    <span>🗑️</span> Delete Selected Mappings ({selectedMappingIds.length})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>

  );

}
