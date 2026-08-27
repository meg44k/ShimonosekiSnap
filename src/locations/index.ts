import { tsunoshimaLocation } from './tsunoshima'
import type { LocationConfig } from './types'

const LOCATIONS: LocationConfig[] = [tsunoshimaLocation]

const LOCATIONS_BY_ID: Record<string, LocationConfig> = Object.fromEntries(
  LOCATIONS.map((location) => [location.id, location]),
)

export function getLocation(id: string): LocationConfig | undefined {
  return LOCATIONS_BY_ID[id]
}

export function listLocations(): LocationConfig[] {
  return LOCATIONS
}
