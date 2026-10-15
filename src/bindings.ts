import { tsPlugin } from "@sveltejs/acorn-typescript"
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/types"
import { Parser } from "acorn"

type Node = TSESTree.Node

export interface Bindings {
  values: Map<string, Node[]>
  types: Map<string, Node>
}

const SCRIPT_EXTENSIONS = [
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
]

const MARKUP_EXTENSIONS = [".svelte", ".vue", ".html", ".astro"]

const TypeScriptParser = Parser.extend(tsPlugin())
const TsxParser = Parser.extend(tsPlugin({ jsx: true }))

function isNode(value: unknown): value is Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  )
}

function walk(node: Node, visit: (n: Node) => void) {
  visit(node)

  for (const [key, value] of Object.entries(node)) {
    if (key === "loc") {
      continue
    }

    for (const child of Array.isArray(value) ? value : [value]) {
      if (isNode(child)) {
        walk(child, visit)
      }
    }
  }
}

function scriptSources(path: string, text: string) {
  if (SCRIPT_EXTENSIONS.some(e => path.endsWith(e))) {
    return [text]
  }

  if (!MARKUP_EXTENSIONS.some(e => path.endsWith(e))) {
    return []
  }

  const sources: string[] = []

  if (path.endsWith(".astro") && text.startsWith("---")) {
    const end = text.indexOf("\n---", 3)

    if (end > 0) {
      sources.push(text.slice(3, end))
    }
  }

  let from = 0

  for (;;) {
    const open = text.indexOf("<script", from)
    const start = open < 0 ? -1 : text.indexOf(">", open)
    const close = start < 0 ? -1 : text.indexOf("</script>", start)

    if (close < 0) {
      break
    }

    sources.push(text.slice(start + 1, close))
    from = close
  }

  return sources
}

function parseScripts(uri: string, text: string) {
  const path = uri.toLowerCase()
  const parser =
    path.endsWith(".jsx") || path.endsWith(".tsx")
      ? TsxParser
      : TypeScriptParser
  const programs: Node[] = []

  for (const source of scriptSources(path, text)) {
    try {
      const program = parser.parse(source, {
        ecmaVersion: "latest",
        sourceType: "module",
      })

      programs.push(program as unknown as TSESTree.Program)
    } catch {}
  }

  return programs
}

function referencedType(node: Node, bindings: Bindings) {
  if (
    node.type === AST_NODE_TYPES.TSTypeReference &&
    node.typeName.type === AST_NODE_TYPES.Identifier
  ) {
    return bindings.types.get(node.typeName.name) ?? null
  }

  return null
}

function propertyTypes(type: Node, key: string, bindings: Bindings) {
  const found: Node[] = []
  const seen = new Set<Node>()

  const visit = (n: Node) => {
    if (seen.has(n)) {
      return
    }

    seen.add(n)

    walk(n, child => {
      if (
        child.type === AST_NODE_TYPES.TSPropertySignature &&
        child.key.type === AST_NODE_TYPES.Identifier &&
        child.key.name === key &&
        child.typeAnnotation
      ) {
        found.push(child.typeAnnotation)
      }

      const target = referencedType(child, bindings)

      if (target) {
        visit(target)
      }
    })
  }

  visit(type)

  return found
}

export function buildBindings(uri: string, text: string): Bindings {
  const bindings: Bindings = { values: new Map(), types: new Map() }
  const patterns: { name: string; type: Node }[] = []

  const add = (name: string, node: Node | null | undefined) => {
    if (node) {
      bindings.values.set(name, [...(bindings.values.get(name) ?? []), node])
    }
  }

  for (const program of parseScripts(uri, text)) {
    walk(program, n => {
      if (n.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
        bindings.types.set(n.id.name, n.typeAnnotation)
      } else if (n.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
        bindings.types.set(n.id.name, n.body)
      } else if (n.type === AST_NODE_TYPES.Identifier && n.typeAnnotation) {
        add(n.name, n.typeAnnotation)
      } else if (
        n.type === AST_NODE_TYPES.VariableDeclarator &&
        n.id.type === AST_NODE_TYPES.Identifier
      ) {
        add(n.id.name, n.init)
      } else if (
        (n.type === AST_NODE_TYPES.AssignmentPattern ||
          n.type === AST_NODE_TYPES.AssignmentExpression) &&
        n.left.type === AST_NODE_TYPES.Identifier
      ) {
        add(n.left.name, n.right)
      } else if (n.type === AST_NODE_TYPES.ObjectPattern && n.typeAnnotation) {
        for (const p of n.properties) {
          if (
            p.type === AST_NODE_TYPES.Property &&
            p.key.type === AST_NODE_TYPES.Identifier
          ) {
            patterns.push({ name: p.key.name, type: n.typeAnnotation })
          }
        }
      }
    })
  }

  for (const { name, type } of patterns) {
    for (const node of propertyTypes(type, name, bindings)) {
      add(name, node)
    }
  }

  return bindings
}

export function stringValues(bindings: Bindings, name: string) {
  const values = new Set<string>()
  const seen = new Set<Node>()

  const visit = (n: Node) => {
    if (seen.has(n)) {
      return
    }

    seen.add(n)

    walk(n, child => {
      if (
        child.type === AST_NODE_TYPES.Literal &&
        typeof child.value === "string"
      ) {
        values.add(child.value)
      } else if (
        child.type === AST_NODE_TYPES.TemplateLiteral &&
        child.expressions.length === 0
      ) {
        values.add(child.quasis[0]?.value.cooked ?? "")
      } else if (child.type === AST_NODE_TYPES.Identifier) {
        for (const node of bindings.values.get(child.name) ?? []) {
          visit(node)
        }
      }

      const target = referencedType(child, bindings)

      if (target) {
        visit(target)
      }
    })
  }

  for (const node of bindings.values.get(name) ?? []) {
    visit(node)
  }

  return [...values]
}
