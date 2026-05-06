import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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

function parseFrontmatter(md) {
  const match = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return null;
  const body = md.slice(match[0].length);
  const lines = match[1].split("\n");
  const data = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^"|"$/g, "");
    data[key] = value;
  }
  return { data, body };
}

export function readSkillBridgeConfigs(projectRoot) {
  const configPath = join(projectRoot, "omni.toml");
  if (!existsSync(configPath)) return [];

  const content = readFileSync(configPath, "utf-8");
  const lines = content.split("\n");
  let currentSection = "";
  const byName = new Map();

  for (const rawLine of lines) {
    const line = stripInlineComment(rawLine).trim();
    if (!line) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1).trim();
      continue;
    }

    const prefix = "extensions.skill_bridges.";
    if (!currentSection.startsWith(prefix)) continue;

    const bridgeName = currentSection.slice(prefix.length);
    if (!bridgeName) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const rawValue = line.slice(eqIdx + 1).trim();
    const current = byName.get(bridgeName) ?? {
      bridgeName,
      sourceCapabilityId: "",
      include: [],
      exclude: [],
      nameMode: "leaf"
    };

    if (key === "source_capability_id") {
      const v = parseTomlString(rawValue);
      if (v) current.sourceCapabilityId = v;
    } else if (key === "include") {
      const v = parseTomlStringArray(rawValue);
      if (v) current.include = v;
    } else if (key === "exclude") {
      const v = parseTomlStringArray(rawValue);
      if (v) current.exclude = v;
    } else if (key === "name_mode") {
      const v = parseTomlString(rawValue);
      if (v === "prefixed" || v === "leaf") current.nameMode = v;
    } else if (key === "enabled") {
      const v = parseTomlBoolean(rawValue);
      if (v === false) current.disabled = true;
    }

    byName.set(bridgeName, current);
  }

  return Array.from(byName.values()).filter((cfg) => cfg.sourceCapabilityId && cfg.disabled !== true);
}

function shouldInclude(rel, include, exclude) {
  if (exclude.includes(rel)) return false;
  if (include.length === 0) return true;
  return include.includes(rel);
}

function slugifyName(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeUniqueName(baseName, usedNames) {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }
  let idx = 2;
  while (true) {
    const candidate = `${baseName}-${idx}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    idx += 1;
  }
}

function getSourceSkillsRoot(projectRoot, capabilityId) {
  return join(projectRoot, ".omni", "capabilities", capabilityId, "skills");
}

function collectNestedSkills(projectRoot, bridgeCfg, usedNames) {
  const { sourceCapabilityId, include, exclude, nameMode } = bridgeCfg;
  const skillsRoot = getSourceSkillsRoot(projectRoot, sourceCapabilityId);
  if (!existsSync(skillsRoot)) return [];

  const out = [];
  const categories = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const category of categories) {
    const categoryDir = join(skillsRoot, category);
    const entries = readdirSync(categoryDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const rawSkillName of entries) {
      const rel = `${category}/${rawSkillName}`;
      if (!shouldInclude(rel, include, exclude)) continue;

      const skillDir = join(categoryDir, rawSkillName);
      const skillMdPath = join(skillDir, "SKILL.md");
      if (!existsSync(skillMdPath)) continue;

      const content = readFileSync(skillMdPath, "utf-8");
      const parsed = parseFrontmatter(content);
      if (!parsed || !parsed.data.name || !parsed.data.description) continue;

      const preferred = nameMode === "prefixed"
        ? `${category}-${rawSkillName}`
        : rawSkillName;
      const baseName = slugifyName(preferred);
      if (!baseName) continue;
      const finalName = makeUniqueName(baseName, usedNames);

      const skillMd = `---\nname: ${finalName}\ndescription: ${JSON.stringify(parsed.data.description)}\n---\n\n${parsed.body.trim()}\n`;
      out.push({ skillMd });
    }
  }

  return out;
}

export function buildSkills(projectRoot = process.cwd()) {
  const bridgeConfigs = readSkillBridgeConfigs(projectRoot);
  const usedNames = new Set();
  const all = [];
  for (const bridgeCfg of bridgeConfigs) {
    const skills = collectNestedSkills(projectRoot, bridgeCfg, usedNames);
    for (const skill of skills) all.push(skill);
  }
  return all;
}

export default {
  skills: buildSkills()
};
