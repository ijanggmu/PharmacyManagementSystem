import { Fragment } from "react"

/** Splits `text` around case-insensitive matches of `query` (pure, for tests and rendering). */
export function splitMatches(text: string, query: string): { text: string; match: boolean }[] {
  const q = query.trim()
  if (!q || !text) return [{ text, match: false }]
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const parts: { text: string; match: boolean }[] = []
  let from = 0
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false })
    parts.push({ text: text.slice(at, at + needle.length), match: true })
    from = at + needle.length
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false })
  return parts
}

/** Renders `text` with the parts matching `query` marked, so search results show why they matched. */
export function HighlightMatch({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitMatches(text, query).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-sm bg-warning/25 px-0.5 text-inherit">
            {part.text}
          </mark>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        )
      )}
    </>
  )
}
