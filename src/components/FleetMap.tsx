import { useEffect } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Entrega, Piloto } from '../types'

const icon = new L.DivIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#f5a524;border:3px solid #0b1220;box-shadow:0 0 0 6px rgba(245,165,36,.25)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

function Fit({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    const b = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
    map.fitBounds(b.pad(0.35))
    // posição inicial apenas — o movimento ao vivo não deve recentrar o mapa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])
  return null
}

export default function FleetMap({
  pilotos,
  entregas,
}: {
  pilotos: Piloto[]
  entregas: Entrega[]
}) {
  const dests = entregas.filter((e) => e.status === 'em_rota' || e.status === 'coletado')
  return (
    <div className="map-wrap">
      <MapContainer center={[-23.55, -46.63]} zoom={13} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Fit points={pilotos} />
        {pilotos.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={icon}>
            <Popup>
              <strong>{p.name}</strong>
              <br />
              {p.plate} · {p.status}
              <br />
              Atualizado {new Date(p.lastUpdate).toLocaleTimeString('pt-BR')}
            </Popup>
          </Marker>
        ))}
        {dests.map((e) => (
          <Marker
            key={e.id}
            position={[e.destLat, e.destLng]}
            icon={L.divIcon({
              className: '',
              html: `<div style="width:12px;height:12px;background:#6ea8ff;border-radius:3px;border:2px solid #fff"></div>`,
              iconSize: [12, 12],
              iconAnchor: [6, 6],
            })}
          >
            <Popup>Destino · {e.destination}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
