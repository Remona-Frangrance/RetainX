import { PageHeader } from "@/components/ui";
import { AssistantClient } from "./AssistantClient";

export default function AssistantPage() {
  return (
    <>
      <PageHeader eyebrow="Conversational analytics" title="AI Business Assistant" subtitle="Ask natural-language questions — every answer is generated from live tool calls against the model and data" />
      <AssistantClient />
    </>
  );
}
