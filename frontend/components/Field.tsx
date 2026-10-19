import type { FieldError } from "@stellarveriphy/shared";

interface FieldProps {
  id: string;
  label: string;
  help?: string;
  error?: FieldError;
  children: React.ReactNode;
}

// Label + input + help text + validation message, wired up for screen readers.
// Inputs should set aria-describedby={`${id}-desc`} and aria-invalid={!!error}.
export function Field({ id, label, help, error, children }: FieldProps) {
  return (
    <div className={`field${error ? " field-invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      <div id={`${id}-desc`}>
        {help && <p className="muted">{help}</p>}
        {error && (
          <p className="error-text">
            {error.message}
            {error.hint && <span className="hint"> {error.hint}</span>}
          </p>
        )}
      </div>
    </div>
  );
}
