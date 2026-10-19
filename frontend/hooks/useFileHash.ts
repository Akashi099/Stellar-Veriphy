"use client";

import { useEffect, useState } from "react";
import { hashFile } from "@stellarveriphy/shared";

export type FileHashState =
  | { status: "idle" }
  | { status: "hashing"; file: File }
  | { status: "done"; file: File; hash: string; durationMs: number }
  | { status: "error"; file: File; message: string };

// Computes the SHA-256 of a file's raw bytes whenever the selected file changes.
export function useFileHash(file: File | null): FileHashState {
  const [state, setState] = useState<FileHashState>({ status: "idle" });

  useEffect(() => {
    if (!file) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    const started = performance.now();
    setState({ status: "hashing", file });
    hashFile(file).then(
      (hash) => !cancelled && setState({ status: "done", file, hash, durationMs: performance.now() - started }),
      (err) =>
        !cancelled &&
        setState({
          status: "error",
          file,
          message: err instanceof Error && err.name === "NotReadableError"
            ? "The file could not be read. It may have been moved or is too large for this browser."
            : "The file could not be hashed. Try selecting it again.",
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [file]);

  return state;
}
