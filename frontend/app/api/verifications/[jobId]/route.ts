import { verificationProxy } from "@/lib/server/verificationProxy";
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  return verificationProxy(request, (await params).jobId);
}
