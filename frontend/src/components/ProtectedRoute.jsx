import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({ children }) {
  const { user } = useAuth();

  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <Loader2 className="h-6 w-6 animate-spin text-forest" />
      </div>
    );
  }
  if (user === false) return <Navigate to="/login" replace />;

  // First-use disclaimer gate
  if (!user.seen_disclaimer && window.location.pathname !== "/disclaimer") {
    return <Navigate to="/disclaimer" replace />;
  }
  return children;
}
