import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execPath } from "node:process"
import { describe, it, type TestContext } from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = fileURLToPath(new URL("../", import.meta.url))
const skillsFlagPluginName = "@sanity-labs/oclif-plugin-skills-flag"

async function installSkillsFlagPlugin(root: string): Promise<void> {
  const pluginRoot = join(root, "node_modules", skillsFlagPluginName)
  await mkdir(pluginRoot, { recursive: true })
  await symlink(join(projectRoot, "src"), join(pluginRoot, "src"))
  await writeFile(
    join(pluginRoot, "package.json"),
    JSON.stringify({
      name: skillsFlagPluginName,
      version: "0.0.0",
      type: "module",
      oclif: {
        hooks: {
          init: "./src/hooks/init.ts",
        },
      },
    }),
  )
}

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
  await installSkillsFlagPlugin(root)

  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "skills-flag-test-host",
      version: "0.0.0",
      type: "module",
      dependencies: {
        "@oclif/core": "^4.0.0",
        [skillsFlagPluginName]: "0.0.0",
      },
      oclif: {
        bin: "skills-test",
        commands: "./commands",
        plugins: [skillsFlagPluginName],
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

async function createNestedHost(
  t: TestContext,
  options: { hostUsesSkillsFlag: boolean },
): Promise<{ bin: string; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "skills-flag-nested-"))
  t.after(() => rm(root, { force: true, recursive: true }))

  await mkdir(join(root, "bin"))
  await mkdir(join(root, "commands"))
  await mkdir(join(root, "skills"))
  await mkdir(join(root, "node_modules/@oclif"), { recursive: true })
  await symlink(
    join(projectRoot, "node_modules/@oclif/core"),
    join(root, "node_modules/@oclif/core"),
  )
  await installSkillsFlagPlugin(root)

  const childRoot = join(root, "node_modules/cli-one")
  await mkdir(join(childRoot, "commands"), { recursive: true })
  await mkdir(join(childRoot, "skills"))
  await writeFile(
    join(childRoot, "package.json"),
    JSON.stringify({
      name: "cli-one",
      version: "0.0.0",
      type: "module",
      dependencies: {
        [skillsFlagPluginName]: "0.0.0",
      },
      oclif: {
        commands: "./commands",
        plugins: [skillsFlagPluginName],
      },
    }),
  )
  await writeFile(
    join(childRoot, "commands/from-cli-one.js"),
    `import {Command} from '@oclif/core'

export default class FromCliOneCommand extends Command {
  static strict = false

  async run() {
    this.log('CLI ONE COMMAND RAN')
  }
}
`,
  )
  await writeFile(join(childRoot, "skills/from-cli-one.md"), "CLI ONE SKILL\n")

  const dependencies: Record<string, string> = {
    "@oclif/core": "^4.0.0",
    "cli-one": "0.0.0",
  }
  const plugins = ["cli-one"]
  if (options.hostUsesSkillsFlag) {
    dependencies[skillsFlagPluginName] = "0.0.0"
    plugins.push(skillsFlagPluginName)
  }

  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "cli-two",
      version: "0.0.0",
      type: "module",
      dependencies,
      oclif: {
        bin: "cli-two",
        commands: "./commands",
        plugins,
        topicSeparator: " ",
      },
    }),
  )
  await writeFile(
    join(root, "bin/run.js"),
    "import {execute} from '@oclif/core'\nawait execute({dir: import.meta.url})\n",
  )
  await writeFile(
    join(root, "commands/from-cli-two.js"),
    `import {Command, Flags} from '@oclif/core'

export default class FromCliTwoCommand extends Command {
  static flags = {
    llms: Flags.boolean({aliases: ['skill']}),
  }

  async run() {
    const {flags} = await this.parse(FromCliTwoCommand)
    this.log(\`CLI TWO FLAG: \${flags.llms}\`)
  }
}
`,
  )
  await writeFile(join(root, "skills/from-cli-two.md"), "CLI TWO SKILL\n")

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

describe("nested oclif plugins", () => {
  for (const flag of ["--llms", "--skill"]) {
    it(`reads CLI 1's skill for ${flag} when invoked through CLI 2`, async (t) => {
      const host = await createNestedHost(t, { hostUsesSkillsFlag: false })
      const result = run(host.root, host.bin, "from-cli-one", flag)

      assert.equal(result.status, 0)
      assert.equal(result.stdout, "CLI ONE SKILL\n")
      assert.equal(result.stderr, "")
      assert.doesNotMatch(result.stdout, /CLI ONE COMMAND RAN/)
    })

    it(`leaves CLI 2's own ${flag} flag alone when only CLI 1 uses the plugin`, async (t) => {
      const host = await createNestedHost(t, { hostUsesSkillsFlag: false })
      const result = run(host.root, host.bin, "from-cli-two", flag)

      assert.equal(result.status, 0)
      assert.equal(result.stdout, "CLI TWO FLAG: true\n")
      assert.equal(result.stderr, "")
    })

    for (const command of ["from-cli-one", "from-cli-two"]) {
      it(`reads the owning CLI's skill for ${command} ${flag} when both CLIs use the plugin`, async (t) => {
        const host = await createNestedHost(t, { hostUsesSkillsFlag: true })
        const result = run(host.root, host.bin, command, flag)
        const owner = command === "from-cli-one" ? "ONE" : "TWO"

        assert.equal(result.status, 0)
        assert.equal(result.stdout, `CLI ${owner} SKILL\n`)
        assert.equal(result.stderr, "")
        assert.doesNotMatch(result.stdout, /COMMAND RAN|CLI TWO FLAG/)
      })
    }
  }
})
