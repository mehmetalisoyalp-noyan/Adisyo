import "server-only";
import { prisma } from "./db";
import type { SessionData } from "./session";

/** Kullanıcının görebildiği şirketler (şubeye bağlı müdür/kasiyer: yalnızca kendi şirketi) */
export async function visibleCompanies(s: SessionData) {
  if (s.branchId) {
    const b = await prisma.branch.findUniqueOrThrow({ where: { id: s.branchId }, include: { company: true } });
    return [b.company];
  }
  return prisma.company.findMany({ where: { organizationId: s.organizationId }, orderBy: { createdAt: "asc" } });
}
