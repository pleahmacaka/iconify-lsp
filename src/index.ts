#!/usr/bin/env node
import { fileURLToPath } from "node:url"
import {
  type CompletionItem,
  CompletionItemKind,
  createConnection,
  type InitializeParams,
  MarkupKind,
  type Position,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
} from "vscode-languageserver/node"
import { TextDocument } from "vscode-languageserver-textdocument"
import { type Bindings, buildBindings, stringValues } from "./bindings.ts"
import { IconStore } from "./icons.ts"
import { rankNames } from "./rank.ts"
import { iconTokenAt, identifierAt } from "./token.ts"

const COMPLETION_LIMIT = 100
const LIST_LIMIT = 12
const PREVIEW_HEIGHT = 64
const LIST_HEIGHT = 18

interface IconRef {
  prefix: string
  name: string
}

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)
const bindingCache = new Map<string, { version: number; bindings: Bindings }>()

let store = new IconStore([], null)
let color = "#808080"

function optionString(options: unknown, key: string) {
  if (typeof options !== "object" || options === null) {
    return null
  }

  const value = (options as Record<string, unknown>)[key]

  return typeof value === "string" && value ? value : null
}

function workspaceRoots(params: InitializeParams) {
  return (params.workspaceFolders ?? [])
    .map(f => f.uri)
    .filter(uri => uri.startsWith("file:"))
    .map(uri => fileURLToPath(uri))
}

function lineAt(uri: string, position: Position) {
  return (
    documents.get(uri)?.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line + 1, character: 0 },
    }) ?? null
  )
}

function tokenAt(uri: string, position: Position) {
  const line = lineAt(uri, position)
  const token = line === null ? null : iconTokenAt(line, position.character)

  return token && store.has(token.prefix) ? token : null
}

function bindingsFor(uri: string) {
  const document = documents.get(uri)

  if (!document) {
    return null
  }

  const cached = bindingCache.get(uri)

  if (cached?.version === document.version) {
    return cached.bindings
  }

  const bindings = buildBindings(uri, document.getText())

  bindingCache.set(uri, { version: document.version, bindings })

  return bindings
}

function toIconRef(value: string): IconRef | null {
  const [prefix, name, ...rest] = value.split(":")

  if (!prefix || !name || rest.length > 0 || !store.has(prefix)) {
    return null
  }

  return { prefix, name }
}

function image({ prefix, name }: IconRef, height: number) {
  const svg = store.svg(prefix, name, color, height)

  if (!svg) {
    return null
  }

  const data = Buffer.from(svg).toString("base64")

  return `![${prefix}:${name}](data:image/svg+xml;base64,${data})`
}

function iconLink({ prefix, name }: IconRef) {
  const link = `https://icon-sets.iconify.design/${prefix}/${name}/`

  return `[${prefix}:${name}](${link})`
}

function preview(ref: IconRef) {
  const picture = image(ref, PREVIEW_HEIGHT)
  const title = store.title(ref.prefix)

  return picture ? `${picture}\n\n${iconLink(ref)} from ${title}` : null
}

function referencedIcons(uri: string, name: string) {
  const bindings = bindingsFor(uri)
  const rows: string[] = []

  for (const value of bindings ? stringValues(bindings, name) : []) {
    const ref = toIconRef(value)
    const picture = ref && image(ref, LIST_HEIGHT)

    if (ref && picture) {
      rows.push(`| ${picture} | ${iconLink(ref)} |`)
    }
  }

  if (rows.length === 0) {
    return null
  }

  return [
    "| Icon | Name |",
    "| :-: | --- |",
    ...rows.slice(0, LIST_LIMIT),
  ].join("\n")
}

function hoverResult(
  markdown: string,
  line: number,
  span: { start: number; end: number },
) {
  return {
    contents: { kind: MarkupKind.Markdown, value: markdown },
    range: {
      start: { line, character: span.start },
      end: { line, character: span.end },
    },
  }
}

connection.onInitialize(params => {
  const options = params.initializationOptions

  store = new IconStore(
    workspaceRoots(params),
    optionString(options, "iconifyJsonPath"),
  )
  color = optionString(options, "color") ?? color

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { triggerCharacters: [":"], resolveProvider: true },
      hoverProvider: true,
    },
    serverInfo: { name: "iconify-lsp" },
  }
})

connection.onInitialized(() => {
  if (store.size === 0) {
    connection.console.warn(
      "No Iconify icon data found. Install @iconify/json or @iconify-json/* packages, or set the iconifyJsonPath initialization option.",
    )
  }
})

connection.onCompletion(({ textDocument, position }) => {
  const token = tokenAt(textDocument.uri, position)

  if (!token || position.character < token.nameStart) {
    return null
  }

  const query = token.name.slice(0, position.character - token.nameStart)
  const names = rankNames(
    store.iconNames(token.prefix),
    query,
    COMPLETION_LIMIT,
  )
  const range = {
    start: { line: position.line, character: token.nameStart },
    end: position,
  }

  return {
    isIncomplete: names.length === COMPLETION_LIMIT,
    items: names.map(
      (name): CompletionItem => ({
        label: name,
        kind: CompletionItemKind.Value,
        detail: store.title(token.prefix),
        textEdit: { range, newText: name },
        data: { prefix: token.prefix, name } satisfies IconRef,
      }),
    ),
  }
})

connection.onCompletionResolve(item => {
  const markdown = preview(item.data as IconRef)

  if (markdown) {
    item.documentation = { kind: MarkupKind.Markdown, value: markdown }
  }

  return item
})

connection.onHover(({ textDocument, position }) => {
  const token = tokenAt(textDocument.uri, position)

  if (token) {
    const markdown = preview(token)

    return markdown ? hoverResult(markdown, position.line, token) : null
  }

  const line = lineAt(textDocument.uri, position)
  const identifier =
    line === null ? null : identifierAt(line, position.character)
  const table = identifier && referencedIcons(textDocument.uri, identifier.text)

  if (!identifier || !table) {
    return null
  }

  return hoverResult(table, position.line, identifier)
})

documents.onDidClose(e => {
  bindingCache.delete(e.document.uri)
})

documents.listen(connection)
connection.listen()
