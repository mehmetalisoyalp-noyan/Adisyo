import { PrismaClient } from "@prisma/client";
import { normalizeDbUrl } from "./dburl";

export const createPrisma = () =>
  new PrismaClient({ datasourceUrl: normalizeDbUrl(process.env.DATABASE_URL) });

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/** Prisma Decimal | null → number */
export const num = (v: unknown) => (v == null ? 0 : Number(v));
