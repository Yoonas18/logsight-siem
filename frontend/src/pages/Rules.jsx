import React from "react";
import { BookOpenCheck } from "lucide-react";
import { useEffect, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SeverityBadge from "../components/SeverityBadge.jsx";
import { api } from "../services/api.js";

export default function Rules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .rules()
      .then(setRules)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="Detection library"
        title="Detection Rules"
        description="Each card maps a plain-English rule condition to alert severity, reason, recommended response, and MITRE context."
      />

      {loading ? (
        <EmptyState title="Loading rules" description="Fetching rule definitions from the backend." />
      ) : error ? (
        <EmptyState title="Could not load rules" description={error} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {rules.map((rule) => (
            <section key={rule.rule_id} className="panel p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-sm font-semibold text-cyan-700">{rule.rule_id}</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950">{rule.name}</h2>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-cyan-200">
                  <BookOpenCheck className="h-5 w-5" aria-hidden="true" />
                </div>
              </div>

              <div className="mt-4">
                <SeverityBadge severity={rule.severity} />
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Condition</p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-4 text-sm text-cyan-100">
                  {rule.condition}
                </pre>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <RuleText title="Reason" body={rule.reason} />
                <RuleText title="Recommended action" body={rule.recommended_action} />
              </div>

              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">MITRE</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {rule.mitre_tactic} / {rule.mitre_technique}
                </p>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function RuleText({ title, body }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}
