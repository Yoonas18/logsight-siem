import React from "react";
import { CheckCircle2, FileSpreadsheet, Play, UploadCloud } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { api } from "../services/api.js";

const requiredColumns =
  "timestamp,event_id,user,src_ip,dst_ip,action,status,file,role,user_agent";

export default function Upload() {
  const [file, setFile] = useState(null);
  const [upload, setUpload] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpload(event) {
    event.preventDefault();
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }

    setLoading(true);
    setError("");
    setAnalysis(null);
    try {
      const result = await api.uploadLogs(file);
      setUpload(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze() {
    if (!upload?.upload_id) return;

    setLoading(true);
    setError("");
    try {
      const result = await api.analyzeUpload(upload.upload_id);
      setAnalysis(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Log ingestion"
        title="Upload CSV Logs"
        description="Load a CSV file, normalize each row into the SQLite event table, then run the detection rules against the upload."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <section className="panel p-6">
          <form onSubmit={handleUpload} className="space-y-5">
            <div>
              <label className="field-label" htmlFor="log-file">
                CSV log file
              </label>
              <div className="mt-2 flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
                <UploadCloud className="h-10 w-10 text-cyan-700" aria-hidden="true" />
                <input
                  id="log-file"
                  className="mt-5 block w-full max-w-md text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-ink-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-ink-800"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] || null);
                    setUpload(null);
                    setAnalysis(null);
                    setError("");
                  }}
                />
                <p className="mt-3 text-sm text-slate-500">
                  {file ? file.name : "Select a CSV with the LogSight training schema."}
                </p>
              </div>
            </div>

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                {loading ? "Working..." : "Upload and normalize"}
              </button>

              <a
                href="/sample_security_logs.csv"
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Download sample CSV
              </a>
            </div>
          </form>

          {upload ? (
            <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-emerald-900">Upload complete</p>
                  <p className="mt-1 text-sm text-emerald-800">
                    Stored {upload.total_events} normalized events from {upload.filename}.
                  </p>
                  <button
                    type="button"
                    onClick={handleAnalyze}
                    disabled={loading}
                    className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    {loading ? "Analyzing..." : "Analyze upload"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {analysis ? (
            <div className="mt-6 rounded-lg border border-cyan-200 bg-cyan-50 p-4">
              <p className="font-semibold text-cyan-950">Detection complete</p>
              <p className="mt-1 text-sm text-cyan-900">
                Generated {analysis.alerts_generated} alerts for upload #{analysis.upload_id}.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  to="/dashboard"
                  className="rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800"
                >
                  View dashboard
                </Link>
                <Link
                  to="/alerts"
                  className="rounded-md border border-cyan-300 bg-white px-4 py-2 text-sm font-semibold text-cyan-900 transition hover:bg-cyan-100"
                >
                  Review alerts
                </Link>
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-950">Required CSV format</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The backend validates these column names and stores the original row as raw JSON.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-ink-950 p-4 text-sm text-cyan-100">
            {requiredColumns}
          </pre>
          <div className="mt-5 space-y-3 text-sm leading-6 text-slate-600">
            <p>
              Use ISO timestamps such as <span className="font-mono">2026-04-27T22:10:00</span>.
            </p>
            <p>
              Recommended action values include <span className="font-mono">login</span>,{" "}
              <span className="font-mono">file_access</span>,{" "}
              <span className="font-mono">logout</span>, and{" "}
              <span className="font-mono">download</span>.
            </p>
            <p>
              Roles and statuses are normalized to lowercase before rules are evaluated.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
