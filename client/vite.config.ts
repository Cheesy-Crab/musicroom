import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 子路径部署:所有资源带 /music-room/ 前缀(线上由 Caddy 托管)
// 开发环境由 Vite 代理转发到后端,剥前缀行为与线上 Caddy 完全一致
export default defineConfig({
  base: "/music-room/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/music-room/api": {
        target: "http://localhost:3000",
        rewrite: (p) => p.replace(/^\/music-room/, ""),
      },
      "/music-room/socket.io": {
        target: "http://localhost:3000",
        ws: true,
        rewrite: (p) => p.replace(/^\/music-room/, ""),
      },
    },
  },
});
