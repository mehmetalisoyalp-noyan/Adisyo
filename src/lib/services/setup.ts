// Gerçek kullanıma geçiş: örnek veriyi temizleme, şube ve masa düzeni.
import { prisma, type Tx } from "../db";

/** Örnek verideki uydurma vergi numarası */
export const SAMPLE_TAX_NUMBER = "1234567890";
export const SAMPLE_EMAIL_DOMAIN = "@ornek.com";

export interface ResetOptions {
  /** Menü, kategoriler ve reçeteleri de sil */
  menu: boolean;
  /** Stok kalemlerini (hammadde tanımları) de sil */
  stockItems: boolean;
  /** Cari hesapları (tedarikçi ve müşteri kartları) de sil */
  accounts: boolean;
}

/**
 * İşlem verisini siler: satışlar, ödemeler, alışlar, stok miktarları ve hareketleri,
 * cari hareketleri, e-belgeler, eşleştirme hafızası.
 * Şirket bilgileri, şubeler, masalar ve kullanıcılar korunur.
 */
export async function resetData(tx: Tx, organizationId: string, opt: ResetOptions) {
  const org = { organizationId };
  const branchOfOrg = { branch: { organizationId } };
  const counts: Record<string, number> = {};
  counts.eBelge = (await tx.eDocument.deleteMany({ where: org })).count;
  counts.adisyon = (await tx.order.deleteMany({ where: org })).count; // kalemler ve ödemeler zincirleme silinir
  counts.stokHareketi = (await tx.stockMovement.deleteMany({ where: org })).count;
  await tx.stockLevel.deleteMany({ where: branchOfOrg });
  counts.cariHareket = (await tx.ledgerEntry.deleteMany({ where: org })).count;
  counts.alisFaturasi = (await tx.purchaseInvoice.deleteMany({ where: org })).count;
  await tx.supplierItemMapping.deleteMany({ where: org });
  if (opt.accounts) counts.cari = (await tx.account.deleteMany({ where: org })).count;
  if (opt.menu) {
    counts.urun = (await tx.product.deleteMany({ where: org })).count; // reçeteler zincirleme silinir
    await tx.category.deleteMany({ where: org });
  }
  if (opt.stockItems) {
    await tx.recipeLine.deleteMany({ where: { product: org } });
    counts.stokKalemi = (await tx.stockItem.deleteMany({ where: org })).count;
  } else {
    // Hammadde tanımları kalır ama örnek alışlardan gelen maliyetler sıfırlanır
    await tx.stockItem.updateMany({ where: org, data: { lastCost: 0 } });
  }
  return counts;
}

/**
 * Bir şubenin belirli bölümündeki (Salon, Bahçe, Teras…) masa sayısını ayarlar.
 * Masalar "<Bölüm> <no>" biçiminde yeniden adlandırılır. Azaltırken açık adisyonu olan masa silinmez;
 * geçmiş adisyonlar masa bağlantısı kaldırılarak korunur.
 */
export async function setAreaTableCount(tx: Tx, branchId: string, area: string, count: number) {
  area = area.trim();
  if (!area) throw new Error("Bölüm adı boş olamaz");
  if (!Number.isInteger(count) || count < 0 || count > 300) throw new Error("Masa sayısı 0–300 arasında olmalı");
  const tables = await tx.diningTable.findMany({ where: { branchId, area }, orderBy: [{ sort: "asc" }, { name: "asc" }] });
  if (count < tables.length) {
    const remove = tables.slice(count);
    const open = await tx.order.count({ where: { tableId: { in: remove.map((t) => t.id) }, status: "OPEN" } });
    if (open) throw new Error("Silinecek masalardan birinde açık adisyon var. Önce adisyonu kapatın.");
    await tx.order.updateMany({ where: { tableId: { in: remove.map((t) => t.id) } }, data: { tableId: null } });
    await tx.diningTable.deleteMany({ where: { id: { in: remove.map((t) => t.id) } } });
  }
  const maxSort = (await tx.diningTable.aggregate({ where: { branchId }, _max: { sort: true } }))._max.sort ?? 0;
  const kept = tables.slice(0, Math.min(count, tables.length));
  for (const [i, t] of kept.entries()) {
    await tx.diningTable.update({ where: { id: t.id }, data: { name: `${area} ${i + 1}` } });
  }
  for (let i = kept.length; i < count; i++) {
    await tx.diningTable.create({ data: { branchId, area, name: `${area} ${i + 1}`, sort: maxSort + 1 + i } });
  }
}

/** Şube silme: yalnızca satış ve alış kaydı yoksa */
export async function deleteBranch(organizationId: string, branchId: string) {
  const [orders, purchases, users] = await Promise.all([
    prisma.order.count({ where: { branchId } }),
    prisma.purchaseInvoice.count({ where: { branchId } }),
    prisma.user.count({ where: { branchId, active: true } }),
  ]);
  if (orders || purchases)
    throw new Error("Bu şubede satış veya alış kaydı var. Önce örnek veriyi temizleyin ya da şubeyi yeniden adlandırın.");
  if (users) throw new Error("Bu şubeye bağlı aktif kullanıcı var. Önce kullanıcıları başka şubeye alın veya pasif yapın.");
  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({ where: { branchId }, data: { branchId: null } });
    await tx.ledgerEntry.updateMany({ where: { branchId }, data: { branchId: null } });
    await tx.branch.deleteMany({ where: { id: branchId, organizationId } });
  });
}
