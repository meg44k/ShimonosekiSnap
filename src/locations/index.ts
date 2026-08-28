import { tsunoshimaLocation } from './tsunoshima'
import type { LocationConfig } from './types'
import { yumetowerLocation } from './yumetower'

const LOCATIONS: readonly LocationConfig[] = [tsunoshimaLocation, yumetowerLocation]

const seenIds = new Set<string>()
for (const location of LOCATIONS) {
  if (seenIds.has(location.id)) {
    throw new Error(`Duplicate location id: "${location.id}"`)
  }
  seenIds.add(location.id)
}

const LOCATIONS_BY_ID: Record<string, LocationConfig> = Object.fromEntries(
  LOCATIONS.map((location) => [location.id, location]),
)

export function getLocation(id: string): LocationConfig | undefined {
  return LOCATIONS_BY_ID[id]
}

export function listLocations(): readonly LocationConfig[] {
  return LOCATIONS
}
