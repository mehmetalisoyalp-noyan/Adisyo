// Okunan menü & reçete şablonunu veritabanına işler (ada göre ekle / güncelle).
import type { Tx } from "../db";
import { key, type ParsedMenu } from "../menuImport";

export async function applyMenuImport(tx: Tx, organizationId: string, p: ParsedMenu) {
  if (p.errors.length) throw new Error("Dosyada hata var, önce düzeltin");
  const counts = { newItems: 0, updatedItems: 0, newProducts: 0, updatedProducts: 0, newCategories: 0, recipeLines: 0 };

  // ---- Stok kalemleri
  const existingItems = await tx.stockItem.findMany({ where: { organizationId } });
  const itemByKey = new Map(existingItems.map((i) => [key(i.name), i]));
  for (const s of p.stockItems) {
    const ex = itemByKey.get(key(s.name));
    const lastCost = s.price != null ? s.price / s.factor : undefined;
    if (ex) {
      if (ex.unit !== s.unit) {
        throw new Error(
          `'${s.name}' programda ${ex.unit.toLowerCase()} biriminde kayıtlı, dosyada ${s.unit.toLowerCase()}. Temel birim değiştirilemez.`,
        );
      }
      const upd = await tx.stockItem.update({
        where: { id: ex.id },
        data: {
          purchaseUnit: s.purchaseUnit,
          purchaseUnitFactor: s.factor,
          ...(lastCost != null ? { lastCost } : {}),
          ...(s.minLevel != null ? { minLevel: s.minLevel } : {}),
        },
      });
      itemByKey.set(key(s.name), upd);
      counts.updatedItems++;
    } else {
      const created = await tx.stockItem.create({
        data: {
          organizationId,
          name: s.name,
          unit: s.unit,
          purchaseUnit: s.purchaseUnit,
          purchaseUnitFactor: s.factor,
          lastCost: lastCost ?? 0,
          minLevel: s.minLevel ?? 0,
        },
      });
      itemByKey.set(key(s.name), created);
      counts.newItems++;
    }
  }

  // ---- Kategoriler ve ürünler
  const cats = await tx.category.findMany({ where: { organizationId } });
  const catByKey = new Map(cats.map((c) => [key(c.name), c]));
  const existingProducts = await tx.product.findMany({ where: { organizationId } });
  const prodByKey = new Map(existingProducts.map((x) => [key(x.name), x]));
  let sort = existingProducts.length;
  for (const pr of p.products) {
    let cat = catByKey.get(key(pr.category));
    if (!cat) {
      cat = await tx.category.create({ data: { organizationId, name: pr.category, sort: catByKey.size } });
      catByKey.set(key(pr.category), cat);
      counts.newCategories++;
    }
    const ex = prodByKey.get(key(pr.name));
    if (ex) {
      const upd = await tx.product.update({
        where: { id: ex.id },
        data: {
          categoryId: cat.id,
          vatRate: pr.vatRate,
          active: pr.active,
          ...(pr.price != null ? { price: pr.price } : {}),
        },
      });
      prodByKey.set(key(pr.name), upd);
      counts.updatedProducts++;
    } else {
      const created = await tx.product.create({
        data: {
          organizationId,
          categoryId: cat.id,
          name: pr.name,
          price: pr.price ?? 0,
          vatRate: pr.vatRate,
          active: pr.active,
          sort: sort++,
        },
      });
      prodByKey.set(key(pr.name), created);
      counts.newProducts++;
    }
  }

  // ---- Reçeteler: dosyada reçetesi olan ürünlerin reçetesi dosyadakiyle değiştirilir
  const withRecipe = new Set(p.recipe.map((l) => key(l.product)));
  for (const k of withRecipe) {
    const prod = prodByKey.get(k)!;
    await tx.recipeLine.deleteMany({ where: { productId: prod.id } });
  }
  for (const l of p.recipe) {
    await tx.recipeLine.create({
      data: {
        productId: prodByKey.get(key(l.product))!.id,
        stockItemId: itemByKey.get(key(l.item))!.id,
        quantity: l.quantity,
        wastePct: l.wastePct,
      },
    });
    counts.recipeLines++;
  }
  return counts;
}
