#!/usr/bin/env node
import { fileURLToPath } from "node:url"
import {
  type CompletionItem,
  CompletionItemKind,
  createConnection,
  type InitializeParams,
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

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

let store = new IconStore([], null)

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

connection.onInitialize(params => {
  store = new IconStore(
    workspaceRoots(params),
    optionString(params.initializationOptions, "iconifyJsonPath"),
  )

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { triggerCharacters: [":"] },
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
      }),
    ),
  }
})

documents.listen(connection)
connection.listen()
