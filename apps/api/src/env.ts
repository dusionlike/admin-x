import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const envFileCandidates = [
  join(process.cwd(), ".env"),
  fileURLToPath(new URL("../.env", import.meta.url)),
];

const envFile = envFileCandidates.find((candidate) => existsSync(candidate));

if (envFile) {
  loadEnvFile(envFile);
}
