# AGENTS.md

Guidance for coding agents working on `@sanity-labs/oclif-plugin-skills-flag`, an ESM
TypeScript plugin for oclif v4. The published code supports Node 22 and later. Development uses
Node 24 through mise.

## Commands

- `npm test` runs the typecheck, Node test suite, and Biome checks.
- `npm run build` compiles `src/` to `dist/` with declarations and source maps.
- `npm run lint` checks formatting, imports, and lint rules.
- `npm run lint:fix` applies Biome's safe formatting and lint fixes.

`prepack` runs the test suite before building the package.

## Architecture

- `src/hooks/init.ts` is the oclif init hook. It handles `--llms` and `--skill` before command
  parsing.
- `src/skills.ts` contains the filesystem and argument helpers.
- `src/index.ts` is the public API.
- The host CLI owns the `skills/` directory. Nested command IDs map from colons to hyphens.
- The hook writes output synchronously before exiting because a successful oclif hook exit does not
  stop command execution.

## Testing

- Tests use `node:test` and run directly from `.ts` source files.
- Integration tests create temporary oclif hosts and spawn them as subprocesses.
- Keep tests independent and clean up temporary directories with `t.after()`.
- Test both flag names and confirm the target command does not run.

## Constraints

- Keep runtime dependencies at zero. `@oclif/core` remains a peer dependency.
- Use Node built-ins instead of adding packages.
- Keep source compatible with Node's type stripping: use type-only imports, `.ts` import
  extensions, and no TypeScript syntax that requires transformation.
- Do not edit generated files in `dist/`; run `npm run build`.
- Do not publish the package unless explicitly asked.

## Style

Biome is authoritative. Use spaces, omit semicolons, and keep trailing commas where JavaScript
allows them. Comments should explain constraints the code cannot show.

