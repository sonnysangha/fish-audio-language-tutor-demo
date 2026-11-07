import type { NextConfig } from "next";
const config: NextConfig = { poweredByHeader: false, devIndicators: false, async headers() { return [{ source: "/(.*)", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Content-Type-Options", value: "nosniff" }, { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" }] }]; } };
export default config;
