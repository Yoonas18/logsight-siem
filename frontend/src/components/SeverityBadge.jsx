import React from "react";

export default function SeverityBadge({ severity }) {
  const value = severity || "Unknown";
  const classes = {
    High: "bg-red-100 text-red-800 ring-red-200",
    Medium: "bg-amber-100 text-amber-800 ring-amber-200",
    Low: "bg-cyan-100 text-cyan-800 ring-cyan-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ${
        classes[value] || "bg-slate-100 text-slate-700 ring-slate-200"
      }`}
    >
      {value}
    </span>
  );
}
