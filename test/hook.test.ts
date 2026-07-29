import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it, type TestContext } from "node:test"
import {
  handleSkillsFlag,
  type SkillsFlagOptions,
  type SkillsFlagRuntime,
} from "../src/hooks/init.ts"
import { resolveSkillsFlagConfig } from "../src/skills.ts"

class ExitSignal extends Error {
  code: number

  constructor(code: number) {
    super(`exit ${code}`)
    this.code = code
  }
}

async function createRoot(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "skills-flag-hook-"))
  t.after(() => rm(root, { force: true, recursive: true }))
  await mkdir(join(root, "skills"))
  return root
}

function options(
  root: string,
  overrides: Partial<SkillsFlagOptions> = {},
): SkillsFlagOptions {
  return {
    argv: ["--llms"],
    bin: "test-cli",
    commandExists: () => true,
    commandId: "functions:test",
    config: resolveSkillsFlagConfig(),
    error: (message) => {
      throw new Error(message)
    },
    isSingleCommandCLI: false,
    root,
    ...overrides,
  }
}

function runtime(): {
  exits: number[]
  io: SkillsFlagRuntime
  writes: string[]
} {
  const exits: number[] = []
  const writes: string[] = []

  return {
    exits,
    io: {
      exit(code): never {
        exits.push(code)
        throw new ExitSignal(code)
      },
      write(output) {
        writes.push(output)
      },
    },
    writes,
  }
}

describe("handleSkillsFlag", () => {
  it("writes the command skill and exits successfully", async (t) => {
    const root = await createRoot(t)
    await writeFile(
      join(root, "skills/functions-test.md"),
      "Test a function locally.",
    )
    const { io, writes } = runtime()

    await assert.rejects(
      handleSkillsFlag(options(root), io),
      (error: unknown) => error instanceof ExitSignal && error.code === 0,
    )
    assert.deepEqual(writes, ["Test a function locally.\n"])
  })

  it("uses index.md for a single-command CLI", async (t) => {
    const root = await createRoot(t)
    await writeFile(join(root, "skills/index.md"), "Run the CLI.\n")
    const { io, writes } = runtime()

    await assert.rejects(
      handleSkillsFlag(options(root, { isSingleCommandCLI: true }), io),
      (error: unknown) => error instanceof ExitSignal && error.code === 0,
    )
    assert.deepEqual(writes, ["Run the CLI.\n"])
  })

  it("reports the expected path when a skill is missing", async (t) => {
    const root = await createRoot(t)
    const { exits, io, writes } = runtime()

    await assert.rejects(
      handleSkillsFlag(options(root), io),
      /No agent guidance is available for `functions test`\.\nAdd it at skills\/functions-test\.md\./,
    )
    assert.deepEqual(writes, [])
    assert.deepEqual(exits, [])
  })

  it("uses configured names and directory", async (t) => {
    const root = await createRoot(t)
    await mkdir(join(root, "docs/agents"), { recursive: true })
    await writeFile(
      join(root, "docs/agents/functions-test.md"),
      "Custom guidance.\n",
    )
    const { io, writes } = runtime()

    await assert.rejects(
      handleSkillsFlag(
        options(root, {
          argv: ["--agents"],
          config: resolveSkillsFlagConfig({
            aliases: [],
            directory: "docs/agents",
            flag: "agents",
          }),
        }),
        io,
      ),
      (error: unknown) => error instanceof ExitSignal && error.code === 0,
    )
    assert.deepEqual(writes, ["Custom guidance.\n"])
  })

  it("does nothing when the flag is absent", async (t) => {
    const root = await createRoot(t)
    const { exits, io, writes } = runtime()

    await handleSkillsFlag(options(root, { argv: [] }), io)
    assert.deepEqual(writes, [])
    assert.deepEqual(exits, [])
  })

  it("leaves unknown commands to oclif", async (t) => {
    const root = await createRoot(t)
    const { exits, io, writes } = runtime()

    await handleSkillsFlag(options(root, { commandExists: () => false }), io)
    assert.deepEqual(writes, [])
    assert.deepEqual(exits, [])
  })
})
