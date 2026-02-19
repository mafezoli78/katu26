import { useState, useEffect, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MapPin, Navigation, Loader2, Users, Clock, Search, Plus, Check, X, UtensilsCrossed, Coffee, Beer, Music, ShoppingBag, Dumbbell, Briefcase, Building2, Store, List, Map } from 'lucide-react';
import { TemporaryPlaceIcon } from '@/components/icons/TemporaryPlaceIcon';
import { Place, PROXIMITY_THRESHOLD_METERS } from '@/services/placesService';
import { NearbyTemporaryPlace } from '@/hooks/usePresence';
import { supabase } from '@/integrations/supabase/client';

const PlaceMap = lazy(() => import('@/components/location/PlaceMap'));

interface PlaceSelectorProps {
  loading: boolean;
  places: Place[];
  temporaryPlaces: NearbyTemporaryPlace[];
  closestPlace: Place | null;
  onSelectPlace: (placeId: string) => void;
  onCreateTemporary: () => void;
  onSearchByName: (query: string) => void;
  searchingByName: boolean;
  presenceRadius: number;
  userCoords: { lat: number; lng: number } | null;
}

// Map category to icon
function getCategoryIcon(categoria?: string | null) {
  if (!categoria) return Store;
  const cat = categoria.toLowerCase();
  if (cat.includes('bar') || cat.includes('pub') || cat.includes('cervej')) return Beer;
  if (cat.includes('restaur') || cat.includes('food') || cat.includes('comida')) return UtensilsCrossed;
  if (cat.includes('café') || cat.includes('coffee') || cat.includes('padaria') || cat.includes('bakery')) return Coffee;
  if (cat.includes('music') || cat.includes('club') || cat.includes('balada') || cat.includes('show')) return Music;
  if (cat.includes('shop') || cat.includes('loja') || cat.includes('mall')) return ShoppingBag;
  if (cat.includes('gym') || cat.includes('academia') || cat.includes('fitness')) return Dumbbell;
  if (cat.includes('office') || cat.includes('cowork') || cat.includes('escritório')) return Briefcase;
  if (cat.includes('hotel') || cat.includes('building')) return Building2;
  return Store;
}

// Map category to background color class
function getCategoryBgColor(categoria?: string | null) {
  if (!categoria) return 'bg-muted';
  const cat = categoria.toLowerCase();
  if (cat.includes('bar') || cat.includes('pub') || cat.includes('cervej')) return 'bg-amber-100';
  if (cat.includes('restaur') || cat.includes('food') || cat.includes('comida')) return 'bg-orange-100';
  if (cat.includes('café') || cat.includes('coffee') || cat.includes('padaria') || cat.includes('bakery')) return 'bg-yellow-100';
  if (cat.includes('music') || cat.includes('club') || cat.includes('balada') || cat.includes('show')) return 'bg-purple-100';
  if (cat.includes('shop') || cat.includes('loja') || cat.includes('mall')) return 'bg-pink-100';
  if (cat.includes('gym') || cat.includes('academia') || cat.includes('fitness')) return 'bg-green-100';
  if (cat.includes('office') || cat.includes('cowork') || cat.includes('escritório')) return 'bg-blue-100';
  return 'bg-muted';
}
function getCategoryIconColor(categoria?: string | null) {
  if (!categoria) return 'text-muted-foreground';
  const cat = categoria.toLowerCase();
  if (cat.includes('bar') || cat.includes('pub') || cat.includes('cervej')) return 'text-amber-600';
  if (cat.includes('restaur') || cat.includes('food') || cat.includes('comida')) return 'text-orange-600';
  if (cat.includes('café') || cat.includes('coffee') || cat.includes('padaria') || cat.includes('bakery')) return 'text-yellow-700';
  if (cat.includes('music') || cat.includes('club') || cat.includes('balada') || cat.includes('show')) return 'text-purple-600';
  if (cat.includes('shop') || cat.includes('loja') || cat.includes('mall')) return 'text-pink-600';
  if (cat.includes('gym') || cat.includes('academia') || cat.includes('fitness')) return 'text-green-600';
  if (cat.includes('office') || cat.includes('cowork') || cat.includes('escritório')) return 'text-blue-600';
  return 'text-muted-foreground';
}
export function PlaceSelector({
  loading,
  places,
  temporaryPlaces,
  closestPlace,
  onSelectPlace,
  onCreateTemporary,
  onSearchByName,
  searchingByName,
  presenceRadius,
  userCoords,
}: PlaceSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showList, setShowList] = useState(!closestPlace);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [tempPlacesCoords, setTempPlacesCoords] = useState<{ id: string; latitude: number; longitude: number }[]>([]);

  // Fetch coords for temporary places (RPC doesn't return them)
  useEffect(() => {
    if (temporaryPlaces.length === 0) {
      setTempPlacesCoords([]);
      return;
    }
    const ids = temporaryPlaces.map(tp => tp.id);
    supabase
      .from('places')
      .select('id, latitude, longitude')
      .in('id', ids)
      .then(({ data }) => {
        if (data) setTempPlacesCoords(data);
      });
  }, [temporaryPlaces]);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      onSearchByName(searchQuery.trim());
    }
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Show direct suggestion for very close place
  if (closestPlace && !showList) {
    const CategoryIcon = getCategoryIcon(closestPlace.categoria);
    const bgColor = getCategoryBgColor(closestPlace.categoria);
    const iconColor = getCategoryIconColor(closestPlace.categoria);
    return <div className="space-y-4 animate-fade-in">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-foreground">Você está aqui?</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Encontramos um local muito próximo
          </p>
        </div>

        <div className="bg-card rounded-2xl p-4 shadow-sm border border-border">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl ${bgColor} flex items-center justify-center flex-shrink-0`}>
              <CategoryIcon className={`h-7 w-7 ${iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg truncate">{closestPlace.nome}</h3>
              <p className="text-sm text-muted-foreground truncate">
                {closestPlace.categoria || 'Local'}
              </p>
              <div className="flex items-center gap-1 mt-1">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {closestPlace.distance_meters}m de você
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setShowList(true)}>
              <X className="h-4 w-4 mr-2" />
              Não é esse
            </Button>
            <Button className="flex-1 h-11 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 font-semibold" onClick={() => onSelectPlace(closestPlace.id)}>
              <Check className="h-4 w-4 mr-2" />
              Aqui
            </Button>
          </div>
        </div>
      </div>;
  }

  // Show full list or map
  return <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold text-foreground">Onde você está agora?</h2>
        {userCoords && (
          <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as 'list' | 'map')} size="sm" className="bg-muted rounded-lg p-0.5">
            <ToggleGroupItem value="list" aria-label="Lista" className="rounded-md px-3 data-[state=on]:bg-card data-[state=on]:shadow-sm">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="map" aria-label="Mapa" className="rounded-md px-3 data-[state=on]:bg-card data-[state=on]:shadow-sm">
              <Map className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {loading ? <div className="text-center py-12">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-katu-blue" />
          <p className="text-sm text-muted-foreground mt-4">Buscando locais próximos...</p>
        </div> : viewMode === 'map' && userCoords ? (
          <Suspense fallback={<div className="text-center py-12"><Loader2 className="h-10 w-10 animate-spin mx-auto text-katu-blue" /></div>}>
            <div style={{ height: 'calc(100dvh - 220px)' }}>
              <PlaceMap
                places={places}
                temporaryPlaces={temporaryPlaces}
                temporaryPlacesCoords={tempPlacesCoords}
                userCoords={userCoords}
                onSelectPlace={onSelectPlace}
              />
            </div>
          </Suspense>
        ) : <div className="space-y-4">
          {/* Temporary Places Section (prioritized) */}
          {temporaryPlaces.length > 0 && <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium px-1">
                <Clock className="h-4 w-4 text-katu-green" />
                <span>Locais temporários ativos</span>
              </div>
              {temporaryPlaces.map(place => <div key={place.id} onClick={() => onSelectPlace(place.id)} className="bg-card rounded-xl p-3 shadow-sm border-2 border-katu-green/30 place-card cursor-pointer hover:border-katu-green/50">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-katu-green/10 flex items-center justify-center flex-shrink-0">
                      <TemporaryPlaceIcon className="h-6 w-6 text-katu-green" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{place.nome}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-xs bg-katu-green/10 text-katu-green border-0">
                          <Users className="h-3 w-3 mr-1" />
                          {place.active_users} {place.active_users === 1 ? 'pessoa' : 'pessoas'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(place.distance_meters)}m
                        </span>
                      </div>
                    </div>
                    <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-lg font-semibold px-4">
                      Aqui
                    </Button>
                  </div>
                </div>)}
            </div>}

          {/* Foursquare Places Section */}
          {places.length > 0 && <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium px-1">
                <Navigation className="h-4 w-4 text-katu-blue" />
                <span>Estabelecimentos ({places.length})</span>
              </div>
              {places.map(place => {
          const CategoryIcon = getCategoryIcon(place.categoria);
          const bgColor = getCategoryBgColor(place.categoria);
          const iconColor = getCategoryIconColor(place.categoria);
          return <div key={place.id} onClick={() => onSelectPlace(place.id)} className="bg-card rounded-xl p-3 shadow-sm border border-border place-card cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center flex-shrink-0`}>
                        <CategoryIcon className={`h-6 w-6 ${iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{place.nome}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          {place.active_users !== undefined && place.active_users > 0 ? <Badge variant="secondary" className="text-xs bg-katu-green/10 text-katu-green border-0">
                              <Users className="h-3 w-3 mr-1" />
                              {place.active_users} {place.active_users === 1 ? 'pessoa' : 'pessoas'}
                            </Badge> : <span className="text-xs text-muted-foreground">
                              Ninguém por aqui ainda
                            </span>}
                        </div>
                      </div>
                      <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-lg font-semibold px-4">
                      Aqui
                    </Button>
                    </div>
                  </div>;
        })}
            </div>}

          {/* Empty state */}
          {places.length === 0 && temporaryPlaces.length === 0 && <div className="text-center py-8 bg-card rounded-xl border border-border">
              <MapPin className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum local encontrado por perto</p>
            </div>}

          {/* Search by name section */}
          <div className="pt-4 border-t border-border space-y-3">
            <p className="text-sm text-muted-foreground">
              Não encontrou? Busque por nome:
            </p>
            <div className="flex gap-2">
              <Input placeholder="Nome do local..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={handleKeyDown} className="flex-1 h-11 rounded-xl bg-card" />
              <Button variant="secondary" size="icon" className="h-11 w-11 rounded-xl" onClick={handleSearch} disabled={!searchQuery.trim() || searchingByName}>
                {searchingByName ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {/* Create temporary place button */}
          <Button variant="outline" className="w-full h-11 rounded-xl border-dashed border-2" onClick={onCreateTemporary}>
            <Plus className="h-4 w-4 mr-2" />
            Criar local temporário
          </Button>
        </div>}
    </div>;
}