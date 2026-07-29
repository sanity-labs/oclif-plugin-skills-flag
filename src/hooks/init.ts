import { writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Hook } from "@oclif/core"
import {
  commandSkillFilename,
  ensureFinalNewline,
  hasSkillsFlag,
  readCommandSkill,
  resolveSkillsFlagConfig,
  type SkillsFlagConfig,
  skillsFlagConfigKey,
} from "../skills.ts"

const SKILLS_FLAG_PLUGIN_NAME = "@sanity-labs/oclif-plugin-skills-flag"

export interface SkillsFlagRuntime {
  exit(code: number): never
  write(output: string): void
}

export interface SkillsFlagOptions {
  argv: string[]
  bin: string
  commandExists(commandId: string): boolean
  commandId: string | undefined
  config: SkillsFlagConfig
  error(message: string): void
  isSingleCommandCLI: boolean
  root: string
}

const processRuntime: SkillsFlagRuntime = {
  exit(code) {
    process.exit(code)
  },
  write(output) {
    writeFileSync(process.stdout.fd, output)
  },
}

export async function handleSkillsFlag(
  options: SkillsFlagOptions,
  runtime: SkillsFlagRuntime = processRuntime,
): Promise<void> {
  if (!hasSkillsFlag(options.argv, options.config)) return
  if (!options.commandId || !options.commandExists(options.commandId)) return

  const skillCommandId = options.isSingleCommandCLI ? "" : options.commandId
  const filename = commandSkillFilename(skillCommandId)
  const skill = await readCommandSkill(
    skillCommandId,
    options.root,
    options.config.directory,
  )

  if (skill === undefined) {
    const commandName = skillCommandId.replaceAll(":", " ") || options.bin
    options.error(
      `No agent guidance is available for \`${commandName}\`.\nAdd it at ${join(options.config.directory, filename)}.`,
    )
    return
  }

  runtime.write(ensureFinalNewline(skill))
  runtime.exit(0)
}

const hook: Hook.Init = async ({ argv, config, context, id }) => {
  if (!id) return

  // oclif runs transitive init hooks across the assembled CLI, so find the command's actual owner.
  const command = config.findCommand(id)
  const commandPlugin = command?.pluginName
    ? config.plugins.get(command.pluginName)
    : undefined

  // A child CLI's dependency on this plugin must not opt the parent CLI's commands in.
  if (!commandPlugin?.pjson.oclif.plugins?.includes(SKILLS_FLAG_PLUGIN_NAME)) {
    return
  }

  // Command shape and skill files belong to the owner, not necessarily the outer host CLI.
  const commandDiscovery = commandPlugin.pjson.oclif.commands
  const isSingleCommandCLI =
    typeof commandDiscovery !== "string" &&
    commandDiscovery?.strategy === "single" &&
    Boolean(commandDiscovery.target)

  let skillsFlagConfig: SkillsFlagConfig
  try {
    skillsFlagConfig = resolveSkillsFlagConfig(
      commandPlugin.pjson[skillsFlagConfigKey],
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    context.error(
      `Invalid skills flag configuration in ${commandPlugin.name}: ${message}`,
      { code: "E_SKILLS_FLAG_CONFIG" },
    )
    return
  }

  await handleSkillsFlag({
    argv,
    bin: config.bin,
    commandExists: (commandId) => config.findCommand(commandId) !== undefined,
    commandId: id,
    config: skillsFlagConfig,
    error: (message) => context.error(message, { code: "E_SKILL_NOT_FOUND" }),
    isSingleCommandCLI,
    root: commandPlugin.root,
  })
}

export default hook
