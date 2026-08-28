import { listLocations } from '../locations'

// モデルの帰属表示(CC-BY-4.0、文言は改変不可)
export const MODEL_CREDIT =
  'This work is based on "Humpback Whale (Swimming)" (https://sketchfab.com/3d-models/humpback-whale-swimming-f4912be9163a4f45b2480df8ccb8b2c6) by Connlan_Immure (https://sketchfab.com/Connlan_Immure) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)'

export function GuidancePage() {
  const locations = listLocations()

  return (
    <div className="start-screen">
      <div className="camera-icon">📱</div>
      <p>QRコードを読み取ってください</p>
      {locations.length > 0 && (
        <div className="location-list">
          <p className="location-list-label">動作確認用リンク</p>
          <ul>
            {locations.map((location) => (
              <li key={location.id}>
                <a href={`/spot/${encodeURIComponent(location.id)}`}>{location.name}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="model-credit">{MODEL_CREDIT}</p>
    </div>
  )
}
