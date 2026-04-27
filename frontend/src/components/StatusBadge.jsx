import React from "react";
import { titleize } from "../utils/format.js";

export default function StatusBadge({ status }) {
  const value = status || "new";
  const classes = {
    new: "bg-blue-100 text-blue-800 ring-blue-200",
    investigating: "bg-amber-100 text-amber-800 ring-amber-200",
    closed_true_positive: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    closed_false_positive: "bg-slate-100 text-slate-700 ring-slate-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ${
        classes[value] || classes.new
      }`}
    >
      {titleize(value)}
    </span>
  );
}
