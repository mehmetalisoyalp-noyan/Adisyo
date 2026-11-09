"use server";
// Ayarlar: şirket, şubeler, masalar, kullanıcılar, veri temizleme. Yalnızca patron (OWNER).
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { deleteBranch, resetData, setAreaTableCount } from "@/lib/services/setup";

type Result = { error?: string; ok?: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const fail = (e: unknown): Result => ({ error: e instanceof Error ? e.message : "İşlem yapılamadı" });

// ---------------------------------------------------------------- Şirket

export async function saveCompany(_: Result, f: FormData): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  const name = str(f, "name");
  const taxNumber = str(f, "taxNumber").replace(/\s/g, "");
  if (!name) return { error: "Şirket ünvanı gerekli" };
  if (taxNumber && !/^\d{10,11}$/.test(taxNumber)) return { error: "Vergi numarası 10 (VKN) veya 11 (TCKN) haneli olmalı" };
  await prisma.organization.update({
    where: { id: s.organizationId },
    data: { name, taxNumber: taxNumber || null, taxOffice: str(f, "taxOffice") || null },
  });
  revalidatePath("/ayarlar");
  return { ok: "Şirket bilgileri kaydedildi" };
}

// ---------------------------------------------------------------- Şubeler & masalar

export async function saveBranch(_: Result, f: FormData): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  const id = str(f, "id");
  const name = str(f, "name");
  if (!name) return { error: "Şube adı gerekli" };
  const data = { name, address: str(f, "address") || null, hasDelivery: f.get("hasDelivery") === "on" };
  if (id) await prisma.branch.updateMany({ where: { id, organizationId: s.organizationId }, data });
  else {
    const b = await prisma.branch.create({ data: { ...data, organizationId: s.organizationId } });
    const count = Number(str(f, "tables")) || 0;
    if (count > 0) await prisma.$transaction((tx) => setAreaTableCount(tx, b.id, "Salon", count));
  }
  revalidatePath("/ayarlar/subeler");
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
  revalidatePath("/ayarlar/subeler");
  return { ok: `${area}: ${count} masa` };
}

export async function removeBranch(branchId: string): Promise<Result> {
  const s = await requireSession(["OWNER"]);
  try {
    await deleteBranch(s.organizationId, branchId);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/ayarlar/subeler");
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
