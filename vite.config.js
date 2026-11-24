// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Long-lived vendor chunks: they change far less often than app code, so returning
// visitors keep them cached across deploys. Order matters (first match wins).
const VENDOR_CHUNKS = [
  ["pdf", /[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:react-pdf|pdfjs-dist)[\\/]/],
  ["markdown", /[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:marked|dompurify|highlight\.js)[\\/]/],
  ["motion", /[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:framer-motion|motion-dom|motion-utils)[\\/]/],
  ["react", /[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:react|react-dom|scheduler|react-router|react-router-dom)[\\/]/],
];

export default defineConfig({
  base: "./", // relative URLs: works on GitHub Pages under any sub-path
  plugins: [react()],
  build: {
    target: "es2022",
    // The pdf.js chunk (lazy, only fetched when a PDF is opened) is legitimately large.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          for (const [name, pattern] of VENDOR_CHUNKS) if (pattern.test(id)) return name;
          return undefined;
        },
      },
    },
  },
  worker: { format: "es" },
  // pdf.js ships its worker as a prebuilt module that is referenced with
  // `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)`; Vite emits it as a
  // hashed asset. Keep it out of dependency pre-bundling so the dev server serves it as-is.
  optimizeDeps: { exclude: ["pdfjs-dist/build/pdf.worker.min.mjs"] },
});
