import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DB 드라이버는 서버에서 그대로 require (번들링하면 PGlite WASM이 깨진다)
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default nextConfig;
