/**
 * ============================================================================
 * TALK TO RITIANS - Centralized Profile & Academic Configuration
 * ============================================================================
 * Central configuration repository for institutional departments, academic
 * batches, class levels, section codes, graduation years, and validation rules.
 *
 * CRITICAL PRIVACY RULE:
 * All academic and demographic attributes defined here are PRIVATE metadata used
 * exclusively for matchmaking cohorts. They are cryptographically quarantined
 * via Row-Level Security and NEVER disclosed to strangers in chat rooms.
 */

export interface DepartmentOption {
  code: string;
  name: string;
}

/**
 * Official Academic Departments at Rajalakshmi Institute of Technology (RIT Chennai).
 */
export const INSTITUTIONAL_DEPARTMENTS: readonly DepartmentOption[] = Object.freeze([
  { code: 'CSE', name: 'Computer Science & Engineering' },
  { code: 'IT', name: 'Information Technology' },
  { code: 'AI/DS', name: 'Artificial Intelligence & Data Science' },
  { code: 'ECE', name: 'Electronics & Communication Engineering' },
  { code: 'EEE', name: 'Electrical & Electronics Engineering' },
  { code: 'AI/ML', name: 'Artificial Intelligence & Machine Learning' },
  { code: 'CSBS', name: 'Computer Science & Business Systems' },
  { code: 'MECH', name: 'Mechanical Engineering' },
]);

/**
 * Controlled Section options.
 */
export const SECTION_OPTIONS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F'] as const);

/**
 * Controlled Academic Class levels.
 */
export const CLASS_OPTIONS = Object.freeze([
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year',
] as const);

/**
 * Controlled Academic Batches (4-year undergraduate cycles).
 */
export const BATCH_OPTIONS = Object.freeze([
  '2021-2025',
  '2022-2026',
  '2023-2027',
  '2024-2028',
  '2025-2029',
  '2026-2030',
] as const);

/**
 * Realistic Expected Graduation Year Range.
 */
export const GRADUATION_YEAR_MIN = 2024;
export const GRADUATION_YEAR_MAX = 2032;

export const GRADUATION_YEAR_OPTIONS: readonly number[] = Object.freeze(
  Array.from(
    { length: GRADUATION_YEAR_MAX - GRADUATION_YEAR_MIN + 1 },
    (_, i) => GRADUATION_YEAR_MIN + i
  )
);

/**
 * Controlled Gender Options.
 */
export const GENDER_OPTIONS = Object.freeze([
  'Male',
  'Female',
  'Non-Binary',
  'Prefer not to say',
] as const);

/**
 * Regex format patterns.
 */
export const SECTION_REGEX = /^[A-Z0-9]{1,3}$/;
export const BATCH_REGEX = /^\d{4}-\d{4}$/;

/**
 * Normalizes an arbitrary department string (e.g. from QR scan) into a canonical department code.
 */
export function normalizeDepartment(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;

  const clean = raw
    .trim()
    .toUpperCase()
    .replace(/&/g, 'AND')
    .replace(/\./g, '')
    .replace(/[-_/]/g, ' ');

  // 1. Computer Science and Business Systems
  if (clean.includes('BUSINESS') || clean.includes('CSBS') || /\bCSBS\b/.test(clean)) {
    return 'CSBS';
  }

  // 2. Artificial Intelligence & Data Science
  if (clean.includes('DATA SCIENCE') || /\b(AI\s*DS|AIDS|AI\s*AND\s*DS)\b/.test(clean)) {
    return 'AI/DS';
  }

  // 3. Artificial Intelligence & Machine Learning
  if (clean.includes('MACHINE LEARNING') || /\b(AI\s*ML|AIML|AI\s*AND\s*ML)\b/.test(clean)) {
    return 'AI/ML';
  }

  // 4. Computer Science & Engineering
  if (clean.includes('COMPUTER SCIENCE') || /\bCSE\b/.test(clean) || clean === 'CS') {
    return 'CSE';
  }

  // 5. Information Technology
  if (clean.includes('INFORMATION TECHNOLOGY') || clean.includes('INFORMATION') || /\bIT\b/.test(clean)) {
    return 'IT';
  }

  // 6. Electronics & Communication Engineering
  if ((clean.includes('ELECTRONICS') && clean.includes('COMMUNICATION')) || /\bECE\b/.test(clean)) {
    return 'ECE';
  }

  // 7. Electrical & Electronics Engineering
  if (clean.includes('ELECTRICAL') || /\bEEE\b/.test(clean)) {
    return 'EEE';
  }

  // 8. Mechanical Engineering
  if (clean.includes('MECHANICAL') || /\bMECH\b/.test(clean)) {
    return 'MECH';
  }

  // Check direct code match
  const rawClean = raw.trim().toUpperCase();
  const exact = INSTITUTIONAL_DEPARTMENTS.find(
    (d) => d.code.toUpperCase() === rawClean || d.name.toUpperCase() === rawClean
  );
  return exact ? exact.code : null;
}

/**
 * Normalizes an arbitrary batch string (e.g. "2023-2027", "2023-27") into standard YYYY-YYYY format.
 */
export function normalizeBatch(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;

  const clean = raw
    .trim()
    .replace(/[\u2013\u2014–—]/g, '-')
    .replace(/\s*-\s*/g, '-');

  if (BATCH_REGEX.test(clean)) return clean;

  // Handle 2-digit end year like 2023-27
  const shortMatch = clean.match(/^(\d{4})-(\d{2})$/);
  if (shortMatch) {
    const century = shortMatch[1].slice(0, 2);
    return `${shortMatch[1]}-${century}${shortMatch[2]}`;
  }

  return null;
}

/**
 * Derives the expected graduation year from a batch string (e.g. "2023-2027" -> 2027).
 */
export function deriveGraduationYearFromBatch(batch?: string | null): number | null {
  const norm = normalizeBatch(batch);
  if (!norm) return null;
  const parts = norm.split('-');
  const endYear = parseInt(parts[1], 10);
  return Number.isInteger(endYear) ? endYear : null;
}

export interface ProfileSetupFormValues {
  department: string;
  section: string;
  className: string;
  batch: string;
  graduationYear: number | string;
  gender: string;
}

export interface ProfileValidationResult {
  isValid: boolean;
  errors: Partial<Record<keyof ProfileSetupFormValues, string>>;
}

/**
 * Comprehensive client & service validator for profile setup fields.
 */
export function validateProfileSetup(data: Partial<ProfileSetupFormValues>): ProfileValidationResult {
  const errors: Partial<Record<keyof ProfileSetupFormValues, string>> = {};

  // 1. Department
  if (!data.department || typeof data.department !== 'string' || data.department.trim() === '') {
    errors.department = 'Department is required.';
  } else {
    const code = normalizeDepartment(data.department);
    const validCodes = INSTITUTIONAL_DEPARTMENTS.map((d) => d.code);
    if (!code || !validCodes.includes(code)) {
      errors.department = 'Please select an authorized institutional department.';
    }
  }

  // 2. Section
  if (!data.section || typeof data.section !== 'string' || data.section.trim() === '') {
    errors.section = 'Section is required.';
  } else {
    const upperSection = data.section.trim().toUpperCase();
    if (!SECTION_REGEX.test(upperSection)) {
      errors.section = 'Section must be 1 to 3 alphanumeric characters (e.g. A, B, C).';
    }
  }

  // 3. Class (Academic Year)
  if (!data.className || typeof data.className !== 'string' || data.className.trim() === '') {
    errors.className = 'Class / Academic year is required.';
  } else if (!CLASS_OPTIONS.includes(data.className as any)) {
    errors.className = 'Please select a valid academic class year.';
  }

  // 4. Batch
  if (!data.batch || typeof data.batch !== 'string' || data.batch.trim() === '') {
    errors.batch = 'Academic batch is required.';
  } else {
    const norm = normalizeBatch(data.batch);
    if (!norm || !BATCH_REGEX.test(norm)) {
      errors.batch = 'Batch must be in YYYY-YYYY format (e.g. 2023-2027).';
    }
  }

  // 5. Expected Graduation Year
  if (data.graduationYear === undefined || data.graduationYear === null || data.graduationYear === '') {
    errors.graduationYear = 'Expected graduation year is required.';
  } else {
    const gradYearNum = typeof data.graduationYear === 'number'
      ? data.graduationYear
      : parseInt(String(data.graduationYear).trim(), 10);

    if (isNaN(gradYearNum)) {
      errors.graduationYear = 'Graduation year must be a valid number.';
    } else if (gradYearNum < GRADUATION_YEAR_MIN || gradYearNum > GRADUATION_YEAR_MAX) {
      errors.graduationYear = `Graduation year must be realistic (between ${GRADUATION_YEAR_MIN} and ${GRADUATION_YEAR_MAX}).`;
    }
  }

  // 6. Gender
  if (!data.gender || typeof data.gender !== 'string' || data.gender.trim() === '') {
    errors.gender = 'Gender is required.';
  } else if (!GENDER_OPTIONS.includes(data.gender as any)) {
    errors.gender = 'Please select a valid gender option.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
