import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    // Package-level scripts run the framework-aware type checks. The root
    // checker stays syntax/lint focused so it can cover Vue SFCs and Nest's
    // separate TypeScript projects in one pass.
    options: { typeAware: false, typeCheck: false },
  },
  run: {
    cache: true,
  },
});
