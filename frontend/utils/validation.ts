/**
 * validation.ts
 *
 * Pure-function validation helpers used across the StellarVeriphy frontend.
 *
 * All functions are side-effect free and safe to call in any environment
 * (browser, Node.js, or Web Workers).  They never throw — invalid input
 * returns `false` or a descriptive error string.
 *
 * @module utils/validation
 */

// ---------------------------------------------------------------------------
// SHA-256
// ---------------------------------------------------------------------------

/**
 * Returns `true` if `hash` is a valid 64-character hexadecimal SHA-256 digest.
 *
 * Accepts both lower-case (`abcdef`) and upper-case (`ABCDEF`) hex digits.
 *
 * @param hash - The string to validate.
 * @returns `true` when `hash` is exactly 64 hex characters, `false` otherwise.
 *
 * @example
 * ```ts
 * isValidSHA256("a".repeat(64))     // → true
 * isValidSHA256("short")            // → false
 * isValidSHA256("g".repeat(64))     // → false  (g is not a hex digit)
 * ```
 */
export function isValidSHA256(hash: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Returns a descriptive error message when `hash` is not a valid SHA-256 hex
 * string, or `null` when it is valid.
 *
 * Use this for form field validation where you need a human-readable reason.
 *
 * @param hash - The candidate hash string.
 * @returns An error string describing the problem, or `null` if valid.
 *
 * @example
 * ```ts
 * validateSHA256("")        // → "Hash is required."
 * validateSHA256("abc")     // → "SHA-256 hash must be exactly 64 hex characters (got 3)."
 * validateSHA256("z".repeat(64))  // → "SHA-256 hash must contain only hexadecimal characters..."
 * validateSHA256("a".repeat(64))  // → null
 * ```
 */
export function validateSHA256(hash: string): string | null {
  if (!hash || hash.trim() === "") {
    return "Hash is required.";
  }
  if (hash.length !== 64) {
    return `SHA-256 hash must be exactly 64 hex characters (got ${hash.length}).`;
  }
  if (!/^[a-fA-F0-9]{64}$/.test(hash)) {
    return "SHA-256 hash must contain only hexadecimal characters (0-9, a-f, A-F).";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stellar
// ---------------------------------------------------------------------------

/**
 * Returns `true` if `address` is a syntactically valid Stellar public key.
 *
 * A valid Stellar public key begins with `G`, is 56 characters long, and
 * consists only of base-32 characters (`A-Z`, `2-7`).  This check does
 * **not** verify the Ed25519 checksum — use the Stellar SDK for that.
 *
 * @param address - The candidate address string.
 * @returns `true` when the address passes the format check.
 *
 * @example
 * ```ts
 * isValidStellarAddress("GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNSOLXAUJVLVWXVVNQNYWGLZ") // → true
 * isValidStellarAddress("not-a-key") // → false
 * ```
 */
export function isValidStellarAddress(address: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(address);
}

/**
 * Returns a descriptive error message when `address` is not a valid Stellar address,
 * or `null` when it is valid.
 *
 * @param address - The candidate Stellar address string.
 * @returns An error string describing the problem, or `null` if valid.
 */
export function validateStellarAddress(address: string): string | null {
  if (!address || address.trim() === "") {
    return "Stellar address is required.";
  }
  if (address.length !== 56) {
    return `Stellar address must be exactly 56 characters (got ${address.length}).`;
  }
  if (address[0] !== "G") {
    return "Stellar address must start with 'G'.";
  }
  if (!/^G[A-Z2-7]{55}$/.test(address)) {
    return "Stellar address must contain only uppercase letters and numbers 2-7.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Ethereum
// ---------------------------------------------------------------------------

/**
 * Returns `true` if `address` is a valid Ethereum address.
 *
 * Accepts all three canonical forms:
 * - All lower-case hex (`0x…`)
 * - All upper-case hex
 * - EIP-55 mixed-case checksum
 *
 * This does **not** verify EIP-55 checksum correctness.
 *
 * @param address - The candidate Ethereum address string.
 * @returns `true` when the string is `0x` followed by exactly 40 hex chars.
 */
export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// ---------------------------------------------------------------------------
// Stellar asset code
// ---------------------------------------------------------------------------

/**
 * Returns `true` if `code` is a valid Stellar asset code.
 *
 * Stellar asset codes are 1–12 alphanumeric characters (e.g. `XLM`, `USDC`).
 *
 * @param code - The candidate asset code string.
 * @returns `true` when the code is 1–12 alphanumeric characters.
 */
export function isValidAssetCode(code: string): boolean {
  return /^[a-zA-Z0-9]{1,12}$/.test(code);
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

/**
 * Returns `true` if `amount` represents a valid positive decimal number.
 *
 * Accepts integers and decimals (e.g. `"100"`, `"3.14"`, `42`).
 * Rejects negative values, zero, non-numeric strings, and `Infinity`.
 *
 * @param amount - A number or its string representation.
 * @returns `true` when `amount` is a finite positive decimal.
 *
 * @example
 * ```ts
 * isValidAmount("10.5")  // → true
 * isValidAmount("-1")    // → false
 * isValidAmount("0")     // → false
 * isValidAmount("abc")   // → false
 * ```
 */
export function isValidAmount(amount: string | number): boolean {
  const value = typeof amount === "number" ? amount : parseFloat(amount);
  if (isNaN(value) || !isFinite(value)) return false;
  if (value <= 0) return false;
  // Ensure the string form only contains digits and an optional single dot
  const str = String(amount).trim();
  return /^\d+(\.\d+)?$/.test(str);
}

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

/**
 * Triggers a browser download of `data` serialised as formatted JSON.
 *
 * Creates a temporary `<a>` element, programmatically clicks it, then
 * revokes the object URL to free memory.
 *
 * @param data     - Any JSON-serialisable object.
 * @param filename - The suggested download file name (e.g. `"manifest.json"`).
 */
/** Primitive values that can appear in a serialisable object. */
type SerializablePrimitive = string | number | boolean | null | undefined;

/** Recursive type for objects that can be serialised to XML. */
type SerializableValue = SerializablePrimitive | SerializableValue[] | SerializableObject;
interface SerializableObject {
  [key: string]: SerializableValue;
}

export function downloadJSON(data: object, filename: string) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Triggers a browser download of `data` serialised as XML.
 *
 * The object is recursively converted to XML with a `<root>` wrapper.
 * Arrays are serialised as repeated `<item>` elements.
 *
 * @param data     - Any JSON-serialisable object.
 * @param filename - The suggested download file name (e.g. `"manifest.xml"`).
 */
export function downloadXML(data: SerializableObject, filename: string) {
  const xml = objectToXml(data);
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Internal XML serialisation helpers
// ---------------------------------------------------------------------------

/**
 * Wraps `objectToXmlContent` with an XML declaration and root element.
 *
 * @param obj      - Object to serialise.
 * @param rootName - Root element tag name (default: `"root"`).
 * @returns Full XML document string.
 */
function objectToXml(obj: SerializableObject, rootName = "root"): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<${rootName}>\n`;
  xml += objectToXmlContent(obj, 1);
  xml += `</${rootName}>`;
  return xml;
}

/**
 * Recursively converts a plain object to indented XML content.
 *
 * - Object values → nested elements.
 * - Array values  → repeated `<item>` elements.
 * - Primitive values → text content.
 * - `null` / `undefined` → self-closing element.
 *
 * Tag names are sanitised to remove characters that are invalid in XML
 * element names (replaced with `_`).
 *
 * @param obj    - Object (or sub-object) to convert.
 * @param indent - Current indentation depth (multiples of two spaces).
 * @returns XML fragment string (no declaration or root wrapper).
 */
function objectToXmlContent(obj: SerializableObject, indent: number): string {
  const spaces = "  ".repeat(indent);
  let xml = "";

  for (const [key, value] of Object.entries(obj)) {
    const tagName = key.replace(/[^a-zA-Z0-9_]/g, "_");
    if (value === null || value === undefined) {
      xml += `${spaces}<${tagName} />\n`;
    } else if (typeof value === "object" && !Array.isArray(value)) {
      xml += `${spaces}<${tagName}>\n`;
      xml += objectToXmlContent(value as SerializableObject, indent + 1);
      xml += `${spaces}</${tagName}>\n`;
    } else if (Array.isArray(value)) {
      (value as SerializableValue[]).forEach((item) => {
        xml += `${spaces}<item>\n`;
        if (
          item !== null &&
          item !== undefined &&
          typeof item === "object" &&
          !Array.isArray(item)
        ) {
          xml += objectToXmlContent(item as SerializableObject, indent + 1);
        } else {
          xml += `${"  ".repeat(indent + 1)}${String(item)}\n`;
        }
        xml += `${spaces}</item>\n`;
      });
    } else {
      xml += `${spaces}<${tagName}>${String(value)}</${tagName}>\n`;
    }
  }

  return xml;
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

/**
 * Copies `text` to the system clipboard using the async Clipboard API.
 *
 * Rejects if the user has not granted clipboard-write permission or if
 * the API is unavailable (e.g. non-HTTPS context).
 *
 * @param text - The string to write to the clipboard.
 * @returns A promise that resolves when the write succeeds.
 */
export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

// ---------------------------------------------------------------------------
// Standardized error messages for forms
// ---------------------------------------------------------------------------

/**
 * Returns a descriptive error message for invalid amount values,
 * or `null` when it is valid.
 *
 * @param amount - A number or its string representation.
 * @returns An error string describing the problem, or `null` if valid.
 */
export function validateAmount(amount: string | number): string | null {
  const str = String(amount).trim();
  if (!str) {
    return "Amount is required.";
  }
  const value = typeof amount === "number" ? amount : parseFloat(amount);
  if (isNaN(value)) {
    return "Amount must be a valid number.";
  }
  if (!isFinite(value)) {
    return "Amount must be a finite number.";
  }
  if (value <= 0) {
    return "Amount must be greater than 0.";
  }
  if (!/^\d+(\.\d+)?$/.test(str)) {
    return "Amount must contain only digits and an optional decimal point.";
  }
  return null;
}

/**
 * Returns a descriptive error message for invalid manifest file types,
 * or `null` if the file type is valid.
 *
 * @param filename - The name of the file to validate.
 * @returns An error string describing the problem, or `null` if valid.
 */
export function validateManifestFileType(filename: string): string | null {
  if (!filename) {
    return "File name is required.";
  }
  const isJsonOrXml = filename.toLowerCase().endsWith(".json") || filename.toLowerCase().endsWith(".xml");
  if (!isJsonOrXml) {
    return "Manifest must be a .json or .xml file.";
  }
  return null;
}

/**
 * Returns a descriptive error message for required fields,
 * or `null` if the field is provided.
 *
 * @param value - The field value to validate.
 * @param fieldName - The name of the field for error messages.
 * @returns An error string describing the problem, or `null` if valid.
 */
export function validateRequired(value: string | undefined | null, fieldName: string): string | null {
  if (!value || value.trim() === "") {
    return `${fieldName} is required.`;
  }
  return null;
}
