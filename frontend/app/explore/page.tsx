import type { Metadata } from "next";
import { SAMPLE_RECORDS } from "@/lib/sample-records";
import { ExploreClient } from "./ExploreClient";

export const metadata: Metadata = {
  title: "Explore verified content · StellarVeriphy",
};

export default function Explore() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Explore verified content</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Content submitted to StellarVeriphy, including checks that failed. Open an item to see its provenance
        certificate and full history.
      </p>

      <ExploreClient initialRecords={SAMPLE_RECORDS} />
    </main>
  );
}
