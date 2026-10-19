import http from "k6/http";
import crypto from "k6/crypto";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// Upload-heavy load test (docs/testing/upload-load-baseline.md).
//
// Each iteration is one user uploading one file through the resumable upload
// flow: start session -> report chunks in batches -> (sometimes) drop and
// resume -> register metadata -> complete session -> duplicate lookup.
//
// Profiles (-e PROFILE=...):
//   smoke     2 VUs for 30s; checks the flow works (CI on every PR)
//   baseline  ramps to 50 concurrent uploaders; the numbers we track (staging)
//   stress    raises the arrival rate until thresholds break; finds the ceiling
//
// Other knobs:
//   BASE_URL           target (default http://localhost:3000)
//   CHUNK_TRANSFER_MS  simulated time to transfer one chunk (default 50)
//   DROP_RATE          share of uploads that disconnect and resume (default 0.1)

const PROFILE = __ENV.PROFILE || "baseline";
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const CHUNK_TRANSFER_MS = Number(__ENV.CHUNK_TRANSFER_MS || 50);
const DROP_RATE = Number(__ENV.DROP_RATE || 0.1);
const CHUNK_SIZE = 5 * 1024 * 1024;
const PROGRESS_BATCH = 4; // same batch size as frontend/lib/resumable-upload.ts
const CREATOR = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

// Rough mix of what creators upload, by share of uploads.
const FILE_MIX = [
  { weight: 0.5, mimeType: "image/jpeg", ext: "jpg", minMb: 1, maxMb: 12 },
  { weight: 0.2, mimeType: "application/pdf", ext: "pdf", minMb: 1, maxMb: 25 },
  { weight: 0.2, mimeType: "video/mp4", ext: "mp4", minMb: 40, maxMb: 250 },
  { weight: 0.1, mimeType: "audio/mpeg", ext: "mp3", minMb: 3, maxMb: 20 },
];

const SCENARIOS = {
  smoke: {
    upload_smoke: { executor: "constant-vus", vus: 2, duration: "30s" },
  },
  baseline: {
    upload_baseline: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 25 },
        { duration: "3m", target: 50 },
        { duration: "1m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  stress: {
    upload_stress: {
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 400,
      stages: [
        { duration: "2m", target: 5 },
        { duration: "2m", target: 10 },
        { duration: "2m", target: 20 },
        { duration: "2m", target: 40 },
      ],
    },
  },
};

export const options = {
  scenarios: SCENARIOS[PROFILE],
  // Recommended thresholds; see the baseline doc for how they were chosen.
  thresholds: {
    "http_req_duration{name:session_start}": ["p(95)<500"],
    "http_req_duration{name:session_progress}": ["p(95)<300", "p(99)<800"],
    "http_req_duration{name:session_resume}": ["p(95)<500"],
    "http_req_duration{name:upload_register}": ["p(95)<800"],
    "http_req_duration{name:session_complete}": ["p(95)<500"],
    "http_req_duration{name:upload_lookup}": ["p(95)<400"],
    http_req_failed: ["rate<0.01"],
    upload_flow_success: ["rate>0.98"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const flowSuccess = new Rate("upload_flow_success");
const flowDuration = new Trend("upload_flow_duration", true);
const uploadsCompleted = new Counter("uploads_completed");
const uploadsResumed = new Counter("uploads_resumed");
const chunksReported = new Counter("chunks_reported");
const bytesSimulated = new Counter("bytes_simulated");

const JSON_HEADERS = { "Content-Type": "application/json" };

function pickFile() {
  let roll = Math.random();
  const kind = FILE_MIX.find((f) => (roll -= f.weight) <= 0) || FILE_MIX[0];
  const sizeMb = kind.minMb + Math.random() * (kind.maxMb - kind.minMb);
  const id = `${__VU}-${__ITER}-${Date.now()}-${Math.random()}`;
  return {
    fileName: `load-${__VU}-${__ITER}.${kind.ext}`,
    mimeType: kind.mimeType,
    fileSize: Math.max(1, Math.floor(sizeMb * 1024 * 1024)),
    contentHash: crypto.sha256(id, "hex"),
  };
}

function send(method, path, body, name) {
  return http.request(method, `${BASE_URL}${path}`, body ? JSON.stringify(body) : null, {
    headers: JSON_HEADERS,
    tags: { name },
  });
}

function reportChunks(sessionId, from, to) {
  for (let start = from; start < to; start += PROGRESS_BATCH) {
    const chunks = [];
    for (let i = start; i < Math.min(start + PROGRESS_BATCH, to); i++) chunks.push(i);
    sleep((CHUNK_TRANSFER_MS * chunks.length) / 1000);
    const res = send(
      "PATCH",
      `/api/uploads/sessions/${sessionId}`,
      { action: "progress", chunks },
      "session_progress"
    );
    if (!check(res, { "progress 200": (r) => r.status === 200 })) return false;
    chunksReported.add(chunks.length);
  }
  return true;
}

export default function () {
  const file = pickFile();
  const totalChunks = Math.ceil(file.fileSize / CHUNK_SIZE);
  const started = Date.now();
  let ok = false;

  group("upload flow", () => {
    const start = send(
      "POST",
      "/api/uploads/sessions",
      { ...file, creator: CREATOR, chunkSize: CHUNK_SIZE },
      "session_start"
    );
    if (!check(start, { "session created": (r) => r.status === 201 })) return;
    const sessionId = start.json("data.id");

    // Simulate a dropped connection part-way through, then resume by sending
    // the start request again (the client lost its session ID).
    let resumeFrom = 0;
    if (totalChunks > 1 && Math.random() < DROP_RATE) {
      const dropAt = Math.floor(totalChunks / 2);
      if (!reportChunks(sessionId, 0, dropAt)) return;
      const resume = send(
        "POST",
        "/api/uploads/sessions",
        { ...file, creator: CREATOR, chunkSize: CHUNK_SIZE },
        "session_resume"
      );
      if (
        !check(resume, {
          "session resumed": (r) => r.status === 200 && r.json("data.nextChunk") === dropAt,
        })
      )
        return;
      uploadsResumed.add(1);
      resumeFrom = dropAt;
    }
    if (!reportChunks(sessionId, resumeFrom, totalChunks)) return;

    const register = send(
      "POST",
      "/api/uploads",
      {
        ...file,
        creator: CREATOR,
        title: `Load test ${file.fileName}`,
        tags: ["load-test"],
        manifest: {
          contentHash: file.contentHash,
          creator: CREATOR,
          timestamp: new Date().toISOString(),
          metadata: { device: "k6" },
        },
      },
      "upload_register"
    );
    if (!check(register, { "upload registered": (r) => r.status === 201 })) return;

    const complete = send(
      "PATCH",
      `/api/uploads/sessions/${sessionId}`,
      { action: "complete", uploadId: register.json("data.id") },
      "session_complete"
    );
    if (
      !check(complete, {
        "session completed": (r) => r.status === 200 && r.json("data.status") === "completed",
      })
    )
      return;

    const lookup = http.get(`${BASE_URL}/api/uploads?contentHash=${file.contentHash}`, {
      tags: { name: "upload_lookup" },
    });
    if (
      !check(lookup, {
        "lookup finds upload": (r) => r.status === 200 && r.json("data.length") >= 1,
      })
    )
      return;

    ok = true;
  });

  flowSuccess.add(ok);
  if (ok) {
    uploadsCompleted.add(1);
    bytesSimulated.add(file.fileSize);
    flowDuration.add(Date.now() - started);
  }
  sleep(1);
}
