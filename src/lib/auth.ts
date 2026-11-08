import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession, type SessionData } from "./session";

export async function getSession() {
  const c = await cookies();
  return verifySession(c.get(SESSION_COOKIE)?.value);
}

/** Oturum zorunlu; rol kısıtı verilirse yetkisiz kullanıcı satış ekranına yönlendirilir. */
export async function requireSession(roles?: SessionData["role"][]) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (roles && !roles.includes(s.role)) redirect("/pos");
  return s;
}

/** Kullanıcının erişebildiği şube filtresi (Prisma where parçası). */
export function branchScope(s: SessionData) {
  return s.branchId ? { id: s.branchId } : {};
}

export function canAccessBranch(s: SessionData, branchId: string) {
  return !s.branchId || s.branchId === branchId;
}
