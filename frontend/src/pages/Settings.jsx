import React, { useState } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import api, { formatApiErrorDetail } from "../lib/api";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { User, Mail, Bell } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const { user, updateUser, logout } = useAuth();
  const [notify, setNotify] = useState(user?.notify_outdated ?? true);
  const [saving, setSaving] = useState(false);

  const toggle = async (v) => {
    setNotify(v);
    setSaving(true);
    try {
      await api.patch("/auth/preferences", { notify_outdated: v });
      updateUser({ notify_outdated: v });
      toast.success("Preferences updated");
    } catch (e) {
      setNotify(!v);
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-10">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted2">Account</p>
        <h1 className="font-serif text-3xl sm:text-4xl text-forest tracking-tight mt-2">Settings</h1>

        <div className="mt-8 bg-white paper-card divide-y divide-line">
          <Row icon={User} label="Name" value={user?.name} />
          <Row icon={Mail} label="Email" value={user?.email} mono />

          <div className="flex items-center gap-4 p-6">
            <Bell className="h-4 w-4 text-forest shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">Outdated-search email alerts</p>
              <p className="text-xs text-muted2 mt-0.5">Get an email reminder when a saved search may be out of date.</p>
            </div>
            <Switch checked={notify} onCheckedChange={toggle} disabled={saving} data-testid="notify-switch" />
          </div>
        </div>

        <Button onClick={logout} variant="outline" data-testid="settings-logout"
          className="mt-8 rounded-sm border-forest/40 text-forest hover:bg-successbg">
          Log out
        </Button>
      </div>
    </Layout>
  );
}

function Row({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-center gap-4 p-6">
      <Icon className="h-4 w-4 text-forest shrink-0" />
      <span className="text-sm text-muted2 w-24">{label}</span>
      <span className={`text-sm text-ink ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
