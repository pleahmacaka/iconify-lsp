export interface IconToken {
  prefix: string
  name: string
  start: number
  nameStart: number
  end: number
}

const isDigit = (c: string) => c >= "0" && c <= "9"

const isIconChar = (c: string) =>
  (c >= "a" && c <= "z") || isDigit(c) || c === "-" || c === ":"

const isIdentifierChar = (c: string) =>
  (c >= "a" && c <= "z") ||
  (c >= "A" && c <= "Z") ||
  isDigit(c) ||
  c === "_" ||
  c === "$"

function spanAt(line: string, column: number, isChar: (c: string) => boolean) {
  let start = column

  while (start > 0 && isChar(line.charAt(start - 1))) {
    start--
  }

  let end = column

  while (end < line.length && isChar(line.charAt(end))) {
    end++
  }

  return { start, end, text: line.slice(start, end) }
}

export function iconTokenAt(line: string, column: number): IconToken | null {
  const { start, end, text } = spanAt(line, column, isIconChar)
  const [prefix, name, ...rest] = text.split(":")

  if (!prefix || name === undefined || rest.length > 0) {
    return null
  }

  return { prefix, name, start, nameStart: start + prefix.length + 1, end }
}

export function identifierAt(line: string, column: number) {
  const span = spanAt(line, column, isIdentifierChar)

  if (!span.text || isDigit(span.text.charAt(0))) {
    return null
  }

  return span
}
