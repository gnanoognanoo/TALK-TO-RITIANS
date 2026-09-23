/**
 * ============================================================================
 * TALK TO RITIANS - QR Scanner & Parser Abstraction Types
 * ============================================================================
 * Since the actual college ID card QR format is yet to be inspected,
 * this contract isolates the physical scanner from the payload parsing logic.
 */

/**
 * Camera status states for the QR scanner lifecycle.
 */
export type CameraStatus =
  | 'idle'
  | 'checking_support'
  | 'permission_denied'
  | 'no_camera'
  | 'scanning'
  | 'scan_success'
  | 'scan_error';

/**
 * Supported or recognized format signatures for ID QR codes.
 */
export type DetectedQrFormat =
  | 'rit_official_url'
  | 'mock_json'
  | 'json'
  | 'delimited_kv'
  | 'url_reference'
  | 'unknown';

/**
 * Structured student fields extracted from a QR code.
 */
export interface ExtractedStudentFields {
  name?: string;
  department?: string;
  batch?: string;
  studentReference?: string;
  collegeEmail?: string;
  rawAttributes?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Decoupled result of parsing raw QR text.
 * Accommodates multiple formats without locking into an assumed official structure.
 */
export interface ParsedCollegeQrResult {
  rawValue: string;
  formatDetected: DetectedQrFormat;
  fields: ExtractedStudentFields;
  validStructure: boolean;
  isMockData: boolean;
  validationErrors: string[];
}

/**
 * Backward-compatible verification identity shape from raw QR code.
 */
export interface ParsedQRIdentity {
  rawText: string;
  isValidFormat: boolean;
  extractedFields: {
    registerNumber?: string;
    fullName?: string;
    collegeEmail?: string;
    department?: string;
    batch?: string;
    studentReference?: string;
    rawAttributes?: Record<string, string>;
  };
  cardIdentifier?: string;
  errorMessage?: string;
}

/**
 * QR Parser contract.
 */
export interface IQRParser {
  readonly parserName: string;
  canParse(rawText: string): boolean;
  parse(rawText: string): ParsedCollegeQrResult;
}
