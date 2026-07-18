import { and, desc, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { opticalProfiles } from "@/db/schema";

export async function findPublishedProfile(id?: string) {
  if (id) {
    return getDatabase().query.opticalProfiles.findFirst({
      where: and(eq(opticalProfiles.id, id), eq(opticalProfiles.status, "published"))
    });
  }
  return getDatabase().query.opticalProfiles.findFirst({
    where: eq(opticalProfiles.status, "published"),
    orderBy: [desc(opticalProfiles.publishedAt), desc(opticalProfiles.createdAt)]
  });
}

export async function findProfile(id: string) {
  return getDatabase().query.opticalProfiles.findFirst({ where: eq(opticalProfiles.id, id) });
}

export async function listProfiles() {
  return getDatabase().query.opticalProfiles.findMany({
    orderBy: [desc(opticalProfiles.createdAt)]
  });
}
