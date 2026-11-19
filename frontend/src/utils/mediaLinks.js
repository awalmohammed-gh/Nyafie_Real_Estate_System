// Video tours (YouTube, Vimeo) and 3D tours (Matterport, Kuula). Listings store { provider, id };
// the embed address is always built here from those parts, never taken from the listing.
// Keep the parsing in step with backend/utils/mediaLinks.js (the server checks every link again).
export const VIDEO_PROVIDERS = ["youtube", "vimeo"];
export const TOUR_PROVIDERS = ["matterport", "kuula"];
export const PROVIDER_NAMES = { youtube: "YouTube", vimeo: "Vimeo", matterport: "Matterport", kuula: "Kuula" };

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
    const collection = parts[1] === "collection";
    const id = collection ? parts[2] : parts[1];
    return /^[A-Za-z0-9]{4,16}$/.test(id || "") ? { provider: "kuula", id: collection ? `collection/${id}` : id } : null;
  }
  return null;
};

// The editor's message for a pasted link ("" when it's fine or empty). kind: "video" | "tour"
export const mediaLinkProblem = (value, kind) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const link = text.length <= 500 ? parseMediaLink(text) : null;
  const allowed = kind === "video" ? VIDEO_PROVIDERS : TOUR_PROVIDERS;
  if (link && allowed.includes(link.provider)) return "";
  if (link) return kind === "video" ? "That's a 3D tour link. Paste it in the 3D tour field instead." : "That's a video link. Paste it in the video tour field instead.";
  return kind === "video" ? "Paste a YouTube or Vimeo link." : "Paste a Matterport or Kuula link.";
};

const safe = (id) => String(id).split("/").map(encodeURIComponent).join("/");

// Where the player loads from (only called after a visitor chooses to play it)
export const embedUrl = (media) => {
  if (!media?.id) return null;
  const { provider, id, hash } = media;
  if (provider === "youtube") return `https://www.youtube-nocookie.com/embed/${safe(id)}?autoplay=1&rel=0&modestbranding=1`;
  if (provider === "vimeo") return `https://player.vimeo.com/video/${safe(id)}?autoplay=1&dnt=1${hash ? `&h=${encodeURIComponent(hash)}` : ""}`;
  if (provider === "matterport") return `https://my.matterport.com/show/?m=${encodeURIComponent(id)}&play=1`;
  if (provider === "kuula") return `https://kuula.co/share/${safe(id)}?logo=1&info=1&fs=1&vr=0&thumbs=1`;
  return null;
};

// The normal page on the provider's site (to prefill the editor, and "open on YouTube")
export const shareUrl = (media) => {
  if (!media?.id) return "";
  const { provider, id, hash } = media;
  if (provider === "youtube") return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  if (provider === "vimeo") return `https://vimeo.com/${safe(id)}${hash ? `/${encodeURIComponent(hash)}` : ""}`;
  if (provider === "matterport") return `https://my.matterport.com/show/?m=${encodeURIComponent(id)}`;
  if (provider === "kuula") return `https://kuula.co/share/${safe(id)}`;
  return "";
};

// A preview image the provider serves without loading its player (YouTube only)
export const mediaThumbnail = (media) => (media?.provider === "youtube" ? `https://i.ytimg.com/vi/${encodeURIComponent(media.id)}/hqdefault.jpg` : null);
