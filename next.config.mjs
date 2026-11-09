/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gelen e-fatura XML yüklemeleri için (Vercel üst sınırı ~4,5 MB)
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};
export default nextConfig;
