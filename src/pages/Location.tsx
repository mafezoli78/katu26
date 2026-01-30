import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePresence, NearbyTemporaryPlace } from '@/hooks/usePresence';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, MapPin, ArrowLeft } from 'lucide-react';
import { Place, placesService, PROXIMITY_THRESHOLD_METERS, INITIAL_SEARCH_RADIUS_METERS, EXPANDED_SEARCH_RADIUS_METERS, MAX_SEARCH_RADIUS_METERS, MIN_RESULTS_FOR_EXPANSION } from '@/services/placesService';
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

  const [step, setStep] = useState<'detecting' | 'select' | 'create_temp' | 'confirm_temp' | 'expression'>('detecting');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [newPlaceName, setNewPlaceName] = useState('');
  const [activating, setActivating] = useState(false);
  const [expressionText, setExpressionText] = useState('');
  
  // Default intention: "Livre" (aberto a qualquer interação)
  const DEFAULT_INTENTION_ID = '8302ef7d-e40e-494f-9ea3-7cfb52730bb2';
  const [nearbyTempToConfirm, setNearbyTempToConfirm] = useState<NearbyTemporaryPlace | null>(null);
  
  // New states for optimized flow
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [closestPlace, setClosestPlace] = useState<Place | null>(null);
  const [searchingByName, setSearchingByName] = useState(false);

  // Auto-search for places when coordinates are obtained
  // Progressive radius expansion: 300m → 600m → 800m (max)
  const fetchPlaces = useCallback(async (lat: number, lng: number) => {
    setPlacesLoading(true);
    
    try {
      // Fetch temporary places first
      await fetchNearbyTemporaryPlaces(lat, lng);
      
      // Step 1: Initial search with 300m radius
      console.log(`[Location] 🔍 Searching with initial radius: ${INITIAL_SEARCH_RADIUS_METERS}m`);
      let results = await placesService.searchNearby({
        latitude: lat,
        longitude: lng,
        radius: INITIAL_SEARCH_RADIUS_METERS,
        limit: 20,
      });
      console.log(`[Location] Found ${results.length} places at ${INITIAL_SEARCH_RADIUS_METERS}m`);

      // Step 2: If fewer than MIN_RESULTS_FOR_EXPANSION, expand to 600m
      if (results.length < MIN_RESULTS_FOR_EXPANSION) {
        console.log(`[Location] 🔍 Expanding to ${EXPANDED_SEARCH_RADIUS_METERS}m (found < ${MIN_RESULTS_FOR_EXPANSION})`);
        results = await placesService.searchNearby({
          latitude: lat,
          longitude: lng,
          radius: EXPANDED_SEARCH_RADIUS_METERS,
          limit: 20,
        });
        console.log(`[Location] Found ${results.length} places at ${EXPANDED_SEARCH_RADIUS_METERS}m`);

        // Step 3: If still fewer than MIN_RESULTS_FOR_EXPANSION, expand to max 800m
        if (results.length < MIN_RESULTS_FOR_EXPANSION) {
          console.log(`[Location] 🔍 Expanding to max radius: ${MAX_SEARCH_RADIUS_METERS}m`);
          results = await placesService.searchNearby({
            latitude: lat,
            longitude: lng,
            radius: MAX_SEARCH_RADIUS_METERS,
            limit: 20,
          });
          console.log(`[Location] Found ${results.length} places at ${MAX_SEARCH_RADIUS_METERS}m (max)`);
        }
      }

      setPlaces(results);

      // Check for very close place
      if (results.length > 0 && results[0].distance_meters !== undefined) {
        if (results[0].distance_meters <= PROXIMITY_THRESHOLD_METERS) {
          setClosestPlace(results[0]);
          console.log(`[Location] Found very close place: ${results[0].nome} (${results[0].distance_meters}m)`);
        }
      }

      console.log(`[Location] ✅ Final result: ${results.length} places`);
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
    setStep('expression');
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

    // No nearby temporary places, proceed to expression
    setStep('expression');
  };

  const handleConfirmUseExistingTemp = () => {
    if (nearbyTempToConfirm) {
      setSelectedPlaceId(nearbyTempToConfirm.id);
      setStep('expression');
    }
  };

  const handleConfirmCreateNewTemp = () => {
    // User wants to create new place even though one exists nearby
    setNearbyTempToConfirm(null);
    setStep('expression');
  };

  const handleActivatePresence = async () => {
    setActivating(true);
    
    try {
      let error: Error | null = null;
      const trimmedExpression = expressionText.trim() || undefined;

      if (selectedPlaceId) {
        // Activate presence at existing place (Foursquare or temporary)
        const result = await activatePresenceAtPlace(selectedPlaceId, DEFAULT_INTENTION_ID, trimmedExpression);
        error = result.error;
      } else if (newPlaceName.trim() && userCoords) {
        // Create new temporary place and activate presence
        const result = await createTemporaryPlace(
          newPlaceName.trim(),
          userCoords.lat,
          userCoords.lng,
          DEFAULT_INTENTION_ID,
          trimmedExpression
        );
        error = result.error;
      } else {
        error = new Error('Nenhum local selecionado');
      }

      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao ativar presença', description: error.message });
      } else {
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
        {/* Detecting location */}
        {step === 'detecting' && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-12 w-12 text-katu-blue mx-auto mb-4 animate-spin" />
            <p className="text-muted-foreground">Detectando sua localização...</p>
          </div>
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
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 rounded-xl"
                onClick={() => setStep('select')}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="text-xl font-bold">Criar local temporário</h2>
                <p className="text-sm text-muted-foreground">
                  Expira após 6 horas sem atividade
                </p>
              </div>
            </div>
            
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6 space-y-4">
                <div>
                  <Label htmlFor="placeName" className="text-sm font-medium">Nome do local</Label>
                  <Input
                    id="placeName"
                    placeholder="Ex: Festa do João, Churrasco no parque..."
                    value={newPlaceName}
                    onChange={(e) => setNewPlaceName(e.target.value)}
                    className="mt-2 h-11 rounded-xl"
                  />
                </div>
                <Button 
                  onClick={handleCreateTemporaryPlace}
                  disabled={!newPlaceName.trim()}
                  className="w-full h-11 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
                >
                  Continuar
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Confirm use of existing temporary place */}
        {step === 'confirm_temp' && nearbyTempToConfirm && (
          <div className="space-y-4 animate-fade-in">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold">Local temporário próximo</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Já existe um local muito próximo. Deseja entrar?
              </p>
            </div>
            
            <Card className="border-2 border-katu-green/30">
              <CardContent className="pt-6">
                <div className="p-4 bg-katu-green/10 rounded-xl">
                  <p className="font-semibold text-lg">{nearbyTempToConfirm.nome}</p>
                  <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{nearbyTempToConfirm.active_users} {nearbyTempToConfirm.active_users === 1 ? 'pessoa' : 'pessoas'}</span>
                    <span>•</span>
                    <span>{Math.round(nearbyTempToConfirm.distance_meters)}m de você</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 mt-4">
                  <Button 
                    onClick={handleConfirmUseExistingTemp}
                    className="h-11 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
                  >
                    Entrar neste local
                  </Button>
                  <Button 
                    variant="outline"
                    className="h-11 rounded-xl"
                    onClick={handleConfirmCreateNewTemp}
                  >
                    Criar outro local mesmo assim
                  </Button>
                  <Button 
                    variant="ghost"
                    className="h-11 rounded-xl"
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
          </div>
        )}

        {/* Expression screen - momentary expression */}
        {step === 'expression' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 rounded-xl"
                onClick={() => {
                  if (nearbyTempToConfirm) {
                    setStep('confirm_temp');
                  } else if (newPlaceName.trim()) {
                    setStep('create_temp');
                  } else {
                    setStep('select');
                  }
                }}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="text-xl font-bold">Expressão momentânea</h2>
              </div>
            </div>
            
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6 space-y-5">
                <div>
                  <p className="text-base text-foreground mb-4">
                    Quer se conectar com alguém sobre algo específico agora?
                  </p>
                  <Textarea
                    placeholder="Ex: Alguém quer jogar conversa fora sobre viagens?"
                    value={expressionText}
                    onChange={(e) => setExpressionText(e.target.value.slice(0, 140))}
                    className="min-h-[100px] rounded-xl resize-none"
                    maxLength={140}
                  />
                  <p className="text-xs text-muted-foreground text-right mt-1">
                    {expressionText.length}/140
                  </p>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <Button 
                    onClick={handleActivatePresence}
                    disabled={activating}
                    className="w-full h-12 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-base"
                  >
                    {activating ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Ativando...
                      </>
                    ) : (
                      'Continuar'
                    )}
                  </Button>
                  <Button 
                    variant="ghost"
                    onClick={() => {
                      setExpressionText('');
                      handleActivatePresence();
                    }}
                    disabled={activating}
                    className="w-full h-11 rounded-xl text-muted-foreground"
                  >
                    Seguir sem escrever
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
