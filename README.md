# claude-mods

**English** · [简体中文](README.zh-CN.md)

A collection of Claude Code mods. Each mod is a function-hook plugin that runs in the terminal and in the Code tab of Claude Desktop.

| Mod | What it does |
| --- | --- |
| [tps-meter](#tps-meter) | Shows the model's live output speed (tokens/s) |

## Install

In a terminal:

```bash
claude plugin marketplace add xingkaixin/claude-mods
claude plugin install tps-meter@claude-mods
```

Or with slash commands at the Claude Code prompt (Desktop does not support these; use the terminal commands above):

```
/plugin marketplace add xingkaixin/claude-mods
/plugin install tps-meter@claude-mods
```

Choose the `user` scope so both the terminal and Desktop load it. After installing, run `/reload-plugins` in any terminal session that is already open. Desktop loads it in a new session.

## Check the version and update

See the installed version:

```bash
claude plugin list
```

The `Version` line under `tps-meter@claude-mods` is the installed version.

Check for and install a new version:

```bash
claude plugin marketplace update claude-mods   # fetch the latest marketplace from GitHub
claude plugin update tps-meter@claude-mods      # update if there is a newer version, otherwise report it is up to date
```

After updating, run `/reload-plugins` in the terminal, or start a new session in Desktop. Sessions that are already running keep the old version.

The latest version number is in `mods/<mod>/.claude-plugin/plugin.json` in this repository.

## tps-meter

Shows the model's live output speed (tokens/s) while it responds:

| Surface | Where |
| --- | --- |
| Terminal | At the end of the hint line under the prompt, e.g. after `bypass permissions on (shift+tab to cycle)` |
| Desktop | Above the input box, at the right |

The readout has two states:

- `⚡ 42.3 tok/s`: the model is still responding. Refreshed every 250 ms. This value is estimated from character counts.
- `· 38.1 tok/s`: the response has finished. The exact value, computed from the `output_tokens` the API returns.

Before any output, Desktop shows `– tok/s`, which also tells you the mod is loaded.

### How it is computed

Each model request (`turn.step`) is measured on its own. Timing starts when the request is sent and ends at the `stop` chunk, so time to first token is included. The readout matches a speed computed from session logs, not the pure generation speed. Thinking, text and tool-call arguments all count as output.

- **Live value**: characters received ÷ characters per token ÷ seconds elapsed. Characters per token starts at 4 (a typical value for English) and is recalibrated from the real `output_tokens` after each request. For CJK text the live value of the first request therefore reads low. Requests with thinking are skipped for recalibration: `output_tokens` includes thinking tokens even when the thinking text is withheld, which would push the ratio too low and inflate later live values.
- **Final value**: `output_tokens` ÷ seconds from sending the request to the end.

### Limits

- Only the main thread is measured; subagent output is not counted.
- A request that finishes less than 200 ms after it is sent does not update the readout. Over such a short span the timing mostly reflects jitter, not a meaningful rate.
- An interrupted request carries no usage, so the readout keeps the last estimate.

## Development

### Layout

```
.claude-plugin/marketplace.json   # marketplace manifest, lists every mod
mods/<mod>/
  .claude-plugin/plugin.json      # mod manifest: name, version, description
  hooks/hooks.json                # points to the hooks module
  hooks/register.tsx              # hooks module, exports register(on)
  types/index.d.ts                # $.state type declarations (needed when the mod uses $.state)
  tests/*.test.tsx                # tests run by claude plugin test
```

`mods/<mod>/.claude-plugin/types/` holds type files Claude Code generates each time it loads a mod; it is ignored in `.gitignore`.

### Add a mod

1. Create a folder under `mods/` with the files listed above.
2. Add an entry to `plugins` in `.claude-plugin/marketplace.json`, with `source` set to `./mods/<mod>`.
3. Add a row to the mod table in both READMEs and describe the mod.

The authoritative API reference is the type file Claude Code generates, `.claude-plugin/types/claude-code/index.d.ts`. Loading the `plugin-authoring` skill in Claude Code gives the full authoring guide.

### Debug locally

```bash
claude --plugin-dir mods/<mod>           # load from the local folder for this session only
claude plugin validate .                 # check the marketplace and every mod manifest
claude plugin validate mods/<mod>        # check one mod's manifest and hooks module
claude plugin test mods/<mod>            # run its tests
```

A terminal session started with `--plugin-dir` watches the folder and reloads the mod when a file is saved.

### Release a new version

1. Change `version` in `mods/<mod>/.claude-plugin/plugin.json`. **The version must change**: an installed plugin is copied into a local cache by version, so with the same version `claude plugin update` does not fetch the new code.
2. Commit and push to `main`.
3. Optional: run `claude plugin tag mods/<mod> --push` to create and push a `<mod>--v<version>` git tag.
4. Update on your machine as described in [Check the version and update](#check-the-version-and-update).
