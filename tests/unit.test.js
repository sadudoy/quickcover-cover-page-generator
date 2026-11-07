import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatDate,
  filterCourses,
  findCourseByCode,
  findCourseByTitle,
  isCascadeHintVisible,
  isTeacherNonEmpty,
  migrateDraft,
  areDraftsEqual,
  applyDefaultsIfNoDraft,
  DEFAULT_FORM_VALUES
} from '../client/js/create.js';

// Sample fixture data for courses & departments
const mockDepartments = [
  { name: 'Department of Computer Science and Engineering (CSE)', code: 'CSE' },
  { name: 'Department of Electrical and Electronic Engineering (EEE)', code: 'EEE' },
  { name: 'Department of Civil Engineering (CE)', code: 'CE' }
];

const mockCourses = [
  { code: 'EEE 2101', title: 'Signals and Systems', dept: 'EEE', level: 2, term: 'I' },
  { code: 'EEE 2201', title: 'Electronics II', dept: 'EEE', level: 2, term: 'II' },
  { code: 'EEE 2202', title: 'Electronics II Sessional', dept: 'EEE', level: 2, term: 'II' },
  { code: 'EEE 3101', title: 'Control Systems', dept: 'EEE', level: 3, term: 'I' }
];

test('unit: formatDate formats YYYY-MM-DD to DD/MM/YYYY', () => {
  assert.equal(formatDate('2026-11-07'), '07/11/2026');
  assert.equal(formatDate('2024-01-01'), '01/01/2024');
  assert.equal(formatDate('2025-12-31'), '31/12/2025');
});

test('unit: formatDate edge cases (null, empty, invalid strings)', () => {
  assert.equal(formatDate(''), '');
  assert.equal(formatDate(null), '');
  assert.equal(formatDate(undefined), '');
  assert.equal(formatDate('invalid-date'), 'invalid-date');
  assert.equal(formatDate('2026-11'), '2026-11');
});

test('unit: filterCourses filters by department only', () => {
  const res = filterCourses(mockCourses, mockDepartments, { departmentInput: 'EEE', level: null, term: null });
  assert.equal(res.length, 4);
  assert.ok(res.every((c) => c.dept === 'EEE'));
});

test('unit: filterCourses filters by department name case-insensitively', () => {
  const res = filterCourses(mockCourses, mockDepartments, {
    departmentInput: 'department of electrical and electronic engineering (eee)',
    level: null,
    term: null
  });
  assert.equal(res.length, 4);
});

test('unit: filterCourses filters by dept + level', () => {
  const res = filterCourses(mockCourses, mockDepartments, { departmentInput: 'EEE', level: '2', term: null });
  assert.equal(res.length, 3);
  assert.ok(res.every((c) => c.level === 2));
});

test('unit: filterCourses filters by dept + level + term', () => {
  const res = filterCourses(mockCourses, mockDepartments, { departmentInput: 'EEE', level: '2', term: 'II' });
  assert.equal(res.length, 2);
  assert.deepEqual(res.map((c) => c.code).sort(), ['EEE 2201', 'EEE 2202']);
});

test('unit: filterCourses returns empty array for recognized department with no courses (e.g. CSE)', () => {
  const res = filterCourses(mockCourses, mockDepartments, { departmentInput: 'CSE', level: '2', term: 'II' });
  assert.deepEqual(res, []);
});

test('unit: filterCourses returns empty array for unknown department input', () => {
  const res = filterCourses(mockCourses, mockDepartments, { departmentInput: 'NonExistent', level: '1', term: 'I' });
  assert.deepEqual(res, []);
});

test('unit: findCourseByCode performs case-insensitive lookup', () => {
  const found = findCourseByCode(mockCourses, 'eee 2201');
  assert.ok(found);
  assert.equal(found.title, 'Electronics II');

  const upper = findCourseByCode(mockCourses, 'EEE 2201');
  assert.ok(upper);
  assert.equal(upper.title, 'Electronics II');

  const notFound = findCourseByCode(mockCourses, 'CSE 1101');
  assert.equal(notFound, null);
});

test('unit: findCourseByTitle performs case-insensitive lookup', () => {
  const found = findCourseByTitle(mockCourses, 'electronics ii');
  assert.ok(found);
  assert.equal(found.code, 'EEE 2201');

  const notFound = findCourseByTitle(mockCourses, 'Unknown Course');
  assert.equal(notFound, null);
});

test('unit: isCascadeHintVisible visibility logic', () => {
  // CSE is recognized, and filtered courses are empty -> hint VISIBLE
  assert.equal(
    isCascadeHintVisible({
      departmentInput: 'Department of Computer Science and Engineering (CSE)',
      departments: mockDepartments,
      filteredCourses: []
    }),
    true
  );

  // EEE is recognized, but filtered courses are non-empty -> hint HIDDEN
  assert.equal(
    isCascadeHintVisible({
      departmentInput: 'EEE',
      departments: mockDepartments,
      filteredCourses: [{ code: 'EEE 2201' }]
    }),
    false
  );

  // Unknown department -> hint HIDDEN
  assert.equal(
    isCascadeHintVisible({
      departmentInput: 'Random Department',
      departments: mockDepartments,
      filteredCourses: []
    }),
    false
  );

  // Empty department input -> hint HIDDEN
  assert.equal(
    isCascadeHintVisible({
      departmentInput: '',
      departments: mockDepartments,
      filteredCourses: []
    }),
    false
  );
});

test('unit: isTeacherNonEmpty validates teacher name', () => {
  assert.equal(isTeacherNonEmpty({ name: 'Dr. Jane Smith', designation: 'Professor' }), true);
  assert.equal(isTeacherNonEmpty({ name: '  Dr. Smith  ', designation: '' }), true);
  assert.equal(isTeacherNonEmpty({ name: '', designation: 'Professor' }), false);
  assert.equal(isTeacherNonEmpty({ name: '   ', designation: 'Lecturer' }), false);
  assert.equal(isTeacherNonEmpty(null), false);
  assert.equal(isTeacherNonEmpty(undefined), false);
});

test('unit: Migration from v1 scalar produces {name, designation} with no role field.', () => {
  const v1Draft = {
    docType: 'lab-report',
    university: 'BAUST',
    teacherName: 'Dr. John Doe',
    teacherDesignation: 'Professor'
  };

  const migrated = migrateDraft(v1Draft);
  assert.ok(migrated);
  assert.equal(migrated.draftVersion, 2);
  assert.deepEqual(migrated.teachers, [
    { name: 'Dr. John Doe', designation: 'Professor' }
  ]);
  assert.equal('role' in migrated.teachers[0], false, 'Migrated teacher must NOT contain role property');
});

test('unit: Loading a draft with teacher entries that still have role drops role silently.', () => {
  const v2DraftWithRole = {
    draftVersion: 2,
    docType: 'lab-report',
    teachers: [
      { role: 'Course Teacher', name: 'Dr. Jane Smith', designation: 'Associate Professor' },
      { role: 'Lab Instructor', name: 'Engr. Lab Instructor', designation: 'Lecturer' }
    ]
  };

  const migrated = migrateDraft(v2DraftWithRole);
  assert.ok(migrated);
  assert.equal(migrated.teachers.length, 2);
  assert.deepEqual(migrated.teachers[0], { name: 'Dr. Jane Smith', designation: 'Associate Professor' });
  assert.deepEqual(migrated.teachers[1], { name: 'Engr. Lab Instructor', designation: 'Lecturer' });
  assert.equal('role' in migrated.teachers[0], false);
  assert.equal('role' in migrated.teachers[1], false);
});

test('unit: areDraftsEqual compares name and designation only (ignoring role)', () => {
  const draftA = {
    docType: 'lab-report',
    university: 'BAUST',
    teachers: [{ role: 'Course Teacher', name: 'Dr. Smith', designation: 'Lecturer' }]
  };
  const draftB = {
    docType: 'lab-report',
    university: 'BAUST',
    teachers: [{ role: 'Something Else', name: 'Dr. Smith', designation: 'Lecturer' }]
  };
  const draftC = {
    docType: 'lab-report',
    university: 'BAUST',
    teachers: [{ name: 'Dr. Smith', designation: 'Assistant Professor' }]
  };

  assert.equal(areDraftsEqual(draftA, draftB), true, 'Drafts differing only by legacy role must be equal');
  assert.equal(areDraftsEqual(draftA, draftC), false, 'Drafts differing by designation must NOT be equal');
});

test('unit: First-visit with no draft applies default values.', () => {
  const result = applyDefaultsIfNoDraft(null, DEFAULT_FORM_VALUES);
  assert.equal(result.applied, true);
  assert.equal(result.values.university, 'Bangladesh Army University of Science and Technology (BAUST), Saidpur');
  assert.equal(result.values.department, 'Department of Computer Science and Engineering (CSE)');
  assert.equal(result.values.level, '2');
  assert.equal(result.values.term, 'II');
});

test('unit: First-visit with existing draft uses draft (no defaults).', () => {
  const existingDraft = {
    university: 'Custom University',
    department: 'Department of Electrical and Electronic Engineering (EEE)',
    level: '3',
    term: 'I'
  };
  const result = applyDefaultsIfNoDraft(existingDraft, DEFAULT_FORM_VALUES);
  assert.equal(result.applied, false);
  assert.equal(result.values.university, 'Custom University');
  assert.equal(result.values.department, 'Department of Electrical and Electronic Engineering (EEE)');
  assert.equal(result.values.level, '3');
  assert.equal(result.values.term, 'I');
});

test('unit: Existing draft with explicit empty university preserves empty value (defaults not re-applied)', () => {
  const explicitEmptyDraft = {
    university: '',
    department: '',
    level: '',
    term: ''
  };
  const result = applyDefaultsIfNoDraft(explicitEmptyDraft, DEFAULT_FORM_VALUES);
  assert.equal(result.applied, false);
  assert.equal(result.values.university, '');
});

test('unit: Start over resets to defaults, not blank.', () => {
  // Verifying DEFAULT_FORM_VALUES constant shape & values
  assert.equal(typeof DEFAULT_FORM_VALUES, 'object');
  assert.equal(DEFAULT_FORM_VALUES.university, 'Bangladesh Army University of Science and Technology (BAUST), Saidpur');
  assert.equal(DEFAULT_FORM_VALUES.department, 'Department of Computer Science and Engineering (CSE)');
  assert.equal(DEFAULT_FORM_VALUES.level, '2');
  assert.equal(DEFAULT_FORM_VALUES.term, 'II');
});
