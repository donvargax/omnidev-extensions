import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function parseJsoncLoose(content) {
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(stripped);
}

function writeJsonc(path, data) {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  writeFileSync(path, text, "utf-8");
}

function readBridgeSelectors(projectRoot) {
  const selectorsPath = join(projectRoot, "capabilities", "bridge-selectors", "selectors.json");
  const fallback = {
    plugins: [],
    syncMcpFromDotMcpJson: true,
    mcpTargetKey: "mcp",
    mcp: {}
  };
  if (!existsSync(selectorsPath)) return fallback;
  try {
    const parsed = JSON.parse(readFileSync(selectorsPath, "utf-8"));
    const cfg = parsed?.opencode || {};
    return {
      plugins: Array.isArray(cfg.plugins) ? cfg.plugins : [],
      syncMcpFromDotMcpJson: cfg.syncMcpFromDotMcpJson !== false,
      mcpTargetKey: typeof cfg.mcpTargetKey === "string" && cfg.mcpTargetKey.length > 0
        ? cfg.mcpTargetKey
        : "mcp",
      mcp: cfg.mcp && typeof cfg.mcp === "object" ? cfg.mcp : {}
    };
  } catch {
    return fallback;
  }
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

function toOpencodeMcp(rawMcpServers) {
  const out = {};
  for (const [name, cfg] of Object.entries(rawMcpServers)) {
    if (!cfg || typeof cfg !== "object") continue;
    const url = typeof cfg.url === "string" ? cfg.url : undefined;
    if (!url) continue;
    out[name] = {
      type: "remote",
      url,
      enabled: false
    };
  }
  return out;
}

async function sync() {
  const projectRoot = process.cwd();
  const opencodeDir = join(projectRoot, ".opencode");
  const opencodeConfigPath = join(opencodeDir, "opencode.jsonc");
  const selectors = readBridgeSelectors(projectRoot);

  mkdirSync(opencodeDir, { recursive: true });

  let config = {};
  if (existsSync(opencodeConfigPath)) {
    try {
      config = parseJsoncLoose(readFileSync(opencodeConfigPath, "utf-8"));
    } catch {
      config = {};
    }
  }

  config.plugin = selectors.plugins;

  if (selectors.mcp && Object.keys(selectors.mcp).length > 0) {
    config[selectors.mcpTargetKey] = selectors.mcp;
    if (selectors.mcpTargetKey !== "mcpServers" && Object.prototype.hasOwnProperty.call(config, "mcpServers")) {
      delete config.mcpServers;
    }
  }

  if (selectors.syncMcpFromDotMcpJson) {
    const mcpServers = readDotMcpJson(projectRoot);
    if (mcpServers && (!selectors.mcp || Object.keys(selectors.mcp).length === 0)) {
      config[selectors.mcpTargetKey] = toOpencodeMcp(mcpServers);
      if (selectors.mcpTargetKey !== "mcpServers" && Object.prototype.hasOwnProperty.call(config, "mcpServers")) {
        delete config.mcpServers;
      }
    }
  }

  writeJsonc(opencodeConfigPath, config);
}

export default { sync };
