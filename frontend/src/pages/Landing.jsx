import React from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Stamp, Search, ShieldCheck, FileText, Link2, Globe2, ArrowRight } from "lucide-react";

const HERO = "https://images.unsplash.com/photo-1687552626877-f4596995931c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzV8MHwxfHNlYXJjaHwzfHxhaXJwb3J0JTIwdGVybWluYWwlMjBhcmNoaXRlY3R1cmV8ZW58MHx8fHwxNzg1NzA4ODMxfDA&ixlib=rb-4.1.0&q=85";

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
            <Link to="/register">
              <Button size="lg" data-testid="hero-cta-btn" className="bg-forest hover:bg-forest-dark text-paper rounded-sm gap-2 h-12 px-7">
                Start a visa lookup <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" data-testid="hero-demo-btn" className="rounded-sm border-forest/40 text-forest hover:bg-successbg h-12 px-7">
                Try the demo account
              </Button>
            </Link>
          </div>
          <p className="mt-4 font-mono text-[11px] text-muted2">demo@visascout.app · Demo1234!</p>
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

      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-14">
        <div className="border-l-4 border-rust bg-rust-bg p-6 sm:p-8">
          <p className="font-serif text-lg text-rust">A word on trust</p>
          <p className="text-sm text-ink/80 mt-2 max-w-3xl leading-relaxed">
            VisaScout never guarantees approval and never invents fees or processing times. When official
            guidance is unclear or contested, we tell you plainly and recommend consulting a licensed
            immigration professional. This tool is informational only and is not legal advice.
          </p>
        </div>
      </section>
    </div>
  );
}
