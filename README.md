# iconify-lsp

A language server for [Iconify](https://iconify.design/) icon names.

- Completion of icon names after a prefix such as `mdi:` or `lucide:`
- Hover preview of icon strings
- Hover preview of variables that hold icon strings in the same file

## Usage

Install from npm and run it over stdio:

```sh
npm install -g iconify-lsp
iconify-lsp --stdio
```

For Zed, install the [Iconify extension](https://github.com/PleahMaCaka/zed-iconify-lsp) instead.

## Icon data

Icon sets are read from, in order:

1. `node_modules/@iconify-json/*` in each workspace folder
2. `node_modules/@iconify/json` in each workspace folder
3. The `iconifyJsonPath` initialization option

## Initialization options

| Option            | Description                           | Default   |
| ----------------- | ------------------------------------- | --------- |
| `iconifyJsonPath` | Path to an `@iconify/json` directory  | none      |
| `color`           | Color of monochrome icons in previews | `#808080` |

## Development

```sh
bun install
bun run check
bun run lint
bun run build
```

## License

MIT
