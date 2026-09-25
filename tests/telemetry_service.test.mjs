import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// Production Error Codes as specified in Phase 7
const PRODUCTION_ERROR_CODES = [
  'QR_DECODE_FAILED',
  'INVALID_RIT_DOMAIN',
  'RIT_PAGE_FETCH_FAILED',
  'RIT_PAGE_FORMAT_UNSUPPORTED',
  'UNSUPPORTED_COURSE_FORMAT',
  'CARD_ALREADY_LINKED',
  'AUTH_REQUIRED',
  'MATCHMAKING_TIMEOUT',
  'CHAT_CONNECTION_FAILED',
];

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

function detectDeviceCategory(ua) {
  if (!ua) return 'unknown';
  if (/Android/i.test(ua)) return 'mobile_android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'mobile_ios';
  if (/Windows|Macintosh|Linux/i.test(ua) && !/Mobile/i.test(ua)) return 'desktop';
  return 'unknown';
}

function categorizeHttpStatus(status) {
  if (!status || status === 0) return 'none';
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 400 && status < 500) return '4xx';
  if (status >= 500 && status < 600) return '5xx';
  return 'network_error';
}

function sanitizeContext(context) {
  if (!context) return {};
  const clean = {};
  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (FORBIDDEN_PII_KEYS.has(lowerKey)) {
      continue;
    }
    if (key === 'diagnostics' && typeof value === 'object' && value !== null) {
      clean.diagnostics = {
        hasTables: typeof value.hasTables === 'boolean' ? value.hasTables : undefined,
        trCount: typeof value.trCount === 'number' ? Math.min(value.trCount, 50) : undefined,
        cellStructure: typeof value.cellStructure === 'string' ? value.cellStructure.slice(0, 30) : undefined,
        missingFields: Array.isArray(value.missingFields)
          ? value.missingFields.filter(f => typeof f === 'string').slice(0, 5)
          : undefined,
        coursePresent: typeof value.coursePresent === 'boolean' ? value.coursePresent : undefined,
      };
      continue;
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
      clean[key] = value;
    } else if (typeof value === 'string') {
      if (value.startsWith('http://') || value.startsWith('https://') || value.includes('@')) {
        continue;
      }
      clean[key] = value.slice(0, 100);
    }
  }
  return clean;
}

function createTelemetryEvent(errorCode, context = {}) {
  assert.ok(PRODUCTION_ERROR_CODES.includes(errorCode), `Invalid error code: ${errorCode}`);
  const sanitized = sanitizeContext(context);
  return {
    timestamp: new Date().toISOString(),
    errorCode,
    parserVersion: '2.1.0-prod',
    httpStatusCategory: categorizeHttpStatus(context.httpStatus),
    deviceCategory: detectDeviceCategory(context.userAgent),
    ...(sanitized.diagnostics ? { diagnostics: sanitized.diagnostics } : {}),
  };
}

describe('Phase 7 — Privacy-Safe Production Error Telemetry Suite', () => {

  // =========================================================================
  // 1. Structured Production Error Codes
  // =========================================================================
  describe('1. Standardized Production Error Codes Coverage', () => {
    test('defines all 9 required production error codes', () => {
      const expectedCodes = [
        'QR_DECODE_FAILED',
        'INVALID_RIT_DOMAIN',
        'RIT_PAGE_FETCH_FAILED',
        'RIT_PAGE_FORMAT_UNSUPPORTED',
        'UNSUPPORTED_COURSE_FORMAT',
        'CARD_ALREADY_LINKED',
        'AUTH_REQUIRED',
        'MATCHMAKING_TIMEOUT',
        'CHAT_CONNECTION_FAILED',
      ];

      for (const code of expectedCodes) {
        assert.ok(PRODUCTION_ERROR_CODES.includes(code), `Missing code: ${code}`);
      }
      assert.equal(PRODUCTION_ERROR_CODES.length, 9);
    });

    test('successfully tracks each of the 9 production error codes', () => {
      for (const code of PRODUCTION_ERROR_CODES) {
        const event = createTelemetryEvent(code);
        assert.equal(event.errorCode, code);
        assert.equal(event.parserVersion, '2.1.0-prod');
        assert.ok(event.timestamp);
      }
    });

    test('rejects unrecognized error codes', () => {
      assert.throws(() => {
        createTelemetryEvent('UNKNOWN_ARBITRARY_ERROR');
      }, /Invalid error code/);
    });
  });

  // =========================================================================
  // 2. Strict Privacy Invariants (Zero PII in Telemetry)
  // =========================================================================
  describe('2. Zero PII Guarantee & Sanitization', () => {
    test('strictly strips student name, register number, and identity hash', () => {
      const contaminated = {
        name: 'Gnanavel RIT',
        student_name: 'John Doe',
        registerNumber: '2117250020107',
        reg_no: '2117250020107',
        identityHash: 'a7b8c9d0...64charhash',
        fingerprint: 'secret_fingerprint',
      };

      const clean = sanitizeContext(contaminated);
      assert.equal(clean.name, undefined);
      assert.equal(clean.student_name, undefined);
      assert.equal(clean.registerNumber, undefined);
      assert.equal(clean.reg_no, undefined);
      assert.equal(clean.identityHash, undefined);
      assert.equal(clean.fingerprint, undefined);
      assert.deepEqual(clean, {});
    });

    test('strictly strips QR URL, raw HTML, email, gender, and chat messages', () => {
      const contaminated = {
        qrUrl: 'https://ims.ritchennai.edu.in/verify?id=123',
        url: 'https://ims.ritchennai.edu.in',
        html: '<table><tr><td>Student</td></tr></table>',
        rawHtml: '<div>full html</div>',
        email: 'student@example.com',
        gender: 'Male',
        chatMessage: 'Hello stranger!',
        messages: ['msg1', 'msg2'],
        phone: '9876543210',
        address: 'Chennai, Tamil Nadu',
      };

      const clean = sanitizeContext(contaminated);
      assert.equal(clean.qrUrl, undefined);
      assert.equal(clean.url, undefined);
      assert.equal(clean.html, undefined);
      assert.equal(clean.rawHtml, undefined);
      assert.equal(clean.email, undefined);
      assert.equal(clean.gender, undefined);
      assert.equal(clean.chatMessage, undefined);
      assert.equal(clean.messages, undefined);
      assert.equal(clean.phone, undefined);
      assert.equal(clean.address, undefined);
      assert.deepEqual(clean, {});
    });

    test('strips arbitrary string values containing URLs or email addresses', () => {
      const context = {
        arbitraryField: 'https://secret.rit.edu/token',
        contactInfo: 'student@gmail.com',
        safeTag: 'tag-123',
      };

      const clean = sanitizeContext(context);
      assert.equal(clean.arbitraryField, undefined);
      assert.equal(clean.contactInfo, undefined);
      assert.equal(clean.safeTag, 'tag-123');
    });

    test('allows safe structural diagnostics without PII content', () => {
      const safeContext = {
        httpStatus: 422,
        diagnostics: {
          hasTables: true,
          trCount: 5,
          cellStructure: '3-col-table',
          missingFields: ['Course'],
          coursePresent: false,
        },
      };

      const event = createTelemetryEvent('UNSUPPORTED_COURSE_FORMAT', safeContext);
      assert.equal(event.httpStatusCategory, '4xx');
      assert.deepEqual(event.diagnostics, {
        hasTables: true,
        trCount: 5,
        cellStructure: '3-col-table',
        missingFields: ['Course'],
        coursePresent: false,
      });
    });
  });

  // =========================================================================
  // 3. Device & HTTP Category Detection
  // =========================================================================
  describe('3. Device Category and HTTP Status Categorization', () => {
    test('correctly categorizes Android Chrome User Agent', () => {
      const androidUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
      assert.equal(detectDeviceCategory(androidUa), 'mobile_android');
    });

    test('correctly categorizes iPhone Safari User Agent', () => {
      const iphoneUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
      assert.equal(detectDeviceCategory(iphoneUa), 'mobile_ios');
    });

    test('correctly categorizes Desktop Chrome User Agent', () => {
      const desktopUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
      assert.equal(detectDeviceCategory(desktopUa), 'desktop');
    });

    test('correctly categorizes HTTP status ranges into safe categories', () => {
      assert.equal(categorizeHttpStatus(200), '2xx');
      assert.equal(categorizeHttpStatus(404), '4xx');
      assert.equal(categorizeHttpStatus(422), '4xx');
      assert.equal(categorizeHttpStatus(500), '5xx');
      assert.equal(categorizeHttpStatus(502), '5xx');
      assert.equal(categorizeHttpStatus(0), 'none');
      assert.equal(categorizeHttpStatus(undefined), 'none');
    });
  });
});
