import { verificationProxy } from "@/lib/server/verificationProxy";
export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  return verificationProxy(request, (await params).jobId, true);
}
