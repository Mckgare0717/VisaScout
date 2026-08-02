import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { Stamp, LogOut, Settings, LayoutGrid, Plus } from "lucide-react";

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="border-b border-line bg-paper/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link to="/app" data-testid="brand-home-link" className="flex items-center gap-2.5 group">
            <span className="h-9 w-9 grid place-items-center bg-forest text-paper stamp-border">
              <Stamp className="h-4 w-4" />
            </span>
            <div className="leading-none">
              <span className="font-serif text-xl text-forest tracking-tight">VisaScout</span>
              <span className="hidden sm:block font-mono text-[10px] text-muted2 uppercase tracking-widest mt-0.5">
                Official Sources · Live Search
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1.5 sm:gap-2">
            <Button variant="ghost" size="sm" data-testid="nav-dashboard"
              onClick={() => navigate("/app")}
              className="text-ink hover:bg-secondary gap-1.5">
              <LayoutGrid className="h-4 w-4" /> <span className="hidden sm:inline">Searches</span>
            </Button>
            <Button size="sm" data-testid="nav-new-search"
              onClick={() => navigate("/app/new")}
              className="bg-forest hover:bg-forest-dark text-paper rounded-sm gap-1.5">
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Lookup</span>
            </Button>
            <Button variant="ghost" size="icon" data-testid="nav-settings"
              onClick={() => navigate("/app/settings")} className="text-muted2 hover:bg-secondary">
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" data-testid="nav-logout"
              onClick={() => { logout(); navigate("/login"); }} className="text-muted2 hover:bg-secondary">
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full">{children}</main>

      <footer className="border-t border-line py-6 mt-10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="font-mono text-[11px] text-muted2">
            Signed in as {user?.email}
          </p>
          <p className="text-[11px] text-muted2 max-w-md">
            Informational only — not legal advice. Always verify with official government sources before applying.
          </p>
        </div>
      </footer>
    </div>
  );
}
