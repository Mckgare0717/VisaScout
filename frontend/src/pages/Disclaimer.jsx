import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import { Button } from "../components/ui/button";
import { ShieldAlert, Check, Loader2 } from "lucide-react";

const GRAPHIC = "https://images.unsplash.com/photo-1654163600175-efc47ce20b29?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTN8MHwxfHNlYXJjaHwzfHxwYXNzcG9ydCUyMHN0YW1wcyUyMHZpbnRhZ2V8ZW58MHx8fHwxNzg1NzA4ODMxfDA&ixlib=rb-4.1.0&q=85";

const points = [
  "VisaScout provides informational guidance only — it is not legal advice.",
  "Visa rules change frequently. Always confirm with the official government authority before you apply or travel.",
  "We never guarantee visa approval, and never invent fees or processing times.",
  "When official sources are unclear or contested, we recommend consulting a licensed immigration professional.",
];

export default function Disclaimer() {
  const { updateUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const accept = async () => {
    setLoading(true);
    try {
      await api.post("/auth/seen-disclaimer");
      updateUser({ seen_disclaimer: true });
      navigate("/app");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-5 sm:p-8">
      <div className="w-full max-w-2xl bg-white paper-card">
        <div className="relative h-40 overflow-hidden border-b border-line">
          <img src={GRAPHIC} alt="Passport stamps" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-forest/55" />
          <div className="absolute inset-0 flex items-center gap-3 px-8">
            <span className="h-11 w-11 grid place-items-center bg-paper text-rust border border-paper">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-paper/80">Before you begin</p>
              <h1 className="font-serif text-2xl sm:text-3xl text-paper">Important disclaimer</h1>
            </div>
          </div>
        </div>

        <div className="p-7 sm:p-10">
          <ul className="space-y-4">
            {points.map((p, i) => (
              <li key={i} className="flex gap-3" data-testid={`disclaimer-point-${i}`}>
                <span className="mt-1 h-5 w-5 shrink-0 grid place-items-center border border-forest text-forest">
                  <Check className="h-3 w-3" />
                </span>
                <span className="text-sm text-ink/85 leading-relaxed">{p}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 border-l-4 border-rust bg-rust-bg p-4">
            <p className="text-sm text-rust">
              By continuing, you acknowledge that VisaScout is an informational aid and that final responsibility
              for any application rests with you and the relevant authorities.
            </p>
          </div>

          <Button onClick={accept} disabled={loading} data-testid="accept-disclaimer-btn"
            className="mt-8 w-full bg-forest hover:bg-forest-dark text-paper rounded-sm h-11">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "I understand — continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
