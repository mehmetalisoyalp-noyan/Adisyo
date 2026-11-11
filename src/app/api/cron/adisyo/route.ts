// Gece görevi: tüm etkin Adisyo bağlantılarını eşitler.
// Vercel, CRON_SECRET ortam değişkeni tanımlıysa isteğe "Authorization: Bearer <CRON_SECRET>" ekler.
import { syncAll } from "@/lib/services/adisyoSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Yetkisiz", { status: 401 });
  }
  const results = await syncAll(undefined, 50000);
  return Response.json({ ok: true, results });
}
