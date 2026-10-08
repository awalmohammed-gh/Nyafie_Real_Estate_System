import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, ImageOff, Plus, Trash2 } from "lucide-react";
import { useSettingsForm } from "../../../hooks/useSettingsForm";
import { Callout, Counter, ImageField, Panel, SaveBar } from "../../../components/admin/settings/SettingsUI";
import { heroImageSources, splitAccent } from "../../../utils/hero";

const MAX_SLIDES = 8;
const POSITIONS = [
  { value: "center", label: "Centre" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];
// Pages the buttons usually point to (any page of the site or a full https:// address works)
const COMMON_LINKS = ["/listings", "/properties", "/sale", "/rent", "/agents", "/contact", "/properties?type=Apartment", "/properties?type=Villa"];

const newSlide = () => ({
  id: `slide-${Date.now().toString(36)}`,
  active: false,
  image: "",
  position: "center",
  label: "",
  title: "",
  description: "",
  primaryText: "",
  primaryLink: "",
  secondaryText: "",
  secondaryLink: "",
});

// Mirrors the server's checks so problems show next to the slide before saving
const slideProblems = (s) => {
  const problems = [];
  if (!s.title.trim()) problems.push("Add a title.");
  if (s.active && !s.image) problems.push("Add a background image, or hide the slide.");
  if (Boolean(s.primaryText.trim()) !== Boolean(s.primaryLink.trim())) problems.push("Give the main button both its text and a link.");
  if (Boolean(s.secondaryText.trim()) !== Boolean(s.secondaryLink.trim())) problems.push("Give the second button both its text and a link.");
  return problems;
};

const Field = ({ label, htmlFor, hint, children }) => (
  <div>
    <label htmlFor={htmlFor} className="text-sm font-semibold text-gray-900">{label}</label>
    {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    <div className="mt-2">{children}</div>
  </div>
);

// A small rendering of the slide as visitors see it: photo, overlay, text and buttons
const SlidePreview = ({ slide }) => (
  <div className="relative isolate aspect-[16/9] overflow-hidden rounded-lg bg-[#1d1524] text-white ring-1 ring-slate-200">
    {slide.image ? (
      <img src={heroImageSources(slide.image).src} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" style={{ objectPosition: slide.position }} />
    ) : (
      <span className="absolute inset-0 -z-10 grid place-items-center text-xs text-white/50"><ImageOff className="h-6 w-6" /></span>
    )}
    <span className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(29_21_36/.84),rgb(29_21_36/.6)_40%,rgb(29_21_36/.1))]" />
    <div className="flex h-full max-w-[70%] flex-col justify-center p-4 sm:p-6">
      {slide.label && <p className="text-[9px] font-bold tracking-[.16em] text-[#e7dcef] uppercase">{slide.label}</p>}
      <p className="mt-1.5 text-lg leading-tight font-semibold tracking-tight text-balance sm:text-2xl">
        {splitAccent(slide.title || "Slide title").map((part, i) => (part.accent ? <span key={i} className="font-serif font-normal text-[#e3cdf0] italic">{part.text}</span> : part.text))}
      </p>
      {slide.description && <p className="mt-2 line-clamp-2 text-[11px] text-white/85 sm:text-xs">{slide.description}</p>}
      {(slide.primaryText || slide.secondaryText) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {slide.primaryText && <span className="rounded-[3px] bg-[#613080] px-2.5 py-1.5 text-[10px] font-semibold">{slide.primaryText}</span>}
          {slide.secondaryText && <span className="rounded-[3px] px-2.5 py-1.5 text-[10px] font-semibold ring-1 ring-white/50">{slide.secondaryText}</span>}
        </div>
      )}
    </div>
  </div>
);

const SlideEditor = ({ slide, n, update }) => {
  const id = (key) => `hero-${slide.id}-${key}`;
  const input = (key, max) => ({ id: id(key), value: slide[key], onChange: (e) => update({ [key]: e.target.value.slice(0, max) }), className: "field" });
  return (
    <div className="grid gap-6 border-t border-slate-100 px-4 py-5 sm:px-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-5">
        <Field label="Background image" hint="A wide landscape photo, at least 1920px across (JPG, PNG or WebP, max 5MB). Text sits on the left, so keep the subject centre or right.">
          <ImageField id={id("image")} value={slide.image} onChange={(image) => update({ image, active: image ? slide.active : false })} accept="image/png,image/jpeg,image/webp" maxKB={5120} previewClass="h-16 max-w-40" compress={{ size: 2560, quality: 0.84 }} />
        </Field>
        <Field label="Focus point" htmlFor={id("position")} hint="Which part of the photo stays in view when the screen crops it (phones show a narrow slice).">
          <select id={id("position")} value={slide.position} onChange={(e) => update({ position: e.target.value })} className="field">
            {POSITIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">Preview</p>
          <SlidePreview slide={slide} />
        </div>
      </div>

      <div className="space-y-5">
        <Field label="Label" htmlFor={id("label")} hint="A few words above the title, e.g. “Short stays”. Optional.">
          <input {...input("label", 40)} placeholder="Modern living" />
        </Field>
        <Field label="Title" htmlFor={id("title")} hint="Wrap a word or phrase in *asterisks* to set it in the italic serif accent.">
          <input {...input("title", 90)} placeholder="Heritage homes with a *story* to tell." required />
          <Counter value={slide.title} max={90} />
        </Field>
        <Field label="Description" htmlFor={id("description")}>
          <textarea {...input("description", 220)} rows={3} className="field resize-y" placeholder={`What makes the homes in slide ${n} worth a look?`} />
          <Counter value={slide.description} max={220} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Main button text" htmlFor={id("primaryText")}>
            <input {...input("primaryText", 30)} placeholder="View homes for sale" />
          </Field>
          <Field label="Main button link" htmlFor={id("primaryLink")}>
            <input {...input("primaryLink", 200)} list="hero-links" placeholder="/sale" />
          </Field>
          <Field label="Second button text" htmlFor={id("secondaryText")}>
            <input {...input("secondaryText", 30)} placeholder="Optional" />
          </Field>
          <Field label="Second button link" htmlFor={id("secondaryLink")}>
            <input {...input("secondaryLink", 200)} list="hero-links" placeholder="/contact" />
          </Field>
        </div>
        <p className="text-xs text-gray-500">Links start with “/” for a page on this site (e.g. /properties?type=Villa), or use a full https:// address.</p>
      </div>
    </div>
  );
};

export const HeroTab = () => {
  const f = useSettingsForm("hero", { label: "Homepage hero" });
  const slides = f.form.slides;
  const [open, setOpen] = useState(() => new Set());
  const problems = slides.map(slideProblems);
  const invalid = problems.some((p) => p.length);
  const shown = slides.filter((s) => s.active && s.image).length;

  const setSlides = (next) => f.set("slides", next);
  const update = (i, patch) => setSlides(slides.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i, step) => {
    const next = [...slides];
    [next[i], next[i + step]] = [next[i + step], next[i]];
    setSlides(next);
  };
  const remove = (i) => {
    if (!window.confirm(`Delete slide ${i + 1}${slides[i].title ? ` (“${slides[i].title.replace(/\*/g, "")}”)` : ""}? This takes effect when you save.`)) return;
    setSlides(slides.filter((_, j) => j !== i));
  };
  const add = () => {
    const slide = newSlide();
    setSlides([...slides, slide]);
    setOpen((prev) => new Set(prev).add(slide.id));
  };
  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Panel
      title="Homepage Hero"
      description="The full-width photos at the top of the homepage. Each slide has its own image, text and buttons, and slides play in the order below."
      footer={<SaveBar form={f} disabled={invalid} />}
    >
      <div className="space-y-3 px-5 py-5 sm:px-6">
        <Callout icon={shown > 1 ? Eye : EyeOff} tone={shown ? "gray" : "amber"}>
          {shown === 0
            ? "No slide is shown, so the homepage uses a plain hero with the default welcome text."
            : shown === 1
              ? "One slide is shown, so the hero stays still (no arrows or autoplay)."
              : `${shown} slides are shown. They change every 7 seconds and pause while a visitor hovers or uses the search.`}
        </Callout>

        <datalist id="hero-links">{COMMON_LINKS.map((link) => <option key={link} value={link} />)}</datalist>

        <ol className="space-y-3">
          {slides.map((slide, i) => {
            const isOpen = open.has(slide.id);
            const issues = problems[i];
            return (
              <li key={slide.id} className={`overflow-hidden rounded-lg bg-white ring-1 ${issues.length ? "ring-red-200" : "ring-slate-200"}`}>
                <div className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap sm:gap-4 sm:p-4">
                  <button type="button" onClick={() => toggle(slide.id)} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-4">
                    <span className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200">
                      {slide.image ? <img src={heroImageSources(slide.image).src} alt="" className="h-full w-full object-cover" style={{ objectPosition: slide.position }} /> : <ImageOff className="absolute inset-0 m-auto h-5 w-5 text-slate-400" />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-xs font-semibold text-gray-400">
                        Slide {i + 1}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${slide.active && slide.image ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{slide.active && slide.image ? "Shown" : "Hidden"}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm font-semibold text-gray-900">{slide.title.replace(/\*/g, "") || "Untitled slide"}</span>
                      {issues.length > 0 && <span className="block truncate text-xs text-red-600">{issues[0]}</span>}
                    </span>
                    <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={slide.active}
                      aria-label={`Show slide ${i + 1} on the homepage`}
                      title={slide.image ? "Show on the homepage" : "Add an image first"}
                      disabled={!slide.image}
                      onClick={() => update(i, { active: !slide.active })}
                      className={`relative mr-2 h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${slide.active ? "bg-brand-500" : "bg-gray-300"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${slide.active ? "translate-x-5" : ""}`} />
                    </button>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move slide ${i + 1} up`} className="grid h-9 w-9 place-items-center rounded-md text-gray-500 hover:bg-slate-100 hover:text-gray-900 disabled:opacity-30">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === slides.length - 1} aria-label={`Move slide ${i + 1} down`} className="grid h-9 w-9 place-items-center rounded-md text-gray-500 hover:bg-slate-100 hover:text-gray-900 disabled:opacity-30">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => remove(i)} aria-label={`Delete slide ${i + 1}`} className="grid h-9 w-9 place-items-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {isOpen && <SlideEditor slide={slide} n={i + 1} update={(patch) => update(i, patch)} />}
              </li>
            );
          })}
        </ol>

        {slides.length < MAX_SLIDES ? (
          <button type="button" onClick={add} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-4 text-sm font-semibold text-gray-600 transition hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-700">
            <Plus className="h-4 w-4" />
            Add a slide
          </button>
        ) : (
          <p className="text-center text-sm text-gray-500">You can have up to {MAX_SLIDES} slides.</p>
        )}
      </div>
    </Panel>
  );
};
