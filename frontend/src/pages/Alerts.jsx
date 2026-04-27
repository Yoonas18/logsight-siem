import React from "react";
import { Eye, Filter, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SeverityBadge from "../components/SeverityBadge.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../services/api.js";
import { formatTimestamp } from "../utils/format.js";

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadAlerts() {
    setLoading(true);
    setError("");
    try {
      const result = await api.alerts({ severity, status });
      setAlerts(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts();
  }, [severity, status]);

  return (
    <div>
      <PageHeader
        eyebrow="Alert triage"
        title="Alerts"
        description="Filter generated alerts by severity or workflow status, then open one to inspect the matching event and rule evidence."
        action={
          <button
            type="button"
            onClick={loadAlerts}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
        }
      />

      <section className="panel p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Filter className="h-4 w-4 text-cyan-700" aria-hidden="true" />
            Filters
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Severity</span>
              <select className="input mt-1" value={severity} onChange={(event) => setSeverity(event.target.value)}>
                <option value="">All severities</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </label>
            <label className="block">
              <span className="field-label">Status</span>
              <select className="input mt-1" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All statuses</option>
                <option value="new">New</option>
                <option value="investigating">Investigating</option>
                <option value="closed_true_positive">Closed true positive</option>
                <option value="closed_false_positive">Closed false positive</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="panel mt-6 overflow-hidden">
        {loading ? (
          <EmptyState title="Loading alerts" description="Checking generated detection results." />
        ) : error ? (
          <EmptyState title="Could not load alerts" description={error} />
        ) : alerts.length === 0 ? (
          <EmptyState
            title="No alerts found"
            description="Upload logs and run analysis, or clear filters to see every alert."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {["Alert ID", "Rule", "Severity", "User", "Source IP", "Timestamp", "Status", "Open"].map(
                    (header) => (
                      <th
                        key={header}
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                      >
                        {header}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {alerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-4 font-mono text-sm text-slate-800">
                      {alert.alert_id}
                    </td>
                    <td className="min-w-64 px-4 py-4 text-sm font-medium text-slate-900">
                      {alert.rule_name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <SeverityBadge severity={alert.severity} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-mono text-sm text-slate-700">
                      {alert.user || "unknown"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-mono text-sm text-slate-700">
                      {alert.src_ip || "unknown"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">
                      {formatTimestamp(alert.timestamp)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <StatusBadge status={alert.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <Link
                        to={`/alerts/${alert.id}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100"
                        title="Open alert details"
                        aria-label={`Open ${alert.alert_id}`}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
