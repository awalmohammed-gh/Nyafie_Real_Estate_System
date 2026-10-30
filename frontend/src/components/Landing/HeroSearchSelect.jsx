import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import "./heroSearchSelect.css";

// Portalled so the hero's image clipping never cuts off the options.
const HeroSearchSelect = ({ icon: Icon, label, title, name, value, onChange, disabled, placeholder, options }) => {
  const id = useId();
  const trigger = useRef(null);
  const panel = useRef(null);
  const input = useRef(null);
  const [position, setPosition] = useState(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const filtered = options.filter((option) => `${option.label} ${option.description || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = options.find((option) => option.value === value);
  const open = Boolean(position) && !disabled;

  const close = (restoreFocus = false) => {
    setPosition(null);
    if (restoreFocus) trigger.current?.focus();
  };
  const locate = () => {
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 320), window.innerWidth - 24);
    const below = window.innerHeight - rect.bottom - 20;
    const above = rect.top - 20;
    const upward = below < 300 && above > below;
    return {
      width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      maxHeight: Math.min(430, Math.max(180, upward ? above : below)),
      ...(upward ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
    };
  };
  const show = (last = false) => {
    setQuery("");
    setActive(last ? options.length - 1 : Math.max(0, options.findIndex((option) => option.value === value)));
    setPosition(locate());
  };
  const choose = (option) => {
    onChange(option.value);
    close(true);
  };

  useEffect(() => {
    if (!open) return;
    input.current?.focus({ preventScroll: true });
    const outside = (event) => {
      if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setPosition(null);
    };
    const reposition = (event) => {
      if (panel.current?.contains(event.target)) return;
      setPosition(locate());
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) panel.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active, query]);

  const onKeyDown = (event) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
    if (event.target !== input.current) return;
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      setActive((index) => filtered.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) % filtered.length : 0);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    }
  };

  return (
    <div className="home-search-field home-search-select">
      <input type="hidden" name={name} value={value} />
      <button ref={trigger} type="button" className="hero-select-trigger" disabled={disabled}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-panel` : undefined}
        aria-label={`${label} ${disabled ? "Loading options" : selected?.label || placeholder}`}
        onClick={() => open ? close() : show()} onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); show(event.key === "ArrowUp"); }
        }}>
        <span className="hero-select-icon"><Icon size={20} aria-hidden="true" /></span>
        <span className="hero-select-copy"><span className="home-field-label">{label}</span><span className="hero-select-value">{disabled ? "Loading options…" : selected?.label || placeholder}</span></span>
        <ChevronDown size={16} aria-hidden="true" className="hero-select-chevron" />
      </button>
      {open && createPortal(
        <div ref={panel} id={`${id}-panel`} role="dialog" aria-label={title} className="hero-select-panel" style={position} onKeyDown={onKeyDown}>
          <div className="hero-select-heading"><div><span className="hero-select-eyebrow">FIND YOUR NEXT HOME</span><h2>{title}</h2></div><button type="button" aria-label="Close options" onClick={() => close(true)}><X size={18} aria-hidden="true" /></button></div>
          <div className="hero-select-search"><Search size={17} aria-hidden="true" /><input ref={input} role="combobox" aria-label={`Search ${name === "area" ? "locations" : "property types"}`} aria-expanded="true" aria-autocomplete="list" aria-controls={`${id}-list`} aria-activedescendant={filtered[active] ? `${id}-option-${active}` : undefined} autoComplete="off" placeholder={name === "area" ? "Search a neighbourhood…" : "Search property types…"} value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} /></div>
          <ul id={`${id}-list`} role="listbox" aria-label={title} className="hero-select-options">
            {filtered.map((option, index) => (
              <li key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={value === option.value} data-active={active === index} className={`hero-select-option ${value === option.value ? "is-selected" : ""}`} onPointerMove={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
                <span className="hero-option-icon"><Icon size={17} aria-hidden="true" /></span>
                <span className="hero-option-copy"><span>{option.label}</span>{option.description && <small>{option.description}</small>}</span>
                {Number.isFinite(option.count) && <span className="hero-option-count">{option.count} {option.count === 1 ? "home" : "homes"}</span>}
                <span className="hero-option-check">{value === option.value && <Check size={16} aria-hidden="true" />}</span>
              </li>
            ))}
          </ul>
          {!filtered.length && <p role="status" className="hero-select-empty">No matches for “{query}”. Try another search.</p>}
          <p className="hero-select-footer">{filtered.length} {filtered.length === 1 ? "option" : "options"}<span>{name === "area" ? "Find a place that feels like home" : "A space for the way you live"}</span></p>
        </div>, document.body,
      )}
    </div>
  );
};

export default HeroSearchSelect;
