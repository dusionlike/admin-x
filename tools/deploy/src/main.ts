import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const toolDir = dirname(sourceDir);
const toolsDir = dirname(toolDir);
const rootDir = dirname(toolsDir);
const adminDir = join(rootDir, "apps", "admin");
const apiDir = join(rootDir, "apps", "api");
const outputDir = join(rootDir, ".output");
const serverDir = join(outputDir, "server");
const vpCommand = process.platform === "win32" ? "vp.exe" : "vp";

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with ${signal ?? `code ${code}`}`));
    });
  });
}

await rm(outputDir, { force: true, recursive: true });

console.log("Building admin frontend...");
await run(vpCommand, ["build"], adminDir);

console.log("Building standalone API server...");
await run(vpCommand, ["build", "--mode", "standalone"], apiDir);

await mkdir(serverDir, { recursive: true });
await cp(join(adminDir, "dist"), join(serverDir, "public"), { recursive: true });
await cp(join(apiDir, "dist", "standalone", "main.mjs"), join(serverDir, "main.mjs"));

const deploymentPackage = {
  name: "admin-x-deployment",
  version: "0.1.0",
  private: true,
  type: "module",
  engines: { node: ">=22.18.0" },
  scripts: { start: "node server/main.mjs" },
};

await writeFile(
  join(outputDir, "package.json"),
  `${JSON.stringify(deploymentPackage, null, 2)}\n`,
  "utf8",
);
await writeFile(
  join(outputDir, "README.txt"),
  [
    "Admin X standalone deployment",
    "",
    "Start with: node server/main.mjs",
    "",
    "Copy .env.example to .env and edit the values before starting.",
    "Existing process environment variables take precedence over .env.",
    "",
    "Environment variables:",
    "  PORT=3000",
    "  JWT_SECRET=replace-this-in-production",
    "  FRONTEND_ORIGIN=http://localhost:3000",
    "  # DATABASE_PATH=/absolute/path/to/data/admin-x.sqlite",
    "",
    "On first launch, open the login page and create the initial system administrator account.",
    "",
  ].join("\n"),
  "utf8",
);
await cp(join(rootDir, ".env.example"), join(outputDir, ".env.example"));

console.log(`Standalone deployment package created at ${outputDir}`);
