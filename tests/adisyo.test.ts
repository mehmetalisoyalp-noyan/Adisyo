import { describe, expect, it } from "vitest";
import { headerValue, mapOrder, parseAdisyoDate, toAdisyoDate } from "@/lib/adisyo";
import { decrypt, encrypt, hint } from "@/lib/secret";

describe("Adisyo sipariş dönüştürme", () => {
  const raw = {
    id: 98765,
    orderNumber: "A-12",
    insertDate: "2027-01-15 13:45:10",
    orderTotal: 720,
    discountAmount: 20,
    orderType: "Masa Siparişi",
    salesChannelName: "Adisyo",
    externalAppName: null,
    status: "Kapandı",
    orderCancelReason: null,
    products: [
      { id: 1, quantity: 2, unitPrice: 355, productName: " Klasik Burger ", totalAmount: 710, discountAmount: 10, features: [{ featureName: "Ekstra Cheddar", additionalPrice: 20 }] },
      { id: 2, quantity: 1, unitPrice: 0, productName: "Kola", parentId: 1, totalAmount: 0 },
      { id: 3, quantity: 1, unitPrice: 30, productName: "Su", totalAmount: 30, cancelReason: "Müşteri vazgeçti" },
      { id: 4, quantity: 1, productName: "" },
    ],
    payments: [{ paymentName: "Kredi Kartı", amount: 700 }],
  };

  it("siparişi ve kalemleri programın yapısına çevirir", () => {
    const o = mapOrder(raw)!;
    expect(o).toMatchObject({ externalId: "98765", orderNumber: "A-12", orderType: "Masa Siparişi", channel: "Adisyo", cancelled: false, total: 720, discount: 20 });
    expect(o.orderDate.toISOString()).toBe("2027-01-15T10:45:10.000Z"); // Türkiye saati → UTC
    expect(o.lines).toHaveLength(3); // adı boş kalem atlanır
    expect(o.lines[0]).toMatchObject({ productName: "Klasik Burger", quantity: 2, amount: 700, parentId: null, features: [{ name: "Ekstra Cheddar", price: 20 }] });
    expect(o.lines[1]).toMatchObject({ productName: "Kola", parentId: "1" });
    expect(o.lines[2].cancelled).toBe(true);
    expect(o.payments).toEqual([{ name: "Kredi Kartı", amount: 700 }]);
  });

  it("iptal edilen siparişi işaretler, kimliksiz siparişi atlar", () => {
    expect(mapOrder({ ...raw, orderCancelReason: "Yanlış sipariş" })!.cancelled).toBe(true);
    expect(mapOrder({ ...raw, status: "İptal Edildi" })!.cancelled).toBe(true);
    expect(mapOrder({ ...raw, id: undefined })).toBeNull();
  });

  it("Türkçe karakterli başlık değerini UTF-8 baytlarıyla gönderir", () => {
    const v = headerValue("Örnek Kafe Grubu A.Ş.");
    expect([...v].every((ch) => ch.charCodeAt(0) <= 255)).toBe(true);
    expect(Buffer.from(v, "latin1").toString("utf8")).toBe("Örnek Kafe Grubu A.Ş.");
    expect(() => new Headers({ "x-api-consumer": v })).not.toThrow();
  });

  it("tarih biçimleri", () => {
    expect(toAdisyoDate(new Date("2027-01-01T00:00:00+03:00"))).toBe("2026-12-31 21:00:00");
    expect(parseAdisyoDate("2027-01-15T10:00:00Z")!.toISOString()).toBe("2027-01-15T10:00:00.000Z");
    expect(parseAdisyoDate("bozuk")).toBeNull();
  });
});

describe("anahtar şifreleme", () => {
  it("şifreler, çözer ve kurcalanmış veriyi reddeder", () => {
    process.env.SESSION_SECRET = "test-icin-en-az-otuz-iki-karakterlik-anahtar";
    const t = encrypt("gizli-anahtar-1234");
    expect(t).not.toContain("gizli");
    expect(decrypt(t)).toBe("gizli-anahtar-1234");
    const parts = t.split(".");
    parts[3] = Buffer.from("baska").toString("base64");
    expect(() => decrypt(parts.join("."))).toThrow();
    expect(hint("gizli-anahtar-1234")).toBe("••••1234");
  });
});
