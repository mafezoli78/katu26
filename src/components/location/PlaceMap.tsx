import { useState, useEffect, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Locate, Users, Loader2 } from 'lucide-react';
import { Place } from '@/services/placesService';
import { NearbyTemporaryPlace } from '@/hooks/usePresence';

interface PlaceMapProps {
  places: Place[];
  temporaryPlaces: NearbyTemporaryPlace[];
  temporaryPlacesCoords: { id: string; latitude: number; longitude: number }[];
  userCoords: { lat: number; lng: number };
  onSelectPlace: (placeId: string) => void;
}

// Internal component to grab map instance and handle tile loading
function MapController({ onMapReady }: { onMapReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    onMapReady(map);
  }, [map, onMapReady]);
  return null;
}

// User location marker (pulsing blue dot)
function UserLocationMarker({ coords }: { coords: { lat: number; lng: number } }) {
  const icon = useMemo(() => L.divIcon({
    className: 'leaflet-user-location',
    html: '<div class="user-dot"><div class="user-dot-pulse"></div></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  }), []);

  return <Marker position={[coords.lat, coords.lng]} icon={icon} interactive={false} />;
}

// Custom pin icon factory
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

export default function PlaceMap({
  places,
  temporaryPlaces,
  temporaryPlacesCoords,
  userCoords,
  onSelectPlace,
}: PlaceMapProps) {
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [tilesLoading, setTilesLoading] = useState(true);

  const handleMapReady = useCallback((map: L.Map) => {
    setMapInstance(map);
    map.on('loading', () => setTilesLoading(true));
    map.on('load', () => setTilesLoading(false));
    // Initial tiles may already be loaded
    setTilesLoading(false);
  }, []);

  const handleRecenter = useCallback(() => {
    if (mapInstance) {
      mapInstance.flyTo([userCoords.lat, userCoords.lng], 16, { duration: 0.5 });
    }
  }, [mapInstance, userCoords]);

  const tempCoordsMap = useMemo(() => {
    const map = new Map<string, { latitude: number; longitude: number }>();
    temporaryPlacesCoords.forEach(t => map.set(t.id, { latitude: t.latitude, longitude: t.longitude }));
    return map;
  }, [temporaryPlacesCoords]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-border h-full bg-muted" style={{ zIndex: 0 }}>
      <MapContainer
        key={`${userCoords.lat}-${userCoords.lng}`}
        center={[userCoords.lat, userCoords.lng]}
        zoom={16}
        zoomControl={false}
        attributionControl={true}
        className="h-full w-full"
        style={{ background: 'hsl(var(--muted))' }}
      >
        <MapController onMapReady={handleMapReady} />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        />
        <UserLocationMarker coords={userCoords} />

        {places.map(place => (
          <Marker
            key={place.id}
            position={[place.latitude, place.longitude]}
            icon={createPlaceIcon(place.active_users ?? 0, false)}
          >
            <Popup className="leaflet-popup-katuu" closeButton={false}>
              <div className="p-2 min-w-[180px]">
                <p className="font-semibold text-sm truncate mb-1">{place.nome}</p>
                <div className="flex items-center justify-between gap-2">
                  {(place.active_users ?? 0) > 0 ? (
                    <Badge variant="secondary" className="text-xs bg-katu-green/10 text-katu-green border-0">
                      <Users className="h-3 w-3 mr-1" />
                      {place.active_users}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Ninguém aqui</span>
                  )}
                  <Button
                    size="sm"
                    className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-lg font-semibold px-4 h-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPlace(place.id);
                    }}
                  >
                    Aqui
                  </Button>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {temporaryPlaces.map(tp => {
          const coords = tempCoordsMap.get(tp.id);
          if (!coords) return null;
          return (
            <Marker
              key={tp.id}
              position={[coords.latitude, coords.longitude]}
              icon={createPlaceIcon(tp.active_users, true)}
            >
              <Popup className="leaflet-popup-katuu" closeButton={false}>
                <div className="p-2 min-w-[180px]">
                  <p className="font-semibold text-sm truncate mb-1">{tp.nome}</p>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="text-xs bg-katu-green/10 text-katu-green border-0">
                      <Users className="h-3 w-3 mr-1" />
                      {tp.active_users}
                    </Badge>
                    <Button
                      size="sm"
                      className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-lg font-semibold px-4 h-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPlace(tp.id);
                      }}
                    >
                      Aqui
                    </Button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {tilesLoading && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-background/40 pointer-events-none">
          <Loader2 className="h-8 w-8 animate-spin text-katu-blue" />
        </div>
      )}

      <button
        onClick={handleRecenter}
        className="leaflet-recenter-btn"
        style={{
          position: 'absolute',
          bottom: '16px',
          right: '16px',
          zIndex: 1000,
          backgroundColor: 'white',
          padding: '8px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          border: '1px solid #e2e8f0'
        }}
        aria-label="Centralizar em mim"
      >
        <Locate className="h-5 w-5" />
      </button>
    </div>
  );
}
