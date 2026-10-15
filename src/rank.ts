function isSubsequence(query: string, name: string) {
  let i = 0

  for (const c of name) {
    if (c === query[i]) {
      i++
    }
  }

  return i === query.length
}

function matchesWords(query: string, name: string) {
  const words = name.split("-")
  let i = 0

  for (const part of query.split("-")) {
    while (i < words.length && !words[i]?.startsWith(part)) {
      i++
    }

    if (i === words.length) {
      return false
    }

    i++
  }

  return true
}

function score(query: string, name: string) {
  if (name.startsWith(query)) {
    return 0
  }

  if (matchesWords(query, name)) {
    return 1
  }

  if (name.includes(query)) {
    return 2
  }

  return isSubsequence(query, name) ? 3 : null
}

export function rankNames(names: string[], query: string, limit: number) {
  const matches: { name: string; score: number }[] = []

  for (const name of names) {
    const s = score(query, name)

    if (s !== null) {
      matches.push({ name, score: s })
    }
  }

  matches.sort(
    (a, b) =>
      a.score - b.score ||
      a.name.length - b.name.length ||
      a.name.localeCompare(b.name),
  )

  return matches.slice(0, limit).map(m => m.name)
}
