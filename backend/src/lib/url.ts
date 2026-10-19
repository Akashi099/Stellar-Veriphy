/** Strips credentials and query strings so URLs are safe to log. */
export function safeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.search = "";
    return url.toString();
  } catch {
    return "<invalid url>";
  }
}
