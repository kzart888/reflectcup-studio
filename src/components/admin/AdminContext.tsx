"use client";

import { createContext, useContext } from "react";

import type { AdminUser } from "./admin-types";

export type AdminContextValue = {
  user: AdminUser;
  setUser: (user: AdminUser) => void;
  logout: () => Promise<void>;
};

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used within AdminShell");
  return value;
}
