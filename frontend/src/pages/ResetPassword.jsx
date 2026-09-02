import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api, { formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Stamp, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Password updated — please log in.");
      navigate("/login");
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

        <h1 className="font-serif text-3xl text-forest tracking-tight">Choose a new password</h1>

        {!token ? (
          <p data-testid="reset-no-token" className="text-sm text-rust mt-4 border-l-2 border-rust pl-3 py-1 bg-rust-bg">
            This link is missing its reset token. Request a new one from{" "}
            <Link to="/forgot-password" className="underline">forgot password</Link>.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4" data-testid="reset-form">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input id="password" type="password" data-testid="reset-password" required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="rounded-sm border-line bg-white" placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input id="confirm" type="password" data-testid="reset-confirm" required minLength={8}
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="rounded-sm border-line bg-white" placeholder="••••••••" />
            </div>
            {error && (
              <p data-testid="reset-error" className="text-sm text-rust border-l-2 border-rust pl-3 py-1 bg-rust-bg">{error}</p>
            )}
            <Button type="submit" disabled={loading} data-testid="reset-submit"
              className="w-full bg-forest hover:bg-forest-dark text-paper rounded-sm h-11">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
