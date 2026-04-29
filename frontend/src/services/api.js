const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const TOKEN_KEY = "logsight_token";

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = localStorage.getItem(TOKEN_KEY);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof body === "string" ? body : body.detail || "Request failed";
    throw new Error(message);
  }

  return body;
}

export const api = {
  health: () => request("/api/health"),
  login: (username, password) =>
    request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  me: () => request("/api/auth/me"),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  rules: () => request("/api/rules"),
  uploadLogs: (file, mapping = null) => {
    const formData = new FormData();
    formData.append("file", file);
    if (mapping) {
      formData.append("mapping", JSON.stringify(mapping));
    }
    return request("/api/upload", {
      method: "POST",
      body: formData,
    });
  },
  previewRemoteCsv: (url) =>
    request("/api/preview-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }),
  importRemoteCsv: (url, mapping = null) =>
    request("/api/import-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, mapping }),
    }),
  analyzeUpload: (uploadId) => request(`/api/analyze/${uploadId}`, { method: "POST" }),
  dashboard: () => request("/api/dashboard"),
  alerts: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.status) params.set("status", filters.status);
    const query = params.toString() ? `?${params.toString()}` : "";
    return request(`/api/alerts${query}`);
  },
  alertDetails: (alertId) => request(`/api/alerts/${alertId}`),
  updateAlertStatus: (alertId, status) =>
    request(`/api/alerts/${alertId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }),
};
