import { useContext, useRef, useState } from "react";
import { AlertCircle, Check, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { compressImage } from "../../../utils/image";
import { SettingsSectionContext } from "./settingsSection";

// Building blocks for the admin Settings page

export const Panel = ({ title, description, children, footer }) => {
  const section = useContext(SettingsSectionContext);
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e9e4f0] bg-white shadow-[0_1px_2px_rgba(42,18,64,0.04)]">
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-7 sm:py-6">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">{title}</h2>
          {description && <p className="mt-1 text-sm leading-relaxed text-gray-500 sm:text-[15px]">{description}</p>}
        </div>
        {section && (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-100 sm:inline-flex">
            <section.icon aria-hidden="true" className="h-4 w-4" />
            {section.group}
          </span>
        )}
      </header>
      <div className="divide-y divide-slate-100">{children}</div>
      {footer}
    </section>
  );
};

// One setting: label and help text on the left, the control on the right (stacked on phones).
// The side margins keep the dividers between settings inset, inside the panel's padding.
export const Row = ({ label, description, htmlFor, required = false, children }) => {
  const title = <>{label}{required && <span aria-hidden="true" className="ml-1 text-red-500">*</span>}</>;
  return (
    <div className="mx-5 grid gap-3 py-6 sm:mx-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-10">
      <div>
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-[15px] font-semibold text-gray-900">{title}</label>
        ) : (
          <p className="text-[15px] font-semibold text-gray-900">{title}</p>
        )}
        {description && <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
};

export const Counter = ({ value = "", max, recommended }) => {
  const over = recommended && value.length > recommended;
  return (
    <p className={`mt-2 text-right text-xs tabular-nums ${over ? "text-amber-600" : "text-gray-500"}`}>
      {value.length.toLocaleString()} / {(recommended || max).toLocaleString()}
      {over ? " (longer than search engines usually show)" : ""}
    </p>
  );
};

export const Switch = ({ label, description, checked, onChange }) => (
  <div className="mx-5 flex items-start justify-between gap-4 py-5 sm:mx-7">
    <div>
      <p className="text-[15px] font-semibold text-gray-900">{label}</p>
      {description && <p className="mt-1 text-sm leading-relaxed text-gray-500">{description}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-brand-500" : "bg-gray-300"}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  </div>
);

export const Callout = ({ tone = "gray", icon: Icon = AlertCircle, children }) => {
  const tones = {
    gray: "bg-slate-50 text-slate-700 ring-slate-200",
    brand: "bg-brand-50 text-brand-900 ring-brand-100",
    amber: "bg-amber-50 text-amber-900 ring-amber-200",
    red: "bg-red-50 text-red-800 ring-red-200",
  };
  return (
    <div className={`flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm ring-1 ${tones[tone]}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
};

// Save / discard for one section, with the saving state on the left
const StatusDot = ({ className, children }) => <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${className}`}>{children}</span>;

export const SaveBar = ({ form: { dirty, status, error, save, reset }, disabled = false, label = "Save Changes", note = "All changes will be saved to your website." }) => {
  const saving = status === "saving";
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 px-5 py-4 sm:px-7 sm:py-5">
      <p className="mr-auto flex min-w-0 basis-full items-center gap-2.5 text-sm sm:basis-auto" aria-live="polite">
        {saving ? (
          <><StatusDot className="bg-brand-50 text-brand-600"><Loader2 className="h-3.5 w-3.5 animate-spin" /></StatusDot><span className="text-gray-600">Saving…</span></>
        ) : status === "error" ? (
          <><StatusDot className="bg-red-50 text-red-600"><AlertCircle className="h-3.5 w-3.5" /></StatusDot><span className="text-red-600">{error || "Failed to save"}</span></>
        ) : dirty ? (
          <><StatusDot className="bg-amber-50"><span className="h-2 w-2 rounded-full bg-amber-500" /></StatusDot><span className="text-amber-800">You have unsaved changes.</span></>
        ) : status === "saved" ? (
          <><StatusDot className="bg-emerald-500 text-white"><Check className="h-3.5 w-3.5" strokeWidth={3} /></StatusDot><span className="text-emerald-700">Saved successfully.</span></>
        ) : (
          <><StatusDot className="bg-emerald-500 text-white"><Check className="h-3.5 w-3.5" strokeWidth={3} /></StatusDot><span className="text-gray-600">{note}</span></>
        )}
      </p>
      <button type="button" onClick={reset} disabled={!dirty || saving} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm whitespace-nowrap sm:px-5 font-semibold text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-500 disabled:hover:bg-white sm:flex-none">
        Discard Changes
      </button>
      <button type="button" onClick={save} disabled={!dirty || saving || disabled} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-700 px-3 text-sm whitespace-nowrap sm:px-5 font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-75 disabled:hover:bg-brand-700 sm:flex-none">
        {saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}
        {saving ? "Saving…" : label}
      </button>
    </div>
  );
};

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("This file couldn't be read."));
    reader.readAsDataURL(file);
  });

/**
 * Picks an image for branding/SEO. The file is only previewed here; it is uploaded to
 * Cloudinary by the server when the section is saved. `compress` re-encodes large photos (JPEG).
 */
export const ImageField = ({ id, value, onChange, accept = "image/png,image/jpeg,image/webp,image/svg+xml", maxKB = 2048, background = "light", previewClass = "h-16 max-w-56", compress }) => {
  const input = useRef(null);
  const [problem, setProblem] = useState("");

  const pick = async (file) => {
    if (!file) return;
    setProblem("");
    if (!accept.split(",").includes(file.type)) return setProblem("This file type isn't supported.");
    try {
      const data = compress ? await compressImage(file, compress.size, compress.quality) : await readAsDataUrl(file);
      if ((data.length * 3) / 4 > maxKB * 1024) return setProblem(`Choose an image smaller than ${maxKB >= 1024 ? `${maxKB / 1024}MB` : `${maxKB}KB`}.`);
      onChange(data);
    } catch (err) {
      setProblem(err.message);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={`grid min-h-20 min-w-32 place-items-center rounded-lg p-3 ring-1 ${
            background === "dark" ? "bg-gray-950 ring-gray-800" : "bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] ring-slate-200"
          }`}
        >
          {value ? (
            <img src={value} alt="" className={`${previewClass} object-contain`} />
          ) : (
            <span className={`text-xs ${background === "dark" ? "text-gray-500" : "text-gray-400"}`}>Not set</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => input.current?.click()} className="btn btn-light px-4 py-2 text-sm">
            <ImagePlus className="h-4 w-4" />
            {value ? "Change" : "Upload"}
          </button>
          {value && (
            <button type="button" onClick={() => onChange("")} className="btn px-3 py-2 text-sm text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" />
              Remove
            </button>
          )}
        </div>
        <input
          ref={input}
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {problem && <p role="alert" className="mt-2 text-sm text-red-600">{problem}</p>}
    </div>
  );
};

// Editable list of short values (property types)
export const TagEditor = ({ values, onChange, format = (v) => v, placeholder = "Add a value" }) => {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim().replace(/\s+/g, "-");
    if (value.length < 2) return;
    if (!values.some((v) => v.toLowerCase() === value.toLowerCase())) onChange([...values, value]);
    setDraft("");
  };
  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {values.map((v) => (
          <li key={v} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pr-1 pl-3 text-sm font-medium text-slate-700">
            {format(v)}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              disabled={values.length === 1}
              aria-label={`Remove ${format(v)}`}
              className="grid h-6 w-6 place-items-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 40))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="field py-2"
        />
        <button type="button" onClick={add} className="btn btn-light shrink-0 px-4 py-2 text-sm">
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>
    </div>
  );
};
