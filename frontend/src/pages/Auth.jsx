import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Stamp, Loader2 } from "lucide-react";
import { toast } from "sonner";

const SIDE = "https://images.unsplash.com/photo-1562504208-03d85cc8c23e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzN8MHwxfHNlYXJjaHwyfHx3b3JsZCUyMG1hcCUyMGFic3RyYWN0JTIwbGluZSUyMGFydHxlbnwwfHx8fDE3ODU3MDg4NDN8MA&ixlib=rb-4.1.0&q=85";

export default function Auth({ mode }) {
  const isLogin = mode === "login";
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(isLogin ? "" : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fillDemo = () => {
    setEmail("demo@visascout.app");
    setPassword("Demo1234!");
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isLogin) await login(email.trim().toLowerCase(), password);
      else await register(name.trim(), email.trim().toLowerCase(), password);
      toast.success(isLogin ? "Welcome back" : "Account created");
      navigate("/app");
    } catch (err) {
      const msg = formatApiErrorDetail(err.response?.data?.detail) || err.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-paper">
      <div className="hidden lg:block relative bg-forest">
        <img src={SIDE} alt="World map" className="absolute inset-0 w-full h-full object-cover opacity-25" />
        <div className="relative h-full flex flex-col justify-between p-12">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 grid place-items-center bg-paper text-forest border border-paper">
              <Stamp className="h-4 w-4" />
            </span>
            <span className="font-serif text-2xl text-paper">VisaScout</span>
          </div>
          <div>
            <h2 className="font-serif text-4xl text-paper leading-tight">
              Visa clarity,<br />straight from the source.
            </h2>
            <p className="text-paper/70 mt-4 max-w-sm text-sm leading-relaxed">
              Live official-source lookups, transparent citations, and honest guardrails on every result.
            </p>
          </div>
          <p className="font-mono text-[11px] text-paper/50 uppercase tracking-widest">Informational · Not legal advice</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <span className="h-9 w-9 grid place-items-center bg-forest text-paper stamp-border">
              <Stamp className="h-4 w-4" />
            </span>
            <span className="font-serif text-xl text-forest">VisaScout</span>
          </div>

          <h1 className="font-serif text-3xl text-forest tracking-tight">
            {isLogin ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-muted2 mt-2">
            {isLogin ? "Log in to run and revisit your visa searches." : "Sign up to save and re-run your visa lookups."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4" data-testid="auth-form">
            {!isLogin && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" data-testid="auth-name" value={name} onChange={(e) => setName(e.target.value)}
                  required className="rounded-sm border-line bg-white" placeholder="Jordan Rivera" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" data-testid="auth-email" value={email} onChange={(e) => setEmail(e.target.value)}
                required className="rounded-sm border-line bg-white" placeholder="you@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" data-testid="auth-password" value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={6} className="rounded-sm border-line bg-white" placeholder="••••••••" />
            </div>

            {error && (
              <p data-testid="auth-error" className="text-sm text-rust border-l-2 border-rust pl-3 py-1 bg-rust-bg">{error}</p>
            )}

            <Button type="submit" disabled={loading} data-testid="auth-submit"
              className="w-full bg-forest hover:bg-forest-dark text-paper rounded-sm h-11">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isLogin ? "Log in" : "Create account"}
            </Button>
          </form>

          {isLogin && (
            <button onClick={fillDemo} data-testid="fill-demo-btn"
              className="mt-4 w-full text-center font-mono text-[11px] text-forest hover:underline">
              Use demo credentials →
            </button>
          )}

          <p className="mt-6 text-sm text-muted2 text-center">
            {isLogin ? "No account yet? " : "Already have an account? "}
            <Link to={isLogin ? "/register" : "/login"} data-testid="auth-switch"
              className="text-forest font-medium hover:underline">
              {isLogin ? "Sign up" : "Log in"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
