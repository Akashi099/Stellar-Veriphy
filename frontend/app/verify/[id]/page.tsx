import { redirect } from "next/navigation";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function VerifyIdRedirect({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sParams = await searchParams;

  const search = new URLSearchParams();
  for (const [key, val] of Object.entries(sParams)) {
    if (typeof val === "string") {
      search.set(key, val);
    } else if (Array.isArray(val) && val[0]) {
      search.set(key, val[0]);
    }
  }

  const query = search.toString();
  redirect(`/v/${encodeURIComponent(id)}${query ? `?${query}` : ""}`);
}
