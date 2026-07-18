"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, Download, Images, ScanLine } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { adminCopy, statusLabels } from "@/i18n/admin";
import { adminRequest, readableAdminError } from "./admin-api";
import type { AdminOpticalProfile, AdminSessionRecord, ProductionArtifact } from "./admin-types";
import styles from "./admin.module.css";

type DashboardPayload = {
  sessions: AdminSessionRecord[];
  profiles: AdminOpticalProfile[];
  artifacts: ProductionArtifact[];
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function AdminDashboard() {
  const [data, setData] = useState<DashboardPayload>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [sessions, profiles, artifacts] = await Promise.all([
        adminRequest<{ sessions: AdminSessionRecord[] }>("/api/v1/admin/preview-sessions", { cache: "no-store" }),
        adminRequest<{ profiles: AdminOpticalProfile[] }>("/api/v1/admin/optical-profiles", { cache: "no-store" }),
        adminRequest<{ artifacts: ProductionArtifact[] }>("/api/v1/admin/production-artifacts", { cache: "no-store" }),
      ]);
      setData({ sessions: sessions.sessions, profiles: profiles.profiles, artifacts: artifacts.artifacts });
    } catch (requestError) {
      setError(readableAdminError(requestError));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const metrics = useMemo(() => {
    const sessions = data?.sessions ?? [];
    return {
      total: sessions.length,
      drafts: sessions.filter((session) => session.status === "draft").length,
      confirmed: sessions.filter((session) => session.status === "confirmed").length,
      published: data?.profiles.filter((profile) => profile.status === "published").length ?? 0,
    };
  }, [data]);

  return (
    <>
      <header className={styles.pageHeader}>
        <div><h1>运营概览</h1><p>查看近期定制活动、光学模型状态和生产包记录。</p></div>
      </header>
      <div className={styles.notice}><AlertTriangle size={18} aria-hidden="true" /><span>{adminCopy.digitalOnly}</span></div>
      {error ? <ErrorState message={error} onRetry={load} /> : !data ? <LoadingPanel /> : (
        <>
          <section className={styles.metricGrid} aria-label="关键数据">
            <Metric label="最近 100 条记录" value={metrics.total} detail="按更新时间倒序" icon={<Images size={18} />} />
            <Metric label="编辑中的设计" value={metrics.drafts} detail="尚未由客户确认" icon={<Clock3 size={18} />} />
            <Metric label="已确认设计" value={metrics.confirmed} detail="已生成不可变快照" icon={<CheckCircle2 size={18} />} />
            <Metric label="使用中的模型" value={metrics.published} detail="同一型号仅保留一个" icon={<ScanLine size={18} />} />
          </section>
          <div className={styles.sectionGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><h2>最近更新的定制记录</h2><Link href="/admin/sessions">查看全部</Link></div>
              {data.sessions.length === 0 ? <CompactEmpty text="尚无客户定制记录。" /> : (
                <div className={styles.tableWrap}><table className={styles.table}>
                  <thead><tr><th>记录 ID</th><th>状态</th><th>光学模型</th><th>更新时间</th></tr></thead>
                  <tbody>{data.sessions.slice(0, 6).map((session) => <tr key={session.id}><td className={styles.mono}>{shortId(session.id)}</td><td><StatusBadge status={session.status} /></td><td>{session.opticalProfile.label} · v{session.opticalProfile.version}</td><td>{formatDate(session.updatedAt)}</td></tr>)}</tbody>
                </table></div>
              )}
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><h2>系统状态</h2></div>
              <div className={styles.panelBody}>
                <dl className={styles.cardMeta} style={{ gridTemplateColumns: "1fr" }}>
                  <div><dt>已发布模型</dt><dd>{data.profiles.filter((item) => item.status === "published").map((item) => `${item.label} v${item.version}`).join("、") || "无"}</dd></div>
                  <div><dt>生产包记录</dt><dd>{data.artifacts.length} 个</dd></div>
                  <div><dt>最近生产包</dt><dd>{data.artifacts[0] ? formatDate(data.artifacts[0].createdAt) : "尚未生成"}</dd></div>
                  <div><dt>运行模式</dt><dd>数字光学 MVP · 本地部署</dd></div>
                </dl>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function Metric({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: React.ReactNode }) {
  return <article className={styles.metricCard}><div className={styles.metricTop}><span>{label}</span><span className={styles.metricIcon}>{icon}</span></div><strong className={styles.metricValue}>{value}</strong><span className={styles.metricDetail}>{detail}</span></article>;
}

export function StatusBadge({ status }: { status: keyof typeof statusLabels }) {
  const className = status === "published" || status === "confirmed" || status === "ready" || status === "completed" ? styles.badgeSuccess : status === "failed" || status === "expired" || status === "retired" ? styles.badgeDanger : styles.badgeWarn;
  return <span className={className}><span className={styles.statusDot} />{statusLabels[status]}</span>;
}

export function LoadingPanel() {
  return <div className={styles.emptyState} role="status"><span className={styles.spinner} aria-hidden="true" /><p>{adminCopy.loading}</p></div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void | Promise<void> }) {
  return <div className={styles.errorState} role="alert"><AlertTriangle size={24} /><h2>{adminCopy.loadFailed}</h2><p>{message}</p><button className={styles.secondaryButton} type="button" onClick={() => void onRetry()}>{adminCopy.retry}</button></div>;
}

export function CompactEmpty({ text }: { text: string }) {
  return <div className={styles.emptyState}><Download size={22} /><p>{text}</p></div>;
}

export function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : dateFormatter.format(date);
}

export function shortId(id: string): string { return id.slice(0, 8); }
