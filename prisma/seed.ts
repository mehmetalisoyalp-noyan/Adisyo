// Örnek veri: 3 kafe, örnek menü + reçeteler, tedarikçiler, alış faturaları ve son 7 günün satışları.
// Çalıştırma: npm run db:reset
import { PrismaClient, type BaseUnit } from "@prisma/client";
import bcrypt from "bcryptjs";
import { recordPurchase } from "../src/lib/services/stock";
import { closeOrder, nextOrderNumber, recalcTotal } from "../src/lib/services/orders";

const prisma = new PrismaClient();

// Basit tekrarlanabilir rastgele sayı üreteci (her çalıştırmada aynı veri)
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];

// ad, birim, alış birimi, katsayı, alış fiyatı (KDV hariç, alış birimi başına), KDV, kritik seviye (temel birim)
const STOCK: [string, BaseUnit, string, number, number, number, number][] = [
  ["Dana köfte (hazır)", "GR", "kg", 1000, 650, 1, 5000],
  ["Dana kıyma", "GR", "kg", 1000, 600, 1, 3000],
  ["Tavuk göğüs", "GR", "kg", 1000, 280, 1, 4000],
  ["Hamburger ekmeği", "ADET", "koli (30 adet)", 30, 300, 1, 60],
  ["Cheddar dilim", "ADET", "paket (20 dilim)", 20, 260, 1, 40],
  ["Marul", "GR", "kg", 1000, 80, 1, 1000],
  ["Domates", "GR", "kg", 1000, 45, 1, 2000],
  ["Turşu", "GR", "kg", 1000, 90, 1, 1000],
  ["Burger sos", "ML", "litre", 1000, 220, 10, 1000],
  ["Dondurulmuş patates", "GR", "kg", 1000, 95, 1, 10000],
  ["Kızartma yağı", "ML", "litre", 1000, 90, 1, 5000],
  ["Pizza hamuru", "ADET", "koli (20 adet)", 20, 400, 1, 20],
  ["Mozzarella", "GR", "kg", 1000, 420, 1, 3000],
  ["Domates sos", "GR", "kg", 1000, 110, 1, 3000],
  ["Sucuk", "GR", "kg", 1000, 750, 1, 1000],
  ["Mantar", "GR", "kg", 1000, 140, 1, 1000],
  ["Yeşil biber", "GR", "kg", 1000, 60, 1, 1000],
  ["Makarna (kuru)", "GR", "kg", 1000, 55, 1, 5000],
  ["Krema", "ML", "litre", 1000, 160, 1, 2000],
  ["Parmesan", "GR", "kg", 1000, 900, 1, 500],
  ["Kola 330 ml", "ADET", "koli (24 adet)", 24, 600, 20, 48],
  ["Ayran 300 ml", "ADET", "koli (20 adet)", 20, 240, 1, 40],
  ["Su 500 ml", "ADET", "koli (24 adet)", 24, 96, 1, 48],
  ["Limon", "GR", "kg", 1000, 60, 1, 1000],
  ["Toz şeker", "GR", "kg", 1000, 45, 1, 2000],
  ["Çay", "GR", "kg", 1000, 400, 1, 500],
  ["Türk kahvesi", "GR", "kg", 1000, 1100, 1, 300],
  ["Espresso çekirdeği", "GR", "kg", 1000, 1300, 1, 500],
  ["Süt", "ML", "litre", 1000, 38, 1, 5000],
];

// kategori, ürün, KDV dahil fiyat, KDV, reçete [stok adı, miktar (temel birim), fire %]
const MENU: [string, string, number, number, [string, number, number?][]][] = [
  ["Burgerler", "Hamburger", 280, 10, [["Dana köfte (hazır)", 120], ["Hamburger ekmeği", 1], ["Marul", 20], ["Domates", 30], ["Turşu", 15], ["Burger sos", 20]]],
  ["Burgerler", "Cheeseburger", 310, 10, [["Dana köfte (hazır)", 120], ["Hamburger ekmeği", 1], ["Cheddar dilim", 2], ["Marul", 20], ["Domates", 30], ["Turşu", 15], ["Burger sos", 20]]],
  ["Burgerler", "Tavuk Burger", 250, 10, [["Tavuk göğüs", 150, 10], ["Hamburger ekmeği", 1], ["Marul", 20], ["Domates", 30], ["Burger sos", 20]]],
  ["Pizzalar", "Margarita Pizza", 300, 10, [["Pizza hamuru", 1], ["Domates sos", 80], ["Mozzarella", 150]]],
  ["Pizzalar", "Karışık Pizza", 360, 10, [["Pizza hamuru", 1], ["Domates sos", 80], ["Mozzarella", 130], ["Sucuk", 50], ["Mantar", 40], ["Yeşil biber", 30]]],
  ["Makarnalar", "Spagetti Bolonez", 260, 10, [["Makarna (kuru)", 120], ["Dana kıyma", 80], ["Domates sos", 100], ["Parmesan", 10]]],
  ["Makarnalar", "Penne Arabiata", 230, 10, [["Makarna (kuru)", 120], ["Domates sos", 120], ["Yeşil biber", 20], ["Parmesan", 10]]],
  ["Makarnalar", "Tavuklu Fettuccine Alfredo", 290, 10, [["Makarna (kuru)", 120], ["Krema", 150], ["Mantar", 40], ["Tavuk göğüs", 80, 10], ["Parmesan", 20]]],
  ["Yan Ürünler", "Patates Kızartması", 110, 10, [["Dondurulmuş patates", 200, 10], ["Kızartma yağı", 30]]],
  ["Yan Ürünler", "Büyük Patates Kızartması", 140, 10, [["Dondurulmuş patates", 300, 10], ["Kızartma yağı", 45]]],
  ["İçecekler", "Kola", 60, 10, [["Kola 330 ml", 1]]],
  ["İçecekler", "Ayran", 40, 10, [["Ayran 300 ml", 1]]],
  ["İçecekler", "Su", 20, 10, [["Su 500 ml", 1]]],
  ["İçecekler", "Ev Yapımı Limonata", 80, 10, [["Limon", 80], ["Toz şeker", 30]]],
  ["İçecekler", "Çay", 25, 10, [["Çay", 3], ["Toz şeker", 10]]],
  ["İçecekler", "Türk Kahvesi", 70, 10, [["Türk kahvesi", 7], ["Toz şeker", 5]]],
  ["İçecekler", "Latte", 100, 10, [["Espresso çekirdeği", 18], ["Süt", 200]]],
];

const SUPPLIER_OF = (name: string) =>
  /köfte|kıyma|tavuk|sucuk/i.test(name)
    ? "Et Dünyası Gıda Ltd. Şti."
    : /kola|ayran|su 500/i.test(name)
      ? "İçecek Dağıtım A.Ş."
      : "Toptan Gıda Pazarlama";

async function main() {
  // Tüm veriyi temizle (Organization’a bağlı her tablo CASCADE ile boşalır)
  await prisma.$executeRawUnsafe(`TRUNCATE "Organization" CASCADE`);

  const org = await prisma.organization.create({
    data: { name: "Örnek Kafe Grubu A.Ş.", taxNumber: "1234567890", taxOffice: "Kadıköy", plan: "PRO" },
  });
  const branchDefs = [
    { name: "Kafe Moda", tables: 20, hasDelivery: false },
    { name: "Kafe Bağdat", tables: 15, hasDelivery: false },
    { name: "Kafe Merkez", tables: 40, hasDelivery: true },
  ];
  const branches = [];
  for (const b of branchDefs) {
    const br = await prisma.branch.create({
      data: { organizationId: org.id, name: b.name, hasDelivery: b.hasDelivery },
    });
    await prisma.diningTable.createMany({
      data: Array.from({ length: b.tables }, (_, i) => ({
        branchId: br.id,
        name: `Masa ${i + 1}`,
        area: i < Math.ceil(b.tables * 0.7) ? "Salon" : "Bahçe",
        sort: i,
      })),
    });
    branches.push(br);
  }

  const hash = await bcrypt.hash("123456", 10);
  await prisma.user.createMany({
    data: [
      { organizationId: org.id, name: "Patron", email: "patron@ornek.com", passwordHash: hash, role: "OWNER" },
      ...branches.map((b, i) => ({
        organizationId: org.id,
        branchId: b.id,
        name: `${b.name} Müdürü`,
        email: `mudur${i + 1}@ornek.com`,
        passwordHash: hash,
        role: "MANAGER" as const,
      })),
      ...branches.map((b, i) => ({
        organizationId: org.id,
        branchId: b.id,
        name: `${b.name} Kasa`,
        email: `kasa${i + 1}@ornek.com`,
        passwordHash: hash,
        role: "CASHIER" as const,
      })),
    ],
  });

  const stock = new Map<string, { id: string; price: number; vat: number }>();
  for (const [name, unit, pu, factor, price, vat, min] of STOCK) {
    const s = await prisma.stockItem.create({
      data: { organizationId: org.id, name, unit, purchaseUnit: pu, purchaseUnitFactor: factor, minLevel: min },
    });
    stock.set(name, { id: s.id, price, vat });
  }

  const products: { id: string; name: string; price: number; category: string }[] = [];
  const categories = new Map<string, string>();
  for (const [cat, name, price, vat, recipe] of MENU) {
    if (!categories.has(cat)) {
      const c = await prisma.category.create({
        data: { organizationId: org.id, name: cat, sort: categories.size },
      });
      categories.set(cat, c.id);
    }
    const p = await prisma.product.create({
      data: {
        organizationId: org.id,
        categoryId: categories.get(cat)!,
        name,
        price,
        vatRate: vat,
        sort: products.length,
        recipe: {
          create: recipe.map(([s, q, w]) => ({ stockItemId: stock.get(s)!.id, quantity: q, wastePct: w ?? 0 })),
        },
      },
    });
    products.push({ id: p.id, name, price, category: cat });
  }

  // Cariler
  const suppliers = new Map<string, string>();
  for (const [name, tax] of [
    ["Et Dünyası Gıda Ltd. Şti.", "4560001122"],
    ["Toptan Gıda Pazarlama", "7890003344"],
    ["İçecek Dağıtım A.Ş.", "3210005566"],
  ]) {
    const a = await prisma.account.create({
      data: { organizationId: org.id, type: "SUPPLIER", name, taxNumber: tax, taxOffice: "Ümraniye" },
    });
    suppliers.set(name, a.id);
  }
  const corporate = await prisma.account.create({
    data: {
      organizationId: org.id,
      type: "CUSTOMER",
      name: "ABC Yazılım Ltd. Şti. (Kurumsal)",
      taxNumber: "9998887776",
      taxOffice: "Maslak",
      address: "Maslak, İstanbul",
    },
  });
  await prisma.account.create({
    data: { organizationId: org.id, type: "CUSTOMER", name: "Ahmet Yılmaz (Açık Hesap)", phone: "05550000000" },
  });

  // Alış faturaları: 8 gün önce, her şubeye, tedarikçi bazında
  const start = new Date();
  start.setDate(start.getDate() - 8);
  start.setHours(9, 0, 0, 0);
  let invNo = 1000;
  for (const [bi, br] of branches.entries()) {
    const bySupplier = new Map<string, { stockItemId: string; quantity: number; unitPrice: number; vatRate: number }[]>();
    for (const [name, , , factor] of STOCK) {
      const s = stock.get(name)!;
      // Alım miktarı: ~2 haftalık ihtiyaç (alış birimi cinsinden)
      const qty = factor === 1000 ? (/patates|köfte|tavuk/i.test(name) ? 60 : s.price > 500 ? 4 : 20) : 12;
      // Şubeler arası küçük fiyat farkı — şube bazında maliyet farkını göstermek için
      const price = Math.round(s.price * (1 + bi * 0.04) * 100) / 100;
      const sup = SUPPLIER_OF(name);
      if (!bySupplier.has(sup)) bySupplier.set(sup, []);
      bySupplier.get(sup)!.push({ stockItemId: s.id, quantity: qty, unitPrice: price, vatRate: s.vat });
    }
    for (const [sup, lines] of bySupplier) {
      await recordPurchase(prisma, {
        organizationId: org.id,
        branchId: br.id,
        supplierId: suppliers.get(sup)!,
        invoiceNo: `ALS-${invNo++}`,
        date: start,
        lines,
      });
    }
  }
  // Tedarikçiye kısmi ödeme
  await prisma.ledgerEntry.create({
    data: {
      organizationId: org.id,
      accountId: suppliers.get("Et Dünyası Gıda Ltd. Şti.")!,
      description: "Havale ile ödeme",
      debit: 50000,
      source: "PAYMENT",
    },
  });

  // Son 7 günün satışları
  const weights = products.flatMap((p) =>
    Array(p.category === "İçecekler" ? 3 : p.category === "Burgerler" ? 3 : 2).fill(p),
  ) as typeof products;
  for (const br of branches) {
    const tables = await prisma.diningTable.findMany({ where: { branchId: br.id } });
    for (let d = 7; d >= 1; d--) {
      const ordersToday = 12 + Math.floor(rnd() * 10);
      for (let o = 0; o < ordersToday; o++) {
        const day = new Date();
        day.setDate(day.getDate() - d);
        day.setHours(11 + Math.floor(rnd() * 11), Math.floor(rnd() * 60), 0, 0);
        const delivery = br.hasDelivery && rnd() < 0.3;
        const order = await prisma.order.create({
          data: {
            organizationId: org.id,
            branchId: br.id,
            tableId: delivery ? null : pick(tables).id,
            number: await nextOrderNumber(prisma, br.id),
            type: delivery ? "DELIVERY" : "DINE_IN",
            channel: delivery ? pick(["YEMEKSEPETI", "GETIR", "TRENDYOL"] as const) : "POS",
          },
        });
        const n = 1 + Math.floor(rnd() * 4);
        for (let k = 0; k < n; k++) {
          const p = pick(weights);
          await prisma.orderItem.create({
            data: {
              orderId: order.id,
              productId: p.id,
              name: p.name,
              quantity: 1 + Math.floor(rnd() * 2),
              unitPrice: p.price,
              vatRate: 10,
            },
          });
        }
        const total = await recalcTotal(prisma, order.id);
        const r = rnd();
        const onAccount = !delivery && r < 0.05;
        const method = onAccount ? "ACCOUNT" : r < 0.4 ? "CASH" : "CARD";
        await closeOrder(prisma, order.id, [{ method, amount: total }], onAccount ? corporate.id : null);
        await prisma.order.update({ where: { id: order.id }, data: { openedAt: day, closedAt: new Date(day.getTime() + 45 * 60000) } });
      }
    }
  }
  // Bugün açık birkaç masa
  for (const br of branches) {
    const tables = await prisma.diningTable.findMany({ where: { branchId: br.id }, take: 3 });
    for (const t of tables) {
      const order = await prisma.order.create({
        data: { organizationId: org.id, branchId: br.id, tableId: t.id, number: await nextOrderNumber(prisma, br.id) },
      });
      for (const p of [pick(weights), pick(weights)]) {
        await prisma.orderItem.create({
          data: { orderId: order.id, productId: p.id, name: p.name, quantity: 1, unitPrice: p.price, vatRate: 10 },
        });
      }
      await recalcTotal(prisma, order.id);
    }
  }

  console.log("Örnek veri yüklendi. Giriş: patron@ornek.com / 123456");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
