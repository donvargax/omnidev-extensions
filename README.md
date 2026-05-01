# omnidev-extensions

Local extension capabilities for OmniDev.

## Included capabilities
- `ext-nested-skills`: flattens nested `skills/<category>/<name>/SKILL.md` trees into OmniDev-compatible skills.
- `ext-opencode-config`: syncs selected OpenCode config sections (plugins, MCP mapping) into `.opencode/opencode.jsonc`.

## Expected config location
These capabilities read extension settings from the Omni workspace `omni.toml` under custom `extensions` keys.
