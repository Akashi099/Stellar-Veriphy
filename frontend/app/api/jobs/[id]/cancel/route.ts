import { defineRoute, ok } from "@/lib/api/handler";
import { requireActor } from "@/lib/server/auth";
import { cancelJob } from "@/lib/server/jobs";

export const POST = defineRoute<{ id: string }>("1", async (request, { params }) => {
  const actor = requireActor(request);
  return ok(await cancelJob(params.id, actor), { headers: { "cache-control": "no-store" } });
});
