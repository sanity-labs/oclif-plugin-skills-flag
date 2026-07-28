import { readFile } from "node:fs/promises"
import { join } from "node:path"

const SKILLS_DIRECTORY = "skills"
const SKILLS_FLAGS = new Set(["--llms", "--skill"])

export const llmsFlagConfig = {
  aliases: ["skill"],
  description: "Show agent-oriented guidance for this command",
}

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

export function hasSkillsFlag(argv: string[]): boolean {
  for (const argument of argv) {
    if (argument === "--") return false
    if (SKILLS_FLAGS.has(argument)) return true
  }

  return false
}

export async function readCommandSkill(
  commandId: string,
  root: string,
): Promise<string | undefined> {
  const path = join(root, SKILLS_DIRECTORY, commandSkillFilename(commandId))

  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
}
