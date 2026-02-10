import { mkdir, rm, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const releaseRoot = path.join(projectRoot, "dist", "obsidian-jsonl-index-plugin");

async function run() {
  await rm(releaseRoot, { recursive: true, force: true });
  await mkdir(releaseRoot, { recursive: true });

  await build({
    entryPoints: [path.join(projectRoot, "src", "main.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node18",
    outfile: path.join(releaseRoot, "main.js"),
    external: ["obsidian"]
  });

  await copyFile(
    path.join(projectRoot, "manifest.json"),
    path.join(releaseRoot, "manifest.json")
  );

  console.log(`Built release package at: ${releaseRoot}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
