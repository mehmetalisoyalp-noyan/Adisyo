"use server";
// Aylık kapanış: sayım yükleme, dış satış raporu yükleme, dönem kilitleme
import { revalidatePath } from "next/cache";
import { num, prisma } from "@/lib/db";
import { canAccessBranch, requireSession } from "@/lib/auth";
import { parseCountWorkbook } from "@/lib/countImport";
import { parseSalesWorkbook } from "@/lib/salesImport";
import { parseDailyRevenueWorkbook, summarizeDays } from "@/lib/dailyRevenueImport";
import { key } from "@/lib/menuImport";
import { lockPeriodCosts, periodReport, saveCount } from "@/lib/services/period";

const fail = (e: unknown) => ({ error: e instanceof Error ? e.message : "İşlem yapılamadı" });
/** Gün → Türkiye saatiyle öğlen (fatura tarihleriyle aynı kural) */
const noon = (ymd: string) => new Date(`${ymd}T12:00:00+03:00`);

async function readFile(form: FormData) {
  const f = form.get("file");
  if (!(f instanceof File) || !f.size) throw new Error("Excel dosyası seçin");
  if (f.size > 5_000_000) throw new Error("Dosya 5 MB'tan büyük olamaz");
  return { name: f.name, data: await f.arrayBuffer() };
}

async function countItems(organizationId: string) {
  const items = await prisma.stockItem.findMany({ where: { organizationId } });
  return items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, purchaseUnitFactor: num(i.purchaseUnitFactor) }));
}

// ---------------------------------------------------------------- Sayım

export async function previewCount(form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  try {
    const { data } = await readFile(form);
    const p = await parseCountWorkbook(data, await countItems(s.organizationId));
    const branches = await prisma.branch.findMany({ where: { organizationId: s.organizationId } });
    const guess = p.branchName ? branches.find((b) => key(b.name) === key(p.branchName!)) : undefined;
    return {
      errors: p.errors,
      branchName: p.branchName,
      branchId: guess?.id ?? null,
      date: p.date,
      counted: p.lines.filter((l) => l.quantity > 0).length,
      withCost: p.lines.filter((l) => l.unitCost != null).length,
      blanks: p.blanks,
      unknown: p.unknown,
      lines: p.lines.filter((l) => l.quantity > 0).map((l) => ({ name: l.name, quantity: l.quantity })),
    };
  } catch (e) {
    return {
      errors: [fail(e).error], branchName: null, branchId: null, date: null, counted: 0, withCost: 0,
      blanks: [] as string[], unknown: [] as { row: number; name: string; quantity: string }[], lines: [] as { name: string; quantity: number }[],
    };
  }
}

export async function commitCount(form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  try {
    const branchId = String(form.get("branchId") ?? "");
    const date = String(form.get("date") ?? "");
    if (!branchId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Şube ve sayım tarihi seçin" };
    if (!canAccessBranch(s, branchId)) return { error: "Bu şubeye erişiminiz yok" };
    await prisma.branch.findFirstOrThrow({ where: { id: branchId, organizationId: s.organizationId } });
    const { data, name } = await readFile(form);
    const p = await parseCountWorkbook(data, await countItems(s.organizationId));
    if (p.errors.length) return { error: "Dosyada hata var: " + p.errors.join("; ") };
    const apply = form.get("apply") === "on";
    const c = await prisma.$transaction(
      (tx) => saveCount(tx, s.organizationId, branchId, noon(date), p.lines, apply, name),
      { timeout: 60000 },
    );
    revalidatePath("/kapanis", "layout");
    return { ok: c.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCount(id: string) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const c = await prisma.stockCount.findFirst({ where: { id, organizationId: s.organizationId } });
  if (!c || !canAccessBranch(s, c.branchId)) return { error: "Sayım bulunamadı" };
  await prisma.stockCount.delete({ where: { id } });
  revalidatePath("/kapanis", "layout");
  return { ok: "Sayım silindi" };
}

// ---------------------------------------------------------------- Satış raporu (Adisyo)

export async function previewSales(form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  try {
    const { data, name } = await readFile(form);
    const p = await parseSalesWorkbook(data);
    const [products, aliases] = await Promise.all([
      prisma.product.findMany({ where: { organizationId: s.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.productAlias.findMany({ where: { organizationId: s.organizationId } }),
    ]);
    const byName = new Map(products.map((x) => [key(x.name), x.id]));
    const byAlias = new Map(aliases.map((a) => [a.alias, a.productId]));
    return {
      errors: p.errors,
      fileName: name,
      headers: p.headers,
      products,
      lines: p.lines.map((l) => {
        const k = key(l.name);
        const productId = byAlias.get(k) ?? byName.get(k) ?? null;
        return { ...l, productId, source: byAlias.has(k) ? "hafıza" : byName.has(k) ? "ad" : null };
      }),
    };
  } catch (e) {
    return { errors: [fail(e).error] };
  }
}

export async function commitSales(input: {
  branchId: string;
  month: string;
  fileName: string;
  lines: { name: string; quantity: number; revenue: number; productId: string | null }[];
}) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  try {
    if (!canAccessBranch(s, input.branchId)) return { error: "Bu şubeye erişiminiz yok" };
    await prisma.branch.findFirstOrThrow({ where: { id: input.branchId, organizationId: s.organizationId } });
    const m = input.month.match(/^(\d{4})-(\d{2})$/);
    if (!m) return { error: "Ay seçin" };
    const last = new Date(Number(m[1]), Number(m[2]), 0).getDate();
    const productIds = new Set(
      (await prisma.product.findMany({ where: { organizationId: s.organizationId }, select: { id: true } })).map((p) => p.id),
    );
    await prisma.$transaction(async (tx) => {
      await tx.salesImport.create({
        data: {
          organizationId: s.organizationId,
          branchId: input.branchId,
          periodStart: noon(`${input.month}-01`),
          periodEnd: noon(`${input.month}-${String(last).padStart(2, "0")}`),
          fileName: input.fileName,
          lines: {
            create: input.lines.map((l) => ({
              externalName: l.name,
              productId: l.productId && productIds.has(l.productId) ? l.productId : null,
              quantity: l.quantity,
              revenue: l.revenue,
            })),
          },
        },
      });
      // Eşleştirmeleri hatırla (sonraki aylarda otomatik gelir)
      for (const l of input.lines) {
        if (!l.productId || !productIds.has(l.productId)) continue;
        const alias = key(l.name);
        await tx.productAlias.upsert({
          where: { organizationId_alias: { organizationId: s.organizationId, alias } },
          create: { organizationId: s.organizationId, alias, productId: l.productId },
          update: { productId: l.productId },
        });
      }
    }, { timeout: 60000 });
    revalidatePath("/kapanis", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSalesImport(id: string) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const i = await prisma.salesImport.findFirst({ where: { id, organizationId: s.organizationId } });
  if (!i || !canAccessBranch(s, i.branchId)) return { error: "Kayıt bulunamadı" };
  await prisma.salesImport.delete({ where: { id } });
  revalidatePath("/kapanis", "layout");
  return { ok: "Satış raporu silindi" };
}

// ---------------------------------------------------------------- Dönem kilitleme

export async function lockPeriod(openingId: string, closingId: string) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  try {
    const r = await periodReport(s.organizationId, openingId, closingId);
    if (!canAccessBranch(s, r.branch.id)) return { error: "Bu şubeye erişiminiz yok" };
    await prisma.$transaction(
      (tx) => lockPeriodCosts(tx, s.organizationId, closingId, r.rows.map((x) => ({ stockItemId: x.stockItemId, avgCost: x.avgCost }))),
      { timeout: 60000 },
    );
    revalidatePath("/kapanis", "layout");
    return { ok: "Kapanış sayımındaki maliyetler dönem ortalamasıyla sabitlendi; bir sonraki ayın açılış maliyeti bunlar olacak." };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- Adisyo ürün adı eşleştirme

export async function setProductAlias(name: string, productId: string | null) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const alias = key(name);
  if (!productId) {
    await prisma.productAlias.deleteMany({ where: { organizationId: s.organizationId, alias } });
  } else {
    await prisma.product.findFirstOrThrow({ where: { id: productId, organizationId: s.organizationId } });
    await prisma.productAlias.upsert({
      where: { organizationId_alias: { organizationId: s.organizationId, alias } },
      create: { organizationId: s.organizationId, alias, productId },
      update: { productId },
    });
  }
  revalidatePath("/kapanis", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- Günlük ciro (ödeme türleri)

export async function uploadDailyRevenue(form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  try {
    const branchId = String(form.get("branchId") ?? "");
    if (!branchId) return { error: "Şube seçin" };
    if (!canAccessBranch(s, branchId)) return { error: "Bu şubeye erişiminiz yok" };
    await prisma.branch.findFirstOrThrow({ where: { id: branchId, organizationId: s.organizationId } });
    const { data, name } = await readFile(form);
    const p = await parseDailyRevenueWorkbook(data);
    if (p.errors.length) return { error: p.errors.join("; ") };
    await prisma.$transaction(
      p.days.map((d) =>
        prisma.dailyRevenue.upsert({
          where: { branchId_date: { branchId, date: noon(d.date) } },
          create: { organizationId: s.organizationId, branchId, date: noon(d.date), total: d.total, payments: d.payments, fileName: name },
          update: { total: d.total, payments: d.payments, fileName: name },
        }),
      ),
    );
    revalidatePath("/kapanis", "layout");
    const sum = summarizeDays(p.days);
    return {
      ok: `${p.days.length} gün kaydedildi (${p.days[0].date.split("-").reverse().join(".")} – ${p.days.at(-1)!.date.split("-").reverse().join(".")}). ` +
        `Toplam ${sum.total.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}.`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDailyRevenueMonth(branchId: string, month: string) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  if (!canAccessBranch(s, branchId) || !/^\d{4}-\d{2}$/.test(month)) return { error: "Kayıt bulunamadı" };
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  await prisma.dailyRevenue.deleteMany({
    where: { organizationId: s.organizationId, branchId, date: { gte: noon(`${month}-01`), lte: noon(`${month}-${String(last).padStart(2, "0")}`) } },
  });
  revalidatePath("/kapanis", "layout");
  return { ok: "Ay silindi" };
}
