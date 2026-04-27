import React from "react";

export default function EmptyState({ title, description, action }) {
  return (
    <section className="panel flex flex-col items-center justify-center px-6 py-12 text-center">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      {description ? <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}
