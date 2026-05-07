import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { sync, toOpencodeMcp } from "../capabilities/ext-opencode-config/index.js";

test("toOpencodeMcp maps url-based servers and derives enabled from disabled", () => {
  const mapped = toOpencodeMcp({
    good: { url: "https://example.com/mcp" },
    disabledByFlag: { url: "https://disabled.example/mcp", disabled: true },
    bad: { command: "node server.js" }
  });
  assert.deepEqual(mapped, {
    good: {
      type: "remote",
      url: "https://example.com/mcp",
      enabled: true
    },
    disabledByFlag: {
      type: "remote",
      url: "https://disabled.example/mcp",
      enabled: false
    },
    bad: {
      type: "local",
      command: ["node server.js"],
      enabled: true
    }
  });
});

test("toOpencodeMcp maps stdio command+args and env to local", () => {
  const mapped = toOpencodeMcp({
    serena: {
      command: "serena",
      args: ["start-mcp-server", "--context=ide"],
      env: {
        SERENA_LOG: "warn",
        IGNORE_ME: 123
      }
    }
  });
  assert.deepEqual(mapped, {
    serena: {
      type: "local",
      command: ["serena", "start-mcp-server", "--context=ide"],
      environment: {
        SERENA_LOG: "warn"
      },
      enabled: true
    }
  });
});

test("sync writes plugin and mcp from .mcp.json", async () => {
  const root = mkdtempSync(join(tmpdir(), "omnidev-ext-opencode-"));
  mkdirSync(join(root, ".opencode"), { recursive: true });
  writeFileSync(
    join(root, "omni.toml"),
    `[extensions.opencode]\nplugins = ["source.omni"]\nsync_mcp_from_dot_mcp_json = true\nmcp_target_key = "mcp"\n`,
    "utf-8"
  );
  writeFileSync(
    join(root, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        context7: { url: "https://context7.example/mcp" },
        localOnly: { command: "node server.js", args: ["--stdio"] }
      }
    }),
    "utf-8"
  );

  const oldCwd = process.cwd();
  process.chdir(root);
  try {
    await sync();
  } finally {
    process.chdir(oldCwd);
  }

  const out = JSON.parse(readFileSync(join(root, ".opencode", "opencode.jsonc"), "utf-8"));
  assert.equal(out.$schema, "https://opencode.ai/config.json");
  assert.deepEqual(out.plugin, ["source.omni"]);
  assert.deepEqual(out.mcp, {
    context7: {
      type: "remote",
      url: "https://context7.example/mcp",
      enabled: true
    },
    localOnly: {
      type: "local",
      command: ["node server.js", "--stdio"],
      enabled: true
    }
  });
});

test("sync preserves existing provider config while updating plugin/mcp", async () => {
  const root = mkdtempSync(join(tmpdir(), "omnidev-ext-opencode-"));
  mkdirSync(join(root, ".opencode"), { recursive: true });
  writeFileSync(
    join(root, "omni.toml"),
    `[extensions.opencode]\nplugins = ["source.omni"]\nsync_mcp_from_dot_mcp_json = true\nmcp_target_key = "mcp"\n`,
    "utf-8"
  );
  writeFileSync(
    join(root, ".mcp.json"),
    JSON.stringify({ mcpServers: { deepwiki: { url: "https://mcp.deepwiki.com/mcp" } } }),
    "utf-8"
  );
  writeFileSync(
    join(root, ".opencode", "opencode.jsonc"),
    JSON.stringify({
      provider: {
        ollama: {
          name: "Ollama (local)",
          npm: "@ai-sdk/openai-compatible",
          options: { baseURL: "http://localhost:11434/v1" }
        }
      }
    }),
    "utf-8"
  );

  const oldCwd = process.cwd();
  process.chdir(root);
  try {
    await sync();
  } finally {
    process.chdir(oldCwd);
  }

  const out = JSON.parse(readFileSync(join(root, ".opencode", "opencode.jsonc"), "utf-8"));
  assert.equal(out.$schema, "https://opencode.ai/config.json");
  assert.equal(out.provider.ollama.options.baseURL, "http://localhost:11434/v1");
  assert.deepEqual(out.plugin, ["source.omni"]);
  assert.equal(out.mcp.deepwiki.type, "remote");
});

test("sync preserves provider from jsonc with comments and trailing commas", async () => {
  const root = mkdtempSync(join(tmpdir(), "omnidev-ext-opencode-"));
  mkdirSync(join(root, ".opencode"), { recursive: true });
  writeFileSync(
    join(root, "omni.toml"),
    `[extensions.opencode]\nplugins = []\nsync_mcp_from_dot_mcp_json = true\nmcp_target_key = "mcp"\n`,
    "utf-8"
  );
  writeFileSync(
    join(root, ".mcp.json"),
    JSON.stringify({ mcpServers: { context7: { url: "https://mcp.context7.com/mcp" } } }),
    "utf-8"
  );
  writeFileSync(
    join(root, ".opencode", "opencode.jsonc"),
    `{
  "$schema": "https://opencode.ai/config.json",
  // keep existing provider config
  "provider": {
    "ollama": {
      "name": "Ollama (local)",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://localhost:11434/v1",
      },
    },
  },
}
`,
    "utf-8"
  );

  const oldCwd = process.cwd();
  process.chdir(root);
  try {
    await sync();
  } finally {
    process.chdir(oldCwd);
  }

  const out = JSON.parse(readFileSync(join(root, ".opencode", "opencode.jsonc"), "utf-8"));
  assert.equal(out.provider.ollama.options.baseURL, "http://localhost:11434/v1");
  assert.equal(out.mcp.context7.type, "remote");
});

test("sync removes legacy mcpServers when target key is mcp", async () => {
  const root = mkdtempSync(join(tmpdir(), "omnidev-ext-opencode-"));
  mkdirSync(join(root, ".opencode"), { recursive: true });
  writeFileSync(
    join(root, "omni.toml"),
    `[extensions.opencode]\nplugins = []\nsync_mcp_from_dot_mcp_json = true\nmcp_target_key = "mcp"\n`,
    "utf-8"
  );
  writeFileSync(
    join(root, ".mcp.json"),
    JSON.stringify({ mcpServers: { x: { url: "https://x.example" } } }),
    "utf-8"
  );
  writeFileSync(
    join(root, ".opencode", "opencode.jsonc"),
    JSON.stringify({ mcpServers: { stale: { type: "stdio" } } }),
    "utf-8"
  );

  const oldCwd = process.cwd();
  process.chdir(root);
  try {
    await sync();
  } finally {
    process.chdir(oldCwd);
  }

  const out = JSON.parse(readFileSync(join(root, ".opencode", "opencode.jsonc"), "utf-8"));
  assert.equal(Object.prototype.hasOwnProperty.call(out, "mcpServers"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(out, "mcp"), true);
});
