import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { SESSION_COOKIE, verifySession, type SessionData } from "./session";

/**
 * Oturum: imzalı çerez + veritabanı kontrolü.
 * Kullanıcı pasif yapılırsa ya da rolü/şubesi değişirse bir sonraki istekte geçerli olur.
 * (İstek başına bir kez sorgulanır.)
 */
export const getSession = cache(async (): Promise<SessionData | null> => {
  const c = await cookies();
  const token = await verifySession(c.get(SESSION_COOKIE)?.value);
  if (!token) return null;
  const user = await prisma.user.findUnique({
    where: { id: token.userId },
    select: { active: true, role: true, branchId: true, organizationId: true, name: true },
  });
  if (!user || !user.active) return null;
  return { userId: token.userId, organizationId: user.organizationId, role: user.role, branchId: user.branchId, name: user.name };
});

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
