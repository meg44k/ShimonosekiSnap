import { akamaLocation } from './akama'
import { ganryujimaLocation } from './ganryujima'
import { tsunoshimaLocation } from './tsunoshima'
import type { LocationConfig } from './types'

const LOCATIONS: readonly LocationConfig[] = [tsunoshimaLocation, akamaLocation, ganryujimaLocation]

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
