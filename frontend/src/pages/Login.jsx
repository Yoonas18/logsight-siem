import React, { useState } from "react";
import { LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const demoUsers = [
  { role: "Admin", username: "admin", password: "LogSightAdmin123!", note: "Full lab control" },
  { role: "Analyst", username: "analyst", password: "Analyst123!", note: "Upload and investigate" },
  { role: "Student", username: "student", password: "Student123!", note: "Read-only learning" },
];

export default function Login() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("analyst");
  const [password, setPassword] = useState("Analyst123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(username, password);
      navigate(location.state?.from?.pathname || "/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink-950 px-4 py-10 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <section>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-400/[0.12] text-cyan-200">
              <ShieldCheck className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xl font-semibold">LogSight SIEM</p>
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">Access Control Lab</p>
            </div>
          </div>

          <h1 className="mt-8 max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">
            Sign in to the training SOC workspace.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
            Roles now control who can ingest logs, run detections, update investigation status,
            and who can only view evidence for learning.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {demoUsers.map((item) => (
              <button
                key={item.username}
                type="button"
                onClick={() => {
                  setUsername(item.username);
                  setPassword(item.password);
                  setError("");
                }}
                className="rounded-lg border border-white/10 bg-white/[0.06] p-4 text-left transition hover:bg-white/[0.1]"
              >
                <p className="text-sm font-semibold text-cyan-100">{item.role}</p>
                <p className="mt-1 font-mono text-xs text-slate-300">{item.username}</p>
                <p className="mt-3 text-xs leading-5 text-slate-400">{item.note}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white p-6 text-slate-900 shadow-panel md:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
              <LockKeyhole className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Login</h2>
              <p className="text-sm text-slate-500">Use a demo role to explore permissions.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <label className="block">
              <span className="field-label">Username</span>
              <input
                className="input mt-1"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
              />
            </label>

            <label className="block">
              <span className="field-label">Password</span>
              <input
                className="input mt-1"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
