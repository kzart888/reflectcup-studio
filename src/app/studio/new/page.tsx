import type { Metadata } from "next";
import { StudioShell } from "@/components/editor/StudioShell";

export const metadata: Metadata = { title: "New design" };

export default function NewStudioPage() {
  return <StudioShell requestedSessionId="new" />;
}
