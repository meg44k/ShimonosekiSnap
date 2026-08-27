export type Route = { type: 'root' } | { type: 'spot'; id: string }

const SPOT_PATH_PATTERN = /^\/spot\/([^/]+)\/?$/

export function parseRoute(pathname: string): Route {
  const match = pathname.match(SPOT_PATH_PATTERN)
  if (match) {
    try {
      return { type: 'spot', id: decodeURIComponent(match[1]) }
    } catch {
      return { type: 'root' }
    }
  }
  return { type: 'root' }
}
