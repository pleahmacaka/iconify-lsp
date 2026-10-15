export interface IconToken {
  prefix: string
  name: string
  start: number
  nameStart: number
  end: number
}

const isTokenChar = (c: string) =>
  (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c === "-" || c === ":"

export function iconTokenAt(line: string, column: number): IconToken | null {
  let start = column

  while (start > 0 && isTokenChar(line.charAt(start - 1))) {
    start--
  }

  let end = column

  while (end < line.length && isTokenChar(line.charAt(end))) {
    end++
  }

  const [prefix, name, ...rest] = line.slice(start, end).split(":")

  if (!prefix || name === undefined || rest.length > 0) {
    return null
  }

  return { prefix, name, start, nameStart: start + prefix.length + 1, end }
}
