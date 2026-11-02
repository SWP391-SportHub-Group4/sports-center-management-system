import { KnowledgeWorkspace } from "@/features/ai-knowledge/workspace";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KnowledgeWorkspace key={id} id={id} />;
}
