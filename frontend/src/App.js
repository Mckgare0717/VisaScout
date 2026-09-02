import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Toaster } from "sonner";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Landing from "./pages/Landing";
import Legal from "./pages/Legal";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import NewSearch from "./pages/NewSearch";
import ResultView from "./pages/ResultView";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import VisaForms from "./pages/VisaForms";
import SchengenForm from "./pages/SchengenForm";

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/terms" element={<Legal type="terms" />} />
            <Route path="/privacy" element={<Legal type="privacy" />} />
            <Route path="/refund" element={<Legal type="refund" />} />
            <Route path="/login" element={<Auth mode="login" />} />
            <Route path="/register" element={<Auth mode="register" />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/app" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/app/new" element={<ProtectedRoute><NewSearch /></ProtectedRoute>} />
            <Route path="/app/forms" element={<ProtectedRoute><VisaForms /></ProtectedRoute>} />
            <Route path="/app/forms/:id" element={<ProtectedRoute><SchengenForm /></ProtectedRoute>} />
            <Route path="/app/search/:id" element={<ProtectedRoute><ResultView /></ProtectedRoute>} />
            <Route path="/app/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/app/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
        <Analytics />
        <SpeedInsights />
      </AuthProvider>
    </div>
  );
}

export default App;
