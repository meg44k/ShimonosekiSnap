import { listLocations } from '../locations'

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
                <a href={`/spot/${location.id}`}>{location.name}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
