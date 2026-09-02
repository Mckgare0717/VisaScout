import React, { useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Stamp, Loader2, MailCheck } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim().toLowerCase() });
      setSent(true);
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md">
        <Link to="/login" className="flex items-center gap-2.5 mb-8">
          <span className="h-9 w-9 grid place-items-center bg-forest text-paper stamp-border">
            <Stamp className="h-4 w-4" />
          </span>
          <span className="font-serif text-xl text-forest">VisaScout</span>
        </Link>

        {sent ? (
          <div data-testid="forgot-sent" className="bg-white paper-card p-6">
            <MailCheck className="h-6 w-6 text-forest" />
            <h1 className="font-serif text-2xl text-forest mt-3">Check your email</h1>
            <p className="text-sm text-muted2 mt-2 leading-relaxed">
              If an account exists for <b>{email}</b>, we've sent a link to reset your password.
              The link expires in 1 hour.
            </p>
            <Link to="/login" className="inline-block mt-5 text-sm text-forest font-medium hover:underline">
              Back to log in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="font-serif text-3xl text-forest tracking-tight">Reset your password</h1>
            <p className="text-sm text-muted2 mt-2">
              Enter your account email and we'll send you a reset link.
            </p>
            <form onSubmit={submit} className="mt-8 space-y-4" data-testid="forgot-form">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" data-testid="forgot-email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="rounded-sm border-line bg-white" placeholder="you@example.com" />
              </div>
              {error && (
                <p data-testid="forgot-error" className="text-sm text-rust border-l-2 border-rust pl-3 py-1 bg-rust-bg">{error}</p>
              )}
              <Button type="submit" disabled={loading} data-testid="forgot-submit"
                className="w-full bg-forest hover:bg-forest-dark text-paper rounded-sm h-11">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
              </Button>
            </form>
            <p className="mt-6 text-sm text-muted2 text-center">
              Remembered it?{" "}
              <Link to="/login" className="text-forest font-medium hover:underline">Log in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
