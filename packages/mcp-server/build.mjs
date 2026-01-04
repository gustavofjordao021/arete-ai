#!/usr/bin/env node
/**
 * Bundle script for arete-mcp-server
 *
 * Creates a single executable bundle that includes:
 * - @arete/core (identity schemas, transforms, storage)
 * - @arete/telemetry (usage tracking)
 * - All MCP server code
 *
 * External dependencies (installed by npm):
 * - @modelcontextprotocol/sdk
 * - zod
 */

import * as esbuild from "esbuild";
import { readFileSync, writeFileSync } from "fs";

async function build() {
  console.log("Building arete-mcp-server bundle...");

  // First, compile TypeScript
  console.log("Step 1: Compiling TypeScript...");
  const { execSync } = await import("child_process");
  execSync("npx tsc", { stdio: "inherit" });

  // Strip shebang from compiled index.js (we'll add it back in banner)
  console.log("Step 2: Stripping shebang from compiled output...");
  let indexJs = readFileSync("dist/index.js", "utf-8");
  if (indexJs.startsWith("#!")) {
    indexJs = indexJs.replace(/^#!.*\n/, "");
    writeFileSync("dist/index.js", indexJs);
  }

  // Then bundle with esbuild
  console.log("Step 3: Bundling with esbuild...");
  await esbuild.build({
    entryPoints: ["dist/index.js"],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    outfile: "dist/bundle.js",
    // Keep these external - they'll be installed as dependencies
    external: [
      "@modelcontextprotocol/sdk",
      "@modelcontextprotocol/sdk/*",
      "zod",
      "dotenv", // CommonJS module, must be external
      "openai", // Has CommonJS internals
    ],
    // Bundle these workspace packages into the output
    // (they're in node_modules due to npm workspaces)
    packages: "bundle",
    // Minify for smaller package size
    minify: false, // Keep readable for debugging
    // Add banner with shebang for CLI execution
    banner: {
      js: "#!/usr/bin/env node",
    },
  });

  // Make executable
  console.log("Step 4: Making bundle executable...");
  execSync("chmod +x dist/bundle.js");

  console.log("Done! Bundle created at dist/bundle.js");
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
