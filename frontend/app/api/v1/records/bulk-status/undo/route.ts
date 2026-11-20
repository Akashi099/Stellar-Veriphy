import { defineRoute, ok, readJsonBody, requireObject } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { requireActor } from "@/lib/server/auth";
import { undoBulkStatusUpdate } from "@/lib/server/record-status";

export const POST = defineRoute("1", async (req) => {
  const actor = requireActor(req, ["admin", "moderator"]);
  const body = requireObject(await readJsonBody(req));
  if (typeof body.token !== "string" || body.token.trim() === "") {
    throw ApiError.validation([{ field: "token", code: "required", message: "An undo token is required." }]);
  }
  return ok(undoBulkStatusUpdate(actor, body.token));
});
***
