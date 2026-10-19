"use client";

import { useEffect, useMemo, useState } from "react";
import { compareHashes, type HashComparison as Comparison, type UploadRecord } from "@stellarveriphy/shared";
import { useFileHash } from "@/hooks/useFileHash";
import { ApiError, api } from "@/lib/api";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]} (${bytes.toLocaleString()} bytes)`;
}

// Renders a hash in groups of 8 with characters that differ from `other` highlighted.
function HashDiff({ hash, other }: { hash: string; other?: string }) {
  return (
    <code className="hash hash-diff">
      {hash.split("").map((char, i) => (
        <span key={i} className={other && other[i] !== char ? "diff" : undefined}>
          {char}
          {i % 8 === 7 && i < hash.length - 1 ? " " : ""}
        </span>
      ))}
    </code>
  );
}

function Verdict({ comparison }: { comparison: Comparison }) {
  if (comparison.status === "match") {
    return (
      <div className="notice notice-success" role="status">
        <p><strong>✓ Match.</strong> This file is byte-for-byte identical to the one recorded in the provenance record.</p>
      </div>
    );
  }
  if (comparison.status === "invalid") {
    return (
      <div className="notice notice-warning" role="status">
        <p>
          <strong>The {comparison.which === "stored" ? "recorded" : "local"} hash can't be compared.</strong>{" "}
          {comparison.message}
        </p>
        <p>{comparison.hint}</p>
      </div>
    );
  }
  return (
    <div className="notice notice-error" role="status">
      <p><strong>✗ No match.</strong> This file is not the same as the one that was recorded.</p>
      <p>Even a one-byte change produces a completely different hash, so this does not tell you how much changed. Common reasons:</p>
      <ul>
        <li>The file was re-saved, compressed, resized or converted (social networks and messaging apps do this automatically).</li>
        <li>Embedded metadata such as camera or location data was added or removed.</li>
        <li>It is a different version or export of the same content.</li>
        <li>The recorded hash was copied from a different certificate.</li>
      </ul>
      <p>
        <strong>What to do:</strong> ask the creator for the original file, or check that the recorded hash belongs to this content.
        Treat the file as unverified until the hashes match.
      </p>
    </div>
  );
}

export function HashComparison() {
  const [file, setFile] = useState<File | null>(null);
  const [stored, setStored] = useState("");
  const [registry, setRegistry] = useState<{ loading: boolean; records?: UploadRecord[]; error?: string }>({ loading: false });
  const hashState = useFileHash(file);
  const localHash = hashState.status === "done" ? hashState.hash : null;

  // Allow links like /verify?expected=<hash> to prefill the recorded hash.
  useEffect(() => {
    const expected = new URLSearchParams(window.location.search).get("expected");
    if (expected) setStored(expected);
  }, []);

  useEffect(() => setRegistry({ loading: false }), [localHash]);

  const comparison = useMemo(
    () => (localHash && stored.trim() ? compareHashes(localHash, stored) : null),
    [localHash, stored],
  );

  async function lookUp() {
    if (!localHash) return;
    setRegistry({ loading: true });
    try {
      setRegistry({ loading: false, records: await api.findUploadsByHash(localHash) });
    } catch (err) {
      setRegistry({ loading: false, error: err instanceof ApiError ? err.message : "Lookup failed." });
    }
  }

  return (
    <div className="form">
      <fieldset>
        <legend>1. Your file</legend>
        <div className="field">
          <label htmlFor="verify-file">File to check</label>
          <input id="verify-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <p className="muted">The file never leaves your device. Its SHA-256 fingerprint is computed in the browser.</p>
        </div>
        {hashState.status === "hashing" && <p className="muted">Computing fingerprint…</p>}
        {hashState.status === "error" && <p className="error-text">{hashState.message}</p>}
        {localHash && <p className="muted">Fingerprint: <code className="hash">{localHash}</code></p>}
      </fieldset>

      <fieldset>
        <legend>2. Recorded hash</legend>
        <div className="field">
          <label htmlFor="stored-hash">Hash from the provenance record or certificate</label>
          <input
            id="stored-hash"
            type="text"
            value={stored}
            onChange={(e) => setStored(e.target.value)}
            placeholder="64 hexadecimal characters"
            spellCheck={false}
            autoComplete="off"
          />
          <p className="muted">Formatting differences such as capital letters, spaces or a “0x” prefix are ignored.</p>
        </div>
        <p className="muted">Don't have one?</p>
        <button type="button" className="secondary" disabled={!localHash || registry.loading} onClick={() => void lookUp()}>
          {registry.loading ? "Searching…" : "Search StellarVeriphy records for this file"}
        </button>
        {registry.error && <p className="error-text">{registry.error}</p>}
        {registry.records?.length === 0 && (
          <p className="notice notice-warning">
            No provenance record exists for this exact file. If you expected one, the file may have been modified since it was registered.
          </p>
        )}
        {registry.records && registry.records.length > 0 && (
          <div className="notice notice-success">
            <p><strong>Found {registry.records.length} record{registry.records.length === 1 ? "" : "s"} for this exact file:</strong></p>
            <ul>
              {registry.records.map((r) => (
                <li key={r.id}>
                  {r.title ?? r.fileName}, registered {new Date(r.createdAt).toLocaleString()} by <code>{r.creator}</code>{" "}
                  <button type="button" className="link" onClick={() => setStored(r.contentHash)}>Compare against this record</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>

      {comparison && (
        <section>
          <h2>Result</h2>
          <Verdict comparison={comparison} />
          {comparison.status !== "invalid" && hashState.status === "done" && (
            <details>
              <summary>Technical details</summary>
              <dl className="details">
                <dt>Algorithm</dt>
                <dd>SHA-256 over the file's raw bytes (same as <code>sha256sum</code> / <code>shasum -a 256</code>)</dd>
                <dt>File</dt>
                <dd>{hashState.file.name} · {hashState.file.type || "unknown type"} · {formatBytes(hashState.file.size)}</dd>
                <dt>Your file</dt>
                <dd><HashDiff hash={comparison.local} other={comparison.stored} /></dd>
                <dt>Recorded</dt>
                <dd><HashDiff hash={comparison.stored} other={comparison.local} /></dd>
                {comparison.status === "mismatch" && (
                  <>
                    <dt>Difference</dt>
                    <dd>
                      {comparison.differingCharacters} of 64 characters differ, starting at position {comparison.firstDifferenceAt + 1}.
                      Hashes don't change gradually, so this number doesn't show how different the files are.
                    </dd>
                  </>
                )}
                <dt>Hashing time</dt>
                <dd>{Math.round(hashState.durationMs)} ms</dd>
              </dl>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
