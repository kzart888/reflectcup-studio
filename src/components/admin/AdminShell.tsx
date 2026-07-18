"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CircleGauge,
  KeyRound,
  ListFilter,
  LogOut,
  ScanLine,
  Settings2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";

import { adminCopy, roleLabels } from "@/i18n/admin";
import { adminRequest, readableAdminError } from "./admin-api";
import { AdminContext } from "./AdminContext";
import type { AdminUser } from "./admin-types";
import styles from "./admin.module.css";

type MeResponse = { user: AdminUser };

type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  ownerOnly?: boolean;
};

const navItems: readonly AdminNavItem[] = [
  { href: "/admin", label: adminCopy.dashboard, icon: CircleGauge, exact: true },
  { href: "/admin/sessions", label: adminCopy.sessions, icon: ListFilter },
  { href: "/admin/profiles", label: adminCopy.profiles, icon: ScanLine },
  { href: "/admin/settings", label: adminCopy.settings, icon: Settings2 },
  { href: "/admin/users", label: adminCopy.users, icon: UsersRound, ownerOnly: true },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<"loading" | "anonymous" | "ready" | "error">("loading");
  const [user, setUser] = useState<AdminUser | null>(null);

  const loadMe = useCallback(async () => {
    setState("loading");
    try {
      const data = await adminRequest<MeResponse>("/api/v1/admin/me", { cache: "no-store" });
      setUser(data.user);
      setState("ready");
    } catch (error) {
      if (error instanceof Error && "status" in error && (error as { status: number }).status === 401) {
        setUser(null);
        setState("anonymous");
      } else {
        setState("error");
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMe(), 0);
    const expire = () => {
      setUser(null);
      setState("anonymous");
    };
    window.addEventListener("reflectcup:admin-auth-expired", expire);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("reflectcup:admin-auth-expired", expire);
    };
  }, [loadMe]);

  async function logout() {
    try {
      await adminRequest<{ loggedOut: boolean }>("/api/v1/admin/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      setState("anonymous");
    }
  }

  if (state === "loading") return <AdminLoading />;
  if (state === "error") return <AdminBootError onRetry={loadMe} />;
  if (state === "anonymous" || !user) return <LoginPanel onLogin={(next) => { setUser(next); setState("ready"); }} />;
  if (user.mustChangePassword) {
    return <PasswordChangePanel user={user} onChanged={() => setUser({ ...user, mustChangePassword: false })} onLogout={logout} />;
  }

  return (
    <AdminContext.Provider value={{ user, setUser, logout }}>
      <div className={styles.adminRoot} lang="zh-CN">
        <aside className={styles.sidebar}>
          <Link className={styles.brand} href="/admin" aria-label="ReflectCup Studio 管理后台首页">
            <span className={styles.brandIcon} aria-hidden="true"><Sparkles size={20} /></span>
            <span><strong>{adminCopy.brand}</strong><small>{adminCopy.admin}</small></span>
          </Link>
          <nav className={styles.nav} aria-label="后台导航">
            {navItems.filter((item) => !item.ownerOnly || user.role === "owner").map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link key={item.href} className={active ? styles.navLinkActive : styles.navLink} href={item.href} aria-current={active ? "page" : undefined}>
                  <Icon size={19} aria-hidden="true" /><span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className={styles.accountCard}>
            <div className={styles.accountIcon} aria-hidden="true"><ShieldCheck size={18} /></div>
            <div className={styles.accountText}><strong title={user.email}>{user.email}</strong><span>{roleLabels[user.role]}</span></div>
            <button className={styles.iconButton} type="button" onClick={() => void logout()} aria-label={adminCopy.logout} title={adminCopy.logout}>
              <LogOut size={18} />
            </button>
          </div>
        </aside>
        <div className={styles.mainColumn}>
          <header className={styles.mobileHeader}>
            <Link className={styles.mobileBrand} href="/admin"><Sparkles size={18} /> ReflectCup</Link>
            <div className={styles.mobileAccount}>
              <span>{roleLabels[user.role]}</span>
              <button className={styles.mobileLogout} type="button" onClick={() => void logout()} aria-label={adminCopy.logout} title={adminCopy.logout}><LogOut size={18} /></button>
            </div>
          </header>
          <div className={styles.mobileNavWrap}>
            <nav className={styles.mobileNav} aria-label="移动端后台导航">
              {navItems.filter((item) => !item.ownerOnly || user.role === "owner").map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                return <Link key={item.href} className={active ? styles.mobileNavActive : styles.mobileNavLink} href={item.href}><Icon size={18} /><span>{item.label}</span></Link>;
              })}
            </nav>
          </div>
          <main className={styles.content}>{children}</main>
        </div>
      </div>
    </AdminContext.Provider>
  );
}

function AdminLoading() {
  return <main className={styles.authScreen} lang="zh-CN"><div className={styles.loadingCard}><span className={styles.spinner} aria-hidden="true" /><p>{adminCopy.loading}</p></div></main>;
}

function AdminBootError({ onRetry }: { onRetry: () => void }) {
  return <main className={styles.authScreen} lang="zh-CN"><section className={styles.authCard}><div className={styles.authIcon}><ShieldCheck /></div><h1>{adminCopy.loadFailed}</h1><p>无法确认当前登录状态，请检查本地服务后重试。</p><button className={styles.primaryButton} onClick={onRetry}>{adminCopy.retry}</button></section></main>;
}

function LoginPanel({ onLogin }: { onLogin: (user: AdminUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      const data = await adminRequest<MeResponse>("/api/v1/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onLogin(data.user);
    } catch (requestError) {
      setError(readableAdminError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.authScreen} lang="zh-CN">
      <section className={styles.authCard} aria-labelledby="admin-login-title">
        <div className={styles.authBrand}><span className={styles.brandIcon}><Sparkles size={20} /></span><span><strong>{adminCopy.brand}</strong><small>{adminCopy.admin}</small></span></div>
        <div className={styles.authIntro}><p className={styles.eyebrow}>SECURE ADMIN</p><h1 id="admin-login-title">{adminCopy.loginTitle}</h1><p>{adminCopy.loginBody}</p></div>
        <form className={styles.formStack} onSubmit={submit}>
          <label className={styles.field}><span>{adminCopy.email}</span><input type="email" name="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></label>
          <label className={styles.field}><span>{adminCopy.password}</span><input type="password" name="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error ? <p className={styles.formError} role="alert">{error}</p> : null}
          <button className={styles.primaryButton} type="submit" disabled={submitting}>{submitting ? adminCopy.loggingIn : adminCopy.login}</button>
        </form>
        <p className={styles.securityNote}><ShieldCheck size={16} /> 会话仅在此设备保留 12 小时，所有关键操作均写入审计记录。</p>
      </section>
    </main>
  );
}

function PasswordChangePanel({ user, onChanged, onLogout }: { user: AdminUser; onChanged: () => void; onLogout: () => Promise<void> }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 12) return setError(adminCopy.passwordHint);
    if (newPassword !== confirmation) return setError("两次输入的新密码不一致。");
    setSubmitting(true);
    setError(undefined);
    try {
      await adminRequest<{ changed: boolean }>("/api/v1/admin/me/password", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) });
      onChanged();
    } catch (requestError) {
      setError(readableAdminError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.authScreen} lang="zh-CN">
      <section className={styles.authCard} aria-labelledby="password-change-title">
        <div className={styles.authIcon}><KeyRound size={24} /></div>
        <div className={styles.authIntro}><p className={styles.eyebrow}>FIRST SIGN-IN</p><h1 id="password-change-title">{adminCopy.passwordChangeTitle}</h1><p>{adminCopy.passwordChangeBody}</p><span className={styles.identityPill}>{user.email}</span></div>
        <form className={styles.formStack} onSubmit={submit}>
          <label className={styles.field}><span>{adminCopy.currentPassword}</span><input aria-label={adminCopy.currentPassword} type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label className={styles.field}><span>{adminCopy.newPassword}</span><input aria-label={adminCopy.newPassword} type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><small>{adminCopy.passwordHint}</small></label>
          <label className={styles.field}><span>{adminCopy.confirmPassword}</span><input aria-label={adminCopy.confirmPassword} type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
          {error ? <p className={styles.formError} role="alert">{error}</p> : null}
          <button className={styles.primaryButton} type="submit" disabled={submitting}>{submitting ? "正在更新…" : adminCopy.changePassword}</button>
          <button className={styles.textButton} type="button" onClick={() => void onLogout()}><LogOut size={17} />{adminCopy.logout}</button>
        </form>
      </section>
    </main>
  );
}
