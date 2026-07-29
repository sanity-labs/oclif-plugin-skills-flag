import { readFile } from "node:fs/promises"
import { join, posix, win32 } from "node:path"

const DEFAULT_DESCRIPTION = "Show agent-oriented guidance for this command"
const DEFAULT_SKILLS_FLAG_CONFIG: SkillsFlagConfig = {
  aliases: ["skill"],
  directory: "skills",
  flag: "llms",
}
const SKILLS_FLAG_CONFIG_OPTIONS = new Set(["aliases", "directory", "flag"])

export const skillsFlagConfigKey = "oclif-plugin-skills-flag"

export interface SkillsFlagConfig {
  aliases: string[]
  directory: string
  flag: string
}

export interface SkillsFlagConfigInput {
  aliases?: readonly string[]
  directory?: string
  flag?: string
}

export interface SkillsFlagDefinition {
  definition: {
    aliases: string[]
    description: string
    hidden: boolean
  }
  name: string
}

export interface SkillsFlagDefinitionOptions {
  description?: string
  hidden?: boolean
}

function validateFlagName(value: unknown, kind: "alias" | "name"): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("-") ||
    /[\s=\0]/u.test(value)
  ) {
    throw new TypeError(
      `Invalid flag ${kind}: expected a name without leading dashes, whitespace, or "="`,
    )
  }

  return value
}

function validateSkillsDirectory(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    posix.isAbsolute(value) ||
    win32.isAbsolute(value) ||
    value.split(/[\\/]/u).includes("..")
  ) {
    throw new TypeError(
      "Invalid skills directory: expected a relative path without parent traversal",
    )
  }

  return value
}

export function resolveSkillsFlagConfig(
  input: unknown = undefined,
): SkillsFlagConfig {
  if (
    input !== undefined &&
    (typeof input !== "object" || input === null || Array.isArray(input))
  ) {
    throw new TypeError("Skills flag configuration must be an object")
  }

  const options = (input ?? {}) as Record<string, unknown>
  for (const option of Object.keys(options)) {
    if (!SKILLS_FLAG_CONFIG_OPTIONS.has(option)) {
      throw new TypeError(`Unknown configuration option: ${option}`)
    }
  }

  const flag = validateFlagName(
    options.flag ?? DEFAULT_SKILLS_FLAG_CONFIG.flag,
    "name",
  )
  const aliasesInput = options.aliases ?? [
    ...DEFAULT_SKILLS_FLAG_CONFIG.aliases,
  ]
  if (!Array.isArray(aliasesInput)) {
    throw new TypeError("Skills flag aliases must be an array")
  }

  const aliases = aliasesInput.map((alias) => validateFlagName(alias, "alias"))
  const names = [flag, ...aliases]
  if (new Set(names).size !== names.length) {
    throw new TypeError("Duplicate flag name in flag or aliases")
  }

  return {
    aliases,
    directory: validateSkillsDirectory(
      options.directory ?? DEFAULT_SKILLS_FLAG_CONFIG.directory,
    ),
    flag,
  }
}

export function createSkillsFlagDefinition(
  config: SkillsFlagConfigInput = {},
  options: SkillsFlagDefinitionOptions = {},
): SkillsFlagDefinition {
  const resolved = resolveSkillsFlagConfig(config)
  const description = options.description ?? DEFAULT_DESCRIPTION
  const hidden = options.hidden ?? true

  if (typeof description !== "string") {
    throw new TypeError("Flag description must be a string")
  }
  if (typeof hidden !== "boolean") {
    throw new TypeError("Flag visibility must be a boolean")
  }

  return {
    definition: {
      aliases: resolved.aliases,
      description,
      hidden,
    },
    name: resolved.flag,
  }
}

export const llmsFlagConfig = createSkillsFlagDefinition().definition

export function commandSkillFilename(commandId: string): string {
  const filename = commandId.replaceAll(":", "-") || "index"

  if (
    filename === "." ||
    filename === ".." ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("\0")
  ) {
    throw new TypeError(`Invalid oclif command ID: ${commandId}`)
  }

  return `${filename}.md`
}

export function ensureFinalNewline(input: string): string {
  return input.endsWith("\n") ? input : `${input}\n`
}

export function hasSkillsFlag(
  argv: string[],
  config: Pick<
    SkillsFlagConfig,
    "aliases" | "flag"
  > = DEFAULT_SKILLS_FLAG_CONFIG,
): boolean {
  const flags = new Set([
    `--${config.flag}`,
    ...config.aliases.map((alias) =>
      alias.length === 1 ? `-${alias}` : `--${alias}`,
    ),
  ])

  for (const argument of argv) {
    if (argument === "--") return false
    if (flags.has(argument)) return true
  }

  return false
}

export async function readCommandSkill(
  commandId: string,
  root: string,
  directory = DEFAULT_SKILLS_FLAG_CONFIG.directory,
): Promise<string | undefined> {
  const path = join(
    root,
    validateSkillsDirectory(directory),
    commandSkillFilename(commandId),
  )

  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
}
