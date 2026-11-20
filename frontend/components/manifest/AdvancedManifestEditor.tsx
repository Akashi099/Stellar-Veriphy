"use client";

/**
 * AdvancedManifestEditor — Issue #216
 *
 * Rich manifest editor with real-time JSON schema validation, field-type
 * enforcement, required-field indicators, auto-complete for common fields,
 * validation error messages, format suggestions, and a schema version selector.
 */

import { useCallback, useRef,useState } from "react";

import { cn } from "@/utils/cn";
import { validateManifest } from "@/utils/manifestValidation";
import { isValidSHA256,isValidStellarAddress } from "@/utils/validation";

// ---------------------------------------------------------------------------
// Schema versions
// ---------------------------------------------------------------------------

export type SchemaVersion = "1.0" | "1.1" | "2.0";

interface SchemaDefinition {
  version: SchemaVersion;
  label: string;
  description: string;
  requiredFields: string[];
  optionalFields: string[];
}

const SCHEMA_VERSIONS: SchemaDefinition[] = [
  {
    version: "1.0",
    label: "v1.0 — Basic",
    description: "Minimal manifest with contentHash, creator, and timestamp.",
    requiredFields: ["contentHash", "creator", "timestamp"],
    optionalFields: [],
  },
  {
    version: "1.1",
    label: "v1.1 — Standard",
    description: "Adds optional device, location, and aiModel metadata fields.",
    requiredFields: ["contentHash", "creator", "timestamp"],
    optionalFields: ["metadata.device", "metadata.location", "metadata.aiModel"],
  },
  {
    version: "2.0",
    label: "v2.0 — Extended",
    description: "Full schema with extended metadata and schema version field.",
    requiredFields: ["contentHash", "creator", "timestamp", "schemaVersion"],
    optionalFields: [
      "metadata.device",
      "metadata.location",
      "metadata.aiModel",
      "metadata.license",
      "metadata.tags",
    ],
  },
];

// ---------------------------------------------------------------------------
// Auto-complete suggestions per field
// ---------------------------------------------------------------------------

const FIELD_SUGGESTIONS: Record<string, string[]> = {
  "metadata.device": [
    "iPhone 15 Pro",
    "Canon EOS R5",
    "Sony A7 IV",
    "Samsung Galaxy S24",
    "DJI Mavic 3",
    "GoPro Hero 12",
    "MacBook Pro (2023)",
    "Adobe Photoshop 2024",
    "Microsoft Word 365",
  ],
  "metadata.location": [
    "New York, USA",
    "London, UK",
    "Tokyo, Japan",
    "Paris, France",
    "GPS: 40.7128,-74.0060",
    "GPS: 51.5074,-0.1278",
    "Studio — Indoor",
    "Remote / Online",
  ],
  "metadata.aiModel": [
    "GPT-4o",
    "Claude 3.5 Sonnet",
    "Gemini 1.5 Pro",
    "DALL·E 3",
    "Stable Diffusion XL",
    "Midjourney v6",
    "Runway Gen-3",
    "ElevenLabs v2",
    "Sora",
    "None — Human-created",
  ],
  "metadata.license": [
    "CC BY 4.0",
    "CC BY-SA 4.0",
    "CC BY-NC 4.0",
    "CC0 1.0 Universal",
    "All Rights Reserved",
    "MIT License",
    "Apache 2.0",
  ],
};

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

interface FieldConfig {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "datetime-local" | "select";
  formatHint?: string;
  validate: (val: string) => string | null;
}

const FIELD_CONFIGS: FieldConfig[] = [
  {
    key: "contentHash",
    label: "Content Hash (SHA-256)",
    placeholder: "64 hex characters, e.g. a1b2c3d4…",
    type: "text",
    formatHint: "SHA-256 hex digest of the media file — exactly 64 lowercase hex characters.",
    validate: (v) =>
      !v.trim()
        ? "contentHash is required."
        : !isValidSHA256(v)
          ? "Must be a valid SHA-256 hex string (64 hexadecimal characters)."
          : null,
  },
  {
    key: "creator",
    label: "Creator (Stellar Public Key)",
    placeholder: "G… (56 base-32 characters)",
    type: "text",
    formatHint: "Stellar public key starting with 'G', 56 alphanumeric characters.",
    validate: (v) =>
      !v.trim()
        ? "creator is required."
        : !isValidStellarAddress(v)
          ? "Must be a valid Stellar public key (starts with 'G', 56 base-32 characters)."
          : null,
  },
  {
    key: "timestamp",
    label: "Timestamp",
    placeholder: "ISO 8601, e.g. 2024-01-15T10:30:00Z",
    type: "datetime-local",
    formatHint: "ISO 8601 datetime string. The UI converts to UTC automatically.",
    validate: (v) => (!v.trim() ? "timestamp is required." : null),
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdvancedManifestValue {
  contentHash: string;
  creator: string;
  timestamp: string;
  schemaVersion?: SchemaVersion;
  metadata?: {
    device?: string;
    location?: string;
    aiModel?: string;
    license?: string;
    tags?: string;
  };
}

interface AdvancedManifestEditorProps {
  /** Called on every valid change with the current manifest value. */
  onChange?: (value: AdvancedManifestValue) => void;
  /** Initial value for the editor. */
  initialValue?: Partial<AdvancedManifestValue>;
  className?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface AutoCompleteInputProps {
  id: string;
  value: string;
  onChange: (val: string) => void;
  suggestions?: string[] | undefined;
  placeholder?: string | undefined;
  hasError?: boolean | undefined;
  "aria-describedby"?: string | undefined;
}

function AutoCompleteInput({
  id,
  value,
  onChange,
  suggestions = [],
  placeholder,
  hasError,
  "aria-describedby": ariaDescribedby,
}: AutoCompleteInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(value.toLowerCase()) && s !== value
  );
  const isOpen = showSuggestions && filtered.length > 0;

  const select = (val: string) => {
    onChange(val);
    setShowSuggestions(false);
    setHighlighted(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      const item = filtered[highlighted];
      if (item) {
        select(item);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-describedby={ariaDescribedby}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
          setHighlighted(-1);
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full px-3 py-2 text-sm border rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
          "transition-colors",
          hasError ? "border-red-500 focus:ring-red-400" : "border-gray-300 dark:border-gray-600"
        )}
      />
      {isOpen && (
        <ul
          role="listbox"
          className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-48 overflow-y-auto"
        >
          {filtered.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={() => select(s)}
              onMouseEnter={() => setHighlighted(i)}
              className={cn(
                "px-3 py-2 text-sm cursor-pointer",
                i === highlighted
                  ? "bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                  : "text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              )}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AdvancedManifestEditor({
  onChange,
  initialValue,
  className,
}: AdvancedManifestEditorProps) {
  const [schemaVersion, setSchemaVersion] = useState<SchemaVersion>(
    initialValue?.schemaVersion ?? "1.1"
  );
  const [values, setValues] = useState<AdvancedManifestValue>({
    contentHash: initialValue?.contentHash ?? "",
    creator: initialValue?.creator ?? "",
    timestamp: initialValue?.timestamp ?? new Date().toISOString(),
    schemaVersion: initialValue?.schemaVersion ?? "1.1",
    metadata: {
      device: initialValue?.metadata?.device ?? "",
      location: initialValue?.metadata?.location ?? "",
      aiModel: initialValue?.metadata?.aiModel ?? "",
      license: initialValue?.metadata?.license ?? "",
      tags: initialValue?.metadata?.tags ?? "",
    },
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [activeHint, setActiveHint] = useState<string | null>(null);

  const schema = SCHEMA_VERSIONS.find((s) => s.version === schemaVersion)!;

  // Run full manifest validation
  const runValidation = useCallback(
    (current: AdvancedManifestValue): Record<string, string> => {
      const errors: Record<string, string> = {};

      // Required fields from schema
      for (const fieldCfg of FIELD_CONFIGS) {
        if (!schema.requiredFields.includes(fieldCfg.key)) continue;
        const raw = (current as unknown as Record<string, unknown>)[fieldCfg.key];
        const val = typeof raw === "string" ? raw : "";
        const err = fieldCfg.validate(val);
        if (err) errors[fieldCfg.key] = err;
      }

      if (schema.version === "2.0" && !current.schemaVersion) {
        errors.schemaVersion = "schemaVersion is required for v2.0.";
      }

      // Metadata fields
      const meta = current.metadata ?? {};
      for (const optKey of schema.optionalFields) {
        const subKey = optKey.replace("metadata.", "");
        const val = (meta as Record<string, unknown>)[subKey];
        if (typeof val === "string" && val.trim().length > 256) {
          errors[optKey] = `${optKey} must be at most 256 characters.`;
        }
      }

      // Full manifest validator (validates the whole shape)
      const fullResult = validateManifest(current);
      if (!fullResult.valid) {
        fullResult.errors.forEach((e) => {
          const firstPart = e.split(" ")[0];
          const key = firstPart ? firstPart.replace(".", "") : "";
          if (key && !errors[key]) errors[key] = e;
        });
      }

      return errors;
    },
    [schema]
  );

  const updateValues = useCallback(
    (next: AdvancedManifestValue) => {
      const errors = runValidation(next);
      setFieldErrors(errors);
      setValues(next);
      if (Object.keys(errors).length === 0 && onChange) {
        onChange(next);
      }
    },
    [runValidation, onChange]
  );

  const setTopLevelField = (key: keyof AdvancedManifestValue, raw: string) => {
    let val: string = raw;
    // datetime-local → ISO
    if (key === "timestamp" && raw) {
      try {
        val = new Date(raw).toISOString();
      } catch {
        val = raw;
      }
    }
    setTouchedFields((prev) => new Set(prev).add(key as string));
    updateValues({ ...values, [key]: val });
  };

  const setMetaField = (subKey: string, val: string) => {
    const fullKey = `metadata.${subKey}`;
    setTouchedFields((prev) => new Set(prev).add(fullKey));
    updateValues({
      ...values,
      metadata: { ...values.metadata, [subKey]: val },
    });
  };

  const handleSchemaChange = (v: SchemaVersion) => {
    setSchemaVersion(v);
    const nextSchema = SCHEMA_VERSIONS.find((candidate) => candidate.version === v)!;
    const allowed = new Set(nextSchema.optionalFields.map((key) => key.replace("metadata.", "")));
    const metadata = Object.fromEntries(
      Object.entries(values.metadata ?? {}).map(([key, value]) => [key, allowed.has(key) ? value : ""])
    ) as AdvancedManifestValue["metadata"];
    const next: AdvancedManifestValue = { ...values, schemaVersion: v, metadata };
    updateValues(next);
  };

  // Derive datetime-local compatible value for the timestamp input
  const timestampLocal = values.timestamp ? values.timestamp.slice(0, 16) : "";

  const totalErrors = Object.keys(fieldErrors).length;
  const hasAnyTouched = touchedFields.size > 0;

  return (
    <div className={cn("space-y-6", className)}>
      {/* Schema version selector */}
      <div>
        <label
          htmlFor="schema-version"
          className="block text-sm font-semibold text-gray-900 dark:text-white mb-2"
        >
          Schema Version{" "}
          <span className="text-red-500" aria-hidden="true">
            *
          </span>
        </label>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3" id="schema-version-help">
          The selected schema controls which metadata fields are available. Switching to a simpler schema clears unsupported values.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SCHEMA_VERSIONS.map((sv) => (
            <button
              key={sv.version}
              type="button"
              onClick={() => handleSchemaChange(sv.version)}
              aria-pressed={schemaVersion === sv.version}
              className={cn(
                "text-left px-4 py-3 rounded-lg border-2 transition-all text-sm",
                schemaVersion === sv.version
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                  : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-600"
              )}
            >
              <span className="font-semibold block">{sv.label}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 block mt-0.5">
                {sv.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Validation summary */}
      {hasAnyTouched && totalErrors > 0 && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
        >
          <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">
            {totalErrors} validation {totalErrors === 1 ? "error" : "errors"}
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            {Object.values(fieldErrors).map((e) => (
              <li key={e} className="text-xs text-red-600 dark:text-red-400">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Core required fields */}
      <fieldset>
        <legend className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          Required Fields
          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
            (marked with <span className="text-red-500">*</span>)
          </span>
        </legend>
        <div className="space-y-4">
          {FIELD_CONFIGS.filter((f) => schema.requiredFields.includes(f.key)).map((field) => {
            const errorKey = field.key;
            const errorMsg = touchedFields.has(field.key) ? fieldErrors[errorKey] : undefined;
            const hintId = `${field.key}-hint`;
            const errorId = `${field.key}-error`;
            const isActive = activeHint === field.key;

            return (
              <div key={field.key}>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor={field.key}
                    className="text-sm font-medium text-gray-900 dark:text-white"
                  >
                    {field.label}{" "}
                    <span className="text-red-500" aria-hidden="true">
                      *
                    </span>
                  </label>
                  {field.formatHint && (
                    <button
                      type="button"
                      aria-expanded={isActive}
                      aria-controls={hintId}
                      onClick={() => setActiveHint(isActive ? null : field.key)}
                      className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                    >
                      Format hint
                    </button>
                  )}
                </div>

                {field.formatHint && isActive && (
                  <p
                    id={hintId}
                    className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded p-2 mb-2"
                  >
                    {field.formatHint}
                  </p>
                )}

                {field.type === "datetime-local" ? (
                  <input
                    id={field.key}
                    type="datetime-local"
                    value={timestampLocal}
                    aria-required="true"
                    aria-describedby={errorMsg ? errorId : undefined}
                    aria-invalid={!!errorMsg}
                    onChange={(e) => setTopLevelField("timestamp", e.target.value)}
                    onBlur={() => setTouchedFields((p) => new Set(p).add(field.key))}
                    className={cn(
                      "w-full px-3 py-2 text-sm border rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white",
                      "focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors",
                      errorMsg ? "border-red-500" : "border-gray-300 dark:border-gray-600"
                    )}
                  />
                ) : (
                  <input
                    id={field.key}
                    type="text"
                    value={
                      ((values as unknown as Record<string, unknown>)[field.key] as string) ?? ""
                    }
                    placeholder={field.placeholder}
                    aria-required="true"
                    aria-describedby={errorMsg ? errorId : undefined}
                    aria-invalid={!!errorMsg}
                    onChange={(e) =>
                      setTopLevelField(field.key as keyof AdvancedManifestValue, e.target.value)
                    }
                    onBlur={() => setTouchedFields((p) => new Set(p).add(field.key))}
                    className={cn(
                      "w-full px-3 py-2 text-sm border rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono",
                      "focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors",
                      errorMsg ? "border-red-500" : "border-gray-300 dark:border-gray-600"
                    )}
                  />
                )}

                {errorMsg && (
                  <p
                    id={errorId}
                    role="alert"
                    className="mt-1 text-xs text-red-600 dark:text-red-400"
                  >
                    {errorMsg}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      {/* Optional metadata fields */}
      {schema.optionalFields.length > 0 && (
        <fieldset>
          <legend className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Optional Metadata
          </legend>
          <div className="space-y-4">
            {schema.optionalFields.map((optKey) => {
              const subKey = optKey.replace("metadata.", "");
              const label =
                subKey.charAt(0).toUpperCase() + subKey.slice(1).replace(/([A-Z])/g, " $1");
              const errorMsg = touchedFields.has(optKey) ? fieldErrors[optKey] : undefined;
              const errorId = `${subKey}-error`;
              const metaVal = ((values.metadata ?? {}) as Record<string, unknown>)[subKey];
              const fieldVal = typeof metaVal === "string" ? metaVal : "";
              const suggestions = FIELD_SUGGESTIONS[optKey] ?? [];

              return (
                <div key={optKey}>
                  <label
                    htmlFor={subKey}
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    {label}
                    <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
                      (optional)
                    </span>
                  </label>
                  <p id={`${subKey}-help`} className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                    {subKey === "device" && "Add the camera, phone, or tool used to create this content."}
                    {subKey === "location" && "Add where it was created; leave blank if you prefer not to share it."}
                    {subKey === "aiModel" && "Add the tool or model when AI created or edited the content."}
                    {subKey === "license" && "Add the reuse terms that apply to this content."}
                    {subKey === "tags" && "Add short comma-separated labels to help find this content later."}
                  </p>
                  <AutoCompleteInput
                    id={subKey}
                    value={fieldVal}
                    onChange={(val) => setMetaField(subKey, val)}
                    suggestions={suggestions}
                    placeholder={`Enter ${label.toLowerCase()}`}
                    hasError={!!errorMsg}
                    aria-describedby={errorMsg ? `${subKey}-help ${errorId}` : `${subKey}-help`}
                  />
                  {errorMsg && (
                    <p
                      id={errorId}
                      role="alert"
                      className="mt-1 text-xs text-red-600 dark:text-red-400"
                    >
                      {errorMsg}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* Live JSON preview */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Live JSON Preview
        </p>
        <pre
          aria-label="Live manifest JSON preview"
          className="text-xs bg-gray-900 dark:bg-gray-950 text-green-400 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap break-words"
        >
          {JSON.stringify(values, null, 2)}
        </pre>
      </div>
    </div>
  );
}
