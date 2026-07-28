import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { Flags } from "@oclif/core"
import {
  commandSkillFilename,
  ensureFinalNewline,
  hasSkillsFlag,
  llmsFlagConfig,
  readCommandSkill,
} from "../src/index.ts"

describe("llmsFlagConfig", () => {
  it("can be passed directly to Flags.boolean", () => {
    const flag = Flags.boolean(llmsFlagConfig)

    assert.deepEqual(flag.aliases, ["skill"])
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
})
