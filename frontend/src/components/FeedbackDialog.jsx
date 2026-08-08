import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import api, { formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { MessageSquare, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "bug", label: "Something is broken" },
  { value: "accuracy", label: "Visa info looks wrong" },
  { value: "idea", label: "Feature idea" },
  { value: "other", label: "General feedback" },
];

export default function FeedbackDialog({ trigger, dark = false }) {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("other");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // AuthContext: null = loading, false = signed out, object = signed in.
  const signedIn = Boolean(user);

  const submit = async (e) => {
    e.preventDefault();
    if (message.trim().length < 5) {
      setError("Please tell us a little more — at least a few words.");
      return;
    }
    setError("");
    setSending(true);
    try {
      await api.post("/feedback", {
        category,
        message: message.trim(),
        // Signed-in users are identified server-side; this is for signed-out visitors.
        email: email.trim() || undefined,
        page: location.pathname,
      });
      toast.success("Thanks — your feedback was sent");
      setMessage("");
      setEmail("");
      setCategory("other");
      setOpen(false);
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || "Could not send feedback. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const base = dark ? "text-paper/70 hover:text-paper" : "text-muted2 hover:text-forest";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <button type="button" data-testid="feedback-trigger"
            className={`flex items-center gap-1.5 text-[11px] ${base} transition-colors`}>
            <MessageSquare className="h-3.5 w-3.5" /> Send feedback
          </button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md bg-paper border-line" data-testid="feedback-dialog">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-forest">Send feedback</DialogTitle>
          <DialogDescription className="text-sm text-muted2">
            Found a bug, spotted wrong visa info, or have an idea? We read every message.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" data-testid="feedback-form">
          <div className="space-y-1.5">
            <Label htmlFor="feedback-category" className="font-mono text-[10px] uppercase tracking-widest text-muted2">
              Type
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="feedback-category" data-testid="feedback-category"
                className="rounded-sm border-line bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value} data-testid={`feedback-cat-${c.value}`}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="feedback-message" className="font-mono text-[10px] uppercase tracking-widest text-muted2">
              Your message
            </Label>
            <Textarea id="feedback-message" data-testid="feedback-message" value={message}
              onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={4000} required
              placeholder="What happened, or what would you like to see?"
              className="rounded-sm border-line bg-white resize-none" />
          </div>

          {!signedIn && (
            <div className="space-y-1.5">
              <Label htmlFor="feedback-email" className="font-mono text-[10px] uppercase tracking-widest text-muted2">
                Email <span className="normal-case tracking-normal">(optional — so we can reply)</span>
              </Label>
              <Input id="feedback-email" type="email" data-testid="feedback-email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                className="rounded-sm border-line bg-white" />
            </div>
          )}

          {error && (
            <p data-testid="feedback-error" className="text-sm text-rust border-l-2 border-rust pl-3 py-1 bg-rust-bg">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}
              className="text-muted2 hover:text-ink">Cancel</Button>
            <Button type="submit" disabled={sending} data-testid="feedback-submit"
              className="bg-forest hover:bg-forest-dark text-paper rounded-sm gap-1.5">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send feedback
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
