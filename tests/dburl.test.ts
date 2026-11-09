import { describe, expect, it } from "vitest";
import { normalizeDbUrl } from "@/lib/dburl";

const U = "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

describe("normalizeDbUrl", () => {
  it.each([
    [U],
    [`"${U}"`],
    [`'${U}'`],
    [`  ${U}\n`],
    [`DATABASE_URL=${U}`],
    [`DATABASE_URL="${U}"`],
    [`psql '${U}'`],
  ])("temizler: %s", (raw) => expect(normalizeDbUrl(raw)).toBe(U));
  it("postgres:// önekini de kabul eder", () => {
    expect(normalizeDbUrl('"postgres://a@b/c"')).toBe("postgres://a@b/c");
  });
  it("boş değeri olduğu gibi bırakır", () => expect(normalizeDbUrl(undefined)).toBeUndefined());
});
