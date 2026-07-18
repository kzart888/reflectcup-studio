export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const [{ recoverProductionJobs }, { processStorageDeletionOutbox }] = await Promise.all([
    import("@/domains/artifacts/render-service"),
    import("@/storage/deletion-outbox")
  ]);
  void recoverProductionJobs().catch((error: unknown) => {
    console.error("ReflectCup production-job recovery failed", error);
  });
  void processStorageDeletionOutbox({ limit: 100 }).catch((error: unknown) => {
    console.error("ReflectCup storage-deletion recovery failed", error);
  });
}
