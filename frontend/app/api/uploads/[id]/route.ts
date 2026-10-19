import type { UploadRecord } from "@stellarveriphy/shared";
import { respond, serverError } from "@/lib/server/http";
import { requestIdFrom } from "@/lib/server/observability";
import { getUpload } from "@/lib/server/uploads";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const record = await getUpload(id);
    if (!record) return respond(404, { status: "not_found", message: "No upload exists with this ID." });
    return respond<UploadRecord>(200, { status: "ok", data: record });
  } catch (err) {
    return serverError("GET /api/uploads/[id]", err, requestIdFrom(_req));
  }
}
