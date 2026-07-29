import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { Flags } from "@oclif/core"
import {
  commandSkillFilename,
  createSkillsFlagDefinition,
  ensureFinalNewline,
  hasSkillsFlag,
  llmsFlagConfig,
  readCommandSkill,
  resolveSkillsFlagConfig,
  skillsFlagConfigKey,
} from "../src/index.ts"

describe("llmsFlagConfig", () => {
  it("can be passed directly to Flags.boolean", () => {
    const flag = Flags.boolean(llmsFlagConfig)

    assert.deepEqual(flag.aliases, ["skill"])
    assert.equal(flag.hidden, true)
  })
})

describe("resolveSkillsFlagConfig", () => {
  it("applies defaults and accepts custom values", () => {
    assert.equal(skillsFlagConfigKey, "oclif-plugin-skills-flag")
    assert.deepEqual(resolveSkillsFlagConfig(), {
      aliases: ["skill"],
      directory: "skills",
      flag: "llms",
    })
    assert.deepEqual(
      resolveSkillsFlagConfig({
        aliases: ["agent-help", "instructions"],
        directory: "docs/agents",
        flag: "agents",
      }),
      {
        aliases: ["agent-help", "instructions"],
        directory: "docs/agents",
        flag: "agents",
      },
    )
  })

  it("rejects invalid flag names, aliases, and directories", () => {
    const invalidConfigs: Array<[unknown, RegExp]> = [
      [null, /configuration must be an object/],
      [{ flag: "--llms" }, /Invalid flag name/],
      [{ aliases: "skill" }, /aliases must be an array/],
      [{ aliases: ["agent help"] }, /Invalid flag alias/],
      [{ aliases: ["skill", "skill"] }, /Duplicate flag name/],
      [{ aliases: ["llms"] }, /Duplicate flag name/],
      [{ directory: "" }, /Invalid skills directory/],
      [{ directory: "../skills" }, /Invalid skills directory/],
      [{ directory: "docs/../skills" }, /Invalid skills directory/],
      [{ directory: "/tmp/skills" }, /Invalid skills directory/],
      [{ directory: "C:\\skills" }, /Invalid skills directory/],
      [{ unexpected: true }, /Unknown configuration option/],
    ]

    for (const [config, expected] of invalidConfigs) {
      assert.throws(() => resolveSkillsFlagConfig(config), expected)
    }
  })
})

describe("createSkillsFlagDefinition", () => {
  it("separates runtime names from opt-in help presentation", () => {
    const defaultFlag = createSkillsFlagDefinition()
    assert.equal(defaultFlag.name, "llms")
    assert.equal(defaultFlag.definition.hidden, true)
    assert.equal(
      defaultFlag.definition.description,
      "Show agent-oriented guidance for this command",
    )

    const customFlag = createSkillsFlagDefinition(
      {
        aliases: ["agent-help"],
        directory: "docs/agents",
        flag: "agents",
      },
      {
        description: "Show instructions for coding agents",
        hidden: false,
      },
    )
    const flag = Flags.boolean(customFlag.definition)

    assert.equal(customFlag.name, "agents")
    assert.deepEqual(flag.aliases, ["agent-help"])
    assert.equal(flag.description, "Show instructions for coding agents")
    assert.equal(flag.hidden, false)
  })
})

describe("commandSkillFilename", () => {
  it("maps command IDs to Markdown filenames", () => {
    assert.equal(commandSkillFilename("blueprinit"), "blueprinit.md")
    assert.equal(
      commandSkillFilename("blueprints:deploy"),
      "blueprints-deploy.md",
    )
    assert.equal(
      commandSkillFilename("functions:env:list"),
      "functions-env-list.md",
    )
    assert.equal(commandSkillFilename(""), "index.md")
  })

  it("rejects command IDs that could leave the skills directory", () => {
    assert.throws(
      () => commandSkillFilename("../secret"),
      /Invalid oclif command ID/,
    )
    assert.throws(
      () => commandSkillFilename("topic\\secret"),
      /Invalid oclif command ID/,
    )
  })
})

describe("hasSkillsFlag", () => {
  it("recognizes both flag names", () => {
    assert.equal(hasSkillsFlag(["--llms"]), true)
    assert.equal(hasSkillsFlag(["value", "--skill"]), true)
  })

  it("requires an exact flag name", () => {
    assert.equal(hasSkillsFlag(["--llms=true"]), false)
    assert.equal(hasSkillsFlag(["--skills"]), false)
  })

  it("ignores values after the argument separator", () => {
    assert.equal(hasSkillsFlag(["--", "--llms"]), false)
    assert.equal(hasSkillsFlag(["value", "--", "--skill"]), false)
  })

  it("recognizes only configured names", () => {
    const config = resolveSkillsFlagConfig({
      aliases: ["a", "agent-help"],
      flag: "agents",
    })

    assert.equal(hasSkillsFlag(["--agents"], config), true)
    assert.equal(hasSkillsFlag(["--agent-help"], config), true)
    assert.equal(hasSkillsFlag(["-a"], config), true)
    assert.equal(hasSkillsFlag(["--a"], config), false)
    assert.equal(hasSkillsFlag(["--llms"], config), false)
    assert.equal(hasSkillsFlag(["--skill"], config), false)
  })
})

describe("ensureFinalNewline", () => {
  it("adds one only when needed", () => {
    assert.equal(ensureFinalNewline("content"), "content\n")
    assert.equal(ensureFinalNewline("content\n"), "content\n")
  })
})

describe("readCommandSkill", () => {
  it("reads a skill and returns undefined for an absent skill", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "skills-flag-reader-"))
    t.after(() => rm(root, { force: true, recursive: true }))
    await mkdir(join(root, "skills"))
    await writeFile(
      join(root, "skills/functions-test.md"),
      "Test a function locally.\n",
    )

    assert.equal(
      await readCommandSkill("functions:test", root),
      "Test a function locally.\n",
    )
    assert.equal(await readCommandSkill("missing", root), undefined)
  })

  it("does not hide filesystem errors other than a missing path", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "skills-flag-reader-"))
    t.after(() => rm(root, { force: true, recursive: true }))
    await writeFile(join(root, "skills"), "not a directory")

    await assert.rejects(readCommandSkill("functions:test", root), {
      code: "ENOTDIR",
    })
  })

  it("reads from a configured directory", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "skills-flag-reader-"))
    t.after(() => rm(root, { force: true, recursive: true }))
    await mkdir(join(root, "docs/agents"), { recursive: true })
    await writeFile(
      join(root, "docs/agents/functions-test.md"),
      "Test with custom guidance.\n",
    )

    assert.equal(
      await readCommandSkill("functions:test", root, "docs/agents"),
      "Test with custom guidance.\n",
    )
  })
})
