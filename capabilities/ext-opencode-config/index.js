import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OPENCODE_SCHEMA_URL = "https://opencode.ai/config.json";

function stripInlineComment(line) {
  const idx = line.indexOf("#");
  if (idx === -1) return line;
  return line.slice(0, idx);
}

function parseTomlString(value) {
  const trimmed = value.trim();
  if (!(trimmed.startsWith('"') && trimmed.endsWith('"'))) return null;
  return trimmed.slice(1, -1).replace(/\\"/g, '"');
}

function parseTomlBoolean(value) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return null;
}

function parseTomlStringArray(value) {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("[") && trimmed.endsWith("]"))) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((part) => parseTomlString(part.trim()))
    .filter((item) => typeof item === "string");
}

function parseJsoncLoose(content) {
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(stripped);
}

function writeJsonc(path, data) {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  writeFileSync(path, text, "utf-8");
}

export function readExtensionConfig(projectRoot) {
  const configPath = join(projectRoot, "omni.toml");
  const fallback = {
    plugins: [],
    syncMcpFromDotMcpJson: true,
    mcpTargetKey: "mcp"
  };
  if (!existsSync(configPath)) return fallback;

  const content = readFileSync(configPath, "utf-8");
  const lines = content.split("\n");
  let inSection = false;
  const out = { ...fallback };

  for (const rawLine of lines) {
    const line = stripInlineComment(rawLine).trim();
    if (!line) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      const section = line.slice(1, -1).trim();
      inSection = section === "extensions.opencode";
      continue;
    }

    if (!inSection) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const rawValue = line.slice(eqIdx + 1).trim();

    if (key === "plugins") {
      const arr = parseTomlStringArray(rawValue);
      if (arr) out.plugins = arr;
    } else if (key === "sync_mcp_from_dot_mcp_json") {
      const b = parseTomlBoolean(rawValue);
      if (b !== null) out.syncMcpFromDotMcpJson = b;
    } else if (key === "mcp_target_key") {
      const s = parseTomlString(rawValue);
      if (s && s.length > 0) out.mcpTargetKey = s;
    }
  }

  return out;
}

function readDotMcpJson(projectRoot) {
  const mcpPath = join(projectRoot, ".mcp.json");
  if (!existsSync(mcpPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(mcpPath, "utf-8"));
    return parsed?.mcpServers && typeof parsed.mcpServers === "object"
      ? parsed.mcpServers
      : null;
  } catch {
    return null;
  }
}

export function toOpencodeMcp(rawMcpServers) {
  const out = {};
  for (const [name, cfg] of Object.entries(rawMcpServers)) {
    if (!cfg || typeof cfg !== "object") continue;
    const enabled = cfg.disabled !== true;
    const url = typeof cfg.url === "string" ? cfg.url : undefined;
    if (url) {
      out[name] = {
        type: "remote",
        url,
        enabled
      };
      continue;
    }

    const rawCommand = cfg.command;
    const args = Array.isArray(cfg.args)
      ? cfg.args.filter((v) => typeof v === "string")
      : [];
    const command = Array.isArray(rawCommand)
      ? rawCommand.filter((v) => typeof v === "string")
      : typeof rawCommand === "string"
        ? [rawCommand, ...args]
        : [];

    if (command.length > 0) {
      const local = {
        type: "local",
        command,
        enabled
      };
      if (cfg.env && typeof cfg.env === "object" && !Array.isArray(cfg.env)) {
        const environment = {};
        for (const [k, v] of Object.entries(cfg.env)) {
          if (typeof v === "string") environment[k] = v;
        }
        if (Object.keys(environment).length > 0) {
          local.environment = environment;
        }
      }
      out[name] = local;
    }
  }
  return out;
}

export async function sync() {
  const projectRoot = process.cwd();
  const opencodeDir = join(projectRoot, ".opencode");
  const opencodeConfigPath = join(opencodeDir, "opencode.jsonc");
  const ext = readExtensionConfig(projectRoot);

  mkdirSync(opencodeDir, { recursive: true });

  let config = {};
  if (existsSync(opencodeConfigPath)) {
    try {
      config = parseJsoncLoose(readFileSync(opencodeConfigPath, "utf-8"));
    } catch {
      config = {};
    }
  }

  if (typeof config.$schema !== "string" || config.$schema.length === 0) {
    config.$schema = OPENCODE_SCHEMA_URL;
  }

  config.plugin = ext.plugins;

  if (ext.syncMcpFromDotMcpJson) {
    const mcpServers = readDotMcpJson(projectRoot);
    if (mcpServers) {
      config[ext.mcpTargetKey] = toOpencodeMcp(mcpServers);
      if (ext.mcpTargetKey !== "mcpServers" && Object.prototype.hasOwnProperty.call(config, "mcpServers")) {
        delete config.mcpServers;
      }
    }
  }

  writeJsonc(opencodeConfigPath, config);
}

export default { sync };
