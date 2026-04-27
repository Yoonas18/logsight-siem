const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
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
  rules: () => request("/api/rules"),
  uploadLogs: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return request("/api/upload", {
      method: "POST",
      body: formData,
    });
  },
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
