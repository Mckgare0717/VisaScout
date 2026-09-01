import React, { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import api, { formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Loader2, Plus, Trash2, RefreshCw, Sparkles, Search, MessageSquare, Shield,
} from "lucide-react";
import { toast } from "sonner";

const fmtDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");

export default function Admin() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [stats, setStats] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", plan: "free", role: "user" });

  const load = useCallback(async () => {
    try {
      const [u, s] = await Promise.all([api.get("/admin/users"), api.get("/admin/stats")]);
      setUsers(u.data);
      setStats(s.data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not load admin data");
      setUsers([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadFeedback = async () => {
    try {
      const { data } = await api.get("/admin/feedback");
      setFeedback(data);
    } catch (e) {
      toast.error("Could not load feedback");
      setFeedback([]);
    }
  };

  const patchUser = async (id, patch, label) => {
    setBusyId(id);
    try {
      const { data } = await api.patch(`/admin/users/${id}`, patch);
      setUsers((list) => list.map((u) => (u.id === id ? { ...u, ...data } : u)));
      toast.success(label || "Updated");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const syncBilling = async (id) => {
    setBusyId(id);
    try {
      const { data } = await api.post(`/admin/users/${id}/sync-billing`);
      setUsers((list) => list.map((u) => (u.id === id ? { ...u, ...data.user } : u)));
      toast.success(`Synced from Stripe — ${data.stripe_subscription_status} → ${data.plan}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Sync failed");
    } finally {
      setBusyId(null);
    }
  };

  const removeUser = async (u) => {
    if (!window.confirm(`Delete ${u.email}? This also deletes their ${u.search_count} searches. Cannot be undone.`)) return;
    setBusyId(u.id);
    try {
      await api.delete(`/admin/users/${u.id}`);
      setUsers((list) => list.filter((x) => x.id !== u.id));
      toast.success("User deleted");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      await api.post("/admin/users", {
        ...form,
        email: form.email.trim().toLowerCase(),
        name: form.name.trim(),
      });
      toast.success("User created");
      setForm({ name: "", email: "", password: "", plan: "free", role: "user" });
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not create user");
    } finally {
      setAdding(false);
    }
  };

  const filtered = (users || []).filter((u) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return u.email.toLowerCase().includes(s) || (u.name || "").toLowerCase().includes(s);
  });

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted2 flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" /> Admin
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl text-forest tracking-tight mt-2">Users &amp; subscriptions</h1>

        {stats && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-px bg-line border border-line">
            {[
              ["Users", stats.total_users],
              ["Pro", stats.pro_users],
              ["Searches", stats.total_searches],
              ["Google sign-ins", stats.google_users],
              ["Admins", stats.admins],
            ].map(([k, v]) => (
              <div key={k} className="bg-paper p-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted2">{k}</p>
                <p className="font-serif text-2xl text-forest mt-1">{v}</p>
              </div>
            ))}
          </div>
        )}

        {/* Add user */}
        <form onSubmit={createUser} className="mt-8 bg-white paper-card p-5 grid sm:grid-cols-6 gap-3 items-end" data-testid="admin-add-user">
          <div className="space-y-1 sm:col-span-2">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted2">Email</Label>
            <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-sm border-line bg-white" placeholder="user@example.com" />
          </div>
          <div className="space-y-1">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted2">Name</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-sm border-line bg-white" placeholder="Jordan" />
          </div>
          <div className="space-y-1">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted2">Password</Label>
            <Input required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="rounded-sm border-line bg-white" placeholder="8+ chars" />
          </div>
          <div className="space-y-1">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted2">Plan</Label>
            <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
              <SelectTrigger className="rounded-sm border-line bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="pro">Pro (comp)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={adding} className="bg-forest hover:bg-forest-dark text-paper rounded-sm gap-1.5">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add user
          </Button>
        </form>

        <div className="mt-8 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted2" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by email or name"
              className="pl-9 rounded-sm border-line bg-white" />
          </div>
          <Button variant="ghost" size="sm" onClick={load} className="text-muted2 gap-1.5">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        {users === null ? (
          <div className="mt-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-forest" /></div>
        ) : (
          <div className="mt-4 overflow-x-auto bg-white paper-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-widest text-muted2">
                  <th className="p-3">User</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Lookups</th>
                  <th className="p-3">Searches</th>
                  <th className="p-3">Joined</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const busy = busyId === u.id;
                  const pro = u.plan === "pro";
                  return (
                    <tr key={u.id} className="border-b border-line/60 hover:bg-paper/50" data-testid={`admin-user-${u.id}`}>
                      <td className="p-3">
                        <div className="text-ink">{u.email}</div>
                        <div className="text-[11px] text-muted2">
                          {u.name || "—"} · {u.provider}
                          {u.role === "admin" && <span className="ml-1 text-forest">· admin</span>}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono uppercase tracking-wide ${pro ? "bg-successbg text-forest" : "bg-secondary text-muted2"}`}>
                          {pro && <Sparkles className="h-3 w-3" />}
                          {u.plan}{u.comp ? " (comp)" : ""}
                        </span>
                        {u.stripe_subscription_status && (
                          <div className="text-[10px] text-muted2 mt-0.5">stripe: {u.stripe_subscription_status}</div>
                        )}
                      </td>
                      <td className="p-3 text-muted2">{u.lookups_used ?? 0}</td>
                      <td className="p-3 text-muted2">{u.search_count}</td>
                      <td className="p-3 text-muted2 font-mono text-[11px]">{fmtDate(u.created_at)}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <Button size="sm" variant="outline" disabled={busy}
                            onClick={() => patchUser(u.id, { plan: pro ? "free" : "pro" }, pro ? "Downgraded to Free" : "Upgraded to Pro (comp)")}
                            className="rounded-sm border-forest/40 text-forest hover:bg-successbg h-8 text-xs">
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : pro ? "Make Free" : "Make Pro"}
                          </Button>
                          {(u.lookups_used ?? 0) > 0 && (
                            <Button size="sm" variant="outline" disabled={busy}
                              onClick={() => patchUser(u.id, { lookups_used: 0 }, "Free-lookup quota reset")}
                              className="rounded-sm border-line text-muted2 hover:text-ink h-8 text-xs">
                              Reset quota
                            </Button>
                          )}
                          {u.stripe_customer_id && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => syncBilling(u.id)}
                              className="rounded-sm border-line text-muted2 hover:text-ink h-8 text-xs gap-1">
                              <RefreshCw className="h-3 w-3" /> Sync Stripe
                            </Button>
                          )}
                          {u.id !== me?.id && (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => removeUser(u)}
                              className="text-muted2 hover:text-rust h-8 w-8 p-0">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted2">No users match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Feedback */}
        <div className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-2xl text-forest flex items-center gap-2">
              <MessageSquare className="h-5 w-5" /> Feedback
            </h2>
            {feedback === null && (
              <Button variant="outline" size="sm" onClick={loadFeedback}
                className="rounded-sm border-forest/40 text-forest hover:bg-successbg">Load feedback</Button>
            )}
          </div>
          {feedback && feedback.length === 0 && <p className="text-sm text-muted2 mt-3">No feedback yet.</p>}
          {feedback && feedback.length > 0 && (
            <div className="mt-4 space-y-3">
              {feedback.map((f) => (
                <div key={f.id} className="bg-white paper-card p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] font-mono uppercase tracking-widest text-muted2">
                    <span>{f.category} · {f.user_name || "anonymous"} {f.reply_to ? `· ${f.reply_to}` : ""}</span>
                    <span>{fmtDate(f.created_at)} {f.emailed ? "· emailed" : "· not emailed"}</span>
                  </div>
                  <p className="text-sm text-ink/85 mt-2 whitespace-pre-wrap">{f.message}</p>
                  {f.page && <p className="text-[11px] text-muted2 mt-1">on {f.page}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
