import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import api, { formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { FileText, Plus, Loader2, Trash2, Check } from "lucide-react";
import { toast } from "sonner";

export default function VisaForms() {
  const navigate = useNavigate();
  const [forms, setForms] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = () => api.get("/forms").then(({ data }) => setForms(data)).catch(() => setForms([]));
  useEffect(() => { load(); }, []);

  const create = async () => {
    setCreating(true);
    try {
      const { data } = await api.post("/forms", {});
      navigate(`/app/forms/${data.id}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not create the form.");
      setCreating(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/forms/${id}`);
      setForms((f) => f.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not delete.");
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted2">Form VS-2 · Visa Application Forms</p>
        <h1 className="font-serif text-3xl sm:text-4xl text-forest tracking-tight mt-2">Visa forms</h1>
        <p className="text-sm text-muted2 mt-2 max-w-xl">
          Fill the official EU harmonised Schengen visa application form online, then download or
          email a completed PDF. The blank form is free — the fee covers the guided fill and PDF.
        </p>

        <Button onClick={create} disabled={creating} data-testid="new-schengen-form"
          className="mt-6 bg-forest hover:bg-forest-dark text-paper rounded-sm gap-2 h-11">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Start a Schengen form
        </Button>

        <div className="mt-8">
          {forms === null ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-forest" /></div>
          ) : forms.length === 0 ? (
            <p className="text-sm text-muted2 font-mono">No forms yet.</p>
          ) : (
            <ul className="bg-white paper-card divide-y divide-line" data-testid="forms-list">
              {forms.map((f) => (
                <li key={f.id} className="flex items-center gap-4 p-5">
                  <FileText className="h-4 w-4 text-forest shrink-0" />
                  <button onClick={() => navigate(`/app/forms/${f.id}`)}
                    className="flex-1 text-left" data-testid={`open-form-${f.id}`}>
                    <p className="text-sm font-medium text-ink">
                      Schengen visa{f.country ? ` — ${f.country}` : ""}
                    </p>
                    <p className="text-xs text-muted2 mt-0.5">
                      Updated {f.updated_at ? new Date(f.updated_at).toLocaleDateString() : "—"}
                    </p>
                  </button>
                  <span className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest px-2 py-1 ${
                    f.paid ? "text-forest bg-successbg" : "text-muted2 bg-secondary"}`}>
                    {f.paid && <Check className="h-3 w-3" />}{f.paid ? "Paid" : "Draft"}
                  </span>
                  <button onClick={() => remove(f.id)} title="Delete"
                    data-testid={`delete-form-${f.id}`}
                    className="text-muted2 hover:text-rust p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  );
}
