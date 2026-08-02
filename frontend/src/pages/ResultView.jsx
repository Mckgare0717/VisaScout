import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import VisaResult from "../components/VisaResult";
import api, { formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { ArrowLeft, RefreshCw, FileDown, Mail, Loader2, Clock, AlertTriangle, Search, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function ResultView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const pollRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/visa/searches/${id}`);
      setSearch(data);
      return data;
    } catch {
      setNotFound(true);
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const d = await load();
      if (cancelled) return;
      if (d && d.status === "processing") {
        pollRef.current = setTimeout(tick, 3000);
      }
    };
    tick();
    return () => { cancelled = true; if (pollRef.current) clearTimeout(pollRef.current); };
    // eslint-disable-next-line
  }, [id]);

  const rerun = async () => {
    setRerunning(true);
    try {
      const { data } = await api.post(`/visa/searches/${id}/rerun`);
      setSearch(data);
      toast.info("Re-checking against live sources…");
      const tick = async () => {
        const d = await load();
        if (d && d.status === "processing") pollRef.current = setTimeout(tick, 3000);
        else { setRerunning(false); if (d?.status === "done") toast.success("Updated with latest sources"); }
      };
      pollRef.current = setTimeout(tick, 3000);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Re-run failed");
      setRerunning(false);
    }
  };

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await api.get(`/visa/searches/${id}/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `visascout-${search.destination}-checklist.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Checklist PDF downloaded");
    } catch {
      toast.error("Could not generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const notify = async () => {
    setNotifying(true);
    try {
      await api.post(`/visa/searches/${id}/notify`);
      toast.success("Email notification sent");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not send email");
    } finally {
      setNotifying(false);
    }
  };

  if (notFound) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-5 py-24 text-center">
          <h1 className="font-serif text-3xl text-forest">Search not found</h1>
          <Button onClick={() => navigate("/app")} className="mt-6 bg-forest text-paper rounded-sm">Back to searches</Button>
        </div>
      </Layout>
    );
  }

  if (!search) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-5 py-24 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-forest" /></div>
      </Layout>
    );
  }

  const processing = search.status === "processing";
  const errored = search.status === "error";

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-8">
        <button onClick={() => navigate("/app")} data-testid="back-btn"
          className="flex items-center gap-2 text-sm text-muted2 hover:text-forest transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to searches
        </button>

        <div className="mt-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted2">{search.purpose_label}</p>
            <h1 className="font-serif text-3xl sm:text-4xl text-forest tracking-tight mt-1">
              {search.nationality} <span className="text-muted2">→</span> {search.destination}
            </h1>
            <p className="font-mono text-[11px] text-muted2 mt-2 flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Residence: {search.residence}
              {search.status === "done" && <span> · checked {search.days_old}d ago</span>}
              {search.outdated && <span className="ml-2 text-rust flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> may be outdated</span>}
            </p>
          </div>

          {search.status === "done" && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={rerun} disabled={rerunning} variant="outline" data-testid="rerun-btn"
                className="rounded-sm border-forest/40 text-forest hover:bg-successbg gap-1.5">
                {rerunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Re-check
              </Button>
              <Button onClick={downloadPdf} disabled={pdfLoading} variant="outline" data-testid="pdf-btn"
                className="rounded-sm border-forest/40 text-forest hover:bg-successbg gap-1.5">
                {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} PDF
              </Button>
              <Button onClick={notify} disabled={notifying} variant="outline" data-testid="notify-btn"
                className="rounded-sm border-forest/40 text-forest hover:bg-successbg gap-1.5">
                {notifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Email me
              </Button>
            </div>
          )}
        </div>

        {processing && (
          <div className="mt-10 bg-white paper-card p-10 sm:p-14 text-center" data-testid="processing-state">
            <span className="mx-auto h-16 w-16 grid place-items-center bg-successbg text-forest stamp-border animate-pulse">
              <Search className="h-7 w-7" />
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl text-forest mt-6">Searching official sources…</h2>
            <p className="text-sm text-muted2 mt-3 max-w-md mx-auto leading-relaxed">
              We're querying government immigration portals and embassy sites for this exact combination, then
              structuring the requirements with citations. This usually takes 30–90 seconds.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2 text-forest">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="font-mono text-[11px] uppercase tracking-widest">Live search in progress</span>
            </div>
          </div>
        )}

        {errored && (
          <div className="mt-10 border-l-4 border-rust bg-rust-bg p-8" data-testid="error-state">
            <div className="flex items-center gap-2 text-rust">
              <XCircle className="h-5 w-5" />
              <h2 className="font-serif text-2xl">The live search couldn't complete</h2>
            </div>
            <p className="text-sm text-ink/80 mt-3">
              {search.error || "Something went wrong while searching official sources."} Please try again.
            </p>
            <Button onClick={rerun} disabled={rerunning} data-testid="retry-btn"
              className="mt-5 bg-forest hover:bg-forest-dark text-paper rounded-sm gap-1.5">
              {rerunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Retry search
            </Button>
          </div>
        )}

        {search.status === "done" && (
          <>
            {search.outdated && (
              <div className="mt-5 border-l-4 border-rust bg-rust-bg px-4 py-3 flex items-center gap-3" data-testid="outdated-banner">
                <AlertTriangle className="h-4 w-4 text-rust shrink-0" />
                <p className="text-sm text-ink/80">This search is {search.days_old} days old. Visa rules change often — re-check to confirm the latest requirements.</p>
              </div>
            )}
            <div className="mt-8">
              <VisaResult search={search} />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
