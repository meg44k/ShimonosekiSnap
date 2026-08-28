import { listLocations } from '../locations'
import { navigate } from '../router'

export function GuidancePage() {
  const locations = listLocations()

  const getIcon = (id: string) => {
    switch (id) {
      case 'kaikyokan':
        return '🐧'
      case 'akama':
        return '⛩️'
      default:
        return '🌊'
    }
  }

  return (
    <div className="start-screen">
      <div className="camera-icon">📱</div>
      <p>QRコードを読み取ってください</p>
      {locations.length > 0 && (
        <div className="location-list">
          <p className="location-list-label">スポット一覧（動作確認リンク）</p>
          <ul>
            {locations.map((location) => (
              <li key={location.id}>
                <a
                  href={`/spot/${encodeURIComponent(location.id)}`}
                  onClick={(e) => {
                    e.preventDefault()
                    navigate(`/spot/${encodeURIComponent(location.id)}`)
                  }}
                >
                  {getIcon(location.id)} {location.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
        <a
          href="/compile"
          style={{ fontSize: '13px', color: 'var(--text)', textDecoration: 'underline' }}
          onClick={(e) => {
            e.preventDefault()
            navigate('/compile')
          }}
        >
          ⚙️ 赤間神宮 ARターゲット(.mind)の自動生成・更新
        </a>
      </div>
    </div>
  )
}
