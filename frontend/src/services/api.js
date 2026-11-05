const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";







const TOKEN_KEY = "smart_exam_token";



const USER_KEY = "smart_exam_user";







export function getStoredToken() {



  return localStorage.getItem(TOKEN_KEY) || "";



}







export function setStoredToken(token) {



  if (token) {



    localStorage.setItem(TOKEN_KEY, token);



  } else {



    localStorage.removeItem(TOKEN_KEY);



  }



}







export function getStoredUser() {



  const data = localStorage.getItem(USER_KEY);



  if (!data) return null;



  try {



    return JSON.parse(data);



  } catch {



    return null;



  }



}







export function setStoredUser(user) {



  if (user) {



    localStorage.setItem(USER_KEY, JSON.stringify(user));



  } else {



    localStorage.removeItem(USER_KEY);



  }



}







export function clearStoredAuth() {



  localStorage.removeItem(TOKEN_KEY);



  localStorage.removeItem(USER_KEY);



}







export async function request(endpoint, options = {}) {



  const url = `${BASE_URL}${endpoint}`;



  const token = getStoredToken();







  const headers = {



    ...(options.headers || {}),



  };







  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {



    headers["Content-Type"] = "application/json";



  }







  if (token && !headers["Authorization"]) {



    headers["Authorization"] = `Bearer ${token}`;



  }







  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (netErr) {
    throw new Error(`Unable to connect to the examination server (${url}). Please ensure the backend is running.`);
  }







  if (response.status === 401) {



    clearStoredAuth();



    window.dispatchEvent(new CustomEvent("auth:unauthorized"));



  }







  let data = null;



  const contentType = response.headers.get("content-type") || "";



  if (contentType.includes("application/json")) {



    data = await response.json();



  } else {



    data = await response.text();



  }







  if (!response.ok) {



    const errorMessage =



      (data && typeof data === "object" && data.error) ||



      (data && typeof data === "object" && data.message) ||



      (typeof data === "string" && data) ||



      `Request failed with status ${response.status}`;



    const error = new Error(errorMessage);



    error.status = response.status;



    error.data = data;



    throw error;



  }







  return data;



}







export const api = {



  baseUrl: BASE_URL,







  // Auth routes



  login: (email, password) =>



    request("/auth/login", {



      method: "POST",



      body: JSON.stringify({ email, password }),



    }),







  signup: (payload) =>



    request("/auth/signup", {



      method: "POST",



      body: JSON.stringify(payload),



    }),







  getMe: () => request("/auth/me", { method: "GET" }),

  sendOtp: (payload) =>
    request("/auth/send-otp", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  verifyOtp: (payload) =>
    request("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  forgotPassword: (email) =>
    request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (payload) =>
    request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getFacultyLookup: () => request("/auth/faculty-lookup", { method: "GET" }),

  createStaffAccount: (payload) =>
    request("/admin/staff-accounts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getStaffAccounts: () => request("/admin/staff-accounts", { method: "GET" }),







  // Core data routes



  getAnalytics: (examId) => {



    const query = examId ? `?exam_id=${encodeURIComponent(examId)}` : "";



    return request(`/analytics${query}`, { method: "GET" });



  },







  // Subjects



  getSubjects: () => request("/subjects", { method: "GET" }),







  createSubject: (payload) =>



    request("/subjects", {



      method: "POST",



      body: JSON.stringify(payload),



    }),







  updateSubject: (subjectId, payload) =>



    request(`/subjects/${subjectId}`, {



      method: "PUT",



      body: JSON.stringify(payload),



    }),







    getSubjectDependencies: (subjectId) =>
    request(`/subjects/${subjectId}/dependencies`, {
      method: "GET",
    }),

  archiveSubject: (subjectId) =>
    request(`/subjects/${subjectId}/archive`, {
      method: "POST",
    }),

  deleteSubject: (subjectId) =>
    request(`/subjects/${subjectId}`, {
      method: "DELETE",
    }),

  checkSubjectDeletion: (payload) =>
    request("/subjects/deletion-check", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  bulkDeleteSubjects: (payload) =>
    request("/subjects/bulk-delete", {
      method: "POST",
      body: JSON.stringify(payload),
    }),







  // Examinations



  getExams: () => request("/exams", { method: "GET" }),







  createExam: (payload) =>



    request("/exams", {



      method: "POST",



      body: JSON.stringify(payload),



    }),







  updateExam: (examId, payload) =>



    request(`/exams/${examId}`, {



      method: "PUT",



      body: JSON.stringify(payload),



    }),







  deleteExam: (examId) =>
    request(`/exams/${examId}`, {
      method: "DELETE",
    }),

  checkExamDeletion: (examId) =>
    request(`/exams/${examId}/deletion-check`, {
      method: "GET",
    }),

  archiveExam: (examId) =>
    request(`/exams/${examId}/archive`, {
      method: "POST",
    }),

  restoreExam: (examId) =>
    request(`/exams/${examId}/restore`, {
      method: "POST",
    }),

  updateExamStatus: (examId, status) =>
    request(`/exams/${examId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),

  cancelExam: (examId, reason) =>
    request(`/exams/${examId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ cancellation_reason: reason }),
    }),

  rescheduleExam: (examId, payload) =>
    request(`/exams/${examId}/reschedule`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),



  publishExam: (examId, publish = true) =>



    request(`/exams/${examId}/publish`, {



      method: "POST",



      body: JSON.stringify({ publish }),



    }),







  getExamStudents: (examId) =>



    request(`/exams/${examId}/students`, { method: "GET" }),







  uploadExamStudents: (examId, file, isPreview = false, autoAllocate = false) => {



    const formData = new FormData();



    formData.append("file", file);



    if (isPreview) {



      formData.append("preview", "true");



    }



    if (autoAllocate) {



      formData.append("auto_allocate", "true");



    }



    return request(`/exams/${examId}/upload-students`, {



      method: "POST",



      body: formData,



    });



  },







    batchImportRoster: (formDataOrFile, optionsOrIsPreview = false) => {
    let body;
    if (formDataOrFile instanceof FormData) {
      body = formDataOrFile;
      if (typeof optionsOrIsPreview === "boolean") {
        if (optionsOrIsPreview && !body.has("preview")) {
          body.append("preview", "true");
        }
      } else if (optionsOrIsPreview && typeof optionsOrIsPreview === "object") {
        Object.entries(optionsOrIsPreview).forEach(([k, v]) => {
          if (!body.has(k) && v !== undefined && v !== null) {
            body.append(k, String(v));
          }
        });
      }
    } else {
      body = new FormData();
      if (formDataOrFile instanceof Blob || (typeof File !== "undefined" && formDataOrFile instanceof File)) {
        body.append("file", formDataOrFile);
      }
      if (typeof optionsOrIsPreview === "boolean") {
        if (optionsOrIsPreview) {
          body.append("preview", "true");
        }
      } else if (optionsOrIsPreview && typeof optionsOrIsPreview === "object") {
        Object.entries(optionsOrIsPreview).forEach(([k, v]) => {
          if (v !== undefined && v !== null) {
            body.append(k, String(v));
          }
        });
      }
    }
    return request("/batch-import-roster", {
      method: "POST",
      body,
    });
  },







  getAvailableHallsForExam: (examId) =>
    request(`/exams/${examId}/available-halls`, { method: "GET" }),

  getExamHalls: (examId) =>
    request(`/exams/${examId}/halls`, { method: "GET" }),

  saveExamHalls: (examId, hallIds) =>
    request(`/exams/${examId}/halls`, {
      method: "POST",
      body: JSON.stringify({ hall_ids: hallIds }),
    }),







  // Students general



  getStudents: (params) => {
    let url = "/students";
    if (params && typeof params === "object") {
      const q = new URLSearchParams(params).toString();
      if (q) url += `?${q}`;
    }
    return request(url, { method: "GET" });
  },







  uploadStudentsCsv: (file) => {



    const formData = new FormData();



    formData.append("file", file);



    return request("/upload-students", {



      method: "POST",



      body: formData,



    });



  },







  // Halls management



  getHalls: () => request("/halls", { method: "GET" }),
  uploadHallsPreview: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return request("/halls/upload-preview", {
      method: "POST",
      body: formData,
    });
  },

  bulkImportHalls: (halls) =>
    request("/halls/bulk-import", {
      method: "POST",
      body: JSON.stringify({ halls }),
    }),








  createHall: (payload) =>



    request("/halls", {



      method: "POST",



      body: JSON.stringify(payload),



    }),







  updateHall: (hallId, payload) =>



    request(`/halls/${hallId}`, {



      method: "PUT",



      body: JSON.stringify(payload),



    }),







  deleteHall: (hallId) =>



    request(`/halls/${hallId}`, {



      method: "DELETE",



    }),

  checkHallDeletion: (payload) =>
    request("/halls/deletion-check", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  bulkDeleteHalls: (payload) =>
    request("/halls/bulk-delete", {
      method: "POST",
      body: JSON.stringify(payload),
    }),







  // Faculty management



  getFaculty: () => request("/faculty", { method: "GET" }),







  createFaculty: (payload) =>



    request("/faculty", {



      method: "POST",



      body: JSON.stringify(payload),



    }),







  updateFaculty: (facultyId, payload) =>



    request(`/faculty/${facultyId}`, {



      method: "PUT",



      body: JSON.stringify(payload),



    }),







  deleteFaculty: (facultyId) =>
    request(`/faculty/${facultyId}`, {
      method: "DELETE",
    }),

  checkFacultyDeletion: (payload) =>
    request("/faculty/deletion-check", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  bulkDeleteFaculty: (payload) =>
    request("/faculty/bulk-delete", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  bulkUpdateFacultyStatus: (payload) =>
    request("/faculty/bulk-status", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  uploadFacultyDirectory: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return request("/faculty/upload-directory", {
      method: "POST",
      body: formData,
    });
  },

  uploadSemesterTeaching: (file, academicYear = "2026-2027", semester = "") => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("academic_year", academicYear);
    if (semester) {
      formData.append("semester", semester);
    }
    return request("/faculty/upload-semester-teaching", {
      method: "POST",
      body: formData,
    });
  },

  uploadFacultyPreview: (file, academicYear = "2026-2027", semester = "") => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("academic_year", academicYear);
    formData.append("semester", semester || "");
    return request("/faculty/upload-preview", {
      method: "POST",
      body: formData,
    });
  },

  bulkImportFacultyMappings: (payload) =>
    request("/faculty/bulk-import-mappings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  uploadFaculty: (file, replaceExisting = false, academicYear = "2026-2027", semester = "Semester 5") => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("replace_existing", replaceExisting ? "true" : "false");
    formData.append("academic_year", academicYear);
    formData.append("semester", semester);
    return request("/faculty/upload", {
      method: "POST",
      body: formData,
    });
  },







  // Seat Allocations (with optional custom hall_ids or auto-allocation)



  getSeatAllocations: (examId) =>



    request(`/seat-allocations?exam_id=${encodeURIComponent(examId)}`, {



      method: "GET",



    }),







  allocateSeats: (examId, hallIds = null, reallocateAll = false) => {



    const payload = { exam_id: Number(examId) };



    if (hallIds && Array.isArray(hallIds) && hallIds.length > 0) {



      payload.hall_ids = hallIds.map(Number);
    }
    if (reallocateAll) {
      payload.reallocate_all = true;



    }



    return request("/allocate-seats", {



      method: "POST",



      body: JSON.stringify(payload),



    });



  },







  registerSupplementary: (examId, hallTicketNo) =>



    request("/register-supplementary", {



      method: "POST",



      body: JSON.stringify({



        exam_id: Number(examId),



        hall_ticket_no: hallTicketNo.trim(),



      }),



    }),







  // Invigilators



  getInvigilatorAssignments: (examId, facultyId) => {



    const params = new URLSearchParams();



    if (examId) params.append("exam_id", examId);



    if (facultyId) params.append("faculty_id", facultyId);



    const query = params.toString() ? `?${params.toString()}` : "";



    return request(`/invigilator-assignments${query}`, { method: "GET" });



  },







  assignInvigilators: (examId) =>



    request("/assign-invigilators", {



      method: "POST",



      body: JSON.stringify({ exam_id: Number(examId) }),



    }),







  respondDuty: (assignmentId, actionOrPayload, reason = "", message = "") => {
    let payload = {};
    if (typeof actionOrPayload === "object" && actionOrPayload !== null) {
      payload = {
        action: actionOrPayload.action || actionOrPayload.response || "accept",
        reason: actionOrPayload.reason || actionOrPayload.decline_reason || "",
        message: actionOrPayload.message || actionOrPayload.message_to_admin || "",
      };
    } else {
      payload = { action: actionOrPayload, reason, message };
    }
    return request(`/invigilators/${assignmentId}/respond`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },







  sendInvigilatorMessage: (assignmentId, message) =>



    request(`/invigilators/${assignmentId}/message`, {



      method: "POST",



      body: JSON.stringify({ message }),



    }),







  reassignInvigilator: (assignmentId, newFacultyId, reason = "") =>
    request("/reassign-invigilator", {
      method: "POST",
      body: JSON.stringify({
        assignment_id: assignmentId,
        new_faculty_id: newFacultyId,
        reason: reason,
      }),
    }),

  getEligibleReplacements: (assignmentId) =>
    request(`/invigilators/${assignmentId}/eligible-replacements`, { method: "GET" }),

  getAdminNotifications: () =>
    request("/admin/notifications", { method: "GET" }),

  markNotificationRead: (notificationId) =>
    request(`/notifications/${notificationId}/read`, { method: "PUT" }),

  markAllNotificationsRead: () =>
    request("/notifications/mark-all-read", { method: "POST" }),

  getPendingReassignments: (status = "pending") =>
    request(`/admin/pending-reassignments?status=${encodeURIComponent(status)}`, { method: "GET" }),







  // HOD Daily schedule



  getHodDailySchedule: (dateStr) =>



    request(`/hod/daily-schedule?date=${encodeURIComponent(dateStr)}`, { method: "GET" }),
  getHodHallRoster: (examId, hallId) =>
    request(`/hod/hall-roster?exam_id=${encodeURIComponent(examId)}&hall_id=${encodeURIComponent(hallId)}`, { method: "GET" }),








  // Conflicts



  auditTeachingConflicts: () =>
    request("/admin/teaching-conflicts-audit", { method: "GET" }),

  checkConflicts: (examId) =>



    request("/check-conflicts", {



      method: "POST",



      body: JSON.stringify({ exam_id: Number(examId) }),



    }),







  // Student seat search



    getStudentMyExams: () =>
    request("/student/my-exams", { method: "GET" }),

  getStudentMySeat: (examId) =>
    request(`/student/my-seat?exam_id=${encodeURIComponent(examId)}`, { method: "GET" }),

getStudentSeat: (hallTicketNo, examId) => {



    const params = new URLSearchParams({



      hall_ticket_no: hallTicketNo.trim(),



      exam_id: String(examId).trim(),



    });



    return request(`/student-seat?${params.toString()}`, { method: "GET" });



  },







  // Reports



  getReportUrl: (reportType, examId, filterParam = {}) => {



    const endpoints = {



      seating: "seating-chart",



      attendance: "attendance-sheet",



      duties: "duty-slips",



    };



    const endpoint = endpoints[reportType] || reportType;



    const params = new URLSearchParams();



    if (examId) params.append("exam_id", examId);



    if (filterParam.hall_id) params.append("hall_id", filterParam.hall_id);



    if (filterParam.faculty_id) params.append("faculty_id", filterParam.faculty_id);



    return `${BASE_URL}/reports/${endpoint}?${params.toString()}`;



  },







  // Student Batches, Deletion & Dynamic Section APIs
  getStudentBatches: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/student-batches${qs ? `?${qs}` : ""}`, { method: "GET" });
  },

  checkStudentDeletion: (payload) =>
    request("/students/deletion-check", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  deleteStudents: (payload) =>
    request("/students/delete", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  previewSubjectUpload: (formData) =>
    request("/subjects/preview", {
      method: "POST",
      body: formData,
    }),

  bulkImportSubjects: (payload) =>
    request("/subjects/bulk-import", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getCohortSections: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/students/cohort-sections${qs ? `?${qs}` : ""}`, { method: "GET" });
  },

  previewSectionRoster: (formData) =>
    request("/students/preview-section", {
      method: "POST",
      body: formData,
    }),

  importSectionRoster: (payload) =>
    request("/students/import-section", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  previewStudentPromotion: (payload) =>
    request("/students/promote-preview", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  executeStudentPromotion: (payload) =>
    request("/students/promote", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getPromotionHistory: () =>
    request("/students/promotions", { method: "GET" }),

  checkClearUploadHistory: (payload = {}) =>
    request("/upload-history/clear-check", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  clearUploadHistory: (payload = {}) =>
    request("/upload-history/clear", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getDailyDutyRegisterUrl: (dateStr, session = "", examId = "", studyYear = "", semester = "") => {
    const params = new URLSearchParams();
    if (dateStr) params.append("date", dateStr);
    if (session) params.append("session", session);
    if (examId) params.append("exam_id", examId);
    if (studyYear) params.append("study_year", studyYear);
    if (semester) params.append("semester", semester);
    return `${BASE_URL}/reports/daily-duty-register?${params.toString()}`;
  },

  getReportFilterOptions: (params = {}) => {
    const query = new URLSearchParams();
    if (params.academic_year) query.append("academic_year", params.academic_year);
    if (params.study_year) query.append("study_year", params.study_year);
    if (params.semester) query.append("semester", params.semester);
    if (params.department) query.append("department", params.department);
    const qStr = query.toString();
    return request(`/reports/filter-options${qStr ? `?${qStr}` : ""}`);
  },

  getReportPreviewData: (examId, hallId = "", studyYear = "", semester = "") => {
    const params = new URLSearchParams({ exam_id: examId });
    if (hallId) params.append("hall_id", hallId);
    if (studyYear) params.append("study_year", studyYear);
    if (semester) params.append("semester", semester);
    return request(`/reports/preview-data?${params.toString()}`);
  },

  getCombinedPdfUrl: (examId, studyYear = "", semester = "") => {
    const params = new URLSearchParams({ exam_id: examId });
    if (studyYear) params.append("study_year", studyYear);
    if (semester) params.append("semester", semester);
    return `${BASE_URL}/reports/combined-pdf?${params.toString()}`;
  },

  getReportsZipUrl: (examId, studyYear = "", semester = "") => {
    const params = new URLSearchParams({ exam_id: examId });
    if (studyYear) params.append("study_year", studyYear);
    if (semester) params.append("semester", semester);
    return `${BASE_URL}/reports/export-zip?${params.toString()}`;
  },

  // Faculty Master Data & Teaching Profiles
  getFacultyCourseProfiles: () =>
    request("/faculty/course-profiles", { method: "GET" }),

  confirmCourseProfiles: (payload) =>
    request("/faculty/course-profiles/confirm", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getFacultySubjectAllocations: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/faculty/subject-allocations${qs ? `?${qs}` : ""}`, {
      method: "GET",
    });
  },

  saveFacultySubjectAllocations: (payload) =>
    request("/faculty/subject-allocations", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateFacultySubjectAllocation: (allocationId, payload) =>
    request(`/faculty/subject-allocations/${allocationId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteFacultySubjectAllocation: (allocationId) =>
    request(`/faculty/subject-allocations/${allocationId}`, {
      method: "DELETE",
    }),

  bulkDeleteFacultySubjectAllocations: (allocationIds) =>
    request("/faculty/subject-allocations/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ allocation_ids: allocationIds }),
    }),

  manualAssignInvigilator: (payload) =>
    request("/assign-invigilator", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Individual Student Management
  addStudentIndividual: (payload) =>
    request("/students/individual", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateStudent: (studentId, payload) =>
    request(`/students/${studentId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),




};







export default api;



