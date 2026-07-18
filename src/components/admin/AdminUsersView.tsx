"use client";

import { AlertTriangle, Plus, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { adminCopy, roleLabels } from "@/i18n/admin";
import { adminRequest, readableAdminError } from "./admin-api";
import { useAdmin } from "./AdminContext";
import type { AdminRole, AdminUser } from "./admin-types";
import { ErrorState, formatDate, LoadingPanel } from "./AdminDashboard";
import styles from "./admin.module.css";

export function AdminUsersView() {
  const { user: currentUser } = useAdmin();
  const [users, setUsers] = useState<AdminUser[]>();
  const [error, setError] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [form, setForm] = useState({ email: "", password: "", role: "viewer" as AdminRole });

  const load = useCallback(async () => {
    if (currentUser.role !== "owner") return;
    setError(undefined);
    try { setUsers((await adminRequest<{ users: AdminUser[] }>("/api/v1/admin/users", { cache: "no-store" })).users); }
    catch (requestError) { setError(readableAdminError(requestError)); }
  }, [currentUser.role]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (currentUser.role !== "owner") return <div className={styles.errorState}><ShieldCheck size={26} /><h2>仅所有者可访问</h2><p>管理员账号和权限变更只对 owner 角色开放。</p></div>;

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy("create"); setFeedback(undefined);
    try {
      const data = await adminRequest<{ user: AdminUser }>("/api/v1/admin/users", { method: "POST", body: JSON.stringify(form) });
      setUsers((current) => [...(current ?? []), data.user].sort((a, b) => a.email.localeCompare(b.email)));
      setForm({ email: "", password: "", role: "viewer" }); setCreating(false); setFeedback("管理员账号已创建，对方首次登录时必须更换密码。");
    } catch (requestError) { setFeedback(readableAdminError(requestError)); }
    finally { setBusy(undefined); }
  }

  async function patchUser(target: AdminUser, payload: { role?: AdminRole; enabled?: boolean }) {
    const message = payload.role ? `确认将 ${target.email} 的权限改为“${roleLabels[payload.role]}”吗？该账号现有会话将失效。` : `确认${payload.enabled ? "启用" : "停用"} ${target.email} 吗？`;
    if (!window.confirm(message)) return;
    setBusy(target.id); setFeedback(undefined);
    try {
      const data = await adminRequest<{ user: AdminUser }>(`/api/v1/admin/users/${target.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setUsers((current) => current?.map((item) => item.id === target.id ? data.user : item)); setFeedback("管理员账号已更新。");
    } catch (requestError) { setFeedback(readableAdminError(requestError)); }
    finally { setBusy(undefined); }
  }

  return (
    <>
      <header className={styles.pageHeader}><div><h1>{adminCopy.users}</h1><p>分配最小必要权限。角色或启用状态变更会终止目标账号的现有会话。</p></div><button className={styles.primaryButton} type="button" onClick={() => setCreating((value) => !value)}><Plus size={17} />{creating ? "取消新建" : "添加管理员"}</button></header>
      <div className={styles.notice}><AlertTriangle size={18} /><span>owner 可管理所有配置；operator 可维护模型草稿和生产任务；viewer 只能读取业务数据。</span></div>
      {feedback ? <div className={styles.infoNotice} role="status"><ShieldCheck size={18} /><span>{feedback}</span></div> : null}
      {creating ? <form className={`${styles.dataCard} ${styles.userCreate}`} onSubmit={create}><div className={styles.formGrid}><label className={styles.field}><span>{adminCopy.email}</span><input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className={styles.field}><span>初始密码</span><input type="password" autoComplete="new-password" minLength={12} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><small>{adminCopy.passwordHint}</small></label><label className={styles.field}><span>{adminCopy.role}</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AdminRole })}><option value="viewer">{roleLabels.viewer}</option><option value="operator">{roleLabels.operator}</option><option value="owner">{roleLabels.owner}</option></select></label></div><div className={styles.cardActions}><button className={styles.primaryButton} disabled={busy === "create"}>{busy === "create" ? adminCopy.saving : "创建账号"}</button></div></form> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : !users ? <LoadingPanel /> : users.length === 0 ? <div className={styles.emptyState}><UserX size={26} /><h2>暂无管理员</h2></div> : (
        <section className={styles.panel}><div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>账号</th><th>{adminCopy.role}</th><th>{adminCopy.status}</th><th>最后登录</th><th>{adminCopy.actions}</th></tr></thead>
          <tbody>{users.map((user) => { const isSelf = user.id === currentUser.id; return <tr key={user.id}><td><strong>{user.email}</strong>{isSelf ? <div className={styles.muted}>当前账号</div> : null}{user.mustChangePassword ? <div className={styles.muted}>等待首次改密</div> : null}</td><td><select className={styles.select} aria-label={`修改 ${user.email} 的权限`} disabled={isSelf || busy === user.id} value={user.role} onChange={(event) => void patchUser(user, { role: event.target.value as AdminRole })}><option value="viewer">{roleLabels.viewer}</option><option value="operator">{roleLabels.operator}</option><option value="owner">{roleLabels.owner}</option></select></td><td><span className={user.enabled ? styles.badgeSuccess : styles.badgeDanger}><span className={styles.statusDot} />{user.enabled ? "已启用" : "已停用"}</span></td><td>{formatDate(user.lastLoginAt)}</td><td><button className={user.enabled ? styles.dangerButton : styles.secondaryButton} type="button" disabled={isSelf || busy === user.id} onClick={() => void patchUser(user, { enabled: !user.enabled })}>{user.enabled ? <UserX size={16} /> : <UserCheck size={16} />}{user.enabled ? "停用" : "启用"}</button></td></tr>; })}</tbody>
        </table></div></section>
      )}
    </>
  );
}
