# omnidev-extensions

Local extension capabilities for OmniDev.

## Included capabilities
- `ext-nested-skills`: flattens nested `skills/<category>/<name>/SKILL.md` trees into OmniDev-compatible skills.
- `ext-opencode-config`: syncs selected OpenCode config sections (plugins, MCP mapping) into `.opencode/opencode.jsonc`.

## `omni.toml` configuration
These capabilities read settings from `omni.toml` custom extension keys.

```toml
[extensions.skill_bridges.mattpocock_skills]
source_capability_id = "mattpocock-skills"
name_mode = "leaf" # leaf | prefixed
include = []
exclude = []

[extensions.opencode]
plugins = []
sync_mcp_from_dot_mcp_json = true
mcp_target_key = "mcp"
```
