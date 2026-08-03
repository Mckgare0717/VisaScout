import React, { useState, useRef, useEffect } from "react";
import { COUNTRIES } from "../lib/countries";
import { Input } from "./ui/input";
import { Check, MapPin } from "lucide-react";

export default function CountryAutocomplete({ value, onChange, placeholder, testid }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);

  const q = (value || "").trim().toLowerCase();
  const matches = q.length >= 1
    ? COUNTRIES.filter((c) => c.toLowerCase().includes(q)).slice(0, 8)
    : [];

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const select = (c) => { onChange(c); setOpen(false); };

  const onKeyDown = (e) => {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); select(matches[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div className="relative" ref={ref}>
      <Input
        data-testid={testid}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => { if ((value || "").trim()) setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className="border-0 rounded-none px-0 focus-visible:ring-0 bg-transparent text-lg h-auto shadow-none"
      />
      {open && matches.length > 0 && (
        <ul data-testid={`${testid}-dropdown`}
          className="absolute z-40 left-0 right-0 top-full mt-2 max-h-64 overflow-auto bg-white border border-forest shadow-lg animate-fade-up">
          {matches.map((c, i) => (
            <li key={c}>
              <button type="button" data-testid={`${testid}-option-${i}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => select(c)}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${i === active ? "bg-successbg text-forest" : "text-ink hover:bg-paper"}`}>
                <MapPin className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="flex-1">{c}</span>
                {value === c && <Check className="h-3.5 w-3.5 text-forest" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
