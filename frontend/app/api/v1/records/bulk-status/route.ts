import { defineRoute, ok, readJsonBody, requireObject } from "@/lib/api/handler";
import { requireActor } from "@/lib/server/auth";
import { BULK_STATUS_ROLES, applyBulkStatusUpdate, parseBulkStatusRequest } from "@/lib/server/record-status";

export const POST = defineRoute("1", async (req) => {
  const actor = requireActor(req, BULK_STATUS_ROLES);
  const request = parseBulkStatusRequest(requireObject(await readJsonBody(req)));
  return ok(applyBulkStatusUpdate(actor, request));
});
