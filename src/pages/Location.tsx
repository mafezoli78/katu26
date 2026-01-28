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
import { Loader2, Users, MapPin, ArrowLeft } from 'lucide-react';
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

        {/* Select intention */}
        {step === 'intention' && (
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
                <h2 className="text-xl font-bold">Qual sua intenção?</h2>
                <p className="text-sm text-muted-foreground">
                  Isso ajuda a conectar com pessoas compatíveis
                </p>
              </div>
            </div>
            
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6 space-y-4">
                <RadioGroup
                  value={selectedIntentionId || undefined}
                  onValueChange={setSelectedIntentionId}
                  className="space-y-2"
                >
                  {intentions.map((intention) => (
                    <div 
                      key={intention.id} 
                      className={`flex items-center space-x-3 p-4 border rounded-xl transition-all cursor-pointer ${
                        selectedIntentionId === intention.id 
                          ? 'border-katu-blue bg-katu-blue/5' 
                          : 'border-border hover:border-muted-foreground/30'
                      }`}
                      onClick={() => setSelectedIntentionId(intention.id)}
                    >
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

                <Button 
                  onClick={handleActivatePresence}
                  disabled={!selectedIntentionId || activating}
                  className="w-full h-12 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-base"
                >
                  {activating ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Ativando...
                    </>
                  ) : (
                    'Estou aqui!'
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
