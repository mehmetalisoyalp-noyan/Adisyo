"use server";
// Ayarlar: şirket, şubeler, masalar, kullanıcılar, veri temizleme. Yalnızca patron (OWNER).
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { deleteBranch, resetData, setAreaTableCount } from "@/lib/services/setup";
import { decrypt, encrypt, hint } from "@/lib/secret";
import { fetchCompletedOrders } from "@/lib/adisyo";
import { syncBranch } from "@/lib/services/adisyoSync";

type Result = { error?: string; ok?: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const fail = (e: unknown): Result => ({ error: e instanceof Error ? e.message : "İşlem yapılamadı" });

// ---------------------------------------------------------------- Grup & şirketler

export async function saveGroup(_: Result, f: FormData): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  const name = str(f, "name");
  if (!name) return { error: "Grup adı gerekli" };
  await prisma.organization.update({ where: { id: s.organizationId }, data: { name } });
  revalidatePath("/ayarlar");
  return { ok: "Kaydedildi" };
}

function companyData(f: FormData) {
  const name = str(f, "name");
  const taxNumber = str(f, "taxNumber").replace(/\s/g, "");
  if (!name) throw new Error("Ticari ünvan gerekli");
  if (taxNumber && !/^\d{10,11}$/.test(taxNumber)) throw new Error("Vergi numarası 10 (VKN) veya 11 (TCKN) haneli olmalı");
  return { name, taxNumber: taxNumber || null, taxOffice: str(f, "taxOffice") || null, address: str(f, "address") || null };
}

async function assertUniqueTax(organizationId: string, taxNumber: string | null, exceptId?: string) {
  if (!taxNumber) return;
  const other = await prisma.company.findFirst({ where: { organizationId, taxNumber, id: { not: exceptId } } });
  if (other) throw new Error(`Bu vergi numarası zaten "${other.name}" şirketinde kayıtlı`);
}

export async function saveCompany(_: Result, f: FormData): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  try {
    const id = str(f, "id");
    const data = companyData(f);
    await assertUniqueTax(s.organizationId, data.taxNumber, id || undefined);
    await prisma.company.updateMany({ where: { id, organizationId: s.organizationId }, data });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/ayarlar", "layout");
  return { ok: "Şirket bilgileri kaydedildi" };
}

/** Yeni şirket ve ilk şubesi (tek adımda) */
export async function createCompanyWithBranch(_: Result, f: FormData): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  try {
    const data = companyData(f);
    await assertUniqueTax(s.organizationId, data.taxNumber);
    const branchName = str(f, "branchName") || data.name;
    const tables = Number(str(f, "tables")) || 0;
    await prisma.$transaction(async (tx) => {
      const c = await tx.company.create({ data: { ...data, organizationId: s.organizationId } });
      const b = await tx.branch.create({
        data: { organizationId: s.organizationId, companyId: c.id, name: branchName, hasDelivery: f.get("hasDelivery") === "on" },
      });
      if (tables > 0) await setAreaTableCount(tx, b.id, "Salon", tables);
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/ayarlar", "layout");
  return { ok: "Şirket ve şubesi eklendi" };
}

export async function removeCompany(companyId: string): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  const [branches, entries] = await Promise.all([
    prisma.branch.count({ where: { companyId } }),
    prisma.ledgerEntry.count({ where: { companyId } }),
  ]);
  if (branches) return { error: "Önce şirketin şubelerini silin veya başka şirkete taşıyın" };
  if (entries) return { error: "Bu şirketin cari hareketleri var. Önce örnek veriyi temizleyin." };
  await prisma.company.deleteMany({ where: { id: companyId, organizationId: s.organizationId } });
  revalidatePath("/ayarlar", "layout");
  return { ok: "Şirket silindi" };
}

// ---------------------------------------------------------------- Şubeler & masalar

export async function saveBranch(_: Result, f: FormData): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  const id = str(f, "id");
  const name = str(f, "name");
  if (!name) return { error: "Şube adı gerekli" };
  const company = await prisma.company.findFirst({ where: { id: str(f, "companyId"), organizationId: s.organizationId } });
  if (!company) return { error: "Şirket seçin" };
  const data = { name, companyId: company.id, address: str(f, "address") || null, hasDelivery: f.get("hasDelivery") === "on" };
  if (id) {
    const b = await prisma.branch.findFirstOrThrow({ where: { id, organizationId: s.organizationId } });
    // Kayıtları olan şube başka şirkete taşınamaz (muhasebe karışır)
    if (b.companyId !== company.id) {
      const [o, p] = await Promise.all([
        prisma.order.count({ where: { branchId: id } }),
        prisma.purchaseInvoice.count({ where: { branchId: id } }),
      ]);
      if (o || p) return { error: "Satış veya alış kaydı olan şube başka şirkete taşınamaz" };
    }
    await prisma.branch.update({ where: { id }, data });
  } else {
    const b = await prisma.branch.create({ data: { ...data, organizationId: s.organizationId } });
    const count = Number(str(f, "tables")) || 0;
    if (count > 0) await prisma.$transaction((tx) => setAreaTableCount(tx, b.id, "Salon", count));
  }
  revalidatePath("/ayarlar", "layout");
  return { ok: id ? "Şube güncellendi" : "Şube eklendi" };
}

export async function setTables(branchId: string, _: Result, f: FormData): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  await prisma.branch.findFirstOrThrow({ where: { id: branchId, organizationId: s.organizationId } });
  const area = str(f, "area");
  const count = Number(str(f, "count"));
  try {
    await prisma.$transaction((tx) => setAreaTableCount(tx, branchId, area, count), { timeout: 30000 });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/ayarlar", "layout");
  return { ok: `${area}: ${count} masa` };
}

export async function removeBranch(branchId: string): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  try {
    await deleteBranch(s.organizationId, branchId);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/ayarlar", "layout");
  return { ok: "Şube silindi" };
}

// ---------------------------------------------------------------- Kullanıcılar

const roleSchema = z.enum(["OWNER", "MANAGER", "CASHIER"]);

async function checkBranch(organizationId: string, branchId: string | null) {
  if (branchId) await prisma.branch.findFirstOrThrow({ where: { id: branchId, organizationId } });
}

/** Son aktif patronun yetkisinin düşürülmesini veya pasif yapılmasını engeller */
async function ensureAnotherOwner(organizationId: string, userId: string) {
  const others = await prisma.user.count({
    where: { organizationId, role: "OWNER", active: true, id: { not: userId } },
  });
  if (!others) throw new Error("En az bir aktif patron kullanıcısı kalmalı");
}

export async function saveUser(_: Result, f: FormData): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  try {
    const id = str(f, "id");
    const role = roleSchema.parse(f.get("role"));
    const name = str(f, "name");
    const email = str(f, "email").toLowerCase();
    const password = str(f, "password");
    // Patron tüm şubeleri görür; kasiyerin şubesi zorunlu
    const branchId = role === "OWNER" ? null : str(f, "branchId") || null;
    if (!name) return { error: "Ad soyad gerekli" };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Geçerli bir e-posta girin" };
    if (role === "CASHIER" && !branchId) return { error: "Kasiyer için şube seçin" };
    await checkBranch(s.organizationId, branchId);
    const clash = await prisma.user.findUnique({ where: { email } });
    if (clash && clash.id !== id) return { error: "Bu e-posta başka bir kullanıcıda kayıtlı" };

    if (id) {
      const u = await prisma.user.findFirstOrThrow({ where: { id, organizationId: s.organizationId } });
      if (u.role === "OWNER" && role !== "OWNER") await ensureAnotherOwner(s.organizationId, id);
      if (password && password.length < 8) return { error: "Şifre en az 8 karakter olmalı" };
      await prisma.user.update({
        where: { id },
        data: { name, email, role, branchId, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
      });
    } else {
      if (password.length < 8) return { error: "Şifre en az 8 karakter olmalı" };
      await prisma.user.create({
        data: { organizationId: s.organizationId, name, email, role, branchId, passwordHash: await bcrypt.hash(password, 10) },
      });
    }
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/ayarlar/kullanicilar");
  return { ok: "Kullanıcı kaydedildi" };
}

export async function toggleUser(userId: string): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  try {
    if (userId === s.userId) return { error: "Kendi hesabınızı pasif yapamazsınız" };
    const u = await prisma.user.findFirstOrThrow({ where: { id: userId, organizationId: s.organizationId } });
    if (u.active && u.role === "OWNER") await ensureAnotherOwner(s.organizationId, userId);
    await prisma.user.update({ where: { id: userId }, data: { active: !u.active } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/ayarlar/kullanicilar");
  return null;
}

export async function deactivateSampleUsers(): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  const me = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
  if (me.email.endsWith("@ornek.com"))
    return { error: "Şu an örnek hesapla girdiniz. Önce kendi patron hesabınızı oluşturup onunla giriş yapın." };
  const n = await prisma.user.updateMany({
    where: { organizationId: s.organizationId, email: { endsWith: "@ornek.com" } },
    data: { active: false },
  });
  revalidatePath("/ayarlar");
  revalidatePath("/ayarlar/kullanicilar");
  return { ok: `${n.count} örnek kullanıcı pasif yapıldı` };
}

// ---------------------------------------------------------------- Veri temizleme

export async function resetSampleData(_: Result, f: FormData): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  if (str(f, "confirm").toLocaleUpperCase("tr-TR") !== "SİL") return { error: 'Onaylamak için kutuya "SİL" yazın' };
  try {
    const counts = await prisma.$transaction(
      (tx) =>
        resetData(tx, s.organizationId, {
          menu: f.get("menu") === "on",
          stockItems: f.get("stockItems") === "on",
          accounts: f.get("accounts") === "on",
        }),
      { timeout: 60000 },
    );
    revalidatePath("/", "layout");
    return {
      ok: `Temizlendi: ${counts.adisyon} adisyon, ${counts.alisFaturasi} alış faturası, ${counts.cariHareket} cari hareket, ${counts.eBelge} e-belge`,
    };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- Kendi şifresi (tüm roller)

export async function changeOwnPassword(_: Result, f: FormData): Promise<Result> {
  const s = await requireSession();
  const current = String(f.get("current") ?? "");
  const next = String(f.get("next") ?? "");
  if (next.length < 8) return { error: "Yeni şifre en az 8 karakter olmalı" };
  if (next !== String(f.get("repeat") ?? "")) return { error: "Yeni şifreler aynı değil" };
  const u = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
  if (!(await bcrypt.compare(current, u.passwordHash))) return { error: "Mevcut şifre hatalı" };
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  return { ok: "Şifreniz değiştirildi" };
}

// ---------------------------------------------------------------- Adisyo entegrasyonu

export async function saveAdisyoAccount(_: Result, f: FormData): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  const apiKey = str(f, "apiKey");
  const consumer = str(f, "consumer");
  if (!consumer) return { error: "Tüketici adı (x-api-consumer) gerekli" };
  const existing = await prisma.adisyoAccount.findUnique({ where: { organizationId: s.organizationId } });
  if (!apiKey && !existing) return { error: "Entegratör anahtarı (x-api-key) gerekli" };
  await prisma.adisyoAccount.upsert({
    where: { organizationId: s.organizationId },
    create: { organizationId: s.organizationId, apiKeyEnc: encrypt(apiKey), consumer },
    update: { consumer, ...(apiKey ? { apiKeyEnc: encrypt(apiKey) } : {}) },
  });
  revalidatePath("/ayarlar/entegrasyon");
  return { ok: "Kaydedildi" };
}

export async function saveAdisyoConnection(branchId: string, _: Result, f: FormData): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  await prisma.branch.findFirstOrThrow({ where: { id: branchId, organizationId: s.organizationId } });
  const secret = str(f, "secret");
  const start = str(f, "startFrom");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { error: "Başlangıç tarihi seçin" };
  const startFrom = new Date(`${start}T00:00:00+03:00`);
  const active = f.get("active") === "on";
  const existing = await prisma.adisyoConnection.findUnique({ where: { branchId } });
  if (!secret && !existing) return { error: "Şube anahtarı (x-api-secret) gerekli" };
  await prisma.adisyoConnection.upsert({
    where: { branchId },
    create: { branchId, apiSecretEnc: encrypt(secret), secretHint: hint(secret), startFrom, active },
    update: {
      active,
      ...(secret ? { apiSecretEnc: encrypt(secret), secretHint: hint(secret) } : {}),
      // Başlangıç tarihi değiştiyse baştan çek
      ...(existing && existing.startFrom.getTime() !== startFrom.getTime() ? { startFrom, cursor: null } : {}),
    },
  });
  revalidatePath("/ayarlar/entegrasyon");
  return { ok: "Bağlantı kaydedildi" };
}

export async function removeAdisyoConnection(branchId: string): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  await prisma.adisyoConnection.deleteMany({ where: { branchId, branch: { organizationId: s.organizationId } } });
  revalidatePath("/ayarlar/entegrasyon");
  return { ok: "Bağlantı kaldırıldı (alınmış siparişler korunur)" };
}

export async function testAdisyoConnection(branchId: string): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  const conn = await prisma.adisyoConnection.findFirst({ where: { branchId, branch: { organizationId: s.organizationId } } });
  const account = await prisma.adisyoAccount.findUnique({ where: { organizationId: s.organizationId } });
  if (!conn || !account) return { error: "Önce anahtarları kaydedin" };
  try {
    const page = await fetchCompletedOrders(
      { apiKey: decrypt(account.apiKeyEnc), apiSecret: decrypt(conn.apiSecretEnc), consumer: account.consumer },
      new Date(Date.now() - 24 * 3600 * 1000),
      1,
    );
    return { ok: `Bağlantı çalışıyor. Son 24 saatte ${page.totalCount ?? page.orders?.length ?? 0} tamamlanmış sipariş var.` };
  } catch (e) {
    return fail(e);
  }
}

export async function syncAdisyoNow(branchId: string): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  const conn = await prisma.adisyoConnection.findFirst({ where: { branchId, branch: { organizationId: s.organizationId } } });
  if (!conn) return { error: "Bağlantı yok" };
  const r = await syncBranch(conn.id, 50000);
  revalidatePath("/ayarlar/entegrasyon");
  revalidatePath("/kapanis", "layout");
  return r.ok ? { ok: r.message } : { error: r.message };
}
