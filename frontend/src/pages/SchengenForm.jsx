import React, { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import api, { formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Loader2, Save, Download, Mail, CreditCard, Check } from "lucide-react";
import { toast } from "sonner";

const NONE = "—"; // placeholder select value for "not selected"

export default function SchengenForm() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const [schema, setSchema] = useState(null);
  const [form, setForm] = useState(null);
  const [country, setCountry] = useState("");
  const [data, setData] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api.get("/forms/schengen/schema").then(({ data }) => setSchema(data)).catch(() => {});
    api.get(`/forms/${id}`).then(({ data }) => {
      setForm(data);
      setCountry(data.country || "");
      setData(data.data || {});
    }).catch((e) => {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Form not found.");
      navigate("/app/forms");
    });
  }, [id, navigate]);

  useEffect(() => {
    if (params.get("paid") === "1") {
      toast.success("Payment received — your PDF is ready below.");
      api.get(`/forms/${id}`).then(({ data }) => setForm(data)).catch(() => {});
      params.delete("paid");
      setParams(params, { replace: true });
    } else if (params.get("checkout") === "cancelled") {
      toast("Checkout cancelled — your form is saved as a draft.");
      params.delete("checkout");
      setParams(params, { replace: true });
    }
  }, [params, id, setParams]);

  const setField = useCallback((key, value) => {
    setData((d) => ({ ...d, [key]: value }));
    setDirty(true);
  }, []);

  const toggleCheck = useCallback((key, option) => {
    setData((d) => {
      const cur = Array.isArray(d[key]) ? d[key] : [];
      return { ...d, [key]: cur.includes(option) ? cur.filter((x) => x !== option) : [...cur, option] };
    });
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const { data: updated } = await api.put(`/forms/${id}`, { country: country || null, data });
      setForm(updated);
      setDirty(false);
      return true;
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not save.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [id, country, data]);

  const pay = async () => {
    if (dirty && !(await save())) return;
    setBusy("pay");
    try {
      const { data } = await api.post(`/forms/${id}/checkout`);
      window.location.href = data.url;
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not start checkout.");
      setBusy("");
    }
  };

  const download = async () => {
    setBusy("download");
    try {
      const res = await api.get(`/forms/${id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `schengen-visa-${(country || "form").toLowerCase().replace(/\s+/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not download the PDF.");
    } finally {
      setBusy("");
    }
  };

  const emailPdf = async () => {
    setBusy("email");
    try {
      await api.post(`/forms/${id}/email`);
      toast.success("Sent — check your inbox.");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not send the email.");
    } finally {
      setBusy("");
    }
  };

  const priceLabel = schema?.price_label || "£3";
  const paid = !!form?.paid;
  const billingOff = schema && !schema.billing_enabled;

  const loading = !schema || !form;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted2">
          Application for Schengen Visa · Harmonised form
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl text-forest tracking-tight mt-2">
          Schengen visa application
        </h1>
        <p className="text-sm text-muted2 mt-2 max-w-xl">
          Fill this in, then {paid ? "download or email your completed PDF" : `pay ${priceLabel} once to download or email a completed PDF`}.
          You still sign it, attach a passport photo, and lodge it at the consulate. Informational only — not legal advice.
        </p>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-forest" /></div>
        ) : (
          <>
            <div className="mt-8 bg-white paper-card p-5">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted2">
                Consulate / country you're applying to
              </Label>
              <Select value={country || NONE} onValueChange={(v) => { setCountry(v === NONE ? "" : v); setDirty(true); }}>
                <SelectTrigger data-testid="form-country" className="mt-2 rounded-sm border-line bg-white">
                  <SelectValue placeholder="Select a country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not selected</SelectItem>
                  {schema.countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {schema.sections.map((section) => (
              <div key={section.title} className="mt-6 bg-white paper-card">
                <h2 className="font-serif text-lg text-forest px-5 pt-4 pb-2">{section.title}</h2>
                <div className="divide-y divide-line">
                  {section.fields.map((f) => (
                    <FieldRow key={f.key} field={f} value={data[f.key]}
                      onChange={(v) => setField(f.key, v)} onToggle={(opt) => toggleCheck(f.key, opt)} />
                  ))}
                </div>
              </div>
            ))}

            <div className="sticky bottom-0 mt-8 -mx-5 sm:mx-0 bg-paper/95 backdrop-blur border-t border-line p-4 flex flex-wrap items-center gap-3">
              <Button onClick={save} disabled={saving || !dirty} data-testid="form-save"
                variant="outline" className="rounded-sm border-forest/40 text-forest gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {dirty ? "Save draft" : "Saved"}
              </Button>

              {paid ? (
                <>
                  <Button onClick={download} disabled={busy === "download"} data-testid="form-download"
                    className="rounded-sm bg-forest hover:bg-forest-dark text-paper gap-2">
                    {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Download PDF
                  </Button>
                  <Button onClick={emailPdf} disabled={busy === "email"} data-testid="form-email"
                    variant="outline" className="rounded-sm border-forest/40 text-forest gap-2">
                    {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    Email it to me
                  </Button>
                  <span className="inline-flex items-center gap-1 text-xs text-forest font-mono">
                    <Check className="h-3.5 w-3.5" /> Paid
                  </span>
                </>
              ) : (
                <Button onClick={pay} disabled={busy === "pay" || billingOff} data-testid="form-pay"
                  className="rounded-sm bg-forest hover:bg-forest-dark text-paper gap-2">
                  {busy === "pay" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  Pay {priceLabel} &amp; get PDF
                </Button>
              )}
              {billingOff && (
                <span className="text-xs text-rust font-mono">Payments not configured yet.</span>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function FieldRow({ field, value, onChange, onToggle }) {
  const { label, type, options } = field;
  return (
    <div className="p-5">
      <Label className="text-sm text-ink leading-snug block">{label}</Label>
      <div className="mt-2">
        {type === "text" && (
          <Input value={value || ""} onChange={(e) => onChange(e.target.value)}
            data-testid={`field-${field.key}`} className="rounded-sm border-line bg-white" />
        )}
        {type === "date" && (
          <Input type="date" value={value || ""} onChange={(e) => onChange(e.target.value)}
            data-testid={`field-${field.key}`} className="rounded-sm border-line bg-white max-w-[16rem]" />
        )}
        {type === "textarea" && (
          <Textarea value={value || ""} onChange={(e) => onChange(e.target.value)}
            data-testid={`field-${field.key}`} className="rounded-sm border-line bg-white" rows={3} />
        )}
        {(type === "select" || type === "radio") && (
          <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
            <SelectTrigger data-testid={`field-${field.key}`} className="rounded-sm border-line bg-white max-w-md">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not selected</SelectItem>
              {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {type === "checks" && (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => {
              const on = Array.isArray(value) && value.includes(o);
              return (
                <button key={o} type="button" onClick={() => onToggle(o)}
                  data-testid={`field-${field.key}-${o}`}
                  className={`text-xs px-2.5 py-1.5 rounded-sm border ${
                    on ? "bg-forest text-paper border-forest" : "bg-white text-ink border-line hover:border-forest/50"}`}>
                  {o}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
