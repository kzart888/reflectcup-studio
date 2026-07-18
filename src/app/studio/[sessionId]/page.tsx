import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioShell } from "@/components/editor/StudioShell";

export const metadata: Metadata = { title: "Design studio" };

export default async function StudioSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(sessionId)) notFound();
  return <StudioShell requestedSessionId={sessionId} />;
}
