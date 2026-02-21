import { useRef, useEffect, useCallback } from 'react';
import L from 'leaflet';
import { Locate } from 'lucide-react';
import { Place } from '@/services/placesService';
import { NearbyTemporaryPlace } from '@/hooks/usePresence';

interface PlaceMapProps {
  places: Place[];
  temporaryPlaces: NearbyTemporaryPlace[];
  temporaryPlacesCoords: { id: string; latitude: number; longitude: number }[];
  userCoords: { lat: number; lng: number };
  onSelectPlace: (placeId: string) => void;
}

function createPlaceIcon(activeUsers: number, isTemporary: boolean): L.DivIcon {
  let bgClass = 'pin-empty';
  if (isTemporary) bgClass = 'pin-temporary';
  else if (activeUsers > 0) bgClass = 'pin-active';

  return L.divIcon({
    className: 'leaflet-place-pin',
    html: `<div class="place-pin ${bgClass}"><span>${activeUsers}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

const userIcon = L.divIcon({
  className: 'leaflet-user-location',
  html: '<div class="user-dot"><div class="user-dot-pulse"></div></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function buildPopupHtml(name: string, activeUsers: number, placeId: string): string {
  const badge = activeUsers > 0
    ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:2px 8px;border-radius:9999px;background:rgba(34,197,94,0.1);color:#16a34a;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        ${activeUsers}
      </span>`
    : `<span style="font-size:12px;color:#9ca3af;">Ninguém aqui</span>`;

  return `
    <div style="padding:8px;min-width:180px;">
      <p style="font-weight:600;font-size:14px;margin:0 0 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</p>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        ${badge}
        <button data-place-id="${placeId}" style="background:hsl(var(--accent));color:hsl(var(--accent-foreground));border:none;border-radius:8px;padding:4px 16px;font-weight:600;font-size:13px;cursor:pointer;height:32px;">
          Aqui
        </button>
      </div>
    </div>
  `;
}

export default function PlaceMap({
  places,
  temporaryPlaces,
  temporaryPlacesCoords,
  userCoords,
  onSelectPlace,
}: PlaceMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const placeMarkersRef = useRef<L.LayerGroup>(L.layerGroup());
  const tempMarkersRef = useRef<L.LayerGroup>(L.layerGroup());
  // Store callback in ref so popup click handler always has latest version
  const onSelectPlaceRef = useRef(onSelectPlace);
  onSelectPlaceRef.current = onSelectPlace;

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [userCoords.lat, userCoords.lng],
      zoom: 16,
      zoomControl: false,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    }).addTo(map);

    userMarkerRef.current = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon, interactive: false }).addTo(map);
    placeMarkersRef.current.addTo(map);
    tempMarkersRef.current.addTo(map);

    // Single delegated click handler on the map container for popup buttons
    containerRef.current.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-place-id]');
      if (btn) {
        e.stopPropagation();
        onSelectPlaceRef.current(btn.dataset.placeId!);
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update user position
  useEffect(() => {
    if (!userMarkerRef.current) return;
    userMarkerRef.current.setLatLng([userCoords.lat, userCoords.lng]);
  }, [userCoords]);

  // Update place markers
  useEffect(() => {
    const group = placeMarkersRef.current;
    group.clearLayers();
    places.forEach((place) => {
      const marker = L.marker([place.latitude, place.longitude], {
        icon: createPlaceIcon(place.active_users ?? 0, false),
      });
      marker.bindPopup(buildPopupHtml(place.nome, place.active_users ?? 0, place.id), {
        className: 'leaflet-popup-katuu',
        closeButton: false,
      });
      group.addLayer(marker);
    });
  }, [places]);

  // Update temporary place markers
  useEffect(() => {
    const group = tempMarkersRef.current;
    group.clearLayers();
    const coordsMap = new Map(temporaryPlacesCoords.map((c) => [c.id, c]));
    temporaryPlaces.forEach((tp) => {
      const coords = coordsMap.get(tp.id);
      if (!coords) return;
      const marker = L.marker([coords.latitude, coords.longitude], {
        icon: createPlaceIcon(tp.active_users, true),
      });
      marker.bindPopup(buildPopupHtml(tp.nome, tp.active_users, tp.id), {
        className: 'leaflet-popup-katuu',
        closeButton: false,
      });
      group.addLayer(marker);
    });
  }, [temporaryPlaces, temporaryPlacesCoords]);

  const handleRecenter = useCallback(() => {
    mapRef.current?.flyTo([userCoords.lat, userCoords.lng], 16, { duration: 0.5 });
  }, [userCoords]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-border h-full bg-muted" style={{ zIndex: 0 }}>
      <div ref={containerRef} className="h-full w-full" />
      <button
        onClick={handleRecenter}
        style={{
          position: 'absolute', bottom: 16, right: 16, zIndex: 1000,
          backgroundColor: 'white', padding: 8, borderRadius: 8,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0',
        }}
        aria-label="Centralizar em mim"
      >
        <Locate className="h-5 w-5" />
      </button>
    </div>
  );
}
