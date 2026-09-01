import React, { useState } from "react";
import { track } from "@vercel/analytics";
import api, { formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { Loader2, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";

const PRO_PERKS = [
  "Unlimited live visa lookups",
  "Re-check any saved search against live sources",
  "PDF document checklists",
  "Email alerts when a saved search goes out of date",
];

export function useUpgrade(source = "unknown") {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const startCheckout = async () => {
    setLoading(true);
    try {
      track("checkout_started", { source });
      const { data } = await api.post("/billing/checkout");
      window.location.href = data.url;
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not start checkout.");
      setLoading(false);
    }
  };

  return { loading, startCheckout, priceLabel: user?.pro_price_label || "£7/mo", enabled: user?.billing_enabled };
}

export function UpgradeButton({ source, className, children }) {
  const { loading, startCheckout, priceLabel, enabled } = useUpgrade(source);
  if (!enabled) return null;
  return (
    <Button onClick={startCheckout} disabled={loading} data-testid="upgrade-btn"
      className={className || "bg-forest hover:bg-forest-dark text-paper rounded-sm gap-2"}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {children || `Upgrade to Pro — ${priceLabel}`}
    </Button>
  );
}

export function PaywallCard({ source, title, body }) {
  const { priceLabel } = useUpgrade(source);
  return (
    <div className="bg-white paper-card p-6 sm:p-8" data-testid="paywall-card">
      <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-forest bg-successbg px-2.5 py-1">
        <Sparkles className="h-3.5 w-3.5" /> VisaScout Pro
      </span>
      <h3 className="font-serif text-2xl text-forest mt-4">{title || "You've used your free lookups"}</h3>
      <p className="text-sm text-muted2 mt-2 max-w-md leading-relaxed">
        {body || `Upgrade to Pro for ${priceLabel} to keep researching. Cancel anytime.`}
      </p>
      <ul className="mt-5 space-y-2">
        {PRO_PERKS.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-ink/85">
            <Check className="h-4 w-4 text-forest shrink-0 mt-0.5" /> {p}
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <UpgradeButton source={source} />
      </div>
    </div>
  );
}
