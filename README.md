# @sanity-labs/oclif-plugin-skills-flag

Adds `--llms` and its `--skill` alias to every command in an oclif v4 CLI. The flag prints
command-specific Markdown for coding agents, then exits without running the command.

## Install

Install the plugin in the CLI:

```sh
npm install @sanity-labs/oclif-plugin-skills-flag
```

Register it in the CLI's `package.json`:

```json
{
  "oclif": {
    "plugins": ["@sanity-labs/oclif-plugin-skills-flag"]
  }
}
```

Add a `skills` directory at the package root. Name each file after its oclif command ID, replacing
colons with hyphens:

```text
skills/
├── deploy.md
└── functions-test.md
```

These commands then print the matching files:

```sh
my-cli deploy --llms
my-cli functions test --skill
```

The second command uses `skills/functions-test.md`. A single-command CLI uses `skills/index.md`.
Include `skills` in the CLI's npm `files` list if it has one.

## Configuration

Add `oclif-plugin-skills-flag` at the top level of the CLI's `package.json` to change the runtime
behavior:

```json
{
  "oclif-plugin-skills-flag": {
    "flag": "agents",
    "aliases": ["agent-help"],
    "directory": "docs/agents",
    "fallThroughOnMissingSkill": false,
    "missingSkillMessage": "No agent instructions are available."
  }
}
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `flag` | string | `"llms"` | Main flag name, without leading dashes |
| `aliases` | string[] | `["skill"]` | Additional names; one-character aliases use a single dash |
| `directory` | string | `"skills"` | Skills directory relative to the CLI package root |
| `fallThroughOnMissingSkill` | boolean | `false` | Let oclif continue processing when the skill file is missing |
| `missingSkillMessage` | string | Command-specific message with the expected file path | Error shown when the skill file is missing |

Configuration belongs to the CLI package that owns the command. If one oclif CLI is installed as a
plugin in another, each CLI can use different flag names and directories for its own commands.
Include the configured directory in the CLI's npm `files` list if it has one.

When `fallThroughOnMissingSkill` is `true`, it takes precedence over `missingSkillMessage`. The hook
returns without printing an error, and oclif continues its normal command lifecycle. A strict
command that calls `this.parse()` reports an undeclared skills flag as nonexistent and prints error
help. A command can instead declare the flag or use non-strict parsing to handle it. Consumers that
enable fallthrough are responsible for handling or rejecting the flag.

## Show the flag in help

An oclif plugin cannot add flags to the host commands' generated help. The hook still recognizes
the configured names before oclif parses the command, but they do not appear in help automatically.
To advertise the default `--llms` flag, add the exported definition to the CLI's existing base
command and set `hidden` to `false`:

```ts
import {Command, Flags} from '@oclif/core'
import {llmsFlagConfig} from '@sanity-labs/oclif-plugin-skills-flag'

export abstract class BaseCommand extends Command {
  static baseFlags = {
    ...super.baseFlags,
    llms: Flags.boolean({...llmsFlagConfig, hidden: false}),
  }
}
```

The plugin handles the flag, so command implementations do not need to read `flags.llms`.

For custom names, create a matching definition:

```ts
import {Command, Flags} from '@oclif/core'
import {createSkillsFlagDefinition} from '@sanity-labs/oclif-plugin-skills-flag'

const skillsFlag = createSkillsFlagDefinition(
  {
    flag: 'agents',
    aliases: ['agent-help'],
  },
  {
    description: 'Show instructions for coding agents',
    hidden: false,
  },
)

export abstract class BaseCommand extends Command {
  static baseFlags = {
    ...super.baseFlags,
    [skillsFlag.name]: Flags.boolean(skillsFlag.definition),
  }
}
```

The names passed to `createSkillsFlagDefinition` must match the package configuration. `hidden` and
`description` affect only the flag definition owned by the host CLI; they do not change runtime
plugin behavior.

## Limitations

- The plugin targets oclif v4.
- When a matching skill exists, configured flag names take precedence over same-named host flags.
- When a matching skill exists, the init hook writes it and exits immediately. Later oclif
  lifecycle hooks do not run.

## Development

mise selects Node 24, which runs the TypeScript tests directly:

```sh
npm install
npm test
```

Run `npm run build` to create the publishable files in `dist/`. Use `npm run lint:fix` to apply
Biome formatting and safe lint fixes.
