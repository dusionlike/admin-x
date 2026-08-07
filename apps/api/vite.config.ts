import { defineConfig } from "vite-plus";

const external = [
  "@nestjs/common",
  "@nestjs/core",
  "@nestjs/platform-express",
  "class-transformer",
  "class-validator",
  "jsonwebtoken",
  "reflect-metadata",
  "rxjs",
  "rxjs/operators",
];

export default defineConfig(({ mode }) => {
  const standalone = mode === "standalone";

  return {
    build: {
      emptyOutDir: true,
      outDir: standalone ? "dist/standalone" : "dist",
      ssr: "src/main.ts",
      target: "node22",
      rollupOptions: {
        external: standalone ? [] : external,
        output: {
          codeSplitting: false,
          entryFileNames: "main.mjs",
          format: "es",
        },
      },
    },
    ssr: standalone ? { noExternal: true } : undefined,
  };
});
