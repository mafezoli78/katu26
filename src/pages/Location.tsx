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
import { CheckinSelfie } from '@/components/location/CheckinSelfie';
import { supabase } from '@/integrations/supabase/client';
import * as cameraService from '@/services/cameraService';

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
    currentPresence
  } = usePresence();

  const [step, setStep] = useState<'permission' | 'detecting' | 'select' | 'create_temp' | 'confirm_temp' | 'expression' | 'selfie'>('permission');
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied' | 'blocked'>('prompt');
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [userCoords, setUserCoords] = useState<{lat: number;lng: number;} | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [newPlaceName, setNewPlaceName] = useState('');
  const [activating, setActivating] = useState(false);
  const [expressionText, setExpressionText] = useState('');
  const [cameraRequesting, setCameraRequesting] = useState(false);

  // Default intention: "Livre" (aberto a qualquer interação)
  const DEFAULT_INTENTION_ID = '8302ef7d-e40e-494f-9ea3-7cfb52730bb2';
  const [nearbyTempToConfirm, setNearbyTempToConfirm] = useState<NearbyTemporaryPlace | null>(null);

  // New states for optimized flow
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [closestPlace, setClosestPlace] = useState<Place | null>(null);
  const [searchingByName, setSearchingByName] = useState(false);

  // Search for places - called explicitly after user grants geolocation
  // Progressive radius expansion: 300m → 600m → 800m (max)
  const fetchPlacesRef = useRef<((lat: number, lng: number) => Promise<void>) | null>(null);
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
        limit: 20
      });
      console.log(`[Location] Found ${results.length} places at ${INITIAL_SEARCH_RADIUS_METERS}m`);

      // Step 2: If fewer than MIN_RESULTS_FOR_EXPANSION, expand to 600m
      if (results.length < MIN_RESULTS_FOR_EXPANSION) {
        console.log(`[Location] 🔍 Expanding to ${EXPANDED_SEARCH_RADIUS_METERS}m (found < ${MIN_RESULTS_FOR_EXPANSION})`);
        results = await placesService.searchNearby({
          latitude: lat,
          longitude: lng,
          radius: EXPANDED_SEARCH_RADIUS_METERS,
          limit: 20
        });
        console.log(`[Location] Found ${results.length} places at ${EXPANDED_SEARCH_RADIUS_METERS}m`);

        // Step 3: If still fewer than MIN_RESULTS_FOR_EXPANSION, expand to max 800m
        if (results.length < MIN_RESULTS_FOR_EXPANSION) {
          console.log(`[Location] 🔍 Expanding to max radius: ${MAX_SEARCH_RADIUS_METERS}m`);
          results = await placesService.searchNearby({
            latitude: lat,
            longitude: lng,
            radius: MAX_SEARCH_RADIUS_METERS,
            limit: 20
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
        description: 'Tente novamente'
      });
    } finally {
      setPlacesLoading(false);
    }
  }, [fetchNearbyTemporaryPlaces, toast]);

  // Keep ref in sync with latest fetchPlaces
  fetchPlacesRef.current = fetchPlaces;

  const hasFetchedRef = useRef(false);

  // Check permission status on mount (without triggering prompt)
  useEffect(() => {
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }
    if (loading) return;
    if (currentPresence) {
      console.log('[Location] User has active presence, redirecting to home');
      navigate('/home', { replace: true });
      return;
    }

    // Passive check only — never trigger a prompt or navigate automatically
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'granted') {
          // Permission already granted from a previous session — auto-proceed is safe
          setPermissionStatus('granted');
          handleRequestLocation();
        }
        // For 'denied' or 'prompt', stay on permission screen and wait for user action.
        // We do NOT set 'blocked' here because many mobile browsers report 'denied'
        // even when the user has never been asked.
      }).catch(() => {


        // Permissions API not supported, stay on permission screen
      });}}, [user, navigate, loading, currentPresence]);

  // Explicit handler: user taps "Permitir localização"
  const handleRequestLocation = useCallback(() => {
    if (isRequestingPermission || hasFetchedRef.current) return;

    setIsRequestingPermission(true);
    setStep('detecting');

    if (!navigator.geolocation) {
      setIsRequestingPermission(false);
      setPermissionStatus('blocked');
      toast({ variant: 'destructive', title: 'Geolocalização não suportada' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        hasFetchedRef.current = true;
        setIsRequestingPermission(false);
        setPermissionStatus('granted');

        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        console.log(`[Location] 📍 Got user coordinates: lat=${coords.lat}, lng=${coords.lng}`);
        setUserCoords(coords);
        fetchPlacesRef.current?.(coords.lat, coords.lng);
        setStep('select');
      },
      (error) => {
        setIsRequestingPermission(false);
        console.error('Geolocation error:', error);

        if (error.code === error.PERMISSION_DENIED) {
          // Check if permanently blocked via Permissions API
          if (navigator.permissions) {
            navigator.permissions.query({ name: 'geolocation' }).then((result) => {
              if (result.state === 'denied') {
                setPermissionStatus('blocked');
              } else {
                setPermissionStatus('denied');
              }
            }).catch(() => setPermissionStatus('denied'));
          } else {
            setPermissionStatus('denied');
          }
        }
        setStep('permission');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    );
  }, [isRequestingPermission, toast]);

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
        limit: 20
      });
      setPlaces(results);
      setClosestPlace(null); // Reset closest place suggestion
    } catch (error) {
      console.error('[Location] Error searching by name:', error);
      toast({
        variant: 'destructive',
        title: 'Erro na busca',
        description: 'Tente novamente'
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

  const handleActivatePresence = async (selfieUrl: string, selfieSource: 'camera' | 'upload') => {
    if (!user) return;
    if (!selfieUrl) {
      throw new Error('Presence activation requires selfieUrl');
    }
    setActivating(true);

    try {
      let error: Error | null = null;
      let presenceId: string | null = null;
      const trimmedExpression = expressionText.trim() || undefined;

      if (selectedPlaceId) {
        const result = await activatePresenceAtPlace(selectedPlaceId, DEFAULT_INTENTION_ID, trimmedExpression);
        error = result.error;
        presenceId = result.presenceId;
      } else if (newPlaceName.trim() && userCoords) {
        const result = await createTemporaryPlace(
          newPlaceName.trim(),
          userCoords.lat,
          userCoords.lng,
          DEFAULT_INTENTION_ID,
          trimmedExpression
        );
        error = result.error;
        presenceId = result.presenceId;
      } else {
        error = new Error('Nenhum local selecionado');
      }

      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao ativar presença', description: error.message });
      } else {
        if (!presenceId) {
          throw new Error('Presence ID not returned after activation');
        }

        await supabase
          .from('presence')
          .update({
            checkin_selfie_url: selfieUrl,
            checkin_selfie_created_at: new Date().toISOString(),
            selfie_provided: selfieSource === 'camera',
            selfie_source: selfieSource,
          })
          .eq('id', presenceId);

        navigate('/home', { replace: true });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro inesperado' });
    } finally {
      setActivating(false);
    }
  };

  const handleSelfieConfirm = async (blob: Blob, source: 'camera' | 'upload') => {
    if (!user) return;
    setActivating(true);

    try {
      // Upload selfie to storage
      const fileName = `${user.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.
      from('checkin-selfies').
      upload(fileName, blob, { contentType: blob.type || 'image/jpeg', upsert: true });

      if (uploadError) {
        toast({ variant: 'destructive', title: 'Erro ao enviar foto' });
        setActivating(false);
        return;
      }

      const { data: urlData } = supabase.storage.
      from('checkin-selfies').
      getPublicUrl(fileName);

      // Activate presence with selfie URL and source metadata
      await handleActivatePresence(urlData.publicUrl, source);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro inesperado' });
      setActivating(false);
    }
  };

  const handleSelfieCancel = () => {
    cameraService.stopCamera();
    setStep('expression');
  };

  return (
    <MobileLayout>
      <div className="p-4 space-y-4 page-fade">
        {/* Permission request step */}
        {step === 'permission' &&
        <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-6">
              <MapPin className="h-8 w-8 text-accent" />
            </div>
            <h2 className="text-xl font-bold text-center mb-2">
              {permissionStatus === 'blocked' ? 'Localização bloqueada' : 'Precisamos da sua localização'}
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-8 max-w-[280px]">
              {permissionStatus === 'blocked' ?
            'A permissão foi negada permanentemente. Abra as configurações do navegador para permitir o acesso à localização.' :
            'Para encontrar locais perto de você, precisamos acessar sua localização.'}
            </p>

            {permissionStatus === 'blocked' ?
          <Button
            onClick={() => {
              // On web, we can't open system settings directly.
              // Guide the user instead.
              toast({
                title: 'Abra as configurações',
                description: 'No navegador, toque no ícone de cadeado/configurações ao lado da barra de endereço e permita a localização.'
              });
            }}
            className="w-full max-w-[280px] h-12 rounded-xl font-semibold text-base"
            variant="outline">

                Como permitir
              </Button> :

          <Button
            onClick={handleRequestLocation}
            disabled={isRequestingPermission}
            className="w-full max-w-[280px] h-12 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-base">

                {isRequestingPermission ?
            <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Solicitando...
                  </> :

            <>
                    <MapPin className="h-5 w-5 mr-2" />
                    Permitir localização
                  </>
            }
              </Button>
          }
          </div>
        }

        {/* Detecting location */}
        {step === 'detecting' &&
        <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-12 w-12 text-katu-blue mx-auto mb-4 animate-spin" />
            <p className="text-muted-foreground">Detectando sua localização...</p>
          </div>
        }

        {/* Select location - New optimized component */}
        {step === 'select' &&
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
          userCoords={userCoords} />

        }

        {/* Create temporary place */}
        {step === 'create_temp' &&
        <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-2">
              <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl"
              onClick={() => setStep('select')}>

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
                  className="mt-2 h-11 rounded-xl" />

                </div>
                <Button
                onClick={handleCreateTemporaryPlace}
                disabled={!newPlaceName.trim()}
                className="w-full h-11 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 font-semibold">

                  Continuar
                </Button>
              </CardContent>
            </Card>
          </div>
        }

        {/* Confirm use of existing temporary place */}
        {step === 'confirm_temp' && nearbyTempToConfirm &&
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
                  className="h-11 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 font-semibold">

                    Entrar neste local
                  </Button>
                  <Button
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={handleConfirmCreateNewTemp}>

                    Criar outro local mesmo assim
                  </Button>
                  <Button
                  variant="ghost"
                  className="h-11 rounded-xl"
                  onClick={() => {
                    setNearbyTempToConfirm(null);
                    setStep('select');
                  }}>

                    Voltar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        }

        {/* Expression screen - momentary expression */}
        {step === 'expression' &&
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
              }}>

                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="text-xl font-bold">Seu momento aqui</h2>
              </div>
            </div>
            
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6 space-y-5">
                <div>
                  <p className="text-base text-foreground mb-1">O que as pessoas precisam saber sobre você aqui e agora?

                </p>
                  <p className="text-sm text-muted-foreground mb-4">

                </p>
                  <Textarea
                  placeholder="Ex: Aberto a conversar."
                  value={expressionText}
                  onChange={(e) => setExpressionText(e.target.value.slice(0, 140))}
                  className="min-h-[100px] rounded-xl resize-none"
                  maxLength={140} />

                  <p className="text-xs text-muted-foreground text-right mt-1">
                    {expressionText.length}/140
                  </p>
                </div>

                <Button
                disabled={cameraRequesting}
                onClick={async () => {
                  setCameraRequesting(true);
                  try {
                    await cameraService.requestCamera();
                  } catch (err) {
                    console.error('[Location] Camera request failed:', err);
                    // Don't block — let CheckinSelfie manage the fallback
                  } finally {
                    setCameraRequesting(false);
                    setStep('selfie');  // Always navigate, with or without stream
                  }
                }}
                className="w-full h-12 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-base">

                  {cameraRequesting ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Acessando câmera...
                    </>
                  ) : (
                    'Continuar'
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        }

        {/* Selfie step */}
        {step === 'selfie' &&
        <CheckinSelfie
          onConfirm={handleSelfieConfirm}
          onCancel={handleSelfieCancel}
          uploading={activating} />

        }
      </div>
    </MobileLayout>);

}