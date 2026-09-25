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
 * Centralized mapping for official and known RIT course names from ims.ritchennai.edu.in
 * to our canonical department representations.
 * Do not scatter course mappings throughout components.
 */
export const KNOWN_RIT_COURSE_MAPPINGS: Readonly<Record<string, string>> = Object.freeze({
  // Computer Science & Engineering -> CSE
  'B.E. CSE': 'CSE',
  'B.E CSE': 'CSE',
  'BE CSE': 'CSE',
  'B.E. COMPUTER SCIENCE AND ENGINEERING': 'CSE',
  'B.E. COMPUTER SCIENCE & ENGINEERING': 'CSE',
  'B.E - COMPUTER SCIENCE AND ENGINEERING': 'CSE',
  'COMPUTER SCIENCE AND ENGINEERING': 'CSE',
  'COMPUTER SCIENCE & ENGINEERING': 'CSE',
  'CSE': 'CSE',
  'CS': 'CSE',

  // Information Technology -> IT
  'B.TECH IT': 'IT',
  'B.TECH. IT': 'IT',
  'BTECH IT': 'IT',
  'B.TECH INFORMATION TECHNOLOGY': 'IT',
  'B.TECH. INFORMATION TECHNOLOGY': 'IT',
  'B.TECH - INFORMATION TECHNOLOGY': 'IT',
  'INFORMATION TECHNOLOGY': 'IT',
  'IT': 'IT',

  // Artificial Intelligence & Data Science -> AI/DS
  'B.TECH AI & DS': 'AI/DS',
  'B.TECH AI/DS': 'AI/DS',
  'B.TECH AIDS': 'AI/DS',
  'BTECH AIDS': 'AI/DS',
  'B.TECH. AI & DS': 'AI/DS',
  'B.TECH ARTIFICIAL INTELLIGENCE AND DATA SCIENCE': 'AI/DS',
  'B.TECH. ARTIFICIAL INTELLIGENCE AND DATA SCIENCE': 'AI/DS',
  'B.TECH - ARTIFICIAL INTELLIGENCE AND DATA SCIENCE': 'AI/DS',
  'ARTIFICIAL INTELLIGENCE AND DATA SCIENCE': 'AI/DS',
  'ARTIFICIAL INTELLIGENCE & DATA SCIENCE': 'AI/DS',
  'AI & DS': 'AI/DS',
  'AI/DS': 'AI/DS',
  'AIDS': 'AI/DS',

  // Electronics & Communication Engineering -> ECE
  'B.E. ECE': 'ECE',
  'B.E ECE': 'ECE',
  'BE ECE': 'ECE',
  'B.E. ELECTRONICS AND COMMUNICATION ENGINEERING': 'ECE',
  'B.E. ELECTRONICS & COMMUNICATION ENGINEERING': 'ECE',
  'B.E - ELECTRONICS AND COMMUNICATION ENGINEERING': 'ECE',
  'ELECTRONICS AND COMMUNICATION ENGINEERING': 'ECE',
  'ELECTRONICS & COMMUNICATION ENGINEERING': 'ECE',
  'ECE': 'ECE',

  // Electrical & Electronics Engineering -> EEE
  'B.E. EEE': 'EEE',
  'B.E EEE': 'EEE',
  'BE EEE': 'EEE',
  'B.E. ELECTRICAL AND ELECTRONICS ENGINEERING': 'EEE',
  'B.E. ELECTRICAL & ELECTRONICS ENGINEERING': 'EEE',
  'B.E - ELECTRICAL AND ELECTRONICS ENGINEERING': 'EEE',
  'ELECTRICAL AND ELECTRONICS ENGINEERING': 'EEE',
  'ELECTRICAL & ELECTRONICS ENGINEERING': 'EEE',
  'EEE': 'EEE',

  // Artificial Intelligence & Machine Learning -> AI/ML
  'B.TECH AI & ML': 'AI/ML',
  'B.TECH AI/ML': 'AI/ML',
  'B.TECH AIML': 'AI/ML',
  'B.E. AI & ML': 'AI/ML',
  'B.E. AI/ML': 'AI/ML',
  'B.E. AIML': 'AI/ML',
  'B.TECH ARTIFICIAL INTELLIGENCE AND MACHINE LEARNING': 'AI/ML',
  'B.E. ARTIFICIAL INTELLIGENCE AND MACHINE LEARNING': 'AI/ML',
  'ARTIFICIAL INTELLIGENCE AND MACHINE LEARNING': 'AI/ML',
  'ARTIFICIAL INTELLIGENCE & MACHINE LEARNING': 'AI/ML',
  'AI & ML': 'AI/ML',
  'AI/ML': 'AI/ML',
  'AIML': 'AI/ML',

  // Computer Science & Business Systems -> CSBS
  'B.TECH CSBS': 'CSBS',
  'BTECH CSBS': 'CSBS',
  'B.TECH. CSBS': 'CSBS',
  'B.TECH COMPUTER SCIENCE AND BUSINESS SYSTEMS': 'CSBS',
  'B.TECH - COMPUTER SCIENCE AND BUSINESS SYSTEMS': 'CSBS',
  'COMPUTER SCIENCE AND BUSINESS SYSTEMS': 'CSBS',
  'CSBS': 'CSBS',

  // Mechanical Engineering -> MECH
  'B.E. MECH': 'MECH',
  'B.E MECH': 'MECH',
  'BE MECH': 'MECH',
  'B.E. MECHANICAL ENGINEERING': 'MECH',
  'B.E - MECHANICAL ENGINEERING': 'MECH',
  'MECHANICAL ENGINEERING': 'MECH',
  'MECH': 'MECH',
});

/**
 * Normalizes an arbitrary course or department string into our canonical department code.
 * Uses centralized KNOWN_RIT_COURSE_MAPPINGS first, then keyword fallback.
 */
export function normalizeDepartment(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;

  const rawUpper = raw.trim().toUpperCase();

  // 1. Direct match in centralized known RIT course mapping
  if (KNOWN_RIT_COURSE_MAPPINGS[rawUpper]) {
    return KNOWN_RIT_COURSE_MAPPINGS[rawUpper];
  }

  // 2. Normalized string matching in known course mapping
  const normalizedKey = rawUpper
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .trim();
  if (KNOWN_RIT_COURSE_MAPPINGS[normalizedKey]) {
    return KNOWN_RIT_COURSE_MAPPINGS[normalizedKey];
  }

  const clean = rawUpper
    .replace(/&/g, 'AND')
    .replace(/\./g, '')
    .replace(/[-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 3. Keyword-based matching
  if (clean.includes('BUSINESS') || clean.includes('CSBS') || /\bCSBS\b/.test(clean)) {
    return 'CSBS';
  }

  if (clean.includes('DATA SCIENCE') || /\b(AI\s*DS|AIDS|AI\s*AND\s*DS)\b/.test(clean)) {
    return 'AI/DS';
  }

  if (clean.includes('MACHINE LEARNING') || /\b(AI\s*ML|AIML|AI\s*AND\s*ML)\b/.test(clean)) {
    return 'AI/ML';
  }

  if (clean.includes('COMPUTER SCIENCE') || /\bCSE\b/.test(clean) || clean === 'CS') {
    return 'CSE';
  }

  if (clean.includes('INFORMATION TECHNOLOGY') || clean.includes('INFORMATION') || /\bIT\b/.test(clean)) {
    return 'IT';
  }

  if ((clean.includes('ELECTRONICS') && clean.includes('COMMUNICATION')) || /\bECE\b/.test(clean)) {
    return 'ECE';
  }

  if (clean.includes('ELECTRICAL') || /\bEEE\b/.test(clean)) {
    return 'EEE';
  }

  if (clean.includes('MECHANICAL') || /\bMECH\b/.test(clean)) {
    return 'MECH';
  }

  // 4. Exact code or name match from INSTITUTIONAL_DEPARTMENTS
  const exact = INSTITUTIONAL_DEPARTMENTS.find(
    (d) => d.code.toUpperCase() === rawUpper || d.name.toUpperCase() === rawUpper
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
