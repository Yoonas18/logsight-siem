import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  Columns3,
  FileSpreadsheet,
  Link2,
  Play,
  UploadCloud,
} from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../services/api.js";

const REQUIRED_COLUMNS = [
  "timestamp",
  "event_id",
  "user",
  "src_ip",
  "dst_ip",
  "action",
  "status",
  "file",
  "role",
  "user_agent",
];

const COLUMN_HELP = {
  timestamp: "When the event happened",
  event_id: "Unique event identifier",
  user: "Account or actor",
  src_ip: "Source IP address",
  dst_ip: "Destination IP address",
  action: "Event action such as login or file_access",
  status: "Result such as success or failed",
  file: "File, URL, or resource path",
  role: "User role such as admin or user",
  user_agent: "Browser, tool, or client string",
};

const SYNONYMS = {
  timestamp: ["timestamp", "time", "_time", "date", "datetime", "event_time", "created_at"],
  event_id: ["event_id", "eventid", "id", "event_code"],
  user: ["user", "username", "user_name", "account", "src_user", "actor"],
  src_ip: ["src_ip", "source_ip", "client_ip", "remote_addr", "ip", "source", "src"],
  dst_ip: ["dst_ip", "destination_ip", "dest_ip", "server_ip", "destination", "dst"],
  action: ["action", "event", "activity", "operation", "method", "event_type"],
  status: ["status", "result", "outcome", "response", "status_code"],
  file: ["file", "path", "file_path", "url", "uri", "resource", "object"],
  role: ["role", "user_role", "account_type", "privilege"],
  user_agent: ["user_agent", "useragent", "agent", "http_user_agent", "browser"],
};

export default function Upload() {
  const { canIngest, user } = useAuth();
  const [sourceMode, setSourceMode] = useState("file");
  const [file, setFile] = useState(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remotePreview, setRemotePreview] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [upload, setUpload] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");

  const exactFormat = useMemo(() => hasExactFormat(headers), [headers]);
  const mappedCount = useMemo(() => Object.values(compactMapping(mapping)).length, [mapping]);

  async function handleFileChange(event) {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setUpload(null);
    setAnalysis(null);
    setRemotePreview(null);
    setError("");

    if (!selectedFile) {
      setHeaders([]);
      setMapping({});
      return;
    }

    const text = await selectedFile.text();
    const parsedHeaders = parseCsvHeaders(text);
    setHeaders(parsedHeaders);
    setMapping(suggestMapping(parsedHeaders));
  }

  async function handleRemotePreview() {
    if (!remoteUrl.trim()) {
      setError("Paste a public CSV URL first.");
      return;
    }

    setPreviewLoading(true);
    setError("");
    setRemotePreview(null);
    setUpload(null);
    setAnalysis(null);
    try {
      const result = await api.previewRemoteCsv(remoteUrl.trim());
      setRemotePreview(result);
      setHeaders(result.columns || []);
      setMapping({ ...suggestMapping(result.columns || []), ...(result.suggested_mapping || {}) });
    } catch (err) {
      setHeaders([]);
      setMapping({});
      setError(err.message);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    if (!canIngest) {
      setError("Your current role can view the lab but cannot ingest logs.");
      return;
    }

    const mappingToSend = exactFormat ? null : compactMapping(mapping);

    if (sourceMode === "file" && !file) {
      setError("Choose a CSV file first.");
      return;
    }
    if (sourceMode === "url" && !remotePreview) {
      setError("Preview the remote CSV headers before importing.");
      return;
    }

    setLoading(true);
    setError("");
    setAnalysis(null);
    try {
      const result =
        sourceMode === "file"
          ? await api.uploadLogs(file, mappingToSend)
          : await api.importRemoteCsv(remotePreview.url, mappingToSend);
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
        title="Upload and Map CSV Logs"
        description="Import the original LogSight sample CSV or map columns from open-source datasets into the normalized event schema."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <section className="panel p-6">
          {!canIngest ? (
            <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Signed in as {user?.role_label}. This role can view dashboards and alerts, but ingestion is limited to
              admin and analyst users.
            </div>
          ) : null}

          <form onSubmit={handleUpload} className="space-y-5">
            <div>
              <span className="field-label">Source</span>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <SourceButton
                  active={sourceMode === "file"}
                  icon={UploadCloud}
                  title="Local CSV file"
                  description="Upload from your computer"
                  onClick={() => {
                    setSourceMode("file");
                    setError("");
                  }}
                />
                <SourceButton
                  active={sourceMode === "url"}
                  icon={Link2}
                  title="Remote CSV URL"
                  description="GitHub raw/blob or direct CSV link"
                  onClick={() => {
                    setSourceMode("url");
                    setError("");
                  }}
                />
              </div>
            </div>

            {sourceMode === "file" ? (
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
                    onChange={handleFileChange}
                    disabled={!canIngest}
                  />
                  <p className="mt-3 text-sm text-slate-500">
                    {file ? file.name : "Select a LogSight CSV or any CSV you want to map."}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <label className="field-label" htmlFor="remote-url">
                  Public CSV URL
                </label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="remote-url"
                    className="input"
                    value={remoteUrl}
                  onChange={(event) => {
                    setRemoteUrl(event.target.value);
                    setRemotePreview(null);
                    setHeaders([]);
                    setMapping({});
                  }}
                    placeholder="https://raw.githubusercontent.com/owner/repo/main/logs.csv"
                    disabled={!canIngest}
                  />
                  <button
                    type="button"
                    onClick={handleRemotePreview}
                    disabled={previewLoading || !canIngest}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Columns3 className="h-4 w-4" aria-hidden="true" />
                    {previewLoading ? "Previewing..." : "Preview"}
                  </button>
                </div>
                {remotePreview ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Found {headers.length} columns in {remotePreview.filename}.
                  </p>
                ) : null}
              </div>
            )}

            {headers.length > 0 ? (
              <SchemaMapper
                headers={headers}
                mapping={mapping}
                setMapping={setMapping}
                exactFormat={exactFormat}
                mappedCount={mappedCount}
              />
            ) : null}

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={loading || !canIngest}
                className="inline-flex items-center gap-2 rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                {loading ? "Working..." : sourceMode === "file" ? "Upload and normalize" : "Import and normalize"}
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
                  <p className="font-semibold text-emerald-900">Import complete</p>
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
          <h2 className="text-lg font-semibold text-slate-950">Normalized event schema</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Exact LogSight CSVs are accepted immediately. Other CSVs can be imported after mapping their source
            columns into these normalized fields.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-ink-950 p-4 text-sm text-cyan-100">
            {REQUIRED_COLUMNS.join(",")}
          </pre>
          <div className="mt-5 space-y-3 text-sm leading-6 text-slate-600">
            <p>
              GitHub <span className="font-mono">blob</span> links are converted to raw CSV links automatically.
            </p>
            <p>
              Unmapped fields receive safe defaults, but detection quality improves when you map action, status, user,
              source IP, role, file, and user agent fields.
            </p>
            <p>
              For public datasets, first inspect the columns, then map the ones that best represent SIEM event fields.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function SourceButton({ active, icon: Icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg border p-4 text-left transition",
        active ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white hover:bg-slate-50",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <Icon className={active ? "h-5 w-5 text-cyan-700" : "h-5 w-5 text-slate-500"} aria-hidden="true" />
        <div>
          <p className="font-semibold text-slate-950">{title}</p>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>
    </button>
  );
}

function SchemaMapper({ headers, mapping, setMapping, exactFormat, mappedCount }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">CSV schema mapper</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {exactFormat
              ? "This file already matches the LogSight schema."
              : `Mapped ${mappedCount} of ${REQUIRED_COLUMNS.length} normalized fields.`}
          </p>
        </div>
        {exactFormat ? (
          <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
            Exact match
          </span>
        ) : null}
      </div>

      {!exactFormat ? (
        <div className="mt-4 grid gap-3">
          {REQUIRED_COLUMNS.map((target) => (
            <label key={target} className="grid gap-2 md:grid-cols-[190px_1fr] md:items-center">
              <div>
                <p className="font-mono text-sm font-semibold text-slate-900">{target}</p>
                <p className="text-xs text-slate-500">{COLUMN_HELP[target]}</p>
              </div>
              <select
                className="input"
                value={mapping[target] || ""}
                onChange={(event) =>
                  setMapping((current) => ({
                    ...current,
                    [target]: event.target.value,
                  }))
                }
              >
                <option value="">Use default value</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function hasExactFormat(headers) {
  return REQUIRED_COLUMNS.every((column) => headers.includes(column));
}

function compactMapping(mapping) {
  return Object.fromEntries(
    Object.entries(mapping).filter(([target, source]) => REQUIRED_COLUMNS.includes(target) && source)
  );
}

function suggestMapping(headers) {
  const normalized = new Map(headers.map((header) => [simpleName(header), header]));
  return Object.fromEntries(
    REQUIRED_COLUMNS.map((target) => {
      const match = SYNONYMS[target].map(simpleName).find((candidate) => normalized.has(candidate));
      return [target, match ? normalized.get(match) : ""];
    })
  );
}

function simpleName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsvHeaders(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim());
  if (!firstLine) return [];
  return parseCsvLine(firstLine).map((header) => header.trim()).filter(Boolean);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];
    if (character === '"' && inQuotes && nextCharacter === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current);
  return values;
}
