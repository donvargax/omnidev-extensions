import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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

function loadSelectors(projectRoot) {
  const selectorsPath = join(projectRoot, "capabilities", "bridge-selectors", "selectors.json");
  if (!existsSync(selectorsPath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(selectorsPath, "utf-8"));
    return Array.isArray(parsed.skillBridges) ? parsed.skillBridges : [];
  } catch {
    return [];
  }
}

function readSkillBridgeConfig(projectRoot, capabilityId) {
  const entries = loadSelectors(projectRoot);
  const cfg = entries.find((entry) => entry?.capabilityId === capabilityId);
  return {
    include: Array.isArray(cfg?.include) ? cfg.include : [],
    exclude: Array.isArray(cfg?.exclude) ? cfg.exclude : [],
    nameMode: cfg?.nameMode === "prefixed" ? "prefixed" : "leaf"
  };
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

function collectNestedSkills(projectRoot, capabilityId) {
  const selectors = readSkillBridgeConfig(projectRoot, capabilityId);
  const skillsRoot = getSourceSkillsRoot(projectRoot, capabilityId);
  if (!existsSync(skillsRoot)) return [];

  const out = [];
  const usedNames = new Set();
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
      if (!shouldInclude(rel, selectors.include, selectors.exclude)) continue;

      const skillDir = join(categoryDir, rawSkillName);
      const skillMdPath = join(skillDir, "SKILL.md");
      if (!existsSync(skillMdPath)) continue;

      const content = readFileSync(skillMdPath, "utf-8");
      const parsed = parseFrontmatter(content);
      if (!parsed || !parsed.data.name || !parsed.data.description) continue;

      const preferred = selectors.nameMode === "prefixed"
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

export default {
  skills: (() => {
    const projectRoot = process.cwd();
    return collectNestedSkills(projectRoot, "mattpocock-skills");
  })()
};
