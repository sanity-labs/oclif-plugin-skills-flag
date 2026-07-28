import { writeFileSync } from "node:fs"
import type { Hook } from "@oclif/core"
import {
  commandSkillFilename,
  ensureFinalNewline,
  hasSkillsFlag,
  readCommandSkill,
} from "../skills.ts"

export interface SkillsFlagRuntime {
  exit(code: number): never
  write(output: string): void
}

export interface SkillsFlagOptions {
  argv: string[]
  bin: string
  commandExists(commandId: string): boolean
  commandId: string | undefined
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
  if (!hasSkillsFlag(options.argv)) return
  if (!options.commandId || !options.commandExists(options.commandId)) return

  const skillCommandId = options.isSingleCommandCLI ? "" : options.commandId
  const filename = commandSkillFilename(skillCommandId)
  const skill = await readCommandSkill(skillCommandId, options.root)

  if (skill === undefined) {
    const commandName = skillCommandId.replaceAll(":", " ") || options.bin
    options.error(
      `No agent guidance is available for \`${commandName}\`.\nAdd it at skills/${filename}.`,
    )
    return
  }

  runtime.write(ensureFinalNewline(skill))
  runtime.exit(0)
}

const hook: Hook.Init = async ({ argv, config, context, id }) => {
  await handleSkillsFlag({
    argv,
    bin: config.bin,
    commandExists: (commandId) => config.findCommand(commandId) !== undefined,
    commandId: id,
    error: (message) => context.error(message, { code: "E_SKILL_NOT_FOUND" }),
    isSingleCommandCLI: config.isSingleCommandCLI,
    root: config.root,
  })
}

export default hook
