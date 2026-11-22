import { siteName } from "../models/Setting.js";
import { hideAdmin, matchesAdminEntry } from "../utils/adminEntry.js";

const ICONS = [
  { src: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

/**
 * GET /api/apps/:entry/manifest.webmanifest -> the admin console as an installable app.
 * It names the console's private address, so it exists only at a URL that already contains it:
 * any other :entry is answered exactly like an unknown endpoint. The browser is pointed here by the
 * console itself (frontend utils/appManifest.js), never by a public page. The customer and agent apps
 * use static files (frontend/public/manifest.webmanifest and agent.webmanifest).
 */
export const adminAppManifest = (req, res) => {
  const entry = req.params.entry;
  if (!matchesAdminEntry(entry)) return hideAdmin(res);
  const base = `/${entry}`;
  const name = siteName();
  res.set({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" });
  res.type("application/manifest+json").send(JSON.stringify({
    name: `${name} Admin`,
    short_name: `${name} Admin`,
    description: `Run ${name}: listings, agents, payments and messages.`,
    // Its own id and scope: installs as a separate app from the customer and agent ones
    id: `${base}/`,
    start_url: `${base}/dashboard?source=app`,
    scope: `${base}/`,
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#3b0f52",
    lang: "en-GH",
    categories: ["business", "productivity"],
    icons: ICONS,
    shortcuts: [
      { name: "Payments", url: `${base}/payments?source=app`, icons: [ICONS[0]] },
      { name: "Properties to review", url: `${base}/properties?status=pending&source=app`, icons: [ICONS[0]] },
      { name: "Messages", url: `${base}/messages?source=app`, icons: [ICONS[0]] },
    ],
  }));
};
