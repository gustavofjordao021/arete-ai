#!/usr/bin/env node
/**
 * Migrate identity.json from v1 to v2 format
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const identityFile = path.join(process.env.HOME, ".arete", "identity.json");

if (!fs.existsSync(identityFile)) {
  console.error("No identity file found at:", identityFile);
  process.exit(1);
}

const v1 = JSON.parse(fs.readFileSync(identityFile, "utf-8"));

// Check if already v2
if (v1.version === "2.0.0") {
  console.log("Identity is already v2 format. No migration needed.");
  process.exit(0);
}

// Generate facts from v1 data
const facts = [];
const now = new Date().toISOString();

function addFact(category, content, source = "manual") {
  facts.push({
    id: crypto.randomUUID(),
    category,
    content,
    confidence: 0.9,
    lastValidated: now,
    validationCount: 1,
    maturity: "established",
    source,
    createdAt: now,
    updatedAt: now
  });
}

// Core info
if (v1.core && v1.core.role) addFact("core", v1.core.role);
if (v1.core && v1.core.background) addFact("core", v1.core.background);

// Expertise
if (v1.expertise && Array.isArray(v1.expertise)) {
  for (const exp of v1.expertise) {
    addFact("expertise", exp);
  }
}

// Context as expertise (avoid duplicates)
if (v1.context && v1.context.professional && Array.isArray(v1.context.professional)) {
  for (const context of v1.context.professional) {
    const alreadyInExpertise = v1.expertise && v1.expertise.includes(context);
    if (alreadyInExpertise === false) {
      addFact("expertise", context);
    }
  }
}

// Goals
if (v1.currentFocus && v1.currentFocus.goals && Array.isArray(v1.currentFocus.goals)) {
  for (const goal of v1.currentFocus.goals) {
    addFact("goal", goal);
  }
}

// Projects
if (v1.currentFocus && v1.currentFocus.projects && Array.isArray(v1.currentFocus.projects)) {
  for (const project of v1.currentFocus.projects) {
    addFact("project", project);
  }
}

// Build v2 identity
const v2 = {
  version: "2.0.0",
  deviceId: (v1.meta && v1.meta.deviceId) || "migrated",
  userId: null,
  facts,
  core: {
    name: (v1.core && v1.core.name) || null,
    role: (v1.core && v1.core.role) || null
  },
  settings: {
    decayHalfLifeDays: 60,
    autoInfer: false,
    excludedDomains: []
  }
};

// Backup v1
const backupFile = identityFile + ".v1.backup";
fs.writeFileSync(backupFile, JSON.stringify(v1, null, 2));
console.log("Backup saved to:", backupFile);

// Write v2
fs.writeFileSync(identityFile, JSON.stringify(v2, null, 2));
console.log("Migration complete!");
console.log("Facts created:", facts.length);
console.log("\nFacts:");
for (const f of facts) {
  console.log(" -", f.category + ":", f.content);
}
