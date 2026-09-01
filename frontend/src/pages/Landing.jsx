import React from "react";
import { Link } from "react-router-dom";
import { track } from "@vercel/analytics";
import { Button } from "../components/ui/button";
import FeedbackDialog from "../components/FeedbackDialog";
import { Stamp, Search, ShieldCheck, FileText, Link2, Globe2, ArrowRight, Instagram, Globe, Mail } from "lucide-react";

const XANRE = {
  site: "https://xanretechltd.netlify.app/",
  instagram: "https://www.instagram.com/xanretech?igsh=MWJjczN2YWh0c3cyMQ==",
  email: "xanretech@gmail.com",
};

const HERO = "https://images.unsplash.com/photo-1687552626877-f4596995931c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzV8MHwxfHNlYXJjaHwzfHxhaXJwb3J0JTIwdGVybWluYWwlMjBhcmNoaXRlY3R1cmV8ZW58MHx8fHwxNzg1NzA4ODMxfDA&ixlib=rb-4.1.0&q=85";

// Off by default — the demo login is for internal/staging use only and
// must be opted into per-deploy, never shipped to real users by default.
const SHOW_DEMO = process.env.REACT_APP_SHOW_DEMO === "true";

const features = [
  { icon: Search, title: "Live official search", body: "Every lookup runs a real-time search of .gov domains and embassy portals — never model memory." },
  { icon: FileText, title: "5-category checklist", body: "Identity, Financial, Purpose-specific, Health/Biometric and Other — as collapsible, checkable cards." },
  { icon: ShieldCheck, title: "Honest guardrails", body: "If sources are ambiguous, we say so and recommend a professional. No fabricated fees or times." },
  { icon: Link2, title: "Full source transparency", body: "Every fee, time and requirement carries its source URL and the date it was checked." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 grid place-items-center bg-forest text-paper stamp-border">
              <Stamp className="h-4 w-4" />
            </span>
            <span className="font-serif text-xl text-forest tracking-tight">VisaScout</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/login"><Button variant="ghost" data-testid="landing-login-btn" className="text-ink hover:bg-secondary">Log in</Button></Link>
            <Link to="/register"><Button data-testid="landing-signup-btn" className="bg-forest hover:bg-forest-dark text-paper rounded-sm">Get started</Button></Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-5 sm:px-8 grid lg:grid-cols-2 gap-10 lg:gap-16 pt-14 pb-20 items-center">
        <div className="animate-fade-up">
          <div className="inline-flex items-center gap-2 border border-forest/30 bg-successbg px-3 py-1 rounded-full mb-6">
            <Globe2 className="h-3.5 w-3.5 text-forest" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-forest">Powered by live government sources</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] text-forest tracking-tight">
            Know exactly what visa you need.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-muted2 max-w-xl leading-relaxed">
            Enter your passport, residence, destination and purpose. VisaScout searches official immigration
            and embassy portals in real time, then structures the requirements, fees, checklist and rejection
            risks — with every source cited and dated.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register" onClick={() => track("signup_cta_click", { source: "hero" })}>
              <Button size="lg" data-testid="hero-cta-btn" className="bg-forest hover:bg-forest-dark text-paper rounded-sm gap-2 h-12 px-7">
                Start a visa lookup <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            {SHOW_DEMO && (
              <Link to="/login">
                <Button size="lg" variant="outline" data-testid="hero-demo-btn" className="rounded-sm border-forest/40 text-forest hover:bg-successbg h-12 px-7">
                  Try the demo account
                </Button>
              </Link>
            )}
          </div>
          {SHOW_DEMO && (
            <p className="mt-4 font-mono text-[11px] text-muted2">demo@visascout.app · Demo1234!</p>
          )}
        </div>

        <div className="relative animate-fade-up" style={{ animationDelay: "0.12s" }}>
          <div className="stamp-border p-2 bg-white">
            <img src={HERO} alt="Airport terminal" className="w-full h-[380px] object-cover" />
          </div>
          <div className="absolute -bottom-5 -left-4 bg-white paper-card px-4 py-3 max-w-[220px]">
            <p className="font-mono text-[10px] uppercase tracking-widest text-forest">Checked on</p>
            <p className="font-mono text-sm text-ink">{new Date().toISOString().slice(0, 10)}</p>
            <p className="text-[11px] text-muted2 mt-1">Sources timestamped on every result.</p>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-white/60">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line">
          {features.map((f) => (
            <div key={f.title} className="bg-paper p-7">
              <f.icon className="h-6 w-6 text-forest" />
              <h3 className="font-serif text-lg text-forest mt-4">{f.title}</h3>
              <p className="text-sm text-muted2 mt-2 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line bg-forest">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-2.5">
            <span className="h-8 w-8 grid place-items-center bg-paper text-forest">
              <Stamp className="h-4 w-4" />
            </span>
            <div>
              <span className="font-serif text-lg text-paper">VisaScout</span>
              <p className="font-mono text-[10px] uppercase tracking-widest text-paper/60">Informational · Not legal advice</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6" data-testid="landing-developer-credit">
            <span className="font-mono text-[11px] uppercase tracking-widest text-paper/70">
              Developed by <span className="text-paper">Xanre Tech LTD</span>
            </span>
            <div className="flex items-center gap-5">
              <a href={XANRE.site} target="_blank" rel="noreferrer" data-testid="landing-xanre-website"
                className="flex items-center gap-1.5 text-[11px] text-paper/70 hover:text-paper transition-colors">
                <Globe className="h-3.5 w-3.5" /> Website
              </a>
              <a href={XANRE.instagram} target="_blank" rel="noreferrer" data-testid="landing-xanre-instagram"
                className="flex items-center gap-1.5 text-[11px] text-paper/70 hover:text-paper transition-colors">
                <Instagram className="h-3.5 w-3.5" /> Instagram
              </a>
              <a href={`mailto:${XANRE.email}`} data-testid="landing-xanre-email"
                className="flex items-center gap-1.5 text-[11px] text-paper/70 hover:text-paper transition-colors">
                <Mail className="h-3.5 w-3.5" /> {XANRE.email}
              </a>
              <FeedbackDialog dark />
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 pb-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-paper/15 pt-6">
          <Link to="/terms" className="font-mono text-[11px] text-paper/60 hover:text-paper">Terms</Link>
          <Link to="/privacy" className="font-mono text-[11px] text-paper/60 hover:text-paper">Privacy</Link>
          <Link to="/refund" className="font-mono text-[11px] text-paper/60 hover:text-paper">Refunds</Link>
        </div>
      </footer>
    </div>
  );
}
