import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    oracle_workload: {
      executor: "constant-vus",
      vus: 100,
      duration: "90s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<1200", "p(99)<2000"],
    http_req_failed: ["rate<0.1"],
    checks: ["rate>0.9"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export default function () {
  const workflow = Math.floor(Math.random() * 3);

  const payloads = [
    {
      endpoint: "/api/verification",
      body: {
        address: `G${__VU}CONTRACT${Math.random().toString(36).slice(2, 12)}`,
        contentHash: "content-" + __VU,
        manifestHash: "manifest-" + __VU,
        storageRef: "ipfs://demo/" + __VU,
        confidence: 0.91,
      },
    },
    {
      endpoint: "/api/health",
      body: null,
    },
    {
      endpoint: "/api/verification",
      body: {
        address: `G${__VU}CHECK${Math.random().toString(36).slice(2, 12)}`,
        contentHash: "checksum-" + __VU,
        manifestHash: "manifest-check-" + __VU,
        storageRef: "arweave://demo/" + __VU,
        confidence: 0.88,
      },
    },
  ];

  const target = payloads[workflow];
  let response;

  if (target.body === null) {
    response = http.get(`${BASE_URL}${target.endpoint}`);
  } else {
    response = http.post(`${BASE_URL}${target.endpoint}`, JSON.stringify(target.body), {
      headers: { "Content-Type": "application/json" },
    });
  }

  check(response, {
    "response is within expected status range": (r) => r.status >= 200 && r.status < 500,
  });

  sleep(0.5 + Math.random() * 0.7);
}
