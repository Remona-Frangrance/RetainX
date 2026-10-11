import { PageHeader } from "@/components/ui";
import { PredictClient } from "./PredictClient";

export default function PredictPage() {
  return (
    <>
      <PageHeader eyebrow="Scoring" title="Prediction" subtitle="Score a single customer interactively or upload a CSV for batch scoring" />
      <PredictClient />
    </>
  );
}
