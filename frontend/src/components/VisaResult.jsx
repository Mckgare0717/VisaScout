import React, { useState } from "react";
import { Checkbox } from "../components/ui/checkbox";
import {
  ChevronDown, ShieldAlert, ExternalLink, Clock, Banknote, FileCheck2,
  User, Wallet, Briefcase, HeartPulse, Package, XCircle, Link2, CheckCircle2,
} from "lucide-react";

const CATEGORY_META = {
  identity: { label: "Identity", icon: User },
  financial: { label: "Financial", icon: Wallet },
  purpose_specific: { label: "Purpose-specific", icon: Briefcase },
  health_biometric: { label: "Health / Biometric", icon: HeartPulse },
  other: { label: "Other", icon: Package },
};

function SourceBadge({ date }) {
  if (!date) return null;
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-forest border border-forest/30 bg-successbg px-2 py-0.5 rounded-full">
      <CheckCircle2 className="h-3 w-3" /> Checked {date}
    </span>
  );
}

function ChecklistCard({ catKey, items }) {
  const meta = CATEGORY_META[catKey];
  const [open, setOpen] = useState(catKey === "identity");
  const [checked, setChecked] = useState({});
  const doneCount = Object.values(checked).filter(Boolean).length;
  const Icon = meta.icon;

  return (
    <div className={`bg-white border ${open ? "border-forest" : "border-line"} transition-colors`} data-testid={`checklist-${catKey}`}>
      <button onClick={() => setOpen((o) => !o)} data-testid={`checklist-toggle-${catKey}`}
        className={`w-full flex items-center gap-3 px-5 py-4 text-left ${open ? "border-l-4 border-forest bg-successbg/40" : "border-l-4 border-transparent"} transition-colors`}>
        <Icon className="h-4 w-4 text-forest shrink-0" />
        <span className="font-serif text-lg text-ink flex-1">{meta.label}</span>
        <span className="font-mono text-[11px] text-muted2">
          {doneCount}/{items.length}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted2 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-line">
          {items.length === 0 ? (
            <p className="text-sm text-muted2 py-3">No specific documents listed by official sources for this category.</p>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((it, i) => {
                const id = `${catKey}-${i}`;
                return (
                  <li key={id} className="flex gap-3 py-3">
                    <Checkbox id={id} data-testid={`check-${id}`} checked={!!checked[id]}
                      onCheckedChange={(v) => setChecked((c) => ({ ...c, [id]: !!v }))}
                      className="mt-0.5 rounded-none border-forest data-[state=checked]:bg-forest data-[state=checked]:text-paper" />
                    <label htmlFor={id} className={`text-sm leading-snug cursor-pointer ${checked[id] ? "line-through text-muted2" : "text-ink"}`}>
                      <span className="font-medium">{it.item}</span>
                      {it.detail && <span className="block text-muted2 text-[13px] mt-0.5">{it.detail}</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function VisaResult({ search }) {
  const r = search.result || {};
  const risky = r.consult_professional || r.ambiguous || r.found_reliable_source === false;
  const checklist = r.checklist || {};

  return (
    <div className="space-y-8" data-testid="visa-result">
      {/* Warning banner */}
      {risky && (
        <div className="border-l-4 border-rust bg-rust-bg p-5 sm:p-6 flex gap-4" data-testid="warning-banner">
          <ShieldAlert className="h-6 w-6 text-rust shrink-0" />
          <div>
            <p className="font-serif text-lg text-rust">Please verify — consult a professional</p>
            <p className="text-sm text-ink/80 mt-1 leading-relaxed">
              {r.warning_message ||
                "The official guidance for this combination is unclear or could not be fully confirmed. Please consult the destination's official immigration authority or a licensed immigration professional before acting."}
            </p>
          </div>
        </div>
      )}

      {/* Category + summary */}
      <div className="bg-white paper-card">
        <div className="p-6 sm:p-8 border-b border-line">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted2">Determined visa category</p>
              <h2 className="font-serif text-2xl sm:text-3xl text-forest tracking-tight mt-1" data-testid="visa-category">
                {r.visa_category || "Unknown"}
              </h2>
            </div>
            <span className={`font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 border ${r.visa_required === false ? "border-forest/40 bg-successbg text-forest" : "border-line bg-paper text-ink"}`}>
              {r.visa_required === false ? "Visa-free / on arrival" : "Visa required"}
            </span>
          </div>
          {r.requirements_summary && (
            <p className="text-sm sm:text-base text-ink/80 mt-4 leading-relaxed max-w-3xl" data-testid="requirements-summary">
              {r.requirements_summary}
            </p>
          )}
        </div>

        {/* Processing + Fee */}
        <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-line">
          <DataCard icon={Clock} label="Processing time" data={r.processing_time} testid="processing-card" />
          <DataCard icon={Banknote} label="Application fee" data={r.fee} testid="fee-card" />
        </div>

        {r.application_portal_url && (
          <a href={r.application_portal_url} target="_blank" rel="noreferrer" data-testid="portal-link"
            className="flex items-center justify-between px-6 sm:px-8 py-4 border-t border-line bg-forest text-paper hover:bg-forest-dark transition-colors">
            <span className="flex items-center gap-2 text-sm font-medium"><ExternalLink className="h-4 w-4" /> Official application portal</span>
            <span className="font-mono text-[11px] truncate max-w-[45%] hidden sm:block">{r.application_portal_url}</span>
          </a>
        )}
      </div>

      {/* Checklist */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <FileCheck2 className="h-5 w-5 text-forest" />
          <h3 className="font-serif text-2xl text-forest">Document checklist</h3>
        </div>
        <div className="space-y-3" data-testid="checklist">
          {Object.keys(CATEGORY_META).map((k) => (
            <ChecklistCard key={k} catKey={k} items={checklist[k] || []} />
          ))}
        </div>
      </div>

      {/* Rejection reasons */}
      {r.rejection_reasons && r.rejection_reasons.length > 0 && (
        <div className="bg-white paper-card p-6 sm:p-8" data-testid="rejection-reasons">
          <div className="flex items-center gap-2 mb-4">
            <XCircle className="h-5 w-5 text-rust" />
            <h3 className="font-serif text-2xl text-forest">Common rejection reasons</h3>
          </div>
          <ul className="space-y-3">
            {r.rejection_reasons.map((rr, i) => (
              <li key={i} className="flex gap-3 text-sm text-ink/85">
                <span className="font-mono text-rust shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <span className="leading-relaxed">{rr}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sources transparency panel */}
      <div className="border-2 border-forest bg-forest text-paper" data-testid="sources-panel">
        <div className="px-6 sm:px-8 py-4 border-b border-paper/20 flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          <h3 className="font-serif text-xl">Sources &amp; transparency</h3>
          <span className="ml-auto font-mono text-[11px] text-paper/70">{(r.sources || []).length} source(s)</span>
        </div>
        <div className="p-6 sm:p-8">
          {(!r.sources || r.sources.length === 0) ? (
            <p className="text-sm text-paper/70">No official sources were confirmed for this lookup. Treat the result with caution and verify independently.</p>
          ) : (
            <ul className="space-y-3">
              {r.sources.map((s, i) => (
                <li key={i} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 border-b border-paper/15 pb-3 last:border-0">
                  <a href={s.url} target="_blank" rel="noreferrer" data-testid={`source-${i}`}
                    className="flex items-center gap-2 text-sm text-paper hover:underline flex-1 min-w-0">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{s.title || s.url}</span>
                  </a>
                  <span className="font-mono text-[11px] text-paper/60 shrink-0">accessed {s.access_date || "—"}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-paper/50 mt-6 leading-relaxed">
            VisaScout compiles publicly available official information. It is informational only and not legal advice.
            Requirements can change without notice — always confirm directly with the relevant authority.
          </p>
        </div>
      </div>
    </div>
  );
}

function DataCard({ icon: Icon, label, data, testid }) {
  return (
    <div className="p-6 sm:p-8" data-testid={testid}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-forest" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted2">{label}</span>
      </div>
      {data && data.value ? (
        <>
          <p className="font-serif text-2xl sm:text-3xl text-ink leading-tight">{data.value}</p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <SourceBadge date={data.date_checked} />
            {data.source_url && (
              <a href={data.source_url} target="_blank" rel="noreferrer"
                className="font-mono text-[11px] text-forest hover:underline flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> source
              </a>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted2">Not confirmed by official sources.</p>
      )}
    </div>
  );
}
