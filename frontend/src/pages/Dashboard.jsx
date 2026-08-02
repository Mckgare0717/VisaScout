import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import api from "../lib/api";
import { Button } from "../components/ui/button";
import { Search, Plus, Clock, ArrowRight, Trash2, AlertTriangle, Loader2, Plane } from "lucide-react";
import { toast } from "sonner";

export default function Dashboard() {
  const navigate = useNavigate();
  const [searches, setSearches] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/visa/searches");
      setSearches(data);
    } catch {
      setSearches([]);
    }
  };
  useEffect(() => { load(); }, []);

  const remove = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api.delete(`/visa/searches/${id}`);
      setSearches((s) => s.filter((x) => x.id !== id));
      toast.success("Search deleted");
    } catch {
      toast.error("Could not delete");
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted2">Your archive</p>
            <h1 className="font-serif text-3xl sm:text-4xl text-forest tracking-tight mt-2">Saved visa searches</h1>
          </div>
          <Link to="/app/new">
            <Button data-testid="dashboard-new-btn" className="bg-forest hover:bg-forest-dark text-paper rounded-sm gap-2 h-11">
              <Plus className="h-4 w-4" /> New lookup
            </Button>
          </Link>
        </div>

        {searches === null && (
          <div className="mt-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-forest" /></div>
        )}

        {searches && searches.length === 0 && (
          <div className="mt-10 bg-white paper-card p-12 text-center">
            <span className="mx-auto h-14 w-14 grid place-items-center bg-successbg text-forest stamp-border">
              <Search className="h-6 w-6" />
            </span>
            <h3 className="font-serif text-2xl text-forest mt-5">No lookups yet</h3>
            <p className="text-sm text-muted2 mt-2 max-w-sm mx-auto">
              Run your first live visa lookup to see requirements, a document checklist and cited sources.
            </p>
            <Button onClick={() => navigate("/app/new")} data-testid="empty-new-btn"
              className="mt-6 bg-forest hover:bg-forest-dark text-paper rounded-sm gap-2">
              <Plus className="h-4 w-4" /> Start a lookup
            </Button>
          </div>
        )}

        {searches && searches.length > 0 && (
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {searches.map((s) => {
              const r = s.result || {};
              const processing = s.status === "processing";
              const errored = s.status === "error";
              const risky = !processing && (r.consult_professional || r.ambiguous || r.found_reliable_source === false);
              return (
                <Link key={s.id} to={`/app/search/${s.id}`} data-testid={`search-card-${s.id}`}
                  className="group bg-white paper-card p-5 hover:border-forest transition-colors flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-forest bg-successbg px-2 py-1 flex items-center gap-1">
                      <Plane className="h-3 w-3" /> {s.purpose_label}
                    </span>
                    <button onClick={(e) => remove(s.id, e)} data-testid={`delete-${s.id}`}
                      className="text-muted2 hover:text-rust transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <h3 className="font-serif text-xl text-ink mt-4 leading-snug">
                    {s.nationality} <span className="text-muted2">→</span> {s.destination}
                  </h3>
                  <p className="text-xs text-muted2 mt-1">
                    {processing ? "Live search in progress…" : errored ? "Search failed — tap to retry" : (r.visa_category || "—")}
                  </p>

                  {processing && (
                    <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-forest border border-forest/40 bg-successbg px-2 py-1 w-fit">
                      <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                    </span>
                  )}
                  {risky && (
                    <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-rust border border-rust/40 bg-rust-bg px-2 py-1 w-fit">
                      <AlertTriangle className="h-3 w-3" /> Consult a professional
                    </span>
                  )}

                  <div className="mt-auto pt-4 flex items-center justify-between border-t border-line mt-4">
                    <span className="font-mono text-[11px] text-muted2 flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      {processing ? "just now" : s.outdated ? <span className="text-rust">{s.days_old}d — may be outdated</span> : `${s.days_old}d ago`}
                    </span>
                    <ArrowRight className="h-4 w-4 text-forest group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
