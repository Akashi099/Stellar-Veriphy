// Docker HEALTHCHECK probe. Calls the readiness endpoint and prints the failing
// checks so `docker inspect --format '{{json .State.Health}}'` shows why the
// container is unhealthy, not just that it is.
import http from "node:http";

const port = process.env.PORT || 3000;
const url = `http://127.0.0.1:${port}/api/health/ready?rpc=0`;

const req = http.get(url, { timeout: 5000 }, (res) => {
  let body = "";
  res.on("data", (chunk) => (body += chunk));
  res.on("end", () => {
    let report = {};
    try {
      report = JSON.parse(body);
    } catch {
      console.log(`unhealthy: HTTP ${res.statusCode}, non-JSON body`);
      process.exit(1);
    }
    const problems = (report.checks || [])
      .filter((c) => c.status !== "pass")
      .map((c) => `${c.name}=${c.status} (${c.message})`);
    console.log(
      `${report.status || "unknown"} HTTP ${res.statusCode}${problems.length ? ": " + problems.join("; ") : ""}`
    );
    process.exit(res.statusCode === 200 ? 0 : 1);
  });
});

req.on("timeout", () => {
  console.log(`unhealthy: no response from ${url} within 5s (server still booting or hung)`);
  req.destroy();
  process.exit(1);
});

req.on("error", (err) => {
  console.log(`unhealthy: ${url} ${err.code || err.message} (server not listening yet?)`);
  process.exit(1);
});
