import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    steady_load: {
      executor: "ramping-vus",
      startVUs: 10,
      stages: [
        { duration: "20s", target: 100 },
        { duration: "60s", target: 100 },
        { duration: "20s", target: 20 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<800", "p(99)<1500"],
    http_req_failed: ["rate<0.05"],
    checks: ["rate>0.95"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export default function () {
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    "health status is 200": (r) => r.status === 200,
    "health body includes ok": (r) => JSON.parse(r.body || "{}").status === "ok",
  });

  const verificationRes = http.post(
    `${BASE_URL}/api/verification`,
    JSON.stringify({
      address: `G${__VU}LOAD${Math.random().toString(36).slice(2, 10)}`,
      contentHash: "QmTestHash" + __VU,
      manifestHash: "abc123" + __VU,
      storageRef: "ipfs://example/" + __VU,
      confidence: 0.95,
    }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );

  check(verificationRes, {
    "verification accepted or validation rejected gracefully": (r) =>
      r.status === 202 || r.status === 400,
  });

  sleep(1);
}
