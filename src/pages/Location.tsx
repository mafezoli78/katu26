import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePresence, NearbyTemporaryPlace } from '@/hooks/usePresence';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Plus, Navigation, Loader2, ArrowLeft, Coffee, Users, Clock } from 'lucide-react';
import logoKatu from '@/assets/logo-katu-branco.png';
import { Place } from '@/services/placesService';
import { Badge } from '@/components/ui/badge';

export default function Location() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { 
    intentions, 
    nearbyPlaces,
    nearbyTemporaryPlaces,
    fetchNearbyPlaces,
    fetchNearbyTemporaryPlaces,
    activatePresenceAtPlace,
    createTemporaryPlace,
    loading,
    placesLoading,
    presenceRadiusMeters,
  } = usePresence();

  const [step, setStep] = useState<'detecting' | 'select' | 'create_temp' | 'confirm_temp' | 'intention'>('detecting');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedIntentionId, setSelectedIntentionId] = useState<string | null>(null);
  const [newPlaceName, setNewPlaceName] = useState('');
  const [activating, setActivating] = useState(false);
  const [nearbyTempToConfirm, setNearbyTempToConfirm] = useState<NearbyTemporaryPlace | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }

    // Request geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
          console.log(`[Location] 📍 Got user coordinates: lat=${coords.lat}, lng=${coords.lng}`);
          setUserCoords(coords);
          
          // Fetch places (Foursquare + temporary places)
          fetchNearbyPlaces(coords.lat, coords.lng);
          
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
        }
      );
    } else {
      toast({ variant: 'destructive', title: 'Geolocalização não suportada' });
      setStep('select');
    }
  }, [user]);

  const handleSelectPlace = (placeId: string) => {
    setSelectedPlaceId(placeId);
    setStep('intention');
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary p-4 flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate(-1)}
          className="text-primary-foreground hover:bg-primary-foreground/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <img src={logoKatu} alt="Katu" className="w-16 h-auto" />
      </div>

      <div className="p-4 space-y-4 page-enter">
        {/* Detecting location */}
        {step === 'detecting' && (
          <Card>
            <CardContent className="py-12 text-center">
              <Loader2 className="h-12 w-12 text-primary mx-auto mb-4 animate-spin" />
              <p className="text-muted-foreground">Detectando sua localização...</p>
            </CardContent>
          </Card>
        )}

        {/* Select location */}
        {step === 'select' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Navigation className="h-5 w-5" />
                  Locais próximos
                </CardTitle>
                <CardDescription>
                  Selecione onde você está (raio: {presenceRadiusMeters}m)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading || placesLoading ? (
                  <div className="text-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    <p className="text-sm text-muted-foreground mt-2">Buscando locais próximos...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Temporary Places Section (prioritized) */}
                    {nearbyTemporaryPlaces.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Locais temporários ativos
                        </p>
                        {nearbyTemporaryPlaces.map((place) => (
                          <Button
                            key={place.id}
                            variant="outline"
                            className="w-full justify-start h-auto py-3 touch-active border-accent bg-accent/5"
                            onClick={() => handleSelectPlace(place.id)}
                          >
                            <MapPin className="h-5 w-5 mr-3 text-accent" />
                            <div className="flex flex-col items-start text-left flex-1">
                              <span>{place.nome}</span>
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
                    {nearbyPlaces.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground font-medium">
                          Estabelecimentos próximos ({nearbyPlaces.length})
                        </p>
                        {nearbyPlaces.slice(0, 10).map((place) => (
                          <Button
                            key={place.id}
                            variant="outline"
                            className="w-full justify-start h-auto py-3 touch-active"
                            onClick={() => handleSelectPlace(place.id)}
                          >
                            <Coffee className="h-5 w-5 mr-3 text-muted-foreground" />
                            <div className="flex flex-col items-start text-left">
                              <span>{place.nome}</span>
                              {place.categoria && (
                                <span className="text-xs text-muted-foreground">{place.categoria}</span>
                              )}
                            </div>
                          </Button>
                        ))}
                      </div>
                    )}

                    {nearbyPlaces.length === 0 && nearbyTemporaryPlaces.length === 0 && userCoords && (
                      <p className="text-muted-foreground text-center py-4 text-sm">
                        Nenhum local encontrado por perto
                      </p>
                    )}
                  </div>
                )}

                <Button
                  variant="ghost"
                  className="w-full mt-4"
                  onClick={() => setStep('create_temp')}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Criar local temporário
                </Button>
              </CardContent>
            </Card>
          </>
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
    </div>
  );
}
