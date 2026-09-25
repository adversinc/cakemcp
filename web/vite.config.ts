import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
	plugins: [vue(), tailwindcss()],
	resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
	build: { outDir: "../dist/web", emptyOutDir: true },
	server: { proxy: { "/api": `http://127.0.0.1:${process.env.WEB_UI_PORT || "8081"}`, "/auth": `http://127.0.0.1:${process.env.WEB_UI_PORT || "8081"}` } },
});
