"use client";

import { Download, ImageOff, LoaderCircle, PackagePlus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { adminCopy, statusLabels } from "@/i18n/admin";
import type { PreviewSessionStatus, RenderJob } from "@/lib/contracts";
import { adminRequest, readableAdminError } from "./admin-api";
import { useAdmin } from "./AdminContext";
import type { AdminSessionRecord, ProductionArtifact } from "./admin-types";
import { ErrorState, formatDate, LoadingPanel, shortId, StatusBadge } from "./AdminDashboard";
import styles from "./admin.module.css";

export function AdminSessionsView() {
  const { user } = useAdmin();
  const [sessions, setSessions] = useState<AdminSessionRecord[]>();
  const [artifacts, setArtifacts] = useState<ProductionArtifact[]>([]);
  const [jobs, setJobs] = useState<Record<string, RenderJob>>({});
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | PreviewSessionStatus>("all");

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [sessionData, artifactData] = await Promise.all([
        adminRequest<{ sessions: AdminSessionRecord[] }>("/api/v1/admin/preview-sessions", { cache: "no-store" }),
        adminRequest<{ artifacts: ProductionArtifact[] }>("/api/v1/admin/production-artifacts", { cache: "no-store" }),
      ]);
      setSessions(sessionData.sessions);
      setArtifacts(artifactData.artifacts);
    } catch (requestError) { setError(readableAdminError(requestError)); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const pending = Object.entries(jobs).filter(([, job]) => job.status === "queued" || job.status === "running");
    if (!pending.length) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void Promise.all(pending.map(async ([sessionId, job]) => {
        const result = await adminRequest<{ job: RenderJob }>(`/api/v1/render-jobs/${job.id}`, { cache: "no-store" });
        return [sessionId, result.job] as const;
      })).then((updates) => {
        if (cancelled) return;
        setJobs((current) => ({ ...current, ...Object.fromEntries(updates) }));
        if (updates.some(([, job]) => job.status === "ready")) void load();
      }).catch((requestError) => {
        if (!cancelled) setActionError(readableAdminError(requestError));
      });
    }, 900);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [jobs, load]);

  const artifactsBySnapshot = useMemo(() => new Map(
    artifacts.map((artifact) => [artifact.snapshotId, artifact] as const),
  ), [artifacts]);

  async function createProductionBundle(session: AdminSessionRecord) {
    if (!session.snapshotId) return;
    setActionError(undefined);
    try {
      const result = await adminRequest<{ job: RenderJob }>("/api/v1/admin/production-artifacts", {
        method: "POST",
        body: JSON.stringify({ snapshotId: session.snapshotId }),
      });
      setJobs((current) => ({ ...current, [session.id]: result.job }));
    } catch (requestError) {
      setActionError(readableAdminError(requestError));
    }
  }

  const filtered = useMemo(() => (sessions ?? []).filter((session) => {
    const matchesStatus = status === "all" || session.status === status;
    const needle = query.trim().toLowerCase();
    return matchesStatus && (!needle || session.id.toLowerCase().includes(needle) || session.opticalProfile.label.toLowerCase().includes(needle));
  }), [query, sessions, status]);

  return (
    <>
      <header className={styles.pageHeader}><div><h1>{adminCopy.sessions}</h1><p>最近更新的 100 条客户定制记录。当前后台接口仅提供安全只读信息。</p></div><button className={styles.secondaryButton} type="button" onClick={() => void load()}>{adminCopy.retry}</button></header>
      <section className={styles.panel}>
        {actionError ? <div className={styles.formError} role="alert">{actionError}</div> : null}
        <div className={styles.panelBody}>
          <div className={styles.toolbar}>
            <label className={styles.searchField}><Search size={18} aria-hidden="true" /><span className={styles.srOnly}>搜索定制记录</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索记录 ID 或模型名称" /></label>
            <select className={styles.select} aria-label="按状态筛选" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="all">全部状态</option>
              {(Object.keys(statusLabels) as Array<keyof typeof statusLabels>).filter((key) => ["draft","confirmed","checkout_pending","paid","production_ready","completed","expired"].includes(key)).map((key) => <option key={key} value={key}>{statusLabels[key]}</option>)}
            </select>
            {sessions ? <span className={styles.inlineStatus}>显示 {filtered.length} / {sessions.length} 条</span> : null}
          </div>
        </div>
        {error ? <ErrorState message={error} onRetry={load} /> : !sessions ? <LoadingPanel /> : filtered.length === 0 ? <div className={styles.emptyState}><ImageOff size={24} /><h2>{adminCopy.noData}</h2><p>没有符合当前筛选条件的定制记录。</p></div> : (
          <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr><th>记录</th><th>{adminCopy.status}</th><th>内容</th><th>光学模型</th><th>场景</th><th>版本</th><th>{adminCopy.updatedAt}</th><th>生产资料</th></tr></thead>
            <tbody>{filtered.map((session) => {
              const artifact = session.snapshotId ? artifactsBySnapshot.get(session.snapshotId) : undefined;
              const job = jobs[session.id];
              const busy = job?.status === "queued" || job?.status === "running";
              return <tr key={session.id}>
              <td><strong className={styles.mono}>{shortId(session.id)}</strong><div className={`${styles.muted} ${styles.mono}`} title={session.id}>{session.id.slice(0, 18)}…</div></td>
              <td><StatusBadge status={session.status} /></td>
              <td>{session.source ? "已上传图片" : "未上传"}<div className={styles.muted}>{session.preview ? "预览已生成" : "暂无服务端预览"}</div></td>
              <td>{session.opticalProfile.label}<div className={styles.muted}>v{session.opticalProfile.version}</div></td>
              <td>{session.sceneId}</td><td>r{session.revision}</td><td>{formatDate(session.updatedAt)}</td>
              <td>
                {artifact?.bundle ? (
                  <a className={styles.secondaryButton} href={artifact.bundle.url}><Download size={15} />下载测试包</a>
                ) : session.snapshotId && user.role !== "viewer" ? (
                  <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => void createProductionBundle(session)}>
                    {busy ? <LoaderCircle className={styles.spinnerSmall} size={15} /> : <PackagePlus size={15} />}
                    {busy ? `${job.progress}%` : "生成测试包"}
                  </button>
                ) : <span className={styles.muted}>{session.snapshotId ? "只读" : "确认后可生成"}</span>}
                {job?.status === "failed" ? <div className={styles.inlineError}>{job.error ?? "生成失败"}</div> : null}
              </td>
            </tr>})}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
