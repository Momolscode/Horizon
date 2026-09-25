import { TriangleAlert } from "lucide-react";

export function ConfigErrorScreen({ title, problems, hint }: { title: string; problems: string[]; hint?: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <section className="card w-full max-w-lg p-6" role="alert" aria-labelledby="config-error-title">
        <div className="mb-4 flex items-center gap-3 text-danger-ink">
          <TriangleAlert aria-hidden="true" />
          <h1 id="config-error-title" className="text-2xl font-semibold">
            {title}
          </h1>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-ink-2">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        {hint ? <p className="mt-4 text-sm text-ink-3">{hint}</p> : null}
      </section>
    </main>
  );
}
