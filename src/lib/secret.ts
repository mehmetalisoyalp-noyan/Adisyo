// Veritabanında saklanan API anahtarları için AES-256-GCM şifreleme.
// Anahtar SECRET_KEY (yoksa SESSION_SECRET) ortam değişkeninden türetilir; değişirse kayıtlı anahtarlar yeniden girilmelidir.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key() {
  const base = process.env.SECRET_KEY || process.env.SESSION_SECRET;
  if (!base || base.length < 32) throw new Error("SECRET_KEY / SESSION_SECRET en az 32 karakter olmalı");
  return createHash("sha256").update(`${base}:entegrasyon-anahtarlari`).digest();
}

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decrypt(token: string) {
  const [v, iv, tag, data] = token.split(".");
  if (v !== "v1") throw new Error("Bilinmeyen şifreleme sürümü");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

/** Ekranda gösterim için: yalnızca son 4 karakter */
export const hint = (s: string) => (s.length <= 4 ? "••••" : `••••${s.slice(-4)}`);
