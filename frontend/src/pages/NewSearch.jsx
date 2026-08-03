import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import api, { formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Checkbox } from "../components/ui/checkbox";
import { Search, Loader2, Plane, MapPin, Home, Flag } from "lucide-react";
import { toast } from "sonner";

export default function NewSearch() {
  const navigate = useNavigate();
  const [purposes, setPurposes] = useState([]);
  const [form, setForm] = useState({ nationality: "", residence: "", destination: "", purpose: "tourism" });
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/purposes").then(({ data }) => setPurposes(data)).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!agreed) {
      setError("Please acknowledge the disclaimer before running a lookup.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/visa/lookup", form);
      navigate(`/app/search/${data.id}`);
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
      toast.error("Could not start search");
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted2">Form VS-1 · Visa Requirements Lookup</p>
        <h1 className="font-serif text-3xl sm:text-4xl text-forest tracking-tight mt-2">New visa lookup</h1>
        <p className="text-sm text-muted2 mt-2 max-w-xl">
          We run a live search of official government and embassy sources for this exact combination.
        </p>

        <form onSubmit={submit} className="mt-8 bg-white paper-card" data-testid="lookup-form">
          <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-line border-b border-line">
            <Field icon={Flag} label="Nationality / Passport" testid="field-nationality">
              <Input required data-testid="input-nationality" value={form.nationality} onChange={set("nationality")}
                placeholder="e.g. India" className="border-0 rounded-none px-0 focus-visible:ring-0 bg-transparent text-lg" />
            </Field>
            <Field icon={Home} label="Country of residence" testid="field-residence">
              <Input required data-testid="input-residence" value={form.residence} onChange={set("residence")}
                placeholder="e.g. United Arab Emirates" className="border-0 rounded-none px-0 focus-visible:ring-0 bg-transparent text-lg" />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-line">
            <Field icon={MapPin} label="Destination country" testid="field-destination">
              <Input required data-testid="input-destination" value={form.destination} onChange={set("destination")}
                placeholder="e.g. Germany" className="border-0 rounded-none px-0 focus-visible:ring-0 bg-transparent text-lg" />
            </Field>
            <Field icon={Plane} label="Purpose of travel" testid="field-purpose">
              <Select value={form.purpose} onValueChange={(v) => setForm((f) => ({ ...f, purpose: v }))}>
                <SelectTrigger data-testid="select-purpose" className="border-0 rounded-none px-0 focus:ring-0 bg-transparent text-lg h-auto shadow-none">
                  <SelectValue placeholder="Select purpose" />
                </SelectTrigger>
                <SelectContent>
                  {purposes.map((p) => (
                    <SelectItem key={p.value} value={p.value} data-testid={`purpose-${p.value}`}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="p-6 border-t border-line bg-paper/60">
            {error && <p data-testid="lookup-error" className="text-sm text-rust mb-4 border-l-2 border-rust pl-3 bg-rust-bg py-1">{error}</p>}

            <label className="flex gap-3 items-start mb-5 border-l-4 border-rust bg-rust-bg p-4 cursor-pointer" data-testid="disclaimer-ack">
              <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} data-testid="disclaimer-checkbox"
                className="mt-0.5 rounded-none border-rust data-[state=checked]:bg-rust data-[state=checked]:text-paper" />
              <span className="text-sm text-ink/85 leading-relaxed">
                I understand VisaScout provides <b>informational guidance only — not legal advice</b>. Results come from
                official sources at the time of checking, visa rules change frequently, and approval is never guaranteed.
                I will verify with the official authority before applying.
              </span>
            </label>

            <Button type="submit" disabled={loading || !agreed} data-testid="run-lookup-btn"
              className="w-full bg-forest hover:bg-forest-dark text-paper rounded-sm h-12 gap-2 text-base disabled:opacity-50">
              {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Starting live search…</> : <><Search className="h-5 w-5" /> Run live lookup</>}
            </Button>
            {loading && (
              <p className="text-center text-xs text-muted2 mt-3 font-mono">
                Opening your result — the live source search runs in the background.
              </p>
            )}
          </div>
        </form>
      </div>
    </Layout>
  );
}

function Field({ icon: Icon, label, children, testid }) {
  return (
    <div className="p-6" data-testid={testid}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-forest" />
        <Label className="font-mono text-[10px] uppercase tracking-widest text-muted2">{label}</Label>
      </div>
      {children}
    </div>
  );
}
