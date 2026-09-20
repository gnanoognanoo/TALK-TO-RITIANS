import { IQRParser, ParsedQRIdentity } from '../types/qr';

/**
 * Default fallback parser for raw string/text ID cards.
 * Can parse basic JSON or key-value structures without hardcoded schema constraints.
 */
export class GenericTextQRParser implements IQRParser {
  readonly parserName = 'GenericTextQRParser';

  canParse(rawText: string): boolean {
    return typeof rawText === 'string' && rawText.trim().length > 0;
  }

  parse(rawText: string): ParsedQRIdentity {
    const trimmed = rawText.trim();

    // Check if payload is serialized JSON
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const json = JSON.parse(trimmed) as Record<string, unknown>;
        return {
          rawText: trimmed,
          isValidFormat: true,
          extractedFields: {
            registerNumber: (json.registerNumber || json.regNo || json.reg_no || json.id) as string | undefined,
            fullName: (json.name || json.fullName || json.student_name) as string | undefined,
            collegeEmail: (json.email || json.college_email) as string | undefined,
            department: (json.dept || json.department) as string | undefined,
            batch: (json.batch || json.year) as string | undefined,
          },
          cardIdentifier: (json.registerNumber || json.id || trimmed) as string,
        };
      } catch {
        // Fall through to plain text parsing
      }
    }

    // Default plain text capture (to be refined after inspecting sample college card QR)
    return {
      rawText: trimmed,
      isValidFormat: true,
      extractedFields: {
        rawAttributes: { content: trimmed },
      },
      cardIdentifier: trimmed,
    };
  }
}

/**
 * QR Parser Registry.
 * Once the physical RIT ID card QR format is inspected, add the concrete parser here.
 */
class QRParserRegistry {
  private parsers: IQRParser[] = [new GenericTextQRParser()];

  registerParser(parser: IQRParser): void {
    this.parsers.unshift(parser); // New parsers take precedence
  }

  parse(rawText: string): ParsedQRIdentity {
    for (const parser of this.parsers) {
      if (parser.canParse(rawText)) {
        return parser.parse(rawText);
      }
    }

    return {
      rawText,
      isValidFormat: false,
      extractedFields: {},
      errorMessage: 'Unrecognized QR code format',
    };
  }
}

export const qrParserRegistry = new QRParserRegistry();
