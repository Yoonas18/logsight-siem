import React from "react";
import { ArrowRight, Bell, FileCode2, FileUp, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";

const pipeline = [
  { label: "Raw Logs", icon: FileUp, text: "CSV rows from systems, users, and applications." },
  { label: "Parse", icon: FileCode2, text: "Columns are read from native or mapped CSVs." },
  { label: "Normalize", icon: Sparkles, text: "Mapped values become structured SIEM fields." },
  { label: "Detect", icon: ShieldCheck, text: "Rules match risky patterns in the dataset." },
  { label: "Alert", icon: Bell, text: "Matches become triage-ready alerts." },
  { label: "Investigate", icon: Search, text: "Roles control who can view or update status." },
];

export default function Home() {
  return (
    <div>
      <PageHeader
        eyebrow="Mini SIEM training lab"
        title="LogSight SIEM"
        description="A beginner-friendly SIEMLite-style workspace that shows the full path from raw security logs to investigation-ready alerts."
        action={
          <Link
            to="/upload"
            className="inline-flex items-center gap-2 rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800"
          >
            Start with a CSV
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      />

      <section className="panel-dark overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="p-6 md:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
              Raw Logs - Parse - Normalize - Detect - Alert - Investigate
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white">
              See how a SIEM thinks, one event at a time.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              LogSight stores uploaded events, supports mapped CSV imports, runs transparent
              detection logic, and keeps every generated alert tied to the original log row. The
              app is intentionally small enough for students to read, modify, and extend.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {["Role-based access", "CSV schema mapper", "React investigation UI"].map((item) => (
                <div key={item} className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3">
                  <p className="text-sm font-semibold text-cyan-100">{item}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-white/10 bg-ink-900 p-6 md:p-8 lg:border-l lg:border-t-0">
            <div className="space-y-3">
              {pipeline.map((step, index) => (
                <div key={step.label} className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-400/[0.12] text-cyan-200">
                    <step.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">{step.label}</p>
                      {index < pipeline.length - 1 ? (
                        <ArrowRight className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="panel p-5">
          <h3 className="text-base font-semibold text-slate-950">Import learner data</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Use the sample CSV, upload mapped open-source CSVs, or import a public CSV URL.
          </p>
        </div>
        <div className="panel p-5">
          <h3 className="text-base font-semibold text-slate-950">Run six rules</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Failed logins, brute-force behavior, off-hours access, sensitive files, unknown admin IPs, and tool-like user agents.
          </p>
        </div>
        <div className="panel p-5">
          <h3 className="text-base font-semibold text-slate-950">Practice controlled triage</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Admin and analyst users update cases while student users review evidence safely.
          </p>
        </div>
      </section>
    </div>
  );
}
