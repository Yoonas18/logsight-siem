import React from "react";
import {
  Activity,
  Bell,
  BookOpen,
  FileUp,
  Home,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";
import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/upload", label: "Upload", icon: FileUp },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/rules", label: "Rules", icon: BookOpen },
];

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 bg-ink-950 text-slate-100 lg:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-400/[0.12] text-cyan-300">
                <ShieldCheck className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-wide text-white">LogSight SIEM</p>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">Academy Lab</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-4 py-6">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition",
                    isActive
                      ? "bg-cyan-400/[0.14] text-cyan-100"
                      : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
                  ].join(" ")
                }
              >
                <item.icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-white/10 p-5">
            <div className="rounded-lg bg-white/[0.06] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Activity className="h-4 w-4 text-signal-green" aria-hidden="true" />
                Learning pipeline
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Upload logs, run detections, and follow each alert back to the original event.
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-8 lg:hidden">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-cyan-600" aria-hidden="true" />
            <span className="font-semibold">LogSight SIEM</span>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  [
                    "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                    isActive
                      ? "bg-ink-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  ].join(" ")
                }
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 md:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
