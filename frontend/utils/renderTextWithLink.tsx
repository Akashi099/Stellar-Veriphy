/**
 * renderTextWithLink.tsx
 *
 * Renders a plain-text message, turning the first embedded URL (if any)
 * into a real clickable link. Used for wallet/connection error messages
 * that embed an install or help URL (e.g. "Freighter is not installed.
 * Install it from: https://...") so the link is actionable instead of
 * being dead text inside an error banner.
 */

const URL_PATTERN = /(https?:\/\/\S+)/;

export function renderTextWithLink(message: string, linkClassName = "underline") {
  const match = message.match(URL_PATTERN);
  if (!match || match.index === undefined) return message;

  const before = message.slice(0, match.index);
  const url = match[0];
  const after = message.slice(match.index + url.length);

  return (
    <>
      {before}
      <a href={url} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        {url}
      </a>
      {after}
    </>
  );
}
