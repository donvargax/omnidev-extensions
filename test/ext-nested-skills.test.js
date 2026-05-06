import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildSkills } from "../capabilities/ext-nested-skills/index.js";

function writeSkill(root, capabilityId, category, name, description = "desc") {
  const dir = join(root, ".omni", "capabilities", capabilityId, "skills", category, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nbody for ${name}\n`,
    "utf-8"
  );
}

test("buildSkills flattens nested categories with leaf names", () => {
  const root = mkdtempSync(join(tmpdir(), "omnidev-ext-nested-"));
  writeFileSync(
    join(root, "omni.toml"),
    `[extensions.skill_bridges.src]\nsource_capability_id = "mattpocock-skills"\nname_mode = "leaf"\n`,
    "utf-8"
  );
  writeSkill(root, "mattpocock-skills", "engineering", "diagnose", "Diagnose things");

  const skills = buildSkills(root);
  assert.equal(skills.length, 1);
  assert.match(skills[0].skillMd, /name: diagnose/);
  assert.match(skills[0].skillMd, /description: "Diagnose things"/);
});

test("buildSkills avoids collisions with numeric suffixes", () => {
  const root = mkdtempSync(join(tmpdir(), "omnidev-ext-nested-"));
  writeFileSync(
    join(root, "omni.toml"),
    `[extensions.skill_bridges.src]\nsource_capability_id = "mattpocock-skills"\nname_mode = "leaf"\n`,
    "utf-8"
  );
  writeSkill(root, "mattpocock-skills", "engineering", "diagnose");
  writeSkill(root, "mattpocock-skills", "debugging", "diagnose");

  const skills = buildSkills(root);
  const names = skills.map((s) => {
    const m = s.skillMd.match(/name: ([^\n]+)/);
    return m ? m[1].trim() : "";
  });
  assert.deepEqual(names, ["diagnose", "diagnose-2"]);
});

test("buildSkills respects include/exclude filters", () => {
  const root = mkdtempSync(join(tmpdir(), "omnidev-ext-nested-"));
  writeFileSync(
    join(root, "omni.toml"),
    `[extensions.skill_bridges.src]\nsource_capability_id = "mattpocock-skills"\ninclude = ["engineering/diagnose", "engineering/plan"]\nexclude = ["engineering/plan"]\n`,
    "utf-8"
  );
  writeSkill(root, "mattpocock-skills", "engineering", "diagnose");
  writeSkill(root, "mattpocock-skills", "engineering", "plan");
  writeSkill(root, "mattpocock-skills", "engineering", "ignore-me");

  const skills = buildSkills(root);
  assert.equal(skills.length, 1);
  assert.match(skills[0].skillMd, /name: diagnose/);
});
