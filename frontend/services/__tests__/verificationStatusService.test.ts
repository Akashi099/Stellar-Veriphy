import { verificationStatusService, type VerificationStatus } from "../verificationStatusService";
import { verificationAction } from "@/lib/verificationErrors";

jest.useFakeTimers();
const originalFetch = globalThis.fetch;
function response(data: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
afterEach(() => { verificationStatusService.unwatchAll(); jest.clearAllTimers(); globalThis.fetch = originalFetch; });

test("uses backend cancellation as terminal state and stops polling", async () => {
  const updates: VerificationStatus[] = []; const onTerminal = jest.fn();
  globalThis.fetch = jest.fn().mockResolvedValue(response({ status: "cancelled", updatedAt: "2026-01-01T00:00:00Z" }));
  verificationStatusService.watch("job", { onUpdate: (status) => updates.push(status), onTerminal }); await flush();
  expect(updates[0]?.phase).toBe("cancelled"); expect(updates[0]?.terminal).toBe(true);
  expect(onTerminal).toHaveBeenCalledTimes(1); expect(verificationStatusService.isWatching("job")).toBe(false);
  jest.advanceTimersByTime(60_000); await flush(); expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});
test("pending backend state never synthesizes a successful certificate", async () => {
  const updates: VerificationStatus[] = [];
  globalThis.fetch = jest.fn().mockResolvedValue(response({ status: "pending" }));
  verificationStatusService.watch("job", { onUpdate: (status) => updates.push(status) }); await flush();
  for (let i = 0; i < 3; i++) { jest.advanceTimersByTime(3_000); await flush(); }
  expect(updates.every((status) => status.phase === "pending")).toBe(true);
  expect(verificationStatusService.isWatching("job")).toBe(true);
});
test("rejected cancellation preserves active polling", async () => {
  globalThis.fetch = jest.fn().mockResolvedValueOnce(response({ status: "processing" })).mockResolvedValueOnce(response({}, 403));
  verificationStatusService.watch("job", { onUpdate: jest.fn() }); await flush();
  await expect(verificationStatusService.cancel("job")).rejects.toThrow("not authorized");
  expect(verificationStatusService.isWatching("job")).toBe(true);
});
test("confirmed cancellation ignores an older in-flight status response", async () => {
  let resolve!: (response: Response) => void; const onUpdate = jest.fn(); const onTerminal = jest.fn();
  globalThis.fetch = jest.fn(() => new Promise<Response>((done) => { resolve = done; }));
  verificationStatusService.watch("job", { onUpdate, onTerminal });
  await verificationStatusService.cancel("job", async () => ({ status: "cancelled" }));
  resolve(response({ status: "processing" })); await flush();
  expect(onUpdate).toHaveBeenCalledTimes(1); expect(onUpdate.mock.calls[0]?.[0].phase).toBe("cancelled");
  expect(onTerminal).toHaveBeenCalledTimes(1);
});
test("unsubscribe fences late reads and clears polling", async () => {
  let resolve!: (response: Response) => void; const onUpdate = jest.fn();
  globalThis.fetch = jest.fn(() => new Promise<Response>((done) => { resolve = done; }));
  const stop = verificationStatusService.watch("job", { onUpdate }); stop();
  resolve(response({ status: "certified" })); await flush();
  expect(onUpdate).not.toHaveBeenCalled(); expect(verificationStatusService.isWatching("job")).toBe(false);
});
test("failure actions use a safe versioned code mapping", async () => {
  const onUpdate = jest.fn();
  globalThis.fetch = jest.fn().mockResolvedValue(response({ status: "failed", error: "private provider text", failure: { version: 1, code: "PROVIDER_TIMEOUT", retryable: true } }));
  verificationStatusService.watch("job", { onUpdate }); await flush();
  expect(onUpdate.mock.calls[0]?.[0].message).toBe("Try again later.");
  expect(verificationAction({ version: 2, code: "PROVIDER_TIMEOUT", retryable: true })).toContain("Contact support");
  expect(verificationAction({ version: 1, code: "toString", retryable: false })).toContain("Contact support");
});
