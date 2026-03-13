/**
 * Watch wine_catalog.xlsx and run import_wine_catalog.py on change.
 * Run from wine-advisor: npm run watch:catalog
 */
const path = require("path");
const { spawn } = require("child_process");

const xlsxPath = path.resolve(
  __dirname,
  "..",
  "..",
  "00_docs",
  "docs_md",
  "spec",
  "fastpath",
  "wine_catalog.xlsx"
);

function runImport() {
  const child = spawn("python", ["scripts/import_wine_catalog.py"], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    shell: true,
  });
  child.on("close", (code) => {
    if (code !== 0) console.error("[watch] import exited with code", code);
  });
}

let chokidar;
try {
  chokidar = require("chokidar");
} catch {
  console.error("Missing chokidar. Run: npm install --save-dev chokidar");
  process.exit(1);
}

const watcher = chokidar.watch(xlsxPath, { persistent: true });

watcher.on("change", () => {
  console.log("[watch] xlsx changed, running import...");
  runImport();
});

watcher.on("ready", () => {
  console.log("[watch] watching", xlsxPath);
  console.log("[watch] run import once on start...");
  runImport();
});

watcher.on("error", (err) => console.error("[watch]", err));
