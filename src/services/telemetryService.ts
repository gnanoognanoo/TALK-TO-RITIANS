/**
 * Production-Safe Error Telemetry Service for Talk to RITians.
 * 
 * Strict Privacy Invariant:
 * Under NO circumstances may any telemetry event contain:
 * - Student Name
 * - Register Number
 * - Scanned QR URL
 * - Raw HTML
 * - Email address
 * - Gender
 * - Chat messages
 * - Physical Address
 * - Phone Number
 * - Identity Hash / Fingerprint
 */

export type ProductionErrorCode =
  | 'QR_DECODE_FAILED'
  | 'INVALID_RIT_DOMAIN'
  | 'RIT_PAGE_FETCH_FAILED'
  | 'RIT_PAGE_FORMAT_UNSUPPORTED'
  | 'UNSUPPORTED_COURSE_FORMAT'
  | 'CARD_ALREADY_LINKED'
  | 'AUTH_REQUIRED'
  | 'MATCHMAKING_TIMEOUT'
  | 'CHAT_CONNECTION_FAILED';

export const PRODUCTION_ERROR_CODES: ReadonlyArray<ProductionErrorCode> = Object.freeze([
  'QR_DECODE_FAILED',
  'INVALID_RIT_DOMAIN',
  'RIT_PAGE_FETCH_FAILED',
  'RIT_PAGE_FORMAT_UNSUPPORTED',
  'UNSUPPORTED_COURSE_FORMAT',
  'CARD_ALREADY_LINKED',
  'AUTH_REQUIRED',
  'MATCHMAKING_TIMEOUT',
  'CHAT_CONNECTION_FAILED',
]);

export type HttpStatusCategory = '2xx' | '4xx' | '5xx' | 'network_error' | 'none';

export type DeviceCategory = 'mobile_android' | 'mobile_ios' | 'desktop' | 'unknown';

export interface SafeParserDiagnostics {
  readonly hasTables?: boolean;
  readonly trCount?: number;
  readonly cellStructure?: string;
  readonly missingFields?: readonly string[];
  readonly coursePresent?: boolean;
  readonly rawFieldLengthCategory?: 'short' | 'medium' | 'long';
}

export interface TelemetryEvent {
  readonly timestamp: string;
  readonly errorCode: ProductionErrorCode;
  readonly parserVersion: string;
  readonly httpStatusCategory: HttpStatusCategory;
  readonly deviceCategory: DeviceCategory;
  readonly diagnostics?: SafeParserDiagnostics;
}

export interface TelemetryContext {
  httpStatus?: number;
  diagnostics?: SafeParserDiagnostics;
  userAgent?: string;
  [key: string]: unknown;
}

const PARSER_VERSION = '2.1.0-prod';

const FORBIDDEN_PII_KEYS = new Set([
  'name',
  'studentname',
  'student_name',
  'registernumber',
  'register_number',
  'regno',
  'reg_no',
  'studentref',
  'qrurl',
  'url',
  'html',
  'rawhtml',
  'email',
  'gender',
  'chatmessage',
  'message',
  'messages',
  'address',
  'phone',
  'phonenumber',
  'identityhash',
  'hash',
  'fingerprint',
]);

export function detectDeviceCategory(userAgent?: string): DeviceCategory {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!ua) return 'unknown';
  if (/Android/i.test(ua)) return 'mobile_android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'mobile_ios';
  if (/Windows|Macintosh|Linux/i.test(ua) && !/Mobile/i.test(ua)) return 'desktop';
  return 'unknown';
}

export function categorizeHttpStatus(status?: number): HttpStatusCategory {
  if (!status || status === 0) return 'none';
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 400 && status < 500) return '4xx';
  if (status >= 500 && status < 600) return '5xx';
  return 'network_error';
}

/**
 * Sanitizes arbitrary context objects by stripping any keys or values
 * that could contain personally identifiable information.
 */
export function sanitizeContext(context?: TelemetryContext): Record<string, unknown> {
  if (!context) return {};

  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (FORBIDDEN_PII_KEYS.has(lowerKey)) {
      continue; // Exclude forbidden PII key entirely
    }

    if (key === 'diagnostics' && typeof value === 'object' && value !== null) {
      clean.diagnostics = sanitizeDiagnostics(value as SafeParserDiagnostics);
      continue;
    }

    // Only allow primitive safe types
    if (typeof value === 'boolean' || typeof value === 'number') {
      clean[key] = value;
    } else if (typeof value === 'string') {
      // Check for URL or email-like strings and redact
      if (value.startsWith('http://') || value.startsWith('https://') || value.includes('@')) {
        continue;
      }
      clean[key] = value.slice(0, 100); // Bounded length
    }
  }

  return clean;
}

function sanitizeDiagnostics(diag: SafeParserDiagnostics): SafeParserDiagnostics {
  return {
    hasTables: typeof diag.hasTables === 'boolean' ? diag.hasTables : undefined,
    trCount: typeof diag.trCount === 'number' ? Math.min(diag.trCount, 50) : undefined,
    cellStructure: typeof diag.cellStructure === 'string' ? diag.cellStructure.slice(0, 30) : undefined,
    missingFields: Array.isArray(diag.missingFields)
      ? diag.missingFields.filter(f => typeof f === 'string').slice(0, 5)
      : undefined,
    coursePresent: typeof diag.coursePresent === 'boolean' ? diag.coursePresent : undefined,
    rawFieldLengthCategory: diag.rawFieldLengthCategory,
  };
}

export class TelemetryService {
  private events: TelemetryEvent[] = [];
  private maxStoredEvents = 100;

  /**
   * Records a production error code with privacy-guaranteed metadata.
   */
  trackError(
    errorCode: ProductionErrorCode,
    context?: TelemetryContext
  ): TelemetryEvent {
    const timestamp = new Date().toISOString();
    const httpStatusCategory = categorizeHttpStatus(context?.httpStatus);
    const deviceCategory = detectDeviceCategory(context?.userAgent);
    const safeDiagnostics = context?.diagnostics ? sanitizeDiagnostics(context.diagnostics) : undefined;

    const event: TelemetryEvent = {
      timestamp,
      errorCode,
      parserVersion: PARSER_VERSION,
      httpStatusCategory,
      deviceCategory,
      ...(safeDiagnostics ? { diagnostics: safeDiagnostics } : {}),
    };

    this.events.push(event);
    if (this.events.length > this.maxStoredEvents) {
      this.events.shift();
    }

    // In production, logs safe structural telemetry without PII
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
      // In tests, silent
    } else {
      console.warn(`[Telemetry] Error: ${errorCode}`, {
        status: httpStatusCategory,
        device: deviceCategory,
        diag: safeDiagnostics,
      });
    }

    return event;
  }

  getRecordedEvents(): readonly TelemetryEvent[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events = [];
  }
}

export const telemetryService = new TelemetryService();
