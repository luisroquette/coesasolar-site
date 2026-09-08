import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // `tsconfig.json` usa `jsx: "preserve"` porque o Next é quem transforma. Fora
  // do Next, o esbuild do vitest então espera um `React` global e os testes de
  // render quebram com "React is not defined". `automatic` usa o runtime novo
  // (`react/jsx-runtime`), que não precisa do import.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
