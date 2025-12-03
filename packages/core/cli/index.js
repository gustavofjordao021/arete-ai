#!/usr/bin/env node

/**
 * Arete Core CLI
 *
 * Test the identity schema, extraction, and transforms.
 *
 * Usage:
 *   node cli/index.js transform <model> [identity.json]
 *   node cli/index.js schema
 *   node cli/index.js demo
 */

import { createEmptyIdentity, parseIdentity } from "../dist/schema/index.js";
import { createClaudeTransform, createOpenAITransform, listTransforms } from "../dist/transforms/index.js";
import { readFileSync } from "fs";

const command = process.argv[2];

// Demo identity for testing
const demoIdentity = {
  meta: {
    version: "1.0.0",
    lastModified: new Date().toISOString(),
    deviceId: "cli-demo",
  },
  core: {
    name: "Alex Chen",
    role: "Senior Software Engineer",
    location: "San Francisco, CA",
    background: "10 years in distributed systems, former Google, now at a startup",
  },
  communication: {
    style: ["Direct and concise", "Prefer code examples over lengthy explanations"],
    format: ["Markdown for documentation", "Bullet points for lists"],
    avoid: ["Excessive pleasantries", "Overly verbose responses"],
    voice: "Technical but approachable",
  },
  expertise: [
    "TypeScript/JavaScript",
    "Distributed systems",
    "API design",
    "Performance optimization",
    "React and Node.js",
  ],
  currentFocus: {
    projects: [
      {
        name: "Arete",
        description: "Portable AI identity layer",
        status: "active",
      },
      {
        name: "Migration to microservices",
        description: "Breaking up the monolith at work",
        status: "active",
      },
    ],
    goals: [
      "Ship Arete MVP by end of hackathon",
      "Learn Rust for systems programming",
    ],
  },
  context: {
    personal: [
      "Night owl - most productive after 10pm",
      "Coffee enthusiast",
    ],
    professional: [
      "Leading a team of 5 engineers",
      "Focused on developer experience",
    ],
  },
  privacy: {
    public: [],
    private: [],
    localOnly: [],
  },
  custom: {},
  sources: [
    {
      field: "all",
      source: "user_input",
      confidence: "high",
      timestamp: new Date().toISOString(),
    },
  ],
};

function showHelp() {
  console.log(`
Arete Core CLI

Usage:
  node cli/index.js <command> [options]

Commands:
  demo              Show demo identity transformed for all models
  transform <model> Transform identity for a specific model (claude, openai)
  schema            Show empty identity schema
  help              Show this help message

Examples:
  node cli/index.js demo
  node cli/index.js transform claude
  node cli/index.js transform openai
  node cli/index.js schema
`);
}

function showSchema() {
  const empty = createEmptyIdentity("cli-test");
  console.log("\n=== Empty Identity Schema ===\n");
  console.log(JSON.stringify(empty, null, 2));
}

function showDemo() {
  const identity = parseIdentity(demoIdentity);

  console.log("\n=== Demo Identity ===\n");
  console.log(JSON.stringify(identity, null, 2));

  console.log("\n\n=== Claude Transform ===\n");
  const claudeTransform = createClaudeTransform();
  const claudeResult = claudeTransform.transform(identity);
  console.log(claudeResult.content);
  console.log(`\n[Estimated tokens: ${claudeResult.estimatedTokens}]`);

  console.log("\n\n=== OpenAI Transform ===\n");
  const openaiTransform = createOpenAITransform();
  const openaiResult = openaiTransform.transform(identity);
  console.log(openaiResult.content);
  console.log(`\n[Estimated tokens: ${openaiResult.estimatedTokens}]`);
}

function transformIdentity(modelId, identityPath) {
  let identity;

  if (identityPath) {
    try {
      const data = JSON.parse(readFileSync(identityPath, "utf-8"));
      identity = parseIdentity(data);
    } catch (err) {
      console.error(`Error reading identity file: ${err.message}`);
      process.exit(1);
    }
  } else {
    identity = parseIdentity(demoIdentity);
  }

  const transforms = {
    claude: createClaudeTransform,
    openai: createOpenAITransform,
    gpt: createOpenAITransform,
  };

  const factory = transforms[modelId.toLowerCase()];
  if (!factory) {
    console.error(`Unknown model: ${modelId}`);
    console.error(`Available models: ${Object.keys(transforms).join(", ")}`);
    process.exit(1);
  }

  const transform = factory();
  const result = transform.transform(identity);

  console.log(`\n=== ${transform.modelName} Transform ===\n`);
  console.log(result.content);
  console.log(`\n[Estimated tokens: ${result.estimatedTokens}]`);
  console.log(`[Sections: ${result.includedSections.join(", ")}]`);
}

// Main
switch (command) {
  case "demo":
    showDemo();
    break;
  case "schema":
    showSchema();
    break;
  case "transform":
    const modelId = process.argv[3];
    const identityPath = process.argv[4];
    if (!modelId) {
      console.error("Please specify a model: claude, openai");
      process.exit(1);
    }
    transformIdentity(modelId, identityPath);
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined:
    showHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}
