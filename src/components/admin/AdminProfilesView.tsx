"use client";

import { AlertTriangle, ChevronDown, CopyPlus, FileJson2, Save, Send } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { adminCopy } from "@/i18n/admin";
import { adminRequest, readableAdminError } from "./admin-api";
import { hasRole, type AdminOpticalProfile } from "./admin-types";
import { useAdmin } from "./AdminContext";
import { ErrorState, formatDate, LoadingPanel, StatusBadge } from "./AdminDashboard";
import styles from "./admin.module.css";

type ProfileForm = { label: string; profileJson: string };

export function AdminProfilesView() {
  const { user } = useAdmin();
  const canEdit = hasRole(user.role, "operator");
  const [profiles, setProfiles] = useState<AdminOpticalProfile[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [feedback, setFeedback] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const data = await adminRequest<{ profiles: AdminOpticalProfile[] }>("/api/v1/admin/optical-profiles", { cache: "no-store" });
      setProfiles(data.profiles);
    } catch (requestError) {
      setError(readableAdminError(requestError));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function clone(sourceProfileId: string) {
    setBusy(sourceProfileId);
    setFeedback(undefined);
    try {
      const data = await adminRequest<{ profile: AdminOpticalProfile }>("/api/v1/admin/optical-profiles", {
        method: "POST",
        body: JSON.stringify({ sourceProfileId })
      });
      setProfiles((current) => [data.profile, ...(current ?? [])]);
      setFeedback("已复制为新版本草稿；LUT 与遮罩继续引用已验证资产。");
    } catch (requestError) {
      setFeedback(readableAdminError(requestError));
    } finally {
      setBusy(undefined);
    }
  }

  async function mutate(id: string, payload: Record<string, unknown>, success: string): Promise<boolean> {
    setBusy(id);
    setFeedback(undefined);
    try {
      const data = await adminRequest<{ profile: AdminOpticalProfile }>(`/api/v1/admin/optical-profiles/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      setProfiles((current) => current?.map((item) => item.id === id ? data.profile : item));
      if (payload.status === "published") await load();
      setFeedback(success);
      return true;
    } catch (requestError) {
      setFeedback(readableAdminError(requestError));
      return false;
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <>
      <header className={styles.pageHeader}><div><h1>{adminCopy.profiles}</h1><p>版本化管理杯型几何、LUT 与有效区遮罩。发布内容和校验和保持不可变。</p></div></header>
      <div className={styles.notice}><AlertTriangle size={18} /><span>可从已验证版本复制草稿；新的测绘资产先由本机 profile 工具导入。只有所有者可发布或退役。</span></div>
      {feedback ? <div className={styles.infoNotice} role="status"><FileJson2 size={18} /><span>{feedback}</span></div> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : !profiles ? <LoadingPanel /> : profiles.length === 0 ? (
        <div className={styles.emptyState}><FileJson2 size={26} /><h2>尚无光学模型</h2><p>先运行 profile 生成与数据库 seed 工具安装名义模型。</p></div>
      ) : (
        <div className={styles.cardList}>{profiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            role={user.role}
            busy={busy === profile.id}
            onClone={canEdit ? clone : undefined}
            onMutate={mutate}
          />
        ))}</div>
      )}
    </>
  );
}

function ProfileCard({
  profile,
  role,
  busy,
  onClone,
  onMutate
}: {
  profile: AdminOpticalProfile;
  role: "owner" | "operator" | "viewer";
  busy: boolean;
  onClone?: (id: string) => Promise<void>;
  onMutate: (id: string, payload: Record<string, unknown>, success: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const [form, setForm] = useState<ProfileForm>({ label: profile.label, profileJson: JSON.stringify(profile.profile, null, 2) });
  const editable = profile.status === "draft" && hasRole(role, "operator");

  async function save(event: FormEvent) {
    event.preventDefault();
    setLocalError(undefined);
    try {
      const payload = { label: form.label, profile: parseObject(form.profileJson) };
      if (await onMutate(profile.id, payload, "草稿已保存。")) setEditing(false);
    } catch (saveError) {
      setLocalError(readableAdminError(saveError));
    }
  }

  return <article className={styles.dataCard}>
    <div className={styles.dataCardHeader}>
      <div><h2>{profile.label}</h2><p>{profile.slug} · 版本 {profile.version}</p></div>
      <div className={styles.cardActions}>
        <StatusBadge status={profile.status} />
        {onClone && profile.status !== "draft" ? <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => void onClone(profile.id)}><CopyPlus size={17} />复制为草稿</button> : null}
        {editable ? <button className={styles.secondaryButton} type="button" onClick={() => setEditing((value) => !value)}><ChevronDown size={17} />{editing ? "收起" : "编辑草稿"}</button> : null}
        {role === "owner" && profile.status === "draft" ? <button className={styles.primaryButton} type="button" disabled={busy || !profile.lutAssetId || !profile.maskAssetId} onClick={() => { if (window.confirm("发布后该版本将不可修改，并自动退役同型号旧版本。确认发布？")) void onMutate(profile.id, { status: "published" }, "光学模型已发布。"); }}><Send size={17} />发布</button> : null}
        {role === "owner" && profile.status === "published" ? <button className={styles.dangerButton} type="button" disabled={busy} onClick={() => { if (window.confirm("退役仅停止新设计选用，历史快照与校验和保持不变。确认退役？")) void onMutate(profile.id, { status: "retired" }, "光学模型已退役。"); }}>退役</button> : null}
      </div>
    </div>
    <dl className={styles.cardMeta}>
      <div><dt>校验和</dt><dd className={styles.mono} title={profile.checksum}>{profile.checksum.slice(0, 12)}…</dd></div>
      <div><dt>LUT 资产</dt><dd className={styles.mono}>{profile.lutAssetId ? `${profile.lutAssetId.slice(0, 8)}…` : "未配置"}</dd></div>
      <div><dt>遮罩资产</dt><dd className={styles.mono}>{profile.maskAssetId ? `${profile.maskAssetId.slice(0, 8)}…` : "未配置"}</dd></div>
      <div><dt>{adminCopy.updatedAt}</dt><dd>{formatDate(profile.updatedAt)}</dd></div>
    </dl>
    {editing ? <form className={styles.editorPanel} onSubmit={save}>
      <div className={styles.formGrid}>
        <label className={styles.field}><span>显示名称</span><input required maxLength={160} value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></label>
        <label className={`${styles.field} ${styles.fullSpan}`}><span>Profile JSON</span><textarea required spellCheck={false} value={form.profileJson} onChange={(event) => setForm({ ...form, profileJson: event.target.value })} /></label>
      </div>
      {localError ? <p className={styles.formError} role="alert">{localError}</p> : null}
      <div className={styles.cardActions}><button className={styles.primaryButton} disabled={busy}><Save size={17} />{busy ? adminCopy.saving : "保存草稿"}</button><button className={styles.secondaryButton} type="button" onClick={() => setEditing(false)}>{adminCopy.cancel}</button></div>
    </form> : null}
  </article>;
}

function parseObject(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Profile JSON 格式不正确。");
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Profile JSON 必须是对象。");
  return parsed as Record<string, unknown>;
}
