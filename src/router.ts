import { useEffect, useState } from 'react'

export type Route = { type: 'root' } | { type: 'spot'; id: string } | { type: 'compile' }

const SPOT_PATH_PATTERN = /^\/spot\/([^/]+)\/?$/

export function parseRoute(pathname: string): Route {
  if (pathname === '/compile' || pathname === '/compile/') {
    return { type: 'compile' }
  }

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

export function navigate(path: string): void {
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    typeof window !== 'undefined' ? parseRoute(window.location.pathname) : { type: 'root' },
  )

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseRoute(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  return route
}
