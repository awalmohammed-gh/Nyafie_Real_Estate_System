import { HttpError } from "./response.js";

// Video and 3D tours are links to a few known providers. Only { provider, id } is stored and the
// page builds the embed address itself, so a listing can never embed an arbitrary site.
// Keep in step with frontend/src/utils/mediaLinks.js.
export const VIDEO_PROVIDERS = ["youtube", "vimeo"];
export const TOUR_PROVIDERS = ["matterport", "kuula"];

const host = (url) => url.hostname.toLowerCase().replace(/^(www|m)\./, "");

/** { provider, id, hash? } for a supported link, or null. */
export const parseMediaLink = (value) => {
  let url;
  try { url = new URL(String(value).trim()); } catch { return null; }
  if (!["https:", "http:"].includes(url.protocol)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const name = host(url);

  if (["youtube.com", "youtube-nocookie.com", "youtu.be"].includes(name)) {
    const id = name === "youtu.be" ? parts[0] : parts[0] === "watch" || !parts.length ? url.searchParams.get("v") : ["shorts", "embed", "live"].includes(parts[0]) ? parts[1] : null;
    return /^[A-Za-z0-9_-]{11}$/.test(id || "") ? { provider: "youtube", id } : null;
  }
  if (name === "vimeo.com" || name === "player.vimeo.com") {
    // vimeo.com/123, vimeo.com/123/abcdef (unlisted), vimeo.com/channels/x/123, player.vimeo.com/video/123?h=abcdef
    const index = parts.findIndex((part) => /^\d{5,12}$/.test(part));
    if (index < 0) return null;
    const hash = url.searchParams.get("h") || parts[index + 1];
    return { provider: "vimeo", id: parts[index], ...(/^[a-f0-9]{6,20}$/.test(hash || "") ? { hash } : {}) };
  }
  if (name === "my.matterport.com" && parts[0] === "show") {
    const id = url.searchParams.get("m");
    return /^[A-Za-z0-9]{8,16}$/.test(id || "") ? { provider: "matterport", id } : null;
  }
  if (name === "kuula.co" && parts[0] === "share") {
    // kuula.co/share/ABC12 or kuula.co/share/collection/ABC12
    const collection = parts[1] === "collection";
    const id = collection ? parts[2] : parts[1];
    return /^[A-Za-z0-9]{4,16}$/.test(id || "") ? { provider: "kuula", id: collection ? `collection/${id}` : id } : null;
  }
  return null;
};

/**
 * The listing's video ("video") or 3D tour ("tour") from a pasted link: null clears it, a link to
 * another site or the wrong kind is refused with a message the owner can act on.
 */
export const parseListingMedia = (value, kind) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const allowed = kind === "video" ? VIDEO_PROVIDERS : TOUR_PROVIDERS;
  const link = text.length <= 500 ? parseMediaLink(text) : null;
  if (!link || !allowed.includes(link.provider))
    throw new HttpError(400, kind === "video" ? "Paste a YouTube or Vimeo link for the video tour." : "Paste a Matterport or Kuula link for the 3D tour.");
  return link;
};
