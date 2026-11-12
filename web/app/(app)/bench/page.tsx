import type { Metadata } from "next";
import { ErrorState } from "@/components/app/ErrorState";
import { Markdown } from "@/components/app/Markdown";
import { api, fetched } from "@/lib/api";

export const metadata: Metadata = { title: "Benchmark" };

export default async function BenchPage() {
  const res = await fetched(api.benchReport());
  return (
    <>
      {res.ok && res.data.markdown.trim() ? (
        <Markdown source={res.data.markdown} />
      ) : (
        <>
          <h1>Benchmark</h1>
          {res.ok ? (
            <p className="muted">
              No benchmark report yet. Run <code>make bench</code> to generate one, then reload.
            </p>
          ) : (
            <ErrorState {...res} />
          )}
        </>
      )}
    </>
  );
}
