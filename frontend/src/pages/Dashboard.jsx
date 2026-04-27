import React from "react";
import { AlertTriangle, Bell, Database, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import MetricCard from "../components/MetricCard.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SeverityBadge from "../components/SeverityBadge.jsx";
import { api } from "../services/api.js";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .dashboard()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <EmptyState title="Loading dashboard" description="Gathering event and alert totals." />;
  }

  if (error) {
    return <EmptyState title="Dashboard unavailable" description={error} />;
  }

  const maxRuleCount = Math.max(1, ...(data.alerts_by_rule || []).map((item) => item.count));

  return (
    <div>
      <PageHeader
        eyebrow="Security operations overview"
        title="Dashboard"
        description="Track processed logs, alert volume, severity mix, and the entities that deserve the first look."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Logs processed"
          value={data.total_logs_processed}
          icon={Database}
          accent="slate"
        />
        <MetricCard label="Total alerts" value={data.total_alerts} icon={Bell} accent="cyan" />
        <MetricCard
          label="High severity"
          value={data.high_severity_alerts}
          icon={ShieldAlert}
          accent="red"
        />
        <MetricCard
          label="Medium severity"
          value={data.medium_severity_alerts}
          icon={AlertTriangle}
          accent="amber"
        />
        <MetricCard
          label="Low severity"
          value={data.low_severity_alerts}
          icon={ShieldCheck}
          accent="green"
        />
      </div>

      {data.total_logs_processed === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No logs uploaded yet"
            description="Upload the sample CSV, run analysis, and this dashboard will fill with SIEM metrics."
          />
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-950">Alerts by rule</h2>
          <div className="mt-5 space-y-4">
            {(data.alerts_by_rule || []).length === 0 ? (
              <p className="text-sm text-slate-500">No alerts have been generated yet.</p>
            ) : (
              data.alerts_by_rule.map((item) => (
                <div key={item.rule_id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {item.rule_id} - {item.rule_name}
                      </p>
                      <div className="mt-1">
                        <SeverityBadge severity={item.severity} />
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{item.count}</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-cyan-600"
                      style={{ width: `${(item.count / maxRuleCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="grid gap-6">
          <TopList title="Top suspicious users" items={data.top_suspicious_users} labelKey="user" />
          <TopList title="Top suspicious IPs" items={data.top_suspicious_ips} labelKey="src_ip" />
        </div>
      </div>
    </div>
  );
}

function TopList({ title, items, labelKey }) {
  const maxCount = Math.max(1, ...(items || []).map((item) => item.count));

  return (
    <section className="panel p-6">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <div className="mt-5 space-y-4">
        {(items || []).length === 0 ? (
          <p className="text-sm text-slate-500">No alert entities yet.</p>
        ) : (
          items.map((item) => (
            <div key={item[labelKey]}>
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-mono text-sm text-slate-800">{item[labelKey]}</span>
                <span className="text-sm font-semibold text-slate-700">{item.count}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-emerald-500"
                  style={{ width: `${(item.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
