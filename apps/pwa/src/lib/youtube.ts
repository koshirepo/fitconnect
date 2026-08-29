/**
 * Documentation: YouTube links, turned into embeds.
 *
 * - A gym pastes whatever it copied — a `watch?v=` link, a `youtu.be` short link, a Shorts URL, or an embed URL already. All four mean the same video, and asking somebody to normalise it by hand is asking them to get it wrong.
 * - Nothing is normalised on the way into the database. The stored value is what was pasted, so a format that changes later can be handled here rather than by a migration over every row.
 * - Returns null for anything unrecognised, which the player treats as "no video" rather than rendering a broken frame.
 * - Primary exports: youTubeEmbedUrl.
 */

/** The eleven-character video id, however the URL happened to carry it. */
function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") return parsed.pathname.slice(1) || null;

    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const query = parsed.searchParams.get("v");
      if (query) return query;

      // /embed/ID, /shorts/ID, /live/ID — all one segment after a keyword.
      const match = parsed.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      if (match) return match[1]!;
    }

    return null;
  } catch {
    // Not a URL at all. Nothing to show, which is not an error worth raising.
    return null;
  }
}

/**
 * A privacy-preserving embed URL, or null when the link is not a YouTube one.
 *
 * `youtube-nocookie.com` because a product page should not set an advertising
 * cookie on somebody who only came to read the ingredients.
 */
export function youTubeEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  const id = extractVideoId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}
