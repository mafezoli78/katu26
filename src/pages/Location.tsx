import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePresence, NearbyTemporaryPlace } from '@/hooks/usePresence';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, MapPin } from 'lucide-react';
import logoKatu from '@/assets/logo-katu-branco.png';
import { Place, placesService, PROXIMITY_THRESHOLD_METERS, INITIAL_SEARCH_RADIUS_METERS, EXPANDED_SEARCH_RADIUS_METERS } from '@/services/placesService';
import { PlaceSelector } from '@/components/location/PlaceSelector';

export default function Location() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { 
    intentions, 
    nearbyTemporaryPlaces,
    fetchNearbyTemporaryPlaces,
    activatePresenceAtPlace,
    createTemporaryPlace,
    loading,
    presenceRadiusMeters,
    currentPresence,
  } = usePresence();

  const [step, setStep] = useState<'detecting' | 'select' | 'create_temp' | 'confirm_temp' | 'intention'>('detecting');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedIntentionId, setSelectedIntentionId] = useState<string | null>(null);
  const [newPlaceName, setNewPlaceName] = useState('');
  const [activating, setActivating] = useState(false);
  const [nearbyTempToConfirm, setNearbyTempToConfirm] = useState<NearbyTemporaryPlace | null>(null);
  
  // New states for optimized flow
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [closestPlace, setClosestPlace] = useState<Place | null>(null);
  const [searchingByName, setSearchingByName] = useState(false);

  // Auto-search for places when coordinates are obtained
  const fetchPlaces = useCallback(async (lat: number, lng: number) => {
    setPlacesLoading(true);
    
    try {
      // Fetch temporary places first
      await fetchNearbyTemporaryPlaces(lat, lng);
      
      // Initial search with small radius
      let results = await placesService.searchNearby({
        latitude: lat,
        longitude: lng,
        radius: INITIAL_SEARCH_RADIUS_METERS,
        limit: 20,
      });

      // If no results, expand search radius
      if (results.length === 0) {
        console.log('[Location] No places found in initial radius, expanding search...');
        results = await placesService.searchNearby({
          latitude: lat,
          longitude: lng,
          radius: EXPANDED_SEARCH_RADIUS_METERS,
          limit: 20,
        });
      }

      setPlaces(results);

      // Check for very close place
      if (results.length > 0 && results[0].distance_meters !== undefined) {
        if (results[0].distance_meters <= PROXIMITY_THRESHOLD_METERS) {
          setClosestPlace(results[0]);
          console.log(`[Location] Found very close place: ${results[0].nome} (${results[0].distance_meters}m)`);
        }
      }

      console.log(`[Location] Found ${results.length} places`);
    } catch (error) {
      console.error('[Location] Error fetching places:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao buscar locais',
        description: 'Tente novamente',
      });
    } finally {
      setPlacesLoading(false);
    }
  }, [fetchNearbyTemporaryPlaces, toast]);

  // Flag to prevent duplicate fetches per navigation cycle
  const hasFetchedRef = useRef(false);
  
  // Reset fetch flag when component unmounts (new navigation cycle)
  useEffect(() => {
    return () => {
      hasFetchedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }

    // Wait for presence state to load before deciding
    if (loading) return;

    // Don't fetch if user already has active presence - redirect to home
    if (currentPresence) {
      console.log('[Location] User has active presence, redirecting to home');
      navigate('/home', { replace: true });
      return;
    }

    // Prevent duplicate fetches in same navigation cycle
    if (hasFetchedRef.current) return;

    // Request geolocation and auto-search
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (hasFetchedRef.current) return;
          hasFetchedRef.current = true;

          const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
          console.log(`[Location] 📍 Got user coordinates: lat=${coords.lat}, lng=${coords.lng}`);
          setUserCoords(coords);
          
          // Auto-fetch places immediately
          fetchPlaces(coords.lat, coords.lng);
          
          setStep('select');
        },
        (error) => {
          console.error('Geolocation error:', error);
          toast({ 
            variant: 'destructive', 
            title: 'Não foi possível obter sua localização',
            description: 'Por favor, permita o acesso à localização'
          });
          setStep('select');
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        }
      );
    } else {
      toast({ variant: 'destructive', title: 'Geolocalização não suportada' });
      setStep('select');
    }
  }, [user, navigate, toast, fetchPlaces, loading, currentPresence]);

  const handleSelectPlace = (placeId: string) => {
    setSelectedPlaceId(placeId);
    setStep('intention');
  };

  const handleSearchByName = async (query: string) => {
    if (!userCoords) return;
    
    setSearchingByName(true);
    try {
      const results = await placesService.searchByName({
        latitude: userCoords.lat,
        longitude: userCoords.lng,
        query,
        limit: 20,
      });
      setPlaces(results);
      setClosestPlace(null); // Reset closest place suggestion
    } catch (error) {
      console.error('[Location] Error searching by name:', error);
      toast({
        variant: 'destructive',
        title: 'Erro na busca',
        description: 'Tente novamente',
      });
    } finally {
      setSearchingByName(false);
    }
  };

  const handleCreateTemporaryPlace = async () => {
    if (!newPlaceName.trim() || !userCoords) {
      toast({ variant: 'destructive', title: 'Preencha o nome do local' });
      return;
    }

    // Check for nearby temporary places first
    const nearbyTemp = await fetchNearbyTemporaryPlaces(userCoords.lat, userCoords.lng);
    
    if (nearbyTemp.length > 0) {
      // Found nearby temporary place - ask user to confirm
      setNearbyTempToConfirm(nearbyTemp[0]); // Show the closest one
      setStep('confirm_temp');
      return;
    }

    // No nearby temporary places, proceed to intention selection
    setStep('intention');
  };

  const handleConfirmUseExistingTemp = () => {
    if (nearbyTempToConfirm) {
      setSelectedPlaceId(nearbyTempToConfirm.id);
      setStep('intention');
    }
  };

  const handleConfirmCreateNewTemp = () => {
    // User wants to create new place even though one exists nearby
    setNearbyTempToConfirm(null);
    setStep('intention');
  };

  const handleActivatePresence = async () => {
    if (!selectedIntentionId) return;

    setActivating(true);
    
    try {
      let error: Error | null = null;

      if (selectedPlaceId) {
        // Activate presence at existing place (Foursquare or temporary)
        const result = await activatePresenceAtPlace(selectedPlaceId, selectedIntentionId);
        error = result.error;
      } else if (newPlaceName.trim() && userCoords) {
        // Create new temporary place and activate presence
        const result = await createTemporaryPlace(
          newPlaceName.trim(),
          userCoords.lat,
          userCoords.lng,
          selectedIntentionId
        );
        error = result.error;
      } else {
        error = new Error('Nenhum local selecionado');
      }

      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao ativar presença', description: error.message });
      } else {
        toast({ title: 'Você está aqui! 📍' });
        navigate('/home', { replace: true });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro inesperado' });
    } finally {
      setActivating(false);
    }
  };

  return (
    <MobileLayout>
      <div className="p-4 space-y-4 page-fade">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Onde você está?</h1>
        </div>
        {/* Detecting location */}
        {step === 'detecting' && (
          <Card>
            <CardContent className="py-12 text-center">
              <Loader2 className="h-12 w-12 text-primary mx-auto mb-4 animate-spin" />
              <p className="text-muted-foreground">Detectando sua localização...</p>
            </CardContent>
          </Card>
        )}

        {/* Select location - New optimized component */}
        {step === 'select' && (
          <PlaceSelector
            loading={loading || placesLoading}
            places={places}
            temporaryPlaces={nearbyTemporaryPlaces}
            closestPlace={closestPlace}
            onSelectPlace={handleSelectPlace}
            onCreateTemporary={() => setStep('create_temp')}
            onSearchByName={handleSearchByName}
            searchingByName={searchingByName}
            presenceRadius={presenceRadiusMeters}
          />
        )}

        {/* Create temporary place */}
        {step === 'create_temp' && (
          <Card>
            <CardHeader>
              <CardTitle>Criar local temporário</CardTitle>
              <CardDescription>
                Crie um local para encontros espontâneos. Expira após 6 horas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="placeName">Nome do local</Label>
                <Input
                  id="placeName"
                  placeholder="Ex: Festa do João, Churrasco no parque..."
                  value={newPlaceName}
                  onChange={(e) => setNewPlaceName(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('select')} className="flex-1">
                  Voltar
                </Button>
                <Button 
                  onClick={handleCreateTemporaryPlace}
                  disabled={!newPlaceName.trim()}
                  className="flex-1 bg-accent text-accent-foreground"
                >
                  Continuar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Confirm use of existing temporary place */}
        {step === 'confirm_temp' && nearbyTempToConfirm && (
          <Card>
            <CardHeader>
              <CardTitle>Local temporário próximo</CardTitle>
              <CardDescription>
                Já existe um local temporário muito próximo. Deseja entrar nele?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-accent/10 rounded-lg border border-accent/30">
                <p className="font-medium">{nearbyTempToConfirm.nome}</p>
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{nearbyTempToConfirm.active_users} {nearbyTempToConfirm.active_users === 1 ? 'pessoa' : 'pessoas'}</span>
                  <span>•</span>
                  <span>{Math.round(nearbyTempToConfirm.distance_meters)}m de você</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button 
                  onClick={handleConfirmUseExistingTemp}
                  className="bg-accent text-accent-foreground"
                >
                  Entrar neste local
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleConfirmCreateNewTemp}
                >
                  Criar outro local mesmo assim
                </Button>
                <Button 
                  variant="ghost"
                  onClick={() => {
                    setNearbyTempToConfirm(null);
                    setStep('select');
                  }}
                >
                  Voltar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Select intention */}
        {step === 'intention' && (
          <Card>
            <CardHeader>
              <CardTitle>Qual sua intenção?</CardTitle>
              <CardDescription>
                Isso ajuda a conectar você com pessoas compatíveis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup
                value={selectedIntentionId || undefined}
                onValueChange={setSelectedIntentionId}
              >
                {intentions.map((intention) => (
                  <div key={intention.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                    <RadioGroupItem value={intention.id} id={intention.id} />
                    <Label htmlFor={intention.id} className="flex-1 cursor-pointer">
                      <span className="font-medium">{intention.nome}</span>
                      {intention.descricao && (
                        <p className="text-sm text-muted-foreground">{intention.descricao}</p>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    if (nearbyTempToConfirm) {
                      setStep('confirm_temp');
                    } else if (newPlaceName.trim()) {
                      setStep('create_temp');
                    } else {
                      setStep('select');
                    }
                  }} 
                  className="flex-1"
                >
                  Voltar
                </Button>
                <Button 
                  onClick={handleActivatePresence}
                  disabled={!selectedIntentionId || activating}
                  className="flex-1 bg-accent text-accent-foreground"
                >
                  {activating ? 'Ativando...' : 'Estou aqui!'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MobileLayout>
  );
}
