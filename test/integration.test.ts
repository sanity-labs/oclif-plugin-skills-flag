import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execPath } from "node:process"
import { describe, it, type TestContext } from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = fileURLToPath(new URL("../", import.meta.url))

async function createHost(
  t: TestContext,
  skill?: string,
): Promise<{ bin: string; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "skills-flag-integration-"))
  t.after(() => rm(root, { force: true, recursive: true }))

  await mkdir(join(root, "bin"))
  await mkdir(join(root, "commands"))
  await mkdir(join(root, "node_modules/@oclif"), { recursive: true })
  await mkdir(join(root, "node_modules/@sanity-labs"), { recursive: true })
  await symlink(
    join(projectRoot, "node_modules/@oclif/core"),
    join(root, "node_modules/@oclif/core"),
  )
  const pluginRoot = join(
    root,
    "node_modules/@sanity-labs/oclif-plugin-skills-flag",
  )
  await mkdir(pluginRoot)
  await symlink(join(projectRoot, "src"), join(pluginRoot, "src"))
  await writeFile(
    join(pluginRoot, "package.json"),
    JSON.stringify({
      name: "@sanity-labs/oclif-plugin-skills-flag",
      version: "0.0.0",
      type: "module",
      oclif: {
        hooks: {
          init: "./src/hooks/init.ts",
        },
      },
    }),
  )

  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "skills-flag-test-host",
      version: "0.0.0",
      type: "module",
      dependencies: {
        "@oclif/core": "^4.0.0",
        "@sanity-labs/oclif-plugin-skills-flag": "0.0.0",
      },
      oclif: {
        bin: "skills-test",
        commands: "./commands",
        plugins: ["@sanity-labs/oclif-plugin-skills-flag"],
        topicSeparator: " ",
      },
    }),
  )
  await writeFile(
    join(root, "bin/run.js"),
    "import {execute} from '@oclif/core'\nawait execute({dir: import.meta.url})\n",
  )
  await writeFile(
    join(root, "commands/hello.js"),
    `import {Command} from '@oclif/core'

export default class HelloCommand extends Command {
  static strict = false

  async run() {
    this.log('COMMAND RAN')
  }
}
`,
  )

  if (skill !== undefined) {
    await mkdir(join(root, "skills"))
    await writeFile(join(root, "skills/hello.md"), skill)
  }

  return { bin: join(root, "bin/run.js"), root }
}

function run(root: string, bin: string, ...argv: string[]) {
  return spawnSync(execPath, [bin, ...argv], {
    cwd: root,
    encoding: "utf8",
  })
}

describe("oclif plugin", () => {
  for (const flag of ["--llms", "--skill"]) {
    it(`prints a skill for ${flag} without running the command`, async (t) => {
      const host = await createHost(t, "Agent instructions")
      const result = run(host.root, host.bin, "hello", flag)

      assert.equal(result.status, 0)
      assert.equal(result.stdout, "Agent instructions\n")
      assert.equal(result.stderr, "")
    })
  }

  it("runs the command when neither flag is present", async (t) => {
    const host = await createHost(t, "Agent instructions")
    const result = run(host.root, host.bin, "hello")

    assert.equal(result.status, 0)
    assert.equal(result.stdout, "COMMAND RAN\n")
    assert.equal(result.stderr, "")
  })

  it("reports a missing skill without running the command", async (t) => {
    const host = await createHost(t)
    const result = run(host.root, host.bin, "hello", "--llms")

    assert.equal(result.status, 2)
    assert.doesNotMatch(result.stdout, /COMMAND RAN/)
    assert.match(result.stderr, /No agent guidance is available for `hello`\./)
    assert.match(result.stderr, /Add it at skills\/hello\.md\./)
  })

  it("ignores the flags after the argument separator", async (t) => {
    const host = await createHost(t, "Agent instructions")
    const result = run(host.root, host.bin, "hello", "--", "--llms")

    assert.equal(result.status, 0)
    assert.equal(result.stdout, "COMMAND RAN\n")
    assert.equal(result.stderr, "")
  })
})
