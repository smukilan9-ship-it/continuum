import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const webRequire = createRequire(join(repositoryRoot, "apps/web/package.json"));
const runtimeRoot = join(repositoryRoot, "apps/web/public/runtime");

async function copyPackageFiles(packageName, outputDirectory, filenames) {
  const packageRoot = dirname(webRequire.resolve(`${packageName}/package.json`));
  const destination = join(runtimeRoot, outputDirectory);
  await mkdir(destination, { recursive: true });
  await Promise.all(filenames.map((filename) => cp(join(packageRoot, filename), join(destination, filename))));
}

await copyPackageFiles("pyodide", "pyodide", [
  "pyodide.mjs",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "pyodide-lock.json",
  "python_stdlib.zip",
]);

const sqlDistributionRoot = dirname(webRequire.resolve("sql.js"));
await mkdir(runtimeRoot, { recursive: true });
await cp(join(sqlDistributionRoot, "sql-wasm.wasm"), join(runtimeRoot, "sql-wasm.wasm"));

process.stdout.write("Browser runtime assets are ready.\n");
