import { useState } from "react";
import { Globe, Link2 } from "lucide-react";
import { usePlatform } from "../../../context/usePlatform";
import { useSettingsForm } from "../../../hooks/useSettingsForm";
import { Callout, Counter, ImageField, Panel, Row, SaveBar, Switch } from "../../../components/admin/settings/SettingsUI";
import BrandLogo from "../../../components/brand/BrandLogo";
import { splitBrandName } from "../../../utils/brand";

// ---------- General ----------
export const GeneralTab = () => {
  const f = useSettingsForm("general", { label: "General settings" });
  const example = [f.form.siteName || "Your site", f.form.tagline || "Real Estate in Ghana"].join(" | ");
  const [first, second] = splitBrandName(f.form.siteName || "");
  return (
    <Panel title="General" description="The identity of the website. The name appears in the navbar, footer, sign-in pages, browser tab and dashboards." footer={<SaveBar form={f} />}>
      <Row label="Website name" description="Shown everywhere the brand appears. Without an uploaded logo, the first letter becomes the logo mark." htmlFor="set-name">
        <input id="set-name" value={f.form.siteName} onChange={(e) => f.set("siteName", e.target.value.slice(0, 40))} required className="field" />
        <p className="mt-2 text-sm text-gray-500">
          Preview: <span className="font-extrabold text-gray-900">{first}</span>
          <span className="font-extrabold text-brand-500">{second}</span>
        </p>
      </Row>
      <Row label="Tagline" description={`A short line used in the browser title, e.g. “${example}”.`} htmlFor="set-tagline">
        <input id="set-tagline" value={f.form.tagline} onChange={(e) => f.set("tagline", e.target.value.slice(0, 80))} className="field" />
      </Row>
      <Row label="Website description" description="One or two sentences about the business. Shown in the footer and used as the default search description." htmlFor="set-desc">
        <textarea id="set-desc" rows={3} value={f.form.description} onChange={(e) => f.set("description", e.target.value.slice(0, 300))} className="field resize-y" />
        <Counter value={f.form.description} max={300} />
      </Row>
    </Panel>
  );
};

// ---------- Branding ----------
export const BrandingTab = () => {
  const f = useSettingsForm("branding", { label: "Branding" });
  const { siteName } = usePlatform();
  return (
    <Panel title="Branding" description="Logos and the browser icon. Images are stored on Cloudinary when you save." footer={<SaveBar form={f} />}>
      <Row label="Logo" description="Used on light backgrounds: navbar, sign-in page and agent workspace. A wide PNG or SVG with a transparent background works best (max 2MB).">
        <ImageField id="set-logo" value={f.form.logo} onChange={(v) => f.set("logo", v)} />
      </Row>
      <Row label="Logo for dark backgrounds" description="Used in the footer, admin console and admin sign-in. Falls back to the main logo when empty.">
        <ImageField id="set-logo-dark" value={f.form.logoDark} onChange={(v) => f.set("logoDark", v)} background="dark" />
      </Row>
      <Row label="Favicon" description="The icon in the browser tab. A square PNG, SVG or ICO, at least 64×64 (max 512KB).">
        <ImageField id="set-favicon" value={f.form.favicon} onChange={(v) => f.set("favicon", v)} maxKB={512} previewClass="h-10 w-10" accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,image/webp" />
      </Row>
      <Row label="Current look" description="How the navbar logo appears with the saved settings.">
        <div className="flex flex-wrap items-center gap-6 rounded-lg bg-white p-4 ring-1 ring-slate-200">
          <BrandLogo />
          <span className="rounded-lg bg-gray-950 p-3">
            <BrandLogo tone="dark" />
          </span>
        </div>
        {!f.form.logo && <p className="mt-2 text-xs text-gray-500">No logo uploaded: showing the “{siteName.charAt(0)}” lettermark with the website name.</p>}
      </Row>
    </Panel>
  );
};

// ---------- SEO & URLs ----------
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Mirrors the server's list of first path segments already used by other pages
const RESERVED = ["admin", "agent", "account", "api", "assets", "checkout", "contact", "house", "login", "logout", "make-offer", "offer", "payment", "register", "rent", "sale"];
const SLUG_FIELDS = [
  { key: "properties", label: "Properties page", description: "Search results and the Properties menu." },
  { key: "listings", label: "All listings page", description: "Every property for sale and rent." },
  { key: "agents", label: "Agents page", description: "The public directory of agents." },
];

const slugProblem = (slugs, key) => {
  const v = slugs[key];
  if (!SLUG.test(v) || v.length < 2) return "Use lowercase letters, numbers and single hyphens.";
  if (RESERVED.includes(v)) return "Already used by another page.";
  if (Object.entries(slugs).some(([k, other]) => k !== key && other === v)) return "Each page needs its own URL.";
  return "";
};

export const SeoTab = () => {
  const { settings } = usePlatform();
  const seo = useSettingsForm("seo", { label: "SEO settings" });
  const slugs = useSettingsForm("slugs", { label: "URL settings" });
  const [origin] = useState(() => window.location.origin);
  const { general } = settings;
  const title = seo.form.title || [general.siteName, general.tagline].filter(Boolean).join(" | ");
  const description = seo.form.metaDescription || general.description;
  const slugInvalid = SLUG_FIELDS.some(({ key }) => slugProblem(slugs.form, key));

  return (
    <div className="space-y-6">
      <Panel title="Search & sharing" description="How the site appears in search results and when links are shared." footer={<SaveBar form={seo} />}>
        <Row label="Site title" description="Browser tab and search result title. Leave empty to use “Website name | Tagline”." htmlFor="seo-title">
          <input id="seo-title" value={seo.form.title} onChange={(e) => seo.set("title", e.target.value.slice(0, 70))} placeholder={[general.siteName, general.tagline].filter(Boolean).join(" | ")} className="field" />
          <Counter value={seo.form.title} max={70} recommended={60} />
        </Row>
        <Row label="Meta description" description="The summary under the title in search results. Empty uses the website description." htmlFor="seo-desc">
          <textarea id="seo-desc" rows={3} value={seo.form.metaDescription} onChange={(e) => seo.set("metaDescription", e.target.value.slice(0, 300))} placeholder={general.description} className="field resize-y" />
          <Counter value={seo.form.metaDescription} max={300} recommended={160} />
        </Row>
        <Row label="Keywords" description="Comma-separated. Most search engines ignore these, but some site tools still read them." htmlFor="seo-keywords">
          <input id="seo-keywords" value={seo.form.keywords} onChange={(e) => seo.set("keywords", e.target.value.slice(0, 300))} placeholder="real estate, homes for rent, Accra" className="field" />
        </Row>
        <Row label="Website address" description="The public address of the site, used for canonical links, e.g. https://www.homebase.com.gh." htmlFor="seo-url">
          <input id="seo-url" type="url" value={seo.form.baseUrl} onChange={(e) => seo.set("baseUrl", e.target.value.trim())} placeholder="https://" className="field" />
        </Row>
        <Row label="Social sharing image" description="Shown when a page is shared on WhatsApp, Facebook or X. 1200×630 works best. Empty uses the logo.">
          <ImageField id="seo-og" value={seo.form.ogImage} onChange={(v) => seo.set("ogImage", v)} accept="image/png,image/jpeg,image/webp" maxKB={3072} previewClass="h-24 max-w-64" compress={{ size: 1200, quality: 0.85 }} />
        </Row>
        <Switch
          label="Allow search engines to index the site"
          description="Turn off while the site is being set up. Adds a noindex tag to every page."
          checked={seo.form.allowIndexing}
          onChange={(v) => seo.set("allowIndexing", v)}
        />
        <div className="px-5 py-5 sm:px-6">
          <p className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">Search preview</p>
          <div className="max-w-xl rounded-lg bg-white p-4 ring-1 ring-slate-200">
            <p className="truncate text-xs text-gray-500">{seo.form.baseUrl || origin}</p>
            <p className="mt-0.5 truncate text-lg text-[#1a0dab]">{title}</p>
            <p className="line-clamp-2 text-sm text-gray-600">{description}</p>
          </div>
        </div>
      </Panel>

      <Panel title="Page URLs" description="The web address of the main public pages. Old addresses redirect to the new ones, so shared links keep working." footer={<SaveBar form={slugs} disabled={slugInvalid} />}>
        {SLUG_FIELDS.map(({ key, label, description }) => {
          const problem = slugProblem(slugs.form, key);
          return (
            <Row key={key} label={label} description={description} htmlFor={`slug-${key}`}>
              <div className={`flex items-center overflow-hidden rounded-xl border bg-white focus-within:ring-4 ${problem ? "border-red-300 focus-within:ring-red-500/10" : "border-gray-200 focus-within:border-brand-500 focus-within:ring-brand-500/10"}`}>
                <span className="flex shrink-0 items-center gap-1.5 border-r border-gray-200 bg-slate-50 px-3 py-3 text-sm text-gray-500">
                  <Link2 className="h-4 w-4" />/
                </span>
                <input
                  id={`slug-${key}`}
                  value={slugs.form[key]}
                  onChange={(e) => slugs.set(key, e.target.value.toLowerCase().replace(/\s+/g, "-").slice(0, 40))}
                  className="min-w-0 flex-1 px-3 py-3 text-sm text-gray-900 outline-none"
                  aria-invalid={Boolean(problem)}
                />
              </div>
              {problem ? <p className="mt-1.5 text-sm text-red-600">{problem}</p> : <p className="mt-1.5 truncate text-xs text-gray-400">{origin}/{slugs.form[key]}</p>}
            </Row>
          );
        })}
        <div className="px-5 py-4 sm:px-6">
          <Callout icon={Globe}>Property details (/house/…), agent profiles (/agent/…), /sale, /rent and /contact keep fixed addresses.</Callout>
        </div>
      </Panel>
    </div>
  );
};
