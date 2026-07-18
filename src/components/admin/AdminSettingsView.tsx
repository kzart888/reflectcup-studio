"use client";

import { Save, Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { adminCopy } from "@/i18n/admin";
import { adminRequest, readableAdminError } from "./admin-api";
import { useAdmin } from "./AdminContext";
import { ErrorState, formatDate, LoadingPanel } from "./AdminDashboard";
import styles from "./admin.module.css";

type SettingsMap = {
  "preview.toneMappingExposure": number;
  "preview.mobileDprCap": number;
  "preview.desktopDprCap": number;
  "preview.keyLightMultiplier": number;
};

type SettingsResponse = { settings: SettingsMap; updatedAt: Partial<Record<keyof SettingsMap, string>> };

const fields: Array<{
  key: keyof SettingsMap;
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: "preview.toneMappingExposure", label: "色调映射曝光", help: "调整整个 3D 预览明暗，不改变生产图。", min: 0.6, max: 1.8, step: 0.01 },
  { key: "preview.keyLightMultiplier", label: "主光强度倍率", help: "调整中性棚拍场景的主光，1.00 为标定默认。", min: 0.5, max: 1.5, step: 0.01 },
  { key: "preview.mobileDprCap", label: "移动端清晰度上限", help: "1.0–1.5；数值越高越清晰，也更耗电。", min: 1, max: 1.5, step: 0.05 },
  { key: "preview.desktopDprCap", label: "桌面端清晰度上限", help: "1.0–2.0；仅限制像素密度，不改变光学算法。", min: 1, max: 2, step: 0.05 }
];

export function AdminSettingsView() {
  const { user } = useAdmin();
  const editable = user.role === "owner";
  const [response, setResponse] = useState<SettingsResponse>();
  const [values, setValues] = useState<SettingsMap>();
  const [error, setError] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const data = await adminRequest<SettingsResponse>("/api/v1/admin/settings", { cache: "no-store" });
      setResponse(data);
      setValues(data.settings);
    } catch (requestError) {
      setError(readableAdminError(requestError));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const latestUpdate = useMemo(() => Object.values(response?.updatedAt ?? {}).sort().at(-1), [response]);

  async function save() {
    if (!values) return;
    setSaving(true);
    setFeedback(undefined);
    try {
      await adminRequest<{ updated: string[] }>("/api/v1/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ settings: values })
      });
      setFeedback("预览参数已保存，新打开或重新载入的定制页面会使用这些值。");
      await load();
    } catch (requestError) {
      setFeedback(readableAdminError(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className={styles.pageHeader}>
        <div><h1>{adminCopy.settings}</h1><p>调整真实生效的 3D 预览质量参数；光学尺寸与生产分辨率由 profile 和版本化代码固定。</p></div>
        {editable ? <button className={styles.primaryButton} type="button" disabled={saving || !values} onClick={() => void save()}><Save size={17} />{saving ? adminCopy.saving : adminCopy.save}</button> : null}
      </header>
      {latestUpdate ? <p className={styles.muted}>最近更新：{formatDate(latestUpdate)}</p> : null}
      {feedback ? <div className={styles.infoNotice} role="status"><Settings2 size={18} /><span>{feedback}</span></div> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : !values ? <LoadingPanel /> : (
        <section className={styles.panel}>
          <div className={styles.panelBody}>
            <div className={styles.formGrid}>
              {fields.map((field) => (
                <label className={styles.field} key={field.key}>
                  <span>{field.label}</span>
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    disabled={!editable}
                    value={values[field.key]}
                    onChange={(event) => setValues((current) => current ? { ...current, [field.key]: Number(event.target.value) } : current)}
                  />
                  <small>{field.help}</small>
                </label>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
