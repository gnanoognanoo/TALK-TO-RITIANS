/**
 * ============================================================================
 * TALK TO RITIANS - QR Scanner & Parser Abstraction Types
 * ============================================================================
 * Since the actual college ID card QR format is yet to be inspected,
 * this contract isolates the physical scanner from the payload parsing logic.
 */

/**
 * Parsed verification identity from a raw QR code string.
 * Uses a flexible payload map to accommodate plain text, JSON, vCard, or custom delimiter formats.
 */
export interface ParsedQRIdentity {
  rawText: string;
  isValidFormat: boolean;
  /**
   * Extracted fields. To be updated once sample QR cards are analyzed.
   */
  extractedFields: {
    registerNumber?: string;
    fullName?: string;
    collegeEmail?: string;
    department?: string;
    batch?: string;
    rawAttributes?: Record<string, string>;
  };
  /**
   * Deterministic identifier or hash derived from card data,
   * used to prevent 1-to-many account duplication.
   */
  cardIdentifier?: string;
  errorMessage?: string;
}

/**
 * QR Parser contract.
 * Multiple parsers can implement this interface (e.g. DelimitedTextParser, JsonQRParser, LegacyIDParser).
 */
export interface IQRParser {
  readonly parserName: string;
  /**
   * Test whether raw scanned text matches this parser's signature.
   */
  canParse(rawText: string): boolean;
  /**
   * Parse the raw string into structured identity candidates.
   */
  parse(rawText: string): ParsedQRIdentity;
}
