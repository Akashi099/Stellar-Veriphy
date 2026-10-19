import type { VerificationJobView } from "@stellarveriphy/shared";
import { respond, serverError } from "@/lib/server/http";
import { requestIdFrom } from "@/lib/server/observability";
import { getJobViews } from "@/lib/server/jobs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [job] = await getJobViews([id]);
    if (!job) return respond(404, { status: "not_found", message: "No verification job exists with this ID." });
    return respond<VerificationJobView>(200, { status: "ok", data: job });
  } catch (err) {
    return serverError("GET /api/jobs/[id]", err, requestIdFrom(_req));
  }
}
