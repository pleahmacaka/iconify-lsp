import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { IconifyJSON } from "@iconify/types"
import { getIconData, iconToHTML, iconToSVG, replaceIDs } from "@iconify/utils"

interface Collection {
  file: string
  title: string
}

interface CollectionInfo {
  name?: string
}

interface Entry {
  hidden?: boolean
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T
  } catch {
    return null
  }
}

function visibleNames(entries: Record<string, Entry> | undefined) {
  return Object.entries(entries ?? {})
    .filter(([, e]) => !e.hidden)
    .map(([name]) => name)
}

export class IconStore {
  private collections = new Map<string, Collection>()

  private sets = new Map<string, IconifyJSON | null>()

  private names = new Map<string, string[]>()

  constructor(roots: string[], iconifyJsonPath: string | null) {
    for (const root of roots) {
      this.addSplitPackages(join(root, "node_modules", "@iconify-json"))
    }

    for (const root of roots) {
      this.addFullSet(join(root, "node_modules", "@iconify", "json"))
    }

    if (iconifyJsonPath) {
      this.addFullSet(iconifyJsonPath)
    }
  }

  get size() {
    return this.collections.size
  }

  has(prefix: string) {
    return this.collections.has(prefix)
  }

  title(prefix: string) {
    return this.collections.get(prefix)?.title ?? prefix
  }

  iconNames(prefix: string) {
    const cached = this.names.get(prefix)

    if (cached) {
      return cached
    }

    const set = this.set(prefix)
    const names = set
      ? [...visibleNames(set.icons), ...visibleNames(set.aliases)]
      : []

    this.names.set(prefix, names)

    return names
  }

  svg(prefix: string, name: string, color: string, height: number) {
    const set = this.set(prefix)
    const data = set && getIconData(set, name)

    if (!data) {
      return null
    }

    const { attributes, body } = iconToSVG(data, { height })

    return iconToHTML(replaceIDs(body), attributes).replaceAll(
      "currentColor",
      color,
    )
  }

  private set(prefix: string) {
    if (!this.sets.has(prefix)) {
      const file = this.collections.get(prefix)?.file

      this.sets.set(prefix, file ? readJson<IconifyJSON>(file) : null)
    }

    return this.sets.get(prefix) ?? null
  }

  private addSplitPackages(dir: string) {
    if (!existsSync(dir)) {
      return
    }

    for (const prefix of readdirSync(dir)) {
      const file = join(dir, prefix, "icons.json")

      if (this.collections.has(prefix) || !existsSync(file)) {
        continue
      }

      const info = readJson<CollectionInfo>(join(dir, prefix, "info.json"))

      this.collections.set(prefix, { file, title: info?.name ?? prefix })
    }
  }

  private addFullSet(dir: string) {
    const infos = readJson<Record<string, CollectionInfo>>(
      join(dir, "collections.json"),
    )

    for (const [prefix, info] of Object.entries(infos ?? {})) {
      if (!this.collections.has(prefix)) {
        this.collections.set(prefix, {
          file: join(dir, "json", `${prefix}.json`),
          title: info.name ?? prefix,
        })
      }
    }
  }
}
