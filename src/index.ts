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
import { IconStore } from "./icons.ts"
import { rankNames } from "./rank.ts"
import { iconTokenAt } from "./token.ts"

const COMPLETION_LIMIT = 100

interface IconRef {
  prefix: string
  name: string
}

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

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

function tokenAt(uri: string, position: Position) {
  const document = documents.get(uri)

  if (!document) {
    return null
  }

  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  })
  const token = iconTokenAt(line, position.character)

  return token && store.has(token.prefix) ? token : null
}

function preview({ prefix, name }: IconRef) {
  const svg = store.svg(prefix, name, color)

  if (!svg) {
    return null
  }

  const image = Buffer.from(svg).toString("base64")
  const link = `https://icon-sets.iconify.design/${prefix}/${name}/`

  return [
    `![${prefix}:${name}](data:image/svg+xml;base64,${image})`,
    `[${prefix}:${name}](${link}) from ${store.title(prefix)}`,
  ].join("\n\n")
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
  const markdown = token && preview(token)

  if (!token || !markdown) {
    return null
  }

  return {
    contents: { kind: MarkupKind.Markdown, value: markdown },
    range: {
      start: { line: position.line, character: token.start },
      end: { line: position.line, character: token.end },
    },
  }
})

documents.listen(connection)
connection.listen()
