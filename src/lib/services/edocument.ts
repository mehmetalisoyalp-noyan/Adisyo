// E-belge (e-fatura / e-arşiv) katmanı.
// Gerçek entegratör (ör. kullandığınız entegratör firma) bu arayüzü uygulayan bir sınıf olarak eklenir;
// programın geri kalanı hangi entegratörün kullanıldığını bilmez.
import { num, type Tx } from "../db";
import { netFromGross, round } from "../costing";

export interface EDocLine {
  name: string;
  quantity: number;
  unitPriceNet: number;
  vatRate: number;
  lineNet: number;
  lineVat: number;
}

export interface EDocPayload {
  type: "E_FATURA" | "E_ARSIV";
  issueDate: string;
  seller: { name: string; taxNumber?: string | null; taxOffice?: string | null };
  buyer: { name: string; taxNumber?: string | null; taxOffice?: string | null; address?: string | null };
  lines: EDocLine[];
  totalNet: number;
  totalVat: number;
  total: number;
}

export interface EDocProvider {
  name: string;
  send(payload: EDocPayload): Promise<{ externalId: string; documentNo: string }>;
}

/** Geliştirme/test sağlayıcısı — belgeyi gerçekten göndermez, başarılı yanıt üretir. */
class MockProvider implements EDocProvider {
  name = "mock";
  async send(payload: EDocPayload) {
    const prefix = payload.type === "E_FATURA" ? "EFT" : "EAR";
    const seq = String(Date.now()).slice(-9);
    return { externalId: crypto.randomUUID(), documentNo: `${prefix}${new Date().getFullYear()}${seq}` };
  }
}

export function getProvider(): EDocProvider {
  switch (process.env.EDOC_PROVIDER ?? "mock") {
    case "mock":
      return new MockProvider();
    default:
      throw new Error(`Tanımsız e-belge sağlayıcısı: ${process.env.EDOC_PROVIDER}`);
  }
}

/**
 * Kapanmış adisyon için e-belge oluşturur.
 * Alıcının vergi numarası varsa e-fatura, yoksa e-arşiv kesilir.
 * (Gerçek entegrasyonda alıcının e-fatura mükellefi olup olmadığı entegratörden sorgulanmalıdır.)
 */
export async function issueForOrder(tx: Tx, organizationId: string, orderId: string) {
  const order = await tx.order.findFirstOrThrow({
    where: { id: orderId, organizationId },
    include: {
      items: { where: { status: "ACTIVE" } },
      customerAccount: true,
      branch: { include: { company: true } },
      eDocuments: { where: { status: { in: ["SENT", "QUEUED"] } } },
    },
  });
  if (order.status !== "PAID") throw new Error("Yalnızca ödenmiş adisyona belge kesilebilir");
  if (order.eDocuments.length) throw new Error("Bu adisyon için zaten belge kesilmiş");

  const buyer = order.customerAccount;
  const type = buyer?.taxNumber ? "E_FATURA" : "E_ARSIV";
  const grossTotal = order.items.reduce((s, i) => s + num(i.unitPrice) * i.quantity, 0);
  const discountRatio = grossTotal > 0 ? num(order.total) / grossTotal : 1;

  const lines: EDocLine[] = order.items.map((i) => {
    const grossLine = num(i.unitPrice) * i.quantity * discountRatio;
    const lineNet = round(netFromGross(grossLine, i.vatRate));
    return {
      name: i.name,
      quantity: i.quantity,
      unitPriceNet: round(lineNet / i.quantity, 4),
      vatRate: i.vatRate,
      lineNet,
      lineVat: round(grossLine - lineNet),
    };
  });
  const totalNet = round(lines.reduce((s, l) => s + l.lineNet, 0));
  const totalVat = round(lines.reduce((s, l) => s + l.lineVat, 0));
  const payload: EDocPayload = {
    type,
    issueDate: new Date().toISOString(),
    // Satıcı: adisyonun kesildiği şubenin bağlı olduğu şirket
    seller: {
      name: order.branch.company.name,
      taxNumber: order.branch.company.taxNumber,
      taxOffice: order.branch.company.taxOffice,
    },
    buyer: buyer
      ? { name: buyer.name, taxNumber: buyer.taxNumber, taxOffice: buyer.taxOffice, address: buyer.address }
      : { name: "Nihai Tüketici", taxNumber: "11111111111" },
    lines,
    totalNet,
    totalVat,
    total: round(totalNet + totalVat),
  };

  const provider = getProvider();
  const doc = await tx.eDocument.create({
    data: {
      organizationId,
      type,
      direction: "OUTGOING",
      status: "QUEUED",
      provider: provider.name,
      orderId,
      payload: payload as object,
    },
  });
  try {
    const res = await provider.send(payload);
    return tx.eDocument.update({
      where: { id: doc.id },
      data: { status: "SENT", externalId: res.externalId, documentNo: res.documentNo },
    });
  } catch (e) {
    return tx.eDocument.update({
      where: { id: doc.id },
      data: { status: "ERROR", error: e instanceof Error ? e.message : String(e) },
    });
  }
}
