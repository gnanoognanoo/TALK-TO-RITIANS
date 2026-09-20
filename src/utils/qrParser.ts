import { IQRParser, ParsedCollegeQrResult } from '../types/qr';
import { parseCollegeQr } from '../services/qrParser';

/**
 * Default parser that wraps the multi-strategy college QR parser abstraction.
 */
export class GenericTextQRParser implements IQRParser {
  readonly parserName = 'GenericTextQRParser';

  canParse(rawText: string): boolean {
    return typeof rawText === 'string' && rawText.trim().length > 0;
  }

  parse(rawText: string): ParsedCollegeQrResult {
    return parseCollegeQr(rawText);
  }
}

/**
 * QR Parser Registry.
 * Allows custom parsers to be registered once physical RIT ID card specifications are analyzed.
 */
class QRParserRegistry {
  private parsers: IQRParser[] = [new GenericTextQRParser()];

  registerParser(parser: IQRParser): void {
    this.parsers.unshift(parser); // New parsers take precedence
  }

  parse(rawText: string): ParsedCollegeQrResult {
    for (const parser of this.parsers) {
      if (parser.canParse(rawText)) {
        return parser.parse(rawText);
      }
    }

    return parseCollegeQr(rawText);
  }
}

export const qrParserRegistry = new QRParserRegistry();
export default qrParserRegistry;
