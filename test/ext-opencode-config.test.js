import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { sync, toOpencodeMcp } from "../capabilities/ext-opencode-config/index.js";

test("toOpencodeMcp maps url-based servers to remote disabled entries", () => {
  const mapped = toOpencodeMcp({
    good: { url: "https://example.com/mcp" },
    bad: { command: "node server.js" }
  });
  assert.deepEqual(mapped, {
    good: {
      type: "remote",
      url: "https://example.com/mcp",
      enabled: false
    },
    bad: {
      type: "local",
      command: ["node server.js"],
      enabled: false
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
      enabled: false
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
  assert.deepEqual(out.plugin, ["source.omni"]);
  assert.deepEqual(out.mcp, {
    context7: {
      type: "remote",
      url: "https://context7.example/mcp",
      enabled: false
    },
    localOnly: {
      type: "local",
      command: ["node server.js", "--stdio"],
      enabled: false
    }
  });
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
