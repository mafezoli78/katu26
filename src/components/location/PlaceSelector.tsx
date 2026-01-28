import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, 
  Navigation, 
  Loader2, 
  Coffee, 
  Users, 
  Clock, 
  Search, 
  Plus,
  Check,
  X
} from 'lucide-react';
import { Place, PROXIMITY_THRESHOLD_METERS } from '@/services/placesService';
import { NearbyTemporaryPlace } from '@/hooks/usePresence';

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
}: PlaceSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showList, setShowList] = useState(!closestPlace);

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
    return (
      <Card className="border-accent border-2">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2 text-accent">
            <Navigation className="h-5 w-5" />
            <CardTitle className="text-lg">Você está aqui?</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-accent/10 rounded-lg">
            <div className="flex items-start gap-3">
              <Coffee className="h-6 w-6 text-accent mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-lg">{closestPlace.nome}</p>
                {closestPlace.categoria && (
                  <p className="text-sm text-muted-foreground">{closestPlace.categoria}</p>
                )}
                {closestPlace.endereco && (
                  <p className="text-xs text-muted-foreground mt-1">{closestPlace.endereco}</p>
                )}
                <Badge variant="secondary" className="mt-2">
                  <MapPin className="h-3 w-3 mr-1" />
                  {closestPlace.distance_meters}m de você
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowList(true)}
            >
              <X className="h-4 w-4 mr-2" />
              Não é esse
            </Button>
            <Button
              className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => onSelectPlace(closestPlace.id)}
            >
              <Check className="h-4 w-4 mr-2" />
              Entrar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show full list
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Navigation className="h-5 w-5" />
          Locais próximos
        </CardTitle>
        <CardDescription>
          Selecione onde você está (raio: {presenceRadius}m)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Buscando locais próximos...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Temporary Places Section (prioritized) */}
            {temporaryPlaces.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Locais temporários ativos
                </p>
                {temporaryPlaces.map((place) => (
                  <Button
                    key={place.id}
                    variant="outline"
                    className="w-full justify-start h-auto py-3 touch-active border-accent bg-accent/5 hover:bg-accent/10"
                    onClick={() => onSelectPlace(place.id)}
                  >
                    <MapPin className="h-5 w-5 mr-3 text-accent flex-shrink-0" />
                    <div className="flex flex-col items-start text-left flex-1 min-w-0">
                      <span className="truncate w-full">{place.nome}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          <Users className="h-3 w-3 mr-1" />
                          {place.active_users} {place.active_users === 1 ? 'pessoa' : 'pessoas'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(place.distance_meters)}m
                        </span>
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            )}

            {/* Foursquare Places Section */}
            {places.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground font-medium">
                  Estabelecimentos ({places.length})
                </p>
                {places.map((place) => (
                  <Button
                    key={place.id}
                    variant="outline"
                    className="w-full justify-start h-auto py-3 touch-active hover:bg-muted/50"
                    onClick={() => onSelectPlace(place.id)}
                  >
                    <Coffee className="h-5 w-5 mr-3 text-muted-foreground flex-shrink-0" />
                    <div className="flex flex-col items-start text-left flex-1 min-w-0">
                      <span className="truncate w-full">{place.nome}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {place.categoria && (
                          <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                            {place.categoria}
                          </span>
                        )}
                        {place.distance_meters !== undefined && (
                          <span className="text-xs text-muted-foreground">
                            • {place.distance_meters}m
                          </span>
                        )}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            )}

            {/* Empty state */}
            {places.length === 0 && temporaryPlaces.length === 0 && (
              <p className="text-muted-foreground text-center py-4 text-sm">
                Nenhum local encontrado por perto
              </p>
            )}

            {/* Search by name section */}
            <div className="pt-4 border-t space-y-3">
              <p className="text-sm text-muted-foreground">
                Não encontrou? Busque por nome:
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Nome do local..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1"
                />
                <Button 
                  variant="secondary" 
                  size="icon"
                  onClick={handleSearch}
                  disabled={!searchQuery.trim() || searchingByName}
                >
                  {searchingByName ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Create temporary place button */}
            <Button
              variant="ghost"
              className="w-full"
              onClick={onCreateTemporary}
            >
              <Plus className="h-4 w-4 mr-2" />
              Criar local temporário
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
