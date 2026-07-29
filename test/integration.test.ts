import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execPath } from "node:process"
import { describe, it, type TestContext } from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = fileURLToPath(new URL("../", import.meta.url))
const skillsFlagConfigKey = "oclif-plugin-skills-flag"
const skillsFlagPluginName = "@sanity-labs/oclif-plugin-skills-flag"

interface SkillsFlagFixtureConfig {
  aliases?: string[]
  directory?: string
  flag?: string
}

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
  skillsFlagConfig?: SkillsFlagFixtureConfig,
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

  const packageJson: Record<string, unknown> = {
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
  }
  if (skillsFlagConfig !== undefined) {
    packageJson[skillsFlagConfigKey] = skillsFlagConfig
  }
  await writeFile(join(root, "package.json"), JSON.stringify(packageJson))
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
    const directory = skillsFlagConfig?.directory ?? "skills"
    await mkdir(join(root, directory), { recursive: true })
    await writeFile(join(root, directory, "hello.md"), skill)
  }

  return { bin: join(root, "bin/run.js"), root }
}

async function createNestedHost(
  t: TestContext,
  options: {
    childSkillsFlagConfig?: SkillsFlagFixtureConfig
    hostSkillsFlagConfig?: SkillsFlagFixtureConfig
    hostUsesSkillsFlag: boolean
  },
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
  const childDirectory = options.childSkillsFlagConfig?.directory ?? "skills"
  await mkdir(join(childRoot, "commands"), { recursive: true })
  await mkdir(join(childRoot, childDirectory), { recursive: true })
  const childPackageJson: Record<string, unknown> = {
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
  }
  if (options.childSkillsFlagConfig !== undefined) {
    childPackageJson[skillsFlagConfigKey] = options.childSkillsFlagConfig
  }
  await writeFile(
    join(childRoot, "package.json"),
    JSON.stringify(childPackageJson),
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
  await writeFile(
    join(childRoot, childDirectory, "from-cli-one.md"),
    "CLI ONE SKILL\n",
  )

  const dependencies: Record<string, string> = {
    "@oclif/core": "^4.0.0",
    "cli-one": "0.0.0",
  }
  const plugins = ["cli-one"]
  if (options.hostUsesSkillsFlag) {
    dependencies[skillsFlagPluginName] = "0.0.0"
    plugins.push(skillsFlagPluginName)
  }

  const hostPackageJson: Record<string, unknown> = {
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
  }
  if (options.hostSkillsFlagConfig !== undefined) {
    hostPackageJson[skillsFlagConfigKey] = options.hostSkillsFlagConfig
  }
  await writeFile(join(root, "package.json"), JSON.stringify(hostPackageJson))
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
  const hostDirectory = options.hostSkillsFlagConfig?.directory ?? "skills"
  if (hostDirectory !== "skills") {
    await mkdir(join(root, hostDirectory), { recursive: true })
  }
  await writeFile(
    join(root, hostDirectory, "from-cli-two.md"),
    "CLI TWO SKILL\n",
  )

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

  it("uses configured flag names and skills directory", async (t) => {
    const host = await createHost(t, "Custom agent instructions", {
      aliases: ["agent-help"],
      directory: "docs/agents",
      flag: "agents",
    })

    for (const flag of ["--agents", "--agent-help"]) {
      const result = run(host.root, host.bin, "hello", flag)

      assert.equal(result.status, 0)
      assert.equal(result.stdout, "Custom agent instructions\n")
      assert.equal(result.stderr, "")
      assert.doesNotMatch(result.stdout, /COMMAND RAN/)
    }

    const defaultFlag = run(host.root, host.bin, "hello", "--llms")
    assert.equal(defaultFlag.status, 0)
    assert.equal(defaultFlag.stdout, "COMMAND RAN\n")
    assert.equal(defaultFlag.stderr, "")
  })

  it("reports a configured skills directory when guidance is missing", async (t) => {
    const host = await createHost(t, undefined, {
      directory: "docs/agents",
      flag: "agents",
    })
    const result = run(host.root, host.bin, "hello", "--agents")

    assert.equal(result.status, 2)
    assert.match(result.stderr, /Add it at docs\/agents\/hello\.md\./)
    assert.doesNotMatch(result.stdout, /COMMAND RAN/)
  })

  it("reports invalid package configuration", async (t) => {
    const host = await createHost(t, undefined, { flag: "--agents" })
    const result = run(host.root, host.bin, "hello", "--agents")

    assert.equal(result.status, 2)
    assert.match(
      result.stderr,
      /Invalid skills flag configuration in skills-flag-test-host: Invalid/,
    )
    assert.match(result.stderr, /flag name: expected/)
    assert.match(result.stderr, /E_SKILLS_FLAG_CONFIG/)
    assert.doesNotMatch(result.stdout, /COMMAND RAN/)
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

  it("keeps different owner configurations isolated", async (t) => {
    const host = await createNestedHost(t, {
      childSkillsFlagConfig: {
        aliases: ["one-skill"],
        directory: "one-guides",
        flag: "one-docs",
      },
      hostSkillsFlagConfig: {
        aliases: ["two-skill"],
        directory: "two-guides",
        flag: "two-docs",
      },
      hostUsesSkillsFlag: true,
    })

    const child = run(host.root, host.bin, "from-cli-one", "--one-docs")
    assert.equal(child.status, 0)
    assert.equal(child.stdout, "CLI ONE SKILL\n")
    assert.equal(child.stderr, "")

    const parent = run(host.root, host.bin, "from-cli-two", "--two-docs")
    assert.equal(parent.status, 0)
    assert.equal(parent.stdout, "CLI TWO SKILL\n")
    assert.equal(parent.stderr, "")

    const otherOwnerFlag = run(
      host.root,
      host.bin,
      "from-cli-one",
      "--two-docs",
    )
    assert.equal(otherOwnerFlag.status, 0)
    assert.equal(otherOwnerFlag.stdout, "CLI ONE COMMAND RAN\n")
    assert.equal(otherOwnerFlag.stderr, "")
  })
})
