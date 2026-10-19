"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SUPPORTED_MEDIA_TYPES,
  UPLOAD_LIMITS,
  errorsByField,
  validateUploadMetadata,
  type ContentManifest,
  type FieldError,
  type UploadSessionView,
  type VerificationJobView,
} from "@stellarveriphy/shared";
import { useFileHash } from "@/hooks/useFileHash";
import { useJobStatuses } from "@/hooks/useJobStatuses";
import { ApiError, api } from "@/lib/api";
import { completeUploadSession, findResumableSession, openUploadSession, uploadMissingChunks } from "@/lib/resumable-upload";
import { trackJob } from "@/lib/tracked-jobs";
import { Field } from "./Field";
import { JobProgress } from "./JobProgress";
import { MediaSnapshotPreview } from "./MediaSnapshotPreview";
import { RetryableError } from "./ui/RetryableError";
import { ShortcutHint } from "./ui/ShortcutHint";

// Maps validation paths from the shared schema to the form input that fixes them.
const FIELD_FOR_PATH: Record<string, string> = {
  fileName: "file",
  mimeType: "file",
  fileSize: "file",
  contentHash: "file",
  "manifest.contentHash": "file",
  creator: "creator",
  "manifest.creator": "creator",
  "manifest.timestamp": "capturedAt",
  "manifest.metadata": "device",
  "manifest.metadata.device": "device",
  "manifest.metadata.location": "location",
  "manifest.metadata.aiModel": "aiModel",
  title: "title",
  description: "description",
  tags: "tags",
};

const ACCEPT = Object.entries(SUPPORTED_MEDIA_TYPES).flatMap(([type, exts]) => [type, ...exts]).join(",");
const DRAFT_KEY = "stellar-veriphy:certificate-upload-draft:v1";
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type FormValues = {
  creator: string;
  capturedAt: string;
  device: string;
  location: string;
  aiModel: string;
  title: string;
  description: string;
  tags: string;
};

type DraftState = {
  savedAt: string;
  values: FormValues;
  fileName?: string;
  fileSize?: number;
};

const emptyValues = (): FormValues => ({
  creator: "",
  capturedAt: localDateTimeNow(),
  device: "",
  location: "",
  aiModel: "",
  title: "",
  description: "",
  tags: "",
});

// Value for <input type="datetime-local"> in the user's timezone.
function localDateTimeNow(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function toIsoTimestamp(local: string): string {
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? local : date.toISOString();
}

function fileSelectionIssue(file: File): string | null {
  const mimeType = file.type.split(";")[0].trim().toLowerCase();
  const extensions = SUPPORTED_MEDIA_TYPES[mimeType];
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!extensions || !extensions.includes(extension)) {
    return "This file type or extension is not supported. Choose an accepted image, video, audio, or PDF file.";
  }
  if (file.size <= 0) return "This file is empty. Choose a file that has content.";
  if (file.size > UPLOAD_LIMITS.maxFileSizeBytes) {
    return `This file is larger than the ${UPLOAD_LIMITS.maxFileSizeBytes / (1024 * 1024)} MB limit.`;
  }
  return null;
}

function MetadataPreview({
  payload,
  validation,
  errors,
}: {
  payload: Record<string, unknown>;
  validation: ReturnType<typeof validateUploadMetadata>;
  errors: FieldError[];
}) {
  const preview = validation.ok ? validation.value : payload;
  return (
    <details open className="card">
      <summary className="cursor-pointer font-semibold">Metadata preview</summary>
      <p className="mt-2 text-sm muted">
        {validation.ok
          ? "This is the exact normalized JSON that will be submitted for verification."
          : "This is the current submission draft. Fix the fields below before publishing it."}
      </p>
      <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-gray-100 p-4 text-xs leading-relaxed text-gray-800 dark:bg-gray-900 dark:text-gray-200">
        {JSON.stringify(preview, null, 2)}
      </pre>
      {errors.length > 0 && (
        <div className="notice notice-error mt-4" role="alert">
          <p><strong>Review these metadata fields:</strong></p>
          <ul>
            {errors.map((error) => {
              const input = FIELD_FOR_PATH[error.field] ?? error.field;
              return (
                <li key={`${error.field}-${error.message}`}>
                  <a href={`#${input}`}>{error.field}: {error.message}</a>
                  {error.hint && <span className="hint"> {error.hint}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </details>
  );
}

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [dragInvalid, setDragInvalid] = useState(false);
  const [fileSelectionError, setFileSelectionError] = useState<string | null>(null);
  const dragDepth = useRef(0);
  const [values, setValues] = useState<FormValues>(() => emptyValues());
  const [restoredDraft, setRestoredDraft] = useState<DraftState | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [serverError, setServerError] = useState<ApiError | null>(null);
  const [submitted, setSubmitted] = useState<VerificationJobView | null>(null);
  // Resumable upload state: the live session while submitting, and an unfinished
  // session for the selected file found from an earlier, interrupted attempt.
  const [uploadSession, setUploadSession] = useState<UploadSessionView | null>(null);
  const [resumable, setResumable] = useState<UploadSessionView | null>(null);
  const [restartUpload, setRestartUpload] = useState(false);
  const hashState = useFileHash(file);
  const { jobs } = useJobStatuses(submitted ? [submitted.id] : []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as DraftState;
      const savedAt = Date.parse(draft.savedAt);
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > DRAFT_TTL_MS) {
        window.localStorage.removeItem(DRAFT_KEY);
        return;
      }
      setValues({ ...emptyValues(), ...draft.values });
      setRestoredDraft(draft);
    } catch {
      window.localStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    const hasTypedDraft = Object.entries(values).some(([key, value]) => {
      if (key === "capturedAt") return false;
      return value.trim() !== "";
    });
    if (!hasTypedDraft && !file) return;

    const draft: DraftState = {
      savedAt: new Date().toISOString(),
      values,
      fileName: file?.name ?? restoredDraft?.fileName,
      fileSize: file?.size ?? restoredDraft?.fileSize,
    };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [file, restoredDraft?.fileName, restoredDraft?.fileSize, values]);

  const set = (name: keyof typeof values) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((v) => ({ ...v, [name]: e.target.value }));
      setServerError(null);
    };
  const touch = (name: string) => () => setTouched((t) => new Set(t).add(name));

  const payload = useMemo(() => {
    const contentHash = hashState.status === "done" ? hashState.hash : "";
    const metadata = { device: values.device, location: values.location, aiModel: values.aiModel };
    const hasMetadata = Object.values(metadata).some((v) => v.trim() !== "");
    const manifest: ContentManifest = {
      contentHash,
      creator: values.creator,
      timestamp: toIsoTimestamp(values.capturedAt),
      ...(hasMetadata ? { metadata } : {}),
    };
    return {
      fileName: file?.name ?? "",
      mimeType: file?.type ?? "",
      fileSize: file?.size ?? 0,
      contentHash,
      creator: values.creator,
      title: values.title,
      description: values.description,
      tags: values.tags.split(",").map((t) => t.trim()).filter(Boolean),
      manifest,
    };
  }, [file, hashState, values]);

  const validation = useMemo(() => validateUploadMetadata(payload), [payload]);
  const sessionCreator = validation.ok ? validation.value.creator : "";
  const sessionHash = validation.ok ? validation.value.contentHash : "";

  useEffect(() => {
    setResumable(null);
    setRestartUpload(false);
    if (!sessionCreator || !sessionHash) return;
    let cancelled = false;
    findResumableSession(sessionCreator, sessionHash).then(
      (session) => !cancelled && setResumable(session && session.completedChunks.length > 0 ? session : null),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [sessionCreator, sessionHash]);
  const clientErrors: FieldError[] = validation.ok ? [] : validation.errors;
  const allErrors = [...clientErrors, ...(serverError?.errors ?? [])];

  // One message per input. Errors show once the input was touched or a submit was attempted.
  const inputErrors: Record<string, FieldError> = {};
  for (const [path, error] of Object.entries(errorsByField(allErrors))) {
    const input = FIELD_FOR_PATH[path] ?? path;
    if (!inputErrors[input] && (submitAttempted || touched.has(input))) inputErrors[input] = error;
  }

  // With no file, the individual file/hash errors are noise; give one clear instruction.
  if (!file && inputErrors.file) {
    inputErrors.file = { field: "file", message: "Choose a file to upload.", hint: "Its hash becomes the content hash in the manifest." };
  }
  // Hash-related errors are noise while the hash is still being computed.
  if (hashState.status === "hashing") delete inputErrors.file;
  if (hashState.status === "error") {
    inputErrors.file = { field: "file", message: hashState.message };
  }

  const visibleFileError = fileSelectionError ?? inputErrors.file?.message;

  const inputProps = (name: string) => ({
    id: name,
    "aria-invalid": !!inputErrors[name] || (name === "file" && Boolean(visibleFileError)),
    "aria-describedby": name === "file" ? "file-desc file-drop-status" : `${name}-desc`,
    onBlur: touch(name),
  });

  const setSelectedFile = (selectedFile: File | undefined) => {
    if (!selectedFile) return;
    const issue = fileSelectionIssue(selectedFile);
    setDragInvalid(Boolean(issue));
    setFileSelectionError(issue);
    setFile(selectedFile);
    touch("file")();
    setServerError(null);
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current += 1;
    setIsDragActive(true);
    const item = event.dataTransfer.items[0];
    const mimeType = item?.type.split(";")[0].trim().toLowerCase();
    setDragInvalid(Boolean(item && item.kind === "file" && (!mimeType || !SUPPORTED_MEDIA_TYPES[mimeType])));
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragActive(false);
      setDragInvalid(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setIsDragActive(false);
    setSelectedFile(event.dataTransfer.files[0]);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    setServerError(null);
    if (!validation.ok || hashState.status !== "done") {
      const first = clientErrors[0];
      document.getElementById(FIELD_FOR_PATH[first?.field] ?? "file")?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const metadata = validation.value;
      let session = await openUploadSession({
        file: hashState.file,
        contentHash: metadata.contentHash,
        creator: metadata.creator,
        mode: restartUpload ? "restart" : "resume",
      });
      setUploadSession(session);
      session = await uploadMissingChunks({ file: hashState.file, session, onProgress: setUploadSession });
      const upload = await api.createUpload(metadata);
      setUploadSession(await completeUploadSession(session, upload.id));
      setResumable(null);
      const job = await api.createJob(upload.id);
      trackJob({ id: job.id, label: upload.title ?? upload.fileName, submittedAt: job.createdAt });
      window.localStorage.removeItem(DRAFT_KEY);
      setRestoredDraft(null);
      setSubmitted(job);
    } catch (err) {
      setServerError(err instanceof ApiError ? err : new ApiError("Submission failed. Please try again.", 0));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    const job = jobs[submitted.id] ?? submitted;
    return (
      <section className="card">
        <h2>Submitted for verification</h2>
        {file && (
          <MediaSnapshotPreview
            file={file}
            verificationState={job.status === "completed" ? "completed" : job.status === "failed" ? "failed" : "processing"}
          />
        )}
        <JobProgress job={job} />
        <p>
          Track this and earlier submissions on <a href="/creator/jobs">My verification jobs</a>.
        </p>
        <button type="button" className="secondary" onClick={() => window.location.reload()}>Upload another file</button>
      </section>
    );
  }

  // Summary lists one message per input, keyed by the input id so links can jump to it.
  const summaryErrors = Object.entries(submitAttempted || serverError ? inputErrors : {});

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !submitting && hashState.status !== "hashing") {
          e.preventDefault();
          e.currentTarget.requestSubmit();
        }
      }}
      noValidate
      className="form"
    >
      {/* Transient failure (network, 5xx, rate limit): one-click resubmit; the draft is kept */}
      {serverError && serverError.isRetryable && serverError.errors.length === 0 && summaryErrors.length === 0 && (
        <RetryableError
          variant="inline"
          error={serverError}
          title="Submission didn't go through"
          retryLabel="Resubmit"
          retrying={submitting}
          onRetry={() => formRef.current?.requestSubmit()}
        />
      )}

      {(summaryErrors.length > 0 || (serverError && !(serverError.isRetryable && serverError.errors.length === 0))) && (
        <div className="notice notice-error" role="alert">
          <p><strong>{serverError && serverError.errors.length === 0 ? serverError.message : "Please fix the following before submitting:"}</strong></p>
          {serverError?.httpStatus === 429 && (
            <p className="hint">
              Retry after {serverError.retryAfterSeconds ?? "the indicated backoff period"} seconds. Your draft is saved locally, so you can safely wait and submit again.
            </p>
          )}
          {summaryErrors.length > 0 && (
            <ul>
              {summaryErrors.map(([input, error]) => (
                <li key={input}>
                  <a href={`#${input}`}>{error.message}</a>
                  {error.hint && <span className="hint"> {error.hint}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {restoredDraft && !file && (
        <div className="notice" role="status">
          <p>
            <strong>Draft restored.</strong> Your form details were saved locally
            {restoredDraft.fileName ? ` with ${restoredDraft.fileName}.` : "."} Re-select the file before submitting.
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              window.localStorage.removeItem(DRAFT_KEY);
              setValues(emptyValues());
              setRestoredDraft(null);
            }}
          >
            Discard draft
          </button>
        </div>
      )}

      <fieldset>
        <legend>Content</legend>
        <Field
          id="file"
          label="Media file"
          help={`Images, video, audio or PDF up to ${UPLOAD_LIMITS.maxFileSizeBytes / (1024 * 1024)} MB. The file is hashed in your browser.`}
          error={inputErrors.file}
        >
          <div
            role="button"
            tabIndex={0}
            aria-label="Choose a media file, or drop one here"
            aria-invalid={Boolean(visibleFileError)}
            aria-describedby="file-desc file-drop-status"
            onClick={() => document.getElementById("file")?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                document.getElementById("file")?.click();
              }
            }}
            onDragEnter={handleDragEnter}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "copy";
              setIsDragActive(true);
              const item = event.dataTransfer.items[0];
              const mimeType = item?.type.split(";")[0].trim().toLowerCase();
              setDragInvalid(Boolean(item && item.kind === "file" && (!mimeType || !SUPPORTED_MEDIA_TYPES[mimeType])));
            }}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
              visibleFileError || dragInvalid
                ? "border-red-500 bg-red-50 text-red-800 dark:border-red-400 dark:bg-red-950/40 dark:text-red-200"
                : isDragActive
                  ? "border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-100"
                  : "border-gray-300 bg-gray-50 text-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:border-gray-600 dark:bg-gray-900/40 dark:text-gray-200 dark:hover:border-blue-400 dark:hover:bg-blue-950/30"
            }`}
          >
            <input
              type="file"
              accept={ACCEPT}
              {...inputProps("file")}
              className="sr-only"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setSelectedFile(event.target.files?.[0])}
            />
            <p id="file-drop-status" className="text-sm font-medium" aria-live="polite">
              {visibleFileError || dragInvalid
                ? visibleFileError ?? "This file type is not supported"
                : isDragActive
                  ? "Release to add this file"
                  : file
                    ? `Selected: ${file.name}`
                    : "Drop a media file here, or choose one"}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Images, video, audio, or PDF · up to {UPLOAD_LIMITS.maxFileSizeBytes / (1024 * 1024)} MB
            </p>
          </div>
        </Field>
        {file && (
          <MediaSnapshotPreview
            file={file}
            verificationState={hashState.status === "hashing" ? "hashing" : submitting ? "submitting" : "idle"}
          />
        )}
        {hashState.status === "hashing" && <p className="muted">Computing SHA-256 hash…</p>}
        {hashState.status === "done" && (
          <p className="muted">SHA-256: <code className="hash">{hashState.hash}</code></p>
        )}
        <Field id="title" label="Title (optional)" help="A short name helps you recognize this asset later." error={inputErrors.title}>
          <input type="text" value={values.title} onChange={set("title")} maxLength={UPLOAD_LIMITS.titleMaxLength} {...inputProps("title")} />
        </Field>
        <Field id="description" label="Description (optional)" help="Add useful context about what this file contains." error={inputErrors.description}>
          <textarea value={values.description} onChange={set("description")} rows={3} {...inputProps("description")} />
        </Field>
        <Field id="tags" label="Tags (optional)" help="Separate tags with commas." error={inputErrors.tags}>
          <input type="text" value={values.tags} onChange={set("tags")} {...inputProps("tags")} />
        </Field>
      </fieldset>

      <fieldset>
        <legend>Manifest</legend>
        <Field id="creator" label="Creator public key" help="Your Stellar address, starting with G." error={inputErrors.creator}>
          <input
            type="text"
            value={values.creator}
            onChange={set("creator")}
            autoComplete="off"
            spellCheck={false}
            placeholder="G…"
            {...inputProps("creator")}
          />
        </Field>
        <Field id="capturedAt" label="Created at" help="When the content was captured or made." error={inputErrors.capturedAt}>
          <input type="datetime-local" value={values.capturedAt} onChange={set("capturedAt")} {...inputProps("capturedAt")} />
        </Field>
        <Field id="device" label="Device (optional)" help="The camera, phone, or tool used to create the content." error={inputErrors.device}>
          <input type="text" value={values.device} onChange={set("device")} {...inputProps("device")} />
        </Field>
        <Field id="location" label="Location (optional)" help="Where the content was created. Leave blank if you prefer not to share it." error={inputErrors.location}>
          <input type="text" value={values.location} onChange={set("location")} {...inputProps("location")} />
        </Field>
        <Field id="aiModel" label="AI model (optional)" help="If AI generated or edited this content, enter the tool or model name." error={inputErrors.aiModel}>
          <input type="text" value={values.aiModel} onChange={set("aiModel")} {...inputProps("aiModel")} />
        </Field>
      </fieldset>

      <MetadataPreview
        payload={payload}
        validation={validation}
        errors={allErrors}
      />

      {resumable && !submitting && (
        <div className="notice" role="status">
          <p>
            An earlier upload of this file stopped at {resumable.progress}%
            {resumable.status === "expired" ? " and has expired, so it will start over." : "."}
          </p>
          {resumable.status !== "expired" && (
            <div className="row">
              <label>
                <input type="radio" name="resumeMode" checked={!restartUpload} onChange={() => setRestartUpload(false)} /> Resume where it stopped
              </label>
              <label>
                <input type="radio" name="resumeMode" checked={restartUpload} onChange={() => setRestartUpload(true)} /> Start over
              </label>
            </div>
          )}
        </div>
      )}
      {submitting && uploadSession && uploadSession.status === "in_progress" && (
        <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadSession.progress}>
          <progress max={100} value={uploadSession.progress} /> {uploadSession.progress}%
          {uploadSession.attempt > 1 && ` (attempt ${uploadSession.attempt})`}
        </div>
      )}
      <button type="submit" disabled={submitting || hashState.status === "hashing"}>
        {submitting ? "Submitting…" : hashState.status === "hashing" ? "Hashing file…" : "Submit for verification"}
        {!submitting && hashState.status !== "hashing" && <ShortcutHint keys="Ctrl + Enter" />}
      </button>
    </form>
  );
}
