/**
 * Cover Craft — Interactive Form & Live Preview Controller
 * Handles datalist cascading, auto-fill, live A4 preview binding,
 * multi-teacher dynamic management, logo upload validation/persistence,
 * and debounced draft persistence with seamless backward migration.
 */

import {
  saveLogo,
  loadLogo,
  deleteLogo,
  saveDraft,
  loadDraft,
  clearDraft,
  isStorageAvailable,
} from "./storage.js";

export const DEFAULT_LOGO_SVG = `<svg viewBox="0 0 139 136" width="36.78mm" height="35.97mm" xmlns="http://www.w3.org/2000/svg"><rect width="139" height="136" fill="#e5e7eb" stroke="#9ca3af" stroke-width="2" rx="4"/><text x="50%" y="45%" text-anchor="middle" dominant-baseline="middle" font-family="'Times New Roman', Times, serif" font-size="16" font-weight="bold" fill="#4b5563">LOGO</text><text x="50%" y="65%" text-anchor="middle" dominant-baseline="middle" font-family="'Times New Roman', Times, serif" font-size="11" fill="#6b7280">36.8 × 36 mm</text></svg>`;

export const DEFAULT_FORM_VALUES = {
  university:
    "Bangladesh Army University of Science and Technology (BAUST), Saidpur",
  department: "",
  level: "2",
  term: "II",
};

const isBrowser = typeof document !== "undefined";

let dropdownData = {
  universities: [],
  departments: [],
  courses: [],
};

let currentFilteredCourses = [];
let saveTimeout = null;
let isApplyingRemoteChange = false;
let lastStatusMessage = "";
let lastStatusTime = 0;
let currentLogoState = "default"; // 'user' | 'default' | 'none'

// Multi-Teacher State (Phase 7: role removed, { name, designation })
let teachers = [{ name: "", designation: "" }];

// Form DOM Elements (guarded for Node import)
const docTypeRadios = isBrowser
  ? document.querySelectorAll('input[name="doc-type"]')
  : [];
const clearFormBtn = isBrowser ? document.getElementById("clear-form") : null;
const universityInput = isBrowser
  ? document.getElementById("university")
  : null;
const departmentInput = isBrowser
  ? document.getElementById("department")
  : null;
const levelSelect = isBrowser ? document.getElementById("level") : null;
const termSelect = isBrowser ? document.getElementById("term") : null;
const courseCodeInput = isBrowser
  ? document.getElementById("course-code")
  : null;
const courseTitleInput = isBrowser
  ? document.getElementById("course-title")
  : null;
const docNumberInput = isBrowser ? document.getElementById("doc-number") : null;
const docTitleInput = isBrowser ? document.getElementById("doc-title") : null;
const commentInput = isBrowser ? document.getElementById("comment") : null;
const studentNameInput = isBrowser
  ? document.getElementById("student-name")
  : null;
const studentIdInput = isBrowser ? document.getElementById("student-id") : null;
const experimentDateInput = isBrowser
  ? document.getElementById("experiment-date")
  : null;
const submissionDateInput = isBrowser
  ? document.getElementById("submission-date")
  : null;

// Multi-Teacher Form Elements
const teachersFormContainer = isBrowser
  ? document.getElementById("teachers-form-container")
  : null;
const addTeacherBtn = isBrowser ? document.getElementById("add-teacher") : null;

// Logo and Storage Status Elements
const logoUploadInput = isBrowser
  ? document.getElementById("logo-upload")
  : null;
const removeLogoBtn = isBrowser
  ? document.getElementById("remove-logo") ||
    document.getElementById("reset-logo-btn")
  : null;
const logoErrorEl = isBrowser ? document.getElementById("logo-error") : null;
const storageStatusEl = isBrowser
  ? document.getElementById("storage-status")
  : null;
const cascadeHintEl = isBrowser
  ? document.getElementById("cascade-hint")
  : null;

// Form Layout Helper Elements
const experimentDateGroup = isBrowser
  ? document.getElementById("experiment-date-group")
  : null;
const docNumberLabel = isBrowser
  ? document.getElementById("doc-number-label")
  : null;
const docTitleLabel = isBrowser
  ? document.getElementById("doc-title-label")
  : null;

// Datalist Elements
const universitiesDatalist = isBrowser
  ? document.getElementById("universities-list")
  : null;
const departmentsDatalist = isBrowser
  ? document.getElementById("departments-list")
  : null;
const courseCodesDatalist = isBrowser
  ? document.getElementById("course-codes-list")
  : null;
const courseTitlesDatalist = isBrowser
  ? document.getElementById("course-titles-list")
  : null;

// Preview DOM Elements
const coverPreviewWrapper = isBrowser
  ? document.getElementById("cover-preview")
  : null;
const a4CoverEl = coverPreviewWrapper
  ? coverPreviewWrapper.querySelector(".a4-cover")
  : null;
const previewViewport = isBrowser
  ? document.getElementById("preview-viewport")
  : null;
const previewDocNumberLabel = isBrowser
  ? document.getElementById("preview-doc-number-label") ||
    document.getElementById("preview-meta-num-label")
  : null;
const previewDocTitleLabel = isBrowser
  ? document.getElementById("preview-doc-title-label") ||
    document.getElementById("preview-meta-title-label")
  : null;
const logoBoxEl = coverPreviewWrapper
  ? coverPreviewWrapper.querySelector(".logo-box")
  : null;

// Preview Card & Teacher Elements
const teachersPreviewContainer = coverPreviewWrapper
  ? coverPreviewWrapper.querySelector('[data-field="teachers-list"]')
  : null;
const cardSubmittedTo = coverPreviewWrapper
  ? coverPreviewWrapper.querySelector(".card-submitted-to")
  : null;
const cardSubmittedBy = coverPreviewWrapper
  ? coverPreviewWrapper.querySelector(".card-submitted-by")
  : null;
const signatureLineEl = coverPreviewWrapper
  ? coverPreviewWrapper.querySelector(".sub-to-row-sign")
  : null;

/**
 * Format YYYY-MM-DD input date to DD/MM/YYYY for cover preview
 */
export function formatDate(isoDate) {
  if (!isoDate || typeof isoDate !== "string") return "";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const [yyyy, mm, dd] = parts;
  if (!yyyy || !mm || !dd) return isoDate;
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Flexible department lookup supporting exact code, full name, substring match, or word-level partial match (Phase 7F)
 */
export function matchDepartment(departments, deptIn) {
  if (!deptIn || !Array.isArray(departments)) return null;
  const input = deptIn.trim().toLowerCase();
  if (!input) return null;

  // 1. Exact code match (e.g. "EEE", "CSE")
  const codeMatch = departments.find(
    (d) => d.code && d.code.toLowerCase() === input,
  );
  if (codeMatch) return codeMatch;

  // 2. Exact full name match
  const exactNameMatch = departments.find(
    (d) => d.name && d.name.toLowerCase() === input,
  );
  if (exactNameMatch) return exactNameMatch;

  // 3. Substring match in department name (e.g. "Computer", "Electrical", "Mechanical", "Civil")
  const partialNameMatch = departments.find(
    (d) => d.name && d.name.toLowerCase().includes(input),
  );
  if (partialNameMatch) return partialNameMatch;

  // 4. Code contained in input (e.g. "(EEE)", "CSE Department")
  const codeSubMatch = departments.find(
    (d) =>
      d.code &&
      (input.includes(`(${d.code.toLowerCase()})`) ||
        input.includes(d.code.toLowerCase())),
  );
  if (codeSubMatch) return codeSubMatch;

  // 5. Input contained in stripped name or vice versa
  const strippedMatch = departments.find((d) => {
    const stripped = (d.name || "")
      .toLowerCase()
      .replace(/^department\s+of\s+/i, "")
      .trim();
    return stripped && (stripped.includes(input) || input.includes(stripped));
  });
  if (strippedMatch) return strippedMatch;

  // 6. Word-level match (e.g. "Electrical Engineering" -> matches "Department of Electrical and Electronic Engineering (EEE)")
  const words = input.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const wordMatch = departments.find((d) => {
      const dLower = (d.name || "").toLowerCase();
      return words.every((w) => dLower.includes(w));
    });
    if (wordMatch) return wordMatch;
  }

  return null;
}

/**
 * Filter course catalogue by department code/name, level, and term
 */
export function filterCourses(
  courses,
  departments,
  { departmentInput: deptIn, level, term },
) {
  const deptInputVal = (deptIn || "").trim();
  let matchedDeptCode = null;

  if (deptInputVal && Array.isArray(departments)) {
    const matchedDept = matchDepartment(departments, deptInputVal);
    if (matchedDept) {
      matchedDeptCode = matchedDept.code;
    }
  }

  const levelVal =
    level !== null && level !== undefined && level !== ""
      ? parseInt(level, 10)
      : null;
  const termVal = term ? String(term).trim() : null;

  let filtered = Array.isArray(courses) ? courses : [];

  if (matchedDeptCode) {
    filtered = filtered.filter((c) => c.dept === matchedDeptCode);
  } else if (deptInputVal) {
    // Department provided but not recognized in catalogue
    filtered = [];
  }
  // If deptInputVal is empty, courses are NOT filtered by department,
  // allowing Level + Term alone to populate courses across departments!

  if (levelVal !== null && !isNaN(levelVal)) {
    filtered = filtered.filter((c) => c.level === levelVal);
  }

  if (termVal) {
    filtered = filtered.filter((c) => c.term === termVal);
  }

  return filtered;
}

/**
 * Lookup course by code (case-insensitive and whitespace-forgiving)
 */
export function findCourseByCode(courses, code) {
  if (!code || !Array.isArray(courses)) return null;
  const target = code.trim().toLowerCase();
  const targetNoSpace = target.replace(/\s+/g, "");
  return (
    courses.find((c) => {
      const cCode = c.code.trim().toLowerCase();
      return cCode === target || cCode.replace(/\s+/g, "") === targetNoSpace;
    }) || null
  );
}

/**
 * Lookup course by title (case-insensitive)
 */
export function findCourseByTitle(courses, title) {
  if (!title || !Array.isArray(courses)) return null;
  const target = title.trim().toLowerCase();
  return courses.find((c) => c.title.trim().toLowerCase() === target) || null;
}

/**
 * Check if the cascade hint should be displayed:
 * Visible ONLY when department is recognized in the catalogue AND the filtered course list is empty.
 */
export function isCascadeHintVisible({
  departmentInput: deptIn,
  departments,
  filteredCourses,
}) {
  if (!deptIn || !Array.isArray(departments)) return false;
  const matchedDept = matchDepartment(departments, deptIn);
  if (!matchedDept) return false;
  return !filteredCourses || filteredCourses.length === 0;
}

/**
 * Check if a teacher entry has a non-empty name
 */
export function isTeacherNonEmpty(teacher) {
  return Boolean(
    teacher && typeof teacher.name === "string" && teacher.name.trim() !== "",
  );
}

/**
 * Migrate legacy drafts to the Phase 7 schema:
 * - v1 scalar { teacherName, teacherDesignation } -> [{ name, designation }]
 * - v2 draft with teacher role fields -> role is dropped silently
 */
export function migrateDraft(draft) {
  if (!draft || typeof draft !== "object") return null;
  let teachersList = [];
  if (Array.isArray(draft.teachers) && draft.teachers.length > 0) {
    teachersList = draft.teachers.map((t) => ({
      name: t && t.name ? String(t.name) : "",
      designation: t && t.designation ? String(t.designation) : "",
    }));
  } else if (
    draft.teacherName ||
    draft["teacher-name"] ||
    draft.teacherDesignation ||
    draft["teacher-designation"]
  ) {
    teachersList = [
      {
        name: String(draft.teacherName || draft["teacher-name"] || ""),
        designation: String(
          draft.teacherDesignation || draft["teacher-designation"] || "",
        ),
      },
    ];
  } else {
    teachersList = [{ name: "", designation: "" }];
  }
  return {
    ...draft,
    draftVersion: 2,
    teachers: teachersList,
  };
}

/**
 * Compare two draft objects for value equality (name + designation only, no role)
 */
export function areDraftsEqual(a, b) {
  if (!a || !b) return false;
  const fields = [
    "docType",
    "university",
    "department",
    "level",
    "term",
    "courseCode",
    "courseTitle",
    "docNumber",
    "docTitle",
    "comment",
    "studentName",
    "studentId",
    "experimentDate",
    "submissionDate",
  ];
  for (const f of fields) {
    if ((a[f] || "") !== (b[f] || "")) return false;
  }
  const tA = Array.isArray(a.teachers) ? a.teachers : [];
  const tB = Array.isArray(b.teachers) ? b.teachers : [];
  if (tA.length !== tB.length) return false;
  for (let i = 0; i < tA.length; i++) {
    if (
      (tA[i].name || "") !== (tB[i].name || "") ||
      (tA[i].designation || "") !== (tB[i].designation || "")
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Helper to determine default values application:
 * Applied ONLY when no draft exists; drafts (including explicit blanks) take precedence.
 */
export function applyDefaultsIfNoDraft(existingDraft, defaultValues) {
  if (
    existingDraft &&
    typeof existingDraft === "object" &&
    Object.keys(existingDraft).length > 0
  ) {
    return { applied: false, values: existingDraft };
  }
  return {
    applied: true,
    values: {
      university: (defaultValues && defaultValues.university) || "",
      department: (defaultValues && defaultValues.department) || "",
      level: (defaultValues && defaultValues.level) || "",
      term: (defaultValues && defaultValues.term) || "",
    },
  };
}

/**
 * Update textContent of a single preview data-field element safely
 */
function updatePreviewField(fieldName, text) {
  if (!coverPreviewWrapper) return;
  const elements = coverPreviewWrapper.querySelectorAll(
    `[data-field="${fieldName}"], [data-field-alt="${fieldName}"]`,
  );
  elements.forEach((el) => {
    if (
      el.classList.contains("metadata-value") ||
      el.classList.contains("card-field-value")
    ) {
      el.classList.add("user-data");
    }
    el.textContent = text || "";
  });
}

/**
 * Live sync all static form fields to preview
 */
function syncAllToPreview() {
  if (!isBrowser) return;
  updatePreviewField(
    "university-name",
    universityInput ? universityInput.value : "",
  );
  updatePreviewField(
    "department-name",
    departmentInput ? departmentInput.value : "",
  );
  updatePreviewField("level", levelSelect ? levelSelect.value : "");
  updatePreviewField("term", termSelect ? termSelect.value : "");
  updatePreviewField(
    "course-code",
    courseCodeInput ? courseCodeInput.value : "",
  );
  updatePreviewField(
    "course-title",
    courseTitleInput ? courseTitleInput.value : "",
  );
  updatePreviewField("doc-number", docNumberInput ? docNumberInput.value : "");
  updatePreviewField("report-no", docNumberInput ? docNumberInput.value : "");
  updatePreviewField("doc-title", docTitleInput ? docTitleInput.value : "");
  updatePreviewField("report-title", docTitleInput ? docTitleInput.value : "");
  updatePreviewField("comment-box", commentInput ? commentInput.value : "");
  updatePreviewField(
    "student-name",
    studentNameInput ? studentNameInput.value : "",
  );
  updatePreviewField("student-id", studentIdInput ? studentIdInput.value : "");

  const isLab = getSelectedDocType() === "lab-report";
  updatePreviewField(
    "experiment-date",
    isLab && experimentDateInput ? formatDate(experimentDateInput.value) : "",
  );
  updatePreviewField(
    "submission-date",
    submissionDateInput ? formatDate(submissionDateInput.value) : "",
  );

  renderTeacherPreview();
}

/**
 * Get current selected document type ('lab-report' | 'assignment')
 */
function getSelectedDocType() {
  if (!isBrowser) return "lab-report";
  const selected = document.querySelector('input[name="doc-type"]:checked');
  return selected ? selected.value : "lab-report";
}

/**
 * Handle document type radio changes
 */
function handleDocTypeChange(shouldSave = false) {
  if (!isBrowser) return;
  const docType = getSelectedDocType();
  const isLab = docType === "lab-report";

  if (a4CoverEl) {
    a4CoverEl.setAttribute("data-cover-type", docType);
  }

  if (experimentDateGroup) {
    experimentDateGroup.style.display = isLab ? "flex" : "none";
  }

  const expDateValue =
    isLab && experimentDateInput ? formatDate(experimentDateInput.value) : "";
  updatePreviewField("experiment-date", expDateValue);

  if (docNumberLabel)
    docNumberLabel.textContent = isLab ? "Report no." : "Assignment no.";
  if (docTitleLabel)
    docTitleLabel.textContent = isLab ? "Report Title" : "Assignment Title";
  if (previewDocNumberLabel)
    previewDocNumberLabel.textContent = isLab ? "Report no." : "Assignment no.";
  if (previewDocTitleLabel)
    previewDocTitleLabel.textContent = isLab
      ? "Report Title"
      : "Assignment Title";

  const titleBanner = coverPreviewWrapper
    ? coverPreviewWrapper.querySelector('[data-field="cover-title"]')
    : null;
  if (titleBanner) {
    titleBanner.textContent = isLab ? "Lab Report" : "Assignment";
  }

  syncCardHeightsAndSignature();

  if (shouldSave) {
    queueDraftSave();
  }
}

/**
 * Cascading dropdown logic: update course suggestions based on department, level, term
 */
function updateCourseLists() {
  if (!isBrowser || !departmentInput) return;
  const deptInputVal = departmentInput.value.trim();
  const levelVal = levelSelect ? levelSelect.value : null;
  const termVal = termSelect ? termSelect.value : null;

  currentFilteredCourses = filterCourses(
    dropdownData.courses,
    dropdownData.departments,
    {
      departmentInput: deptInputVal,
      level: levelVal,
      term: termVal,
    },
  );

  if (courseCodesDatalist) {
    const uniqueCodes = Array.from(
      new Set(currentFilteredCourses.map((c) => c.code)),
    ).sort();
    courseCodesDatalist.textContent = "";
    uniqueCodes.forEach((code) => {
      const opt = document.createElement("option");
      opt.value = code;
      courseCodesDatalist.appendChild(opt);
    });
  }

  if (courseTitlesDatalist) {
    const uniqueTitles = Array.from(
      new Set(currentFilteredCourses.map((c) => c.title)),
    ).sort();
    courseTitlesDatalist.textContent = "";
    uniqueTitles.forEach((title) => {
      const opt = document.createElement("option");
      opt.value = title;
      courseTitlesDatalist.appendChild(opt);
    });
  }

  // Cascade hint: visible ONLY when department is recognized and filtered courses list is empty
  const hintEl = cascadeHintEl || document.getElementById("cascade-hint");
  if (hintEl) {
    const isVisible = isCascadeHintVisible({
      departmentInput: deptInputVal,
      departments: dropdownData.departments,
      filteredCourses: currentFilteredCourses,
    });
    hintEl.style.display = isVisible ? "block" : "none";
  }

  // Dynamic placeholder for Course Code input (Phase 7B / 7C)
  if (courseCodeInput) {
    if (currentFilteredCourses.length > 0) {
      courseCodeInput.placeholder = "Select or type course code";
    } else if (!deptInputVal) {
      courseCodeInput.placeholder = "Select department first";
    } else if (!levelVal || !termVal) {
      courseCodeInput.placeholder = "Select level & term first";
    } else {
      courseCodeInput.placeholder = "Type course code";
    }
  }

  // Refresh mobile dropdowns for cascaded course fields
  if (courseCodeInput)
    updateSingleMobileDropdown(
      courseCodeInput,
      "course-codes-list",
      "Course Code",
    );
  if (courseTitleInput)
    updateSingleMobileDropdown(
      courseTitleInput,
      "course-titles-list",
      "Course Title",
    );
}

/**
 * Mobile Dynamic Dropdowns Registry & Handler (Phase 7W)
 * Pairs datalist inputs with a native <select> element on mobile viewports (<= 768px).
 * Opens native wheel/bottom-sheet pickers on mobile phones instead of the virtual keyboard.
 */
let mobileDropdownRegistry = [];

export function isMobileScreen() {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= 768;
}

export function registerMobileDropdown(input, datalistId, fieldLabel) {
  if (!input || !isBrowser) return;

  mobileDropdownRegistry = mobileDropdownRegistry.filter(
    (item) => item.input && document.body && document.body.contains(item.input),
  );

  const existing = mobileDropdownRegistry.find((item) => item.input === input);
  if (!existing) {
    mobileDropdownRegistry.push({ input, datalistId, fieldLabel });
  }

  updateSingleMobileDropdown(input, datalistId, fieldLabel);
}

export function updateSingleMobileDropdown(input, datalistId, fieldLabel) {
  if (!input || !isBrowser) return;

  const datalist = document.getElementById(datalistId);
  if (!datalist) return;

  let select = input._mobileSelect;
  if (!select) {
    select = document.createElement("select");
    select.className = "select mobile-select-dropdown";
    select.setAttribute("aria-label", `Select ${fieldLabel}`);
    input._mobileSelect = select;
    select._targetInput = input;

    if (input.parentNode) {
      input.parentNode.insertBefore(select, input.nextSibling);
    }

    select.addEventListener("change", () => {
      if (select.value === "__custom__") {
        input.classList.add("mobile-custom-input");
        input.classList.remove("mobile-input-hidden");
        input.value = "";
        input.focus();
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        input.classList.remove("mobile-custom-input");
        input.classList.add("mobile-input-hidden");
        input.value = select.value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    input.addEventListener("input", () => {
      if (select.value !== "__custom__") {
        const matchingOpt = Array.from(select.options).find(
          (o) => o.value === input.value,
        );
        if (matchingOpt) {
          select.value = input.value;
        }
      }
    });
  }

  // Populate options from datalist
  const optionValues = Array.from(datalist.querySelectorAll("option"))
    .map((opt) => opt.value)
    .filter(Boolean);

  select.innerHTML = "";

  const placeholderOpt = document.createElement("option");
  placeholderOpt.value = "";
  placeholderOpt.textContent = `Select ${fieldLabel}`;
  select.appendChild(placeholderOpt);

  optionValues.forEach((val) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = val;
    select.appendChild(opt);
  });

  const otherOpt = document.createElement("option");
  otherOpt.value = "__custom__";
  otherOpt.textContent = "Other (type manually)";
  select.appendChild(otherOpt);

  // Sync selection state with current input value
  const curVal = input.value || "";
  if (!curVal) {
    select.value = "";
    input.classList.remove("mobile-custom-input");
    input.classList.add("mobile-input-hidden");
  } else if (optionValues.includes(curVal)) {
    select.value = curVal;
    input.classList.remove("mobile-custom-input");
    input.classList.add("mobile-input-hidden");
  } else {
    select.value = "__custom__";
    input.classList.add("mobile-custom-input");
    input.classList.remove("mobile-input-hidden");
  }
}

export function refreshAllMobileDropdowns() {
  if (!isBrowser) return;
  mobileDropdownRegistry = mobileDropdownRegistry.filter(
    (item) => item.input && document.body && document.body.contains(item.input),
  );
  mobileDropdownRegistry.forEach((item) => {
    updateSingleMobileDropdown(item.input, item.datalistId, item.fieldLabel);
  });
}

/**
 * Bidirectional auto-fill for Course Code <-> Course Title
 */
function handleCourseCodeInput() {
  if (!courseCodeInput || !courseTitleInput) return;
  const codeVal = courseCodeInput.value.trim();
  if (!codeVal) return;

  let matched = findCourseByCode(currentFilteredCourses, codeVal);
  if (!matched && dropdownData && Array.isArray(dropdownData.courses)) {
    matched = findCourseByCode(dropdownData.courses, codeVal);
  }

  if (matched) {
    courseTitleInput.value = matched.title;
    updatePreviewField("course-title", matched.title);
    updateSingleMobileDropdown(
      courseTitleInput,
      "course-titles-list",
      "Course Title",
    );
  }
}

function handleCourseTitleInput() {
  if (!courseCodeInput || !courseTitleInput) return;
  const titleVal = courseTitleInput.value.trim();
  if (!titleVal) return;

  let matched = findCourseByTitle(currentFilteredCourses, titleVal);
  if (!matched && dropdownData && Array.isArray(dropdownData.courses)) {
    matched = findCourseByTitle(dropdownData.courses, titleVal);
  }

  if (matched) {
    courseCodeInput.value = matched.code;
    updatePreviewField("course-code", matched.code);
    updateSingleMobileDropdown(
      courseCodeInput,
      "course-codes-list",
      "Course Code",
    );
  }
}

/**
 * Datalist UX Helper (Phase 7G):
 * - Focus: selects all text so typing immediately overwrites.
 * - Click: clears input value if non-empty, saves previousValue, and triggers showPicker()
 *   so the full native datalist popup is displayed without requiring manual backspace.
 * - Keydown: marks user interaction so deliberate clearing isn't reverted.
 * - Blur: restores previousValue if the user clicked in and clicked away without selecting or typing.
 */
function setupDatalistUx(input) {
  if (!input || input.dataset.datalistUxInitialized) return;
  input.dataset.datalistUxInitialized = "true";

  input.addEventListener("focus", function () {
    this.select();
  });

  input.addEventListener("click", function () {
    if (isMobileScreen()) return;
    if (this.value !== "") {
      this.dataset.previousValue = this.value;
      this.value = "";
      this.dataset.userInteracted = "false";
      this.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (typeof this.showPicker === "function") {
      try {
        this.showPicker();
      } catch {}
    }
  });

  input.addEventListener("keydown", function () {
    this.dataset.userInteracted = "true";
  });

  input.addEventListener("blur", function () {
    if (
      this.value === "" &&
      this.dataset.previousValue &&
      this.dataset.userInteracted !== "true"
    ) {
      this.value = this.dataset.previousValue;
      this.dataset.previousValue = "";
      this.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}

/**
 * Multi-Teacher Form Renderer (Phase 7C: Vertical stacked layout)
 */
function renderTeacherForm() {
  if (!teachersFormContainer) return;
  teachersFormContainer.textContent = "";

  teachers.forEach((teacher, index) => {
    const row = document.createElement("div");
    row.className = "teacher-row";
    row.dataset.index = String(index);

    // Form Group: Name
    const nameGroup = document.createElement("div");
    nameGroup.className = "form-group";

    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Name";
    nameGroup.appendChild(nameLabel);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "t-name";
    nameInput.dataset.index = String(index);
    nameInput.dataset.prop = "name";
    nameInput.value = teacher.name || "";
    nameInput.placeholder = "Teacher's Name";
    nameGroup.appendChild(nameInput);
    row.appendChild(nameGroup);

    // Form Group: Designation
    const desigGroup = document.createElement("div");
    desigGroup.className = "form-group";

    const desigLabel = document.createElement("label");
    desigLabel.textContent = "Designation";
    desigGroup.appendChild(desigLabel);

    const desigInput = document.createElement("input");
    desigInput.type = "text";
    desigInput.setAttribute("list", "teacher-designations-list");
    desigInput.className = "t-designation";
    desigInput.dataset.index = String(index);
    desigInput.dataset.prop = "designation";
    desigInput.value = teacher.designation || "";
    desigInput.autocomplete = "off";
    desigInput.placeholder = "e.g. Assistant Professor";
    setupDatalistUx(desigInput);
    desigGroup.appendChild(desigInput);
    registerMobileDropdown(
      desigInput,
      "teacher-designations-list",
      "Designation",
    );
    row.appendChild(desigGroup);

    // Remove Button
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "t-remove btn btn-ghost";
    removeBtn.dataset.index = String(index);
    removeBtn.setAttribute("aria-label", "Remove teacher");
    removeBtn.textContent = "×";
    if (teachers.length === 1) {
      removeBtn.disabled = true;
    }
    row.appendChild(removeBtn);

    teachersFormContainer.appendChild(row);
  });
}

/**
 * Multi-Teacher Live Preview Renderer (Phase 7: Role removed)
 * Uses textContent exclusively — no innerHTML for user values.
 * Line 1 always shows: Teacher Name: <name>
 * Line 2 (if present): Designation: <designation>
 */
function renderTeacherPreview() {
  const container =
    teachersPreviewContainer ||
    (coverPreviewWrapper
      ? coverPreviewWrapper.querySelector('[data-field="teachers-list"]')
      : null);
  if (!container) return;
  container.textContent = "";

  const activeTeachers = teachers.filter(isTeacherNonEmpty);

  activeTeachers.forEach((teacher) => {
    const entry = document.createElement("div");
    entry.className = "teacher-entry";

    // Line 1: Teacher Name + Name
    const line1 = document.createElement("div");
    line1.className = "teacher-line teacher-line-name";

    const strong1 = document.createElement("strong");
    strong1.className = "card-field-label";
    strong1.textContent = "Teacher Name:";
    line1.appendChild(strong1);
    line1.appendChild(document.createTextNode(" "));

    const nameSpan = document.createElement("span");
    nameSpan.className = "card-field-value user-data";
    nameSpan.textContent = teacher.name.trim();
    line1.appendChild(nameSpan);

    entry.appendChild(line1);

    // Line 2 (Optional): Designation
    if (teacher.designation && teacher.designation.trim()) {
      const line2 = document.createElement("div");
      line2.className = "teacher-line teacher-line-desig";

      const strong2 = document.createElement("strong");
      strong2.className = "card-field-label";
      strong2.textContent = "Designation:";
      line2.appendChild(strong2);
      line2.appendChild(document.createTextNode(" "));

      const desigSpan = document.createElement("span");
      desigSpan.className = "card-field-value user-data";
      desigSpan.textContent = teacher.designation.trim();
      line2.appendChild(desigSpan);

      entry.appendChild(line2);
    }

    container.appendChild(entry);
  });

  // Synchronize dynamic card heights and signature placement
  syncCardHeightsAndSignature();
}

/**
 * Card Heights and Shared Signature Line Synchronization
 * In single-teacher default case, preserves Phase 2 geometry exactly.
 * In multi-teacher case, expands both cards downward in unison with pinned signature line.
 */
function syncCardHeightsAndSignature() {
  if (!cardSubmittedTo || !cardSubmittedBy || !teachersPreviewContainer) return;

  const baseMinMm = 66.13;
  const mmToPx = a4CoverEl ? a4CoverEl.offsetWidth / 210 : 3.7795;
  const minHeightPx = baseMinMm * mmToPx;

  const teacherTopPx = 11.39 * mmToPx;
  const teacherHeightPx = teachersPreviewContainer.offsetHeight;
  const signatureHeightPx = signatureLineEl ? signatureLineEl.offsetHeight : 16;
  const bottomPaddingPx = 8 * mmToPx;

  const neededHeightPx =
    teacherTopPx + teacherHeightPx + signatureHeightPx + bottomPaddingPx;
  const activeCount = teachers.filter(isTeacherNonEmpty).length;

  if (neededHeightPx > minHeightPx && activeCount >= 1) {
    const targetHeight = `${Math.ceil(neededHeightPx)}px`;
    cardSubmittedTo.style.height = targetHeight;
    cardSubmittedBy.style.height = targetHeight;
    const sigRow = cardSubmittedTo.querySelector(".signature-row");
    if (sigRow) {
      sigRow.style.top = `${Math.ceil(neededHeightPx - signatureHeightPx - 2 * mmToPx)}px`;
    }
  } else {
    cardSubmittedTo.style.height = "";
    cardSubmittedBy.style.height = "";
    const sigRow = cardSubmittedTo.querySelector(".signature-row");
    if (sigRow) {
      sigRow.style.top = "";
    }
  }
}

/**
 * Render user-uploaded logo in preview
 */
function renderUserLogoInPreview(blob) {
  const box =
    logoBoxEl ||
    (coverPreviewWrapper
      ? coverPreviewWrapper.querySelector(".logo-box")
      : null);
  if (!box) return;
  box.textContent = "";
  const img = document.createElement("img");
  img.className = "logo-img";
  img.alt = "Uploaded institution logo";
  img.src = URL.createObjectURL(blob);
  box.appendChild(img);
  currentLogoState = "user";
}

/**
 * Render default institution logo in preview
 */
function renderDefaultLogoInPreview() {
  const box =
    logoBoxEl ||
    (coverPreviewWrapper
      ? coverPreviewWrapper.querySelector(".logo-box")
      : null);
  if (!box) return;
  box.textContent = "";
  const img = document.createElement("img");
  img.className = "logo-img";
  img.alt = "Default institution logo";
  img.src = "assets/default-logo.png";
  img.onerror = () => {
    currentLogoState = "none";
    renderSvgPlaceholder();
  };
  box.appendChild(img);
  currentLogoState = "default";
}

/**
 * Render defensive SVG placeholder when neither user nor default logo loads
 */
function renderSvgPlaceholder() {
  const box =
    logoBoxEl ||
    (coverPreviewWrapper
      ? coverPreviewWrapper.querySelector(".logo-box")
      : null);
  if (!box) return;
  box.textContent = "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(DEFAULT_LOGO_SVG, "image/svg+xml");
  const svgEl = doc.documentElement;
  box.appendChild(document.importNode(svgEl, true));
  currentLogoState = "none";
}

/**
 * Handle Logo File Upload
 */
async function handleLogoUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (logoErrorEl) logoErrorEl.textContent = "";

  if (!file.type.startsWith("image/")) {
    if (logoErrorEl)
      logoErrorEl.textContent =
        "Invalid file type. Please upload an image (PNG, JPG, SVG, WebP).";
    if (logoUploadInput) logoUploadInput.value = "";
    return;
  }

  const maxSizeBytes = 2 * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    if (logoErrorEl)
      logoErrorEl.textContent = `File is too large (${(file.size / (1024 * 1024)).toFixed(2)} MB). Maximum allowed size is 2 MB.`;
    if (logoUploadInput) logoUploadInput.value = "";
    return;
  }

  try {
    const res = await saveLogo(file);
    renderUserLogoInPreview(file);
    if (res && res.success === false) {
      if (res.reason === "quota") {
        setStorageStatus(
          "Storage full — clear the form or remove the logo to save more.",
          "warning",
        );
      } else {
        setStorageStatus("Logo will not persist in this browser.", "warning");
      }
    } else if (res && res.fallback) {
      setStorageStatus("Logo saved (fallback storage).", "saved");
    } else {
      setStorageStatus("Logo saved.", "saved");
    }
  } catch (err) {
    console.error("Failed to save logo:", err);
    if (logoErrorEl)
      logoErrorEl.textContent = "Failed to save logo to local storage.";
    setStorageStatus("Logo not saved: local storage error.", "error");
  }
}

/**
 * Handle Logo Reset ("Reset logo" reverts to default logo)
 */
async function handleResetLogo() {
  try {
    await deleteLogo();
    if (logoUploadInput) logoUploadInput.value = "";
    if (logoErrorEl) logoErrorEl.textContent = "";
    renderDefaultLogoInPreview();
    setStorageStatus("Logo reset to default.", "saved");
  } catch (err) {
    console.error("Failed to reset logo:", err);
    if (logoErrorEl) logoErrorEl.textContent = "Failed to reset logo.";
  }
}

/**
 * Build snapshot of current in-memory draft state (name + designation only)
 */
function getCurrentFormDraft() {
  return {
    docType: getSelectedDocType(),
    university: universityInput ? universityInput.value : "",
    department: departmentInput ? departmentInput.value : "",
    level: levelSelect ? levelSelect.value : "",
    term: termSelect ? termSelect.value : "",
    courseCode: courseCodeInput ? courseCodeInput.value : "",
    courseTitle: courseTitleInput ? courseTitleInput.value : "",
    docNumber: docNumberInput ? docNumberInput.value : "",
    docTitle: docTitleInput ? docTitleInput.value : "",
    comment: commentInput ? commentInput.value : "",
    studentName: studentNameInput ? studentNameInput.value : "",
    studentId: studentIdInput ? studentIdInput.value : "",
    experimentDate: experimentDateInput ? experimentDateInput.value : "",
    submissionDate: submissionDateInput ? submissionDateInput.value : "",
    teachers: teachers.map((t) => ({
      name: t.name || "",
      designation: t.designation || "",
    })),
  };
}

/**
 * Apply draft data payload to form inputs and teachers array
 */
function applyDraftToForm(rawDraft) {
  const draft = migrateDraft(rawDraft);
  if (!draft) return;

  if (draft.docType) {
    const targetRadio = document.querySelector(
      `input[name="doc-type"][value="${draft.docType}"]`,
    );
    if (targetRadio) targetRadio.checked = true;
  }

  if (draft.university !== undefined && universityInput)
    universityInput.value = draft.university;
  if (draft.department !== undefined && departmentInput)
    departmentInput.value = draft.department;
  if (draft.level !== undefined && levelSelect) levelSelect.value = draft.level;
  if (draft.term !== undefined && termSelect) termSelect.value = draft.term;
  if (draft.courseCode !== undefined && courseCodeInput)
    courseCodeInput.value = draft.courseCode;
  if (draft.courseTitle !== undefined && courseTitleInput)
    courseTitleInput.value = draft.courseTitle;
  if (draft.docNumber !== undefined && docNumberInput)
    docNumberInput.value = draft.docNumber;
  if (draft.docTitle !== undefined && docTitleInput)
    docTitleInput.value = draft.docTitle;
  if (draft.comment !== undefined && commentInput)
    commentInput.value = draft.comment;
  if (draft.studentName !== undefined && studentNameInput)
    studentNameInput.value = draft.studentName;
  if (draft.studentId !== undefined && studentIdInput)
    studentIdInput.value = draft.studentId;
  if (draft.experimentDate !== undefined && experimentDateInput)
    experimentDateInput.value = draft.experimentDate;
  if (draft.submissionDate !== undefined && submissionDateInput)
    submissionDateInput.value = draft.submissionDate;

  teachers = draft.teachers;
  refreshAllMobileDropdowns();
}

/**
 * Debounced Save Draft to localStorage (v2 without teacher role)
 */
function queueDraftSave() {
  if (isApplyingRemoteChange) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    if (isApplyingRemoteChange) return;
    const draft = {
      draftVersion: 2,
      docType: getSelectedDocType(),
      university: universityInput ? universityInput.value : "",
      department: departmentInput ? departmentInput.value : "",
      level: levelSelect ? levelSelect.value : "",
      term: termSelect ? termSelect.value : "",
      courseCode: courseCodeInput ? courseCodeInput.value : "",
      courseTitle: courseTitleInput ? courseTitleInput.value : "",
      docNumber: docNumberInput ? docNumberInput.value : "",
      docTitle: docTitleInput ? docTitleInput.value : "",
      comment: commentInput ? commentInput.value : "",
      studentName: studentNameInput ? studentNameInput.value : "",
      studentId: studentIdInput ? studentIdInput.value : "",
      experimentDate: experimentDateInput ? experimentDateInput.value : "",
      submissionDate: submissionDateInput ? submissionDateInput.value : "",
      teachers: teachers.map((t) => ({
        name: t.name || "",
        designation: t.designation || "",
      })),
    };

    const res = saveDraft(draft);
    if (res && res.success === false) {
      if (res.reason === "quota") {
        setStorageStatus(
          "Storage full — clear the form or remove the logo to save more.",
          "warning",
        );
      } else {
        setStorageStatus(
          "Local saving unavailable in this browser.",
          "warning",
        );
      }
    } else {
      setStorageStatus("Draft saved.", "saved");
    }
  }, 500);
}

/**
 * Restore Draft from localStorage
 */
function restoreDraft() {
  const res = loadDraft();
  if (!res) return false;

  if (res.status === "unavailable") {
    setStorageStatus("Local saving unavailable in this browser.", "warning");
    return false;
  }
  if (res.status === "corrupt") {
    setStorageStatus("Previous draft could not be restored.", "warning");
    return false;
  }
  if (res.status === "newer_version") {
    setStorageStatus("Draft format is newer than this app.", "warning");
    return false;
  }
  if (res.status === "empty" || !res.data) {
    return false;
  }

  const draft = res.data;
  applyDraftToForm(draft);

  // If legacy v1 draft without version or legacy draft with role, save clean v2 draft
  if (!draft.draftVersion || draft.draftVersion < 2) {
    saveDraft({
      ...draft,
      draftVersion: 2,
      teachers: teachers.map((t) => ({ ...t })),
    });
  }

  return true;
}

/**
 * Handle Start Over / Clear Form action with confirmation:
 * Resets fields to default values (BAUST / CSE / Level 2 / Term II),
 * other fields blank, 1 empty teacher entry, default logo.
 */
async function handleClearForm() {
  const confirmed = window.confirm(
    "Clear all fields, the uploaded logo, and the saved draft? This cannot be undone.",
  );
  if (!confirmed) return;

  if (saveTimeout) clearTimeout(saveTimeout);

  teachers = [{ name: "", designation: "" }];

  // Reset default fields to DEFAULT_FORM_VALUES
  if (universityInput) universityInput.value = DEFAULT_FORM_VALUES.university;
  if (departmentInput) departmentInput.value = DEFAULT_FORM_VALUES.department;
  if (levelSelect) levelSelect.value = DEFAULT_FORM_VALUES.level;
  if (termSelect) termSelect.value = DEFAULT_FORM_VALUES.term;

  // Reset other fields to empty
  if (courseCodeInput) courseCodeInput.value = "";
  if (courseTitleInput) courseTitleInput.value = "";
  if (docNumberInput) docNumberInput.value = "";
  if (docTitleInput) docTitleInput.value = "";
  if (commentInput) commentInput.value = "";
  if (studentNameInput) studentNameInput.value = "";
  if (studentIdInput) studentIdInput.value = "";
  if (experimentDateInput) experimentDateInput.value = "";
  if (submissionDateInput) submissionDateInput.value = "";

  if (logoUploadInput) logoUploadInput.value = "";
  if (logoErrorEl) logoErrorEl.textContent = "";

  const labRadio = document.getElementById("doc-type-lab");
  if (labRadio) labRadio.checked = true;

  clearDraft();
  await deleteLogo();

  renderDefaultLogoInPreview();
  handleDocTypeChange();
  updateCourseLists();
  renderTeacherForm();
  renderTeacherPreview();
  syncAllToPreview();
  refreshAllMobileDropdowns();

  setStorageStatus("Reset to defaults.", "saved");
  if (universityInput) universityInput.focus();
}

/**
 * Cross-Tab Storage Event Handler
 */
function onStorageChange(e) {
  if (e.key !== "covercraft-draft-v1") return;

  if (e.newValue === null) {
    setStorageStatus("Draft was cleared in another tab.", "warning");
    return;
  }

  try {
    const remoteDraft = JSON.parse(e.newValue);
    if (!remoteDraft || typeof remoteDraft !== "object") return;

    const currentDraft = getCurrentFormDraft();
    if (areDraftsEqual(currentDraft, remoteDraft)) {
      return;
    }

    isApplyingRemoteChange = true;
    try {
      applyDraftToForm(remoteDraft);
      handleDocTypeChange();
      updateCourseLists();
      renderTeacherForm();
      renderTeacherPreview();
      syncAllToPreview();
      setStorageStatus("Draft updated from another tab.", "saved");
    } finally {
      isApplyingRemoteChange = false;
    }
  } catch (err) {
    console.warn("Failed to parse remote draft from storage event:", err);
  }
}

/**
 * Surface storage status with deduplication throttling (500ms)
 * textContent only — no innerHTML.
 */
function setStorageStatus(msg, state = "") {
  if (!storageStatusEl || !msg) return;
  const now = Date.now();
  if (msg === lastStatusMessage && now - lastStatusTime < 500) {
    return;
  }
  lastStatusMessage = msg;
  lastStatusTime = now;
  storageStatusEl.textContent = msg;
  storageStatusEl.className = ("storage-status " + state).trim();
}

/**
 * Scale A4 Preview to fit viewport dynamically without window scrolling
 */
export function scalePreview() {
  if (typeof document === "undefined" || !coverPreviewWrapper) return;
  const paperWrap = document.querySelector(".paper-wrap");
  const previewPanel = document.querySelector(".preview-panel");
  if (!previewPanel) return;

  const isFullscreen = Boolean(
    document.fullscreenElement ||
    previewPanel.classList.contains("is-fullscreen"),
  );

  const container = paperWrap || previewPanel;
  const paddingH = isFullscreen ? 32 : 32;
  const paddingW = isFullscreen ? 32 : 32;

  const isMobile = window.innerWidth <= 1024 && !isFullscreen;
  let scale;

  if (isMobile) {
    const containerWidth =
      container.clientWidth > 0 ? container.clientWidth : window.innerWidth;
    const availableWidth = Math.max(100, containerWidth - paddingW);
    scale = Math.min(1.0, Math.max(0.1, availableWidth / 793.7));

    const previewViewport = document.getElementById("preview-viewport");
    if (previewViewport) {
      previewViewport.style.width = `${Math.round(793.7 * scale)}px`;
      previewViewport.style.height = `${Math.round(1122.5 * scale)}px`;
      previewViewport.style.overflow = "visible";
      previewViewport.style.position = "relative";
      previewViewport.style.display = "flex";
      previewViewport.style.alignItems = "center";
      previewViewport.style.justifyContent = "center";
    }
  } else {
    const previewViewport = document.getElementById("preview-viewport");
    if (previewViewport) {
      previewViewport.style.width = "";
      previewViewport.style.height = "";
      previewViewport.style.position = "";
      previewViewport.style.overflow = "";
      previewViewport.style.display = "";
      previewViewport.style.alignItems = "";
      previewViewport.style.justifyContent = "";
    }

    const availableHeight =
      container.clientHeight > 0
        ? container.clientHeight - paddingH
        : window.innerHeight > 0
          ? window.innerHeight - 80
          : 800;
    const availableWidth =
      container.clientWidth > 0
        ? container.clientWidth - paddingW
        : window.innerWidth > 0
          ? window.innerWidth - 40
          : 600;

    const scaleByHeight = availableHeight / 1122.5;
    const scaleByWidth = availableWidth / 793.7;
    scale = Math.max(
      0.1,
      Math.min(scaleByHeight, scaleByWidth > 0 ? scaleByWidth : scaleByHeight),
    );
  }

  coverPreviewWrapper.style.transform = `scale(${scale})`;
  coverPreviewWrapper.style.transformOrigin = "center center";
}

/**
 * Update Fullscreen UI and scale
 */
export function updateFullscreenState(isFullscreen) {
  if (typeof document === "undefined") return;
  const previewPanel = document.querySelector(".preview-panel");
  const fullscreenBtn = document.getElementById("fullscreen-btn");
  if (previewPanel) {
    previewPanel.classList.toggle("is-fullscreen", isFullscreen);
  }
  if (fullscreenBtn) {
    const iconExpand = fullscreenBtn.querySelector(".icon-expand");
    const iconCompress = fullscreenBtn.querySelector(".icon-compress");
    const label = fullscreenBtn.querySelector(".fs-label");
    if (iconExpand) iconExpand.style.display = isFullscreen ? "none" : "";
    if (iconCompress) iconCompress.style.display = isFullscreen ? "" : "none";
    if (label) label.textContent = isFullscreen ? "Exit" : "Fullscreen";
    fullscreenBtn.setAttribute(
      "aria-label",
      isFullscreen ? "Exit Fullscreen" : "Toggle Fullscreen Preview",
    );
    fullscreenBtn.setAttribute(
      "title",
      isFullscreen ? "Exit Fullscreen (Esc)" : "Toggle Fullscreen",
    );
  }
  scalePreview();
  setTimeout(scalePreview, 50);
}

/**
 * Initialize Application
 */
export async function init() {
  if (!isBrowser) return;

  // 1. Fetch dropdown data
  try {
    let res;
    try {
      res = await fetch("data/dropdowns.json");
      if (!res.ok) res = await fetch("/data/dropdowns.json");
    } catch {
      res = await fetch("/data/dropdowns.json");
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    dropdownData = await res.json();

    if (universitiesDatalist) {
      universitiesDatalist.textContent = "";
      (dropdownData.universities || []).forEach((u) => {
        const opt = document.createElement("option");
        opt.value = u.name;
        universitiesDatalist.appendChild(opt);
      });
    }

    if (departmentsDatalist) {
      departmentsDatalist.textContent = "";
      (dropdownData.departments || []).forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d.name;
        departmentsDatalist.appendChild(opt);
      });
    }
  } catch (err) {
    console.error("Failed to load dropdowns.json:", err);
    setStorageStatus(
      "Notice: Catalog suggestions unavailable. Free typing enabled.",
      "warning",
    );
  }

  // Register static mobile dropdowns (Phase 7W)
  registerMobileDropdown(universityInput, "universities-list", "University");
  registerMobileDropdown(departmentInput, "departments-list", "Department");
  registerMobileDropdown(courseCodeInput, "course-codes-list", "Course Code");
  registerMobileDropdown(
    courseTitleInput,
    "course-titles-list",
    "Course Title",
  );

  // 2. Restore Draft (including teachers) or apply initial defaults
  const hasDraft = restoreDraft();
  if (!hasDraft) {
    if (universityInput) universityInput.value = DEFAULT_FORM_VALUES.university;
    if (departmentInput) departmentInput.value = DEFAULT_FORM_VALUES.department;
    if (levelSelect) levelSelect.value = DEFAULT_FORM_VALUES.level;
    if (termSelect) termSelect.value = DEFAULT_FORM_VALUES.term;
  }

  // 3. Setup Doc Type
  handleDocTypeChange();

  // 4. Update Course Lists cascade & hint
  updateCourseLists();

  // 5. Render Teacher Form and Preview
  renderTeacherForm();
  renderTeacherPreview();

  // 6. Sync inputs to Preview
  syncAllToPreview();
  refreshAllMobileDropdowns();

  // 7. Restore Logo from Storage or render default logo
  let logoRestored = false;
  try {
    const logoBlob = await loadLogo();
    if (logoBlob) {
      renderUserLogoInPreview(logoBlob);
      logoRestored = true;
    } else {
      renderDefaultLogoInPreview();
    }
  } catch (err) {
    console.warn("Could not load logo:", err);
    renderDefaultLogoInPreview();
  }

  // 8. Initial storage feedback
  if (!isStorageAvailable) {
    setStorageStatus("Local saving unavailable in this browser.", "warning");
  } else if (hasDraft) {
    setStorageStatus("Draft restored.", "saved");
  } else if (logoRestored) {
    setStorageStatus("Logo restored.", "saved");
  }

  // 9. Preview scale adjustment & mobile dropdown responsiveness
  scalePreview();
  const onViewportResize = () => {
    scalePreview();
    refreshAllMobileDropdowns();
  };
  window.addEventListener("resize", onViewportResize);
  window.addEventListener("orientationchange", onViewportResize);

  // 10. Form submit event listener (prevents default submission)
  const coverForm = document.getElementById("cover-form");
  if (coverForm) {
    coverForm.addEventListener("submit", (e) => e.preventDefault());
  }

  // 11. Event Listeners
  docTypeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      handleDocTypeChange(true);
      syncAllToPreview();
    });
  });

  // Cascade triggers
  if (departmentInput) {
    const onDeptUpdate = () => {
      updatePreviewField("department-name", departmentInput.value);
      updateCourseLists();
      queueDraftSave();
    };
    departmentInput.addEventListener("input", onDeptUpdate);
    departmentInput.addEventListener("change", onDeptUpdate);
  }

  if (levelSelect) {
    const onLevelUpdate = () => {
      updatePreviewField("level", levelSelect.value);
      updateCourseLists();
      queueDraftSave();
    };
    levelSelect.addEventListener("change", onLevelUpdate);
    levelSelect.addEventListener("input", onLevelUpdate);
  }

  if (termSelect) {
    const onTermUpdate = () => {
      updatePreviewField("term", termSelect.value);
      updateCourseLists();
      queueDraftSave();
    };
    termSelect.addEventListener("change", onTermUpdate);
    termSelect.addEventListener("input", onTermUpdate);
  }

  // Course Code & Title
  if (courseCodeInput) {
    const onCourseCodeUpdate = () => {
      updatePreviewField("course-code", courseCodeInput.value);
      handleCourseCodeInput();
      queueDraftSave();
    };
    courseCodeInput.addEventListener("input", onCourseCodeUpdate);
    courseCodeInput.addEventListener("change", onCourseCodeUpdate);
  }

  if (courseTitleInput) {
    const onCourseTitleUpdate = () => {
      updatePreviewField("course-title", courseTitleInput.value);
      handleCourseTitleInput();
      queueDraftSave();
    };
    courseTitleInput.addEventListener("input", onCourseTitleUpdate);
    courseTitleInput.addEventListener("change", onCourseTitleUpdate);
  }

  // Datalist UX Enhancement (Phase 7G): Auto-select on focus and clear on click for full list visibility
  const datalistInputs = document.querySelectorAll("input[list]");
  datalistInputs.forEach((input) => setupDatalistUx(input));

  // Field live bindings
  if (universityInput) {
    universityInput.addEventListener("input", () => {
      updatePreviewField("university-name", universityInput.value);
      queueDraftSave();
    });
  }

  if (docNumberInput) {
    docNumberInput.addEventListener("input", () => {
      updatePreviewField("doc-number", docNumberInput.value);
      updatePreviewField("report-no", docNumberInput.value);
      queueDraftSave();
    });
  }

  if (docTitleInput) {
    docTitleInput.addEventListener("input", () => {
      updatePreviewField("doc-title", docTitleInput.value);
      updatePreviewField("report-title", docTitleInput.value);
      queueDraftSave();
    });
  }

  if (commentInput) {
    commentInput.addEventListener("input", () => {
      updatePreviewField("comment-box", commentInput.value);
      queueDraftSave();
    });
  }

  if (studentNameInput) {
    studentNameInput.addEventListener("input", () => {
      updatePreviewField("student-name", studentNameInput.value);
      queueDraftSave();
    });
  }

  if (studentIdInput) {
    studentIdInput.addEventListener("input", () => {
      updatePreviewField("student-id", studentIdInput.value);
      queueDraftSave();
    });
  }

  if (experimentDateInput) {
    experimentDateInput.addEventListener("input", () => {
      updatePreviewField(
        "experiment-date",
        formatDate(experimentDateInput.value),
      );
      queueDraftSave();
    });
  }

  if (submissionDateInput) {
    submissionDateInput.addEventListener("input", () => {
      updatePreviewField(
        "submission-date",
        formatDate(submissionDateInput.value),
      );
      queueDraftSave();
    });
  }

  // Multi-Teacher Form Interaction Listeners
  if (teachersFormContainer) {
    // Input delegation: .t-name and .t-designation only
    teachersFormContainer.addEventListener("input", (event) => {
      const target = event.target;
      if (
        !target.classList.contains("t-name") &&
        !target.classList.contains("t-designation")
      ) {
        return;
      }
      const index = parseInt(target.dataset.index, 10);
      const prop = target.dataset.prop;
      if (!isNaN(index) && teachers[index] && prop) {
        teachers[index][prop] = target.value.trimStart();
        renderTeacherPreview();
        queueDraftSave();
      }
    });

    // Click delegation: remove button and datalist picker helper
    teachersFormContainer.addEventListener("click", (event) => {
      const desigInput = event.target.closest(".t-designation");
      if (desigInput && typeof desigInput.showPicker === "function") {
        try {
          desigInput.showPicker();
        } catch {}
      }
      const btn = event.target.closest(".t-remove");
      if (!btn) return;
      if (teachers.length <= 1) return;
      const index = parseInt(btn.dataset.index, 10);
      if (!isNaN(index) && index >= 0 && index < teachers.length) {
        teachers.splice(index, 1);
        renderTeacherForm();
        renderTeacherPreview();
        queueDraftSave();
      }
    });
  }

  // Add teacher button
  if (addTeacherBtn) {
    addTeacherBtn.addEventListener("click", () => {
      teachers.push({ name: "", designation: "" });
      renderTeacherForm();
      renderTeacherPreview();
      const newNameInput = teachersFormContainer.querySelector(
        `.teacher-row[data-index="${teachers.length - 1}"] .t-name`,
      );
      if (newNameInput) newNameInput.focus();
      queueDraftSave();
    });
  }

  // Logo upload & reset
  const uploadLogoBtn = document.getElementById("upload-logo-btn");
  if (uploadLogoBtn && logoUploadInput) {
    uploadLogoBtn.addEventListener("click", () => {
      logoUploadInput.click();
    });
  }
  if (logoUploadInput) {
    logoUploadInput.addEventListener("change", handleLogoUpload);
  }
  if (removeLogoBtn) {
    removeLogoBtn.addEventListener("click", handleResetLogo);
  }

  // Clear Form ("Start over") button
  if (clearFormBtn) {
    clearFormBtn.addEventListener("click", handleClearForm);
  }

  // Fullscreen Preview Toggle
  const fullscreenBtn = document.getElementById("fullscreen-btn");
  const previewPanel = document.querySelector(".preview-panel");
  if (fullscreenBtn && previewPanel) {
    fullscreenBtn.addEventListener("click", async () => {
      const isCurrentlyFullscreen = Boolean(
        document.fullscreenElement ||
        previewPanel.classList.contains("is-fullscreen"),
      );

      if (!isCurrentlyFullscreen) {
        if (typeof previewPanel.requestFullscreen === "function") {
          try {
            await previewPanel.requestFullscreen();
            return;
          } catch {
            // Native fullscreen failed or disallowed; fallback to CSS mode
          }
        }
        updateFullscreenState(true);
      } else {
        if (
          document.fullscreenElement &&
          typeof document.exitFullscreen === "function"
        ) {
          try {
            await document.exitFullscreen();
            return;
          } catch {
            // Ignore exit errors
          }
        }
        updateFullscreenState(false);
      }
    });

    const onFullscreenChange = () => {
      const isFs = Boolean(document.fullscreenElement);
      updateFullscreenState(isFs);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);

    window.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        previewPanel.classList.contains("is-fullscreen") &&
        !document.fullscreenElement
      ) {
        updateFullscreenState(false);
      }
    });
  }

  // Print / Save as PDF button
  const printCoverBtn = document.getElementById("print-cover");
  if (printCoverBtn) {
    printCoverBtn.addEventListener("click", () => {
      if (typeof window.print === "function") {
        window.print();
      } else {
        setStorageStatus(
          "Printing is not supported in this browser.",
          "warning",
        );
      }
    });
  }

  // Cross-tab storage synchronization
  window.addEventListener("storage", onStorageChange);
}

if (isBrowser) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
