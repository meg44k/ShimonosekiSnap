export type Route = { type: 'root' } | { type: 'spot'; id: string }

const SPOT_PATH_PATTERN = /^\/spot\/([^/]+)\/?$/

export function parseRoute(pathname: string): Route {
  const match = pathname.match(SPOT_PATH_PATTERN)
  if (match) {
    return { type: 'spot', id: decodeURIComponent(match[1]) }
  }
  return { type: 'root' }
}
