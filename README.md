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

## Show the flag in help

An oclif plugin cannot add flags to the host commands' generated help. The hook still recognizes
both flags before oclif parses the command. To advertise `--llms`, add the exported config to the
CLI's existing base command:

```ts
import {Command, Flags} from '@oclif/core'
import {llmsFlagConfig} from '@sanity-labs/oclif-plugin-skills-flag'

export abstract class BaseCommand extends Command {
  static baseFlags = {
    ...super.baseFlags,
    llms: Flags.boolean(llmsFlagConfig),
  }
}
```

The plugin handles the flag, so command implementations do not need to read `flags.llms`.

## Limitations

- The plugin targets oclif v4.
- `--llms` and `--skill` take precedence over same-named host flags.
- The init hook writes the skill and exits immediately. Later oclif lifecycle hooks do not run.

## Development

mise selects Node 24, which runs the TypeScript tests directly:

```sh
npm install
npm test
```

Run `npm run build` to create the publishable files in `dist/`. Use `npm run lint:fix` to apply
Biome formatting and safe lint fixes.
