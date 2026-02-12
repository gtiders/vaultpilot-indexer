import { mkdir, rm, copyFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const releaseRoot = path.join(projectRoot, "dist", "vaultpilot-indexer");

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

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

  // Copy vaultpilot-indexer-skill folder
  const skillSrcDir = path.join(projectRoot, "vaultpilot-indexer-skill");
  const skillDestDir = path.join(releaseRoot, "vaultpilot-indexer-skill");
  const skillDirExists = await stat(skillSrcDir).then(() => true).catch(() => false);

  if (skillDirExists) {
    await copyDir(skillSrcDir, skillDestDir);
    console.log(`Copied vaultpilot-indexer-skill to: ${skillDestDir}`);
  }

  console.log(`Built release package at: ${releaseRoot}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
