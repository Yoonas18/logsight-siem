import React from "react";
import { ArrowLeft, CheckCircle2, HelpCircle, Save, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SeverityBadge from "../components/SeverityBadge.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../services/api.js";
import { formatTimestamp, titleize } from "../utils/format.js";

const statuses = [
  "new",
  "investigating",
  "closed_true_positive",
  "closed_false_positive",
];

const investigationQuestions = [
  "Is the user expected to perform this action at this time?",
  "Is the source IP known, trusted, or associated with VPN infrastructure?",
  "What activity happened immediately before and after the event?",
  "Does the event line up with a business request, maintenance window, or approved scanner?",
  "Should the account, host, or file permission be reviewed before closing the alert?",
];

export default function AlertDetails() {
  const { alertId } = useParams();
  const [details, setDetails] = useState(null);
  const [status, setStatus] = useState("new");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api
      .alertDetails(alertId)
      .then((result) => {
        setDetails(result);
        setStatus(result.alert.status);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [alertId]);

  async function saveStatus() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await api.updateAlertStatus(alertId, status);
      setDetails((current) => ({ ...current, alert: result.alert }));
      setMessage("Alert status updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <EmptyState title="Loading alert" description="Retrieving alert evidence and event details." />;
  }

  if (!details || error) {
    return <EmptyState title="Alert unavailable" description={error || "Alert not found."} />;
  }

  const { alert, event, rule } = details;
  const eventRows = [
    ["Timestamp", formatTimestamp(event?.timestamp)],
    ["Event ID", event?.event_id],
    ["User", event?.user],
    ["Source IP", event?.src_ip],
    ["Destination IP", event?.dst_ip],
    ["Action", event?.action],
    ["Status", event?.status],
    ["File", event?.file || "Not applicable"],
    ["Role", event?.role],
    ["User agent", event?.user_agent],
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Investigation"
        title={alert.alert_id}
        description="Review why the alert fired, inspect the original event, and update the investigation workflow status."
        action={
          <Link
            to="/alerts"
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to alerts
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_0.82fr]">
        <section className="panel p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <SeverityBadge severity={alert.severity} />
                <StatusBadge status={alert.status} />
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-slate-950">{alert.rule_name}</h2>
              <p className="mt-2 text-sm font-medium text-slate-500">
                {alert.rule_id} matched event {alert.event_id}
              </p>
            </div>
            <ShieldAlert className="h-10 w-10 text-cyan-700" aria-hidden="true" />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <InfoBlock title="Reason" body={alert.reason} />
            <InfoBlock title="Recommended action" body={alert.recommended_action} />
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-base font-semibold text-slate-950">MITRE mapping</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tactic</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{alert.mitre_tactic}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Technique</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{alert.mitre_technique}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 p-5">
            <h3 className="text-base font-semibold text-slate-950">Status update</h3>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
                {statuses.map((item) => (
                  <option key={item} value={item}>
                    {titleize(item)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={saveStatus}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {saving ? "Saving..." : "Save status"}
              </button>
            </div>
            {message ? (
              <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {message}
              </p>
            ) : null}
          </div>
        </section>

        <div className="space-y-6">
          <section className="panel p-6">
            <h2 className="text-lg font-semibold text-slate-950">Original event details</h2>
            <dl className="mt-5 divide-y divide-slate-100">
              {eventRows.map(([label, value]) => (
                <div key={label} className="grid gap-2 py-3 sm:grid-cols-[140px_1fr]">
                  <dt className="text-sm font-medium text-slate-500">{label}</dt>
                  <dd className="min-w-0 break-words font-mono text-sm text-slate-900">
                    {value || "Not provided"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="panel p-6">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-cyan-700" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-slate-950">Student investigation questions</h2>
            </div>
            <ol className="mt-4 space-y-3">
              {investigationQuestions.map((question, index) => (
                <li key={question} className="flex gap-3 text-sm leading-6 text-slate-700">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-cyan-50 text-xs font-semibold text-cyan-800">
                    {index + 1}
                  </span>
                  <span>{question}</span>
                </li>
              ))}
            </ol>
          </section>

          {rule ? (
            <section className="panel p-6">
              <h2 className="text-lg font-semibold text-slate-950">Matched rule condition</h2>
              <pre className="mt-4 overflow-x-auto rounded-lg bg-ink-950 p-4 text-sm text-cyan-100">
                {rule.condition}
              </pre>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ title, body }) {
  return (
    <div className="rounded-lg border border-slate-200 p-5">
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}
