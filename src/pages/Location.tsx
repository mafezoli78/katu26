import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePresence } from '@/hooks/usePresence';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Plus, Navigation, Loader2, ArrowLeft, Coffee } from 'lucide-react';
import logoKatu from '@/assets/logo-katu-branco.png';
import { Place } from '@/services/placesService';

export default function Location() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { 
    intentions, 
    nearbyLocations, 
    nearbyPlaces,
    fetchNearbyLocations, 
    fetchNearbyPlaces,
    activatePresence, 
    suggestLocation,
    loading,
    placesLoading 
  } = usePresence();

  const [step, setStep] = useState<'detecting' | 'select' | 'suggest' | 'intention'>('detecting');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedLocationType, setSelectedLocationType] = useState<'location' | 'place'>('location');
  
  // Demo location UUID - must match database record
  const DEMO_LOCATION_ID = 'a0000000-0000-0000-0000-000000000001';
  
  // Demo location for testing - always visible
  const DEMO_LOCATION = {
    id: DEMO_LOCATION_ID,
    nome: '🧪 Local de Teste (DEMO)',
    latitude: 0,
    longitude: 0,
    raio: 999999,
    status_aprovacao: 'aprovado'
  };
  
  // Combine real locations with demo
  const allLocations = [DEMO_LOCATION, ...nearbyLocations];
  const [selectedIntentionId, setSelectedIntentionId] = useState<string | null>(null);
  const [newLocationName, setNewLocationName] = useState('');
  const [activating, setActivating] = useState(false);

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
          
          // Fetch both manual locations AND Foursquare places
          fetchNearbyLocations(coords.lat, coords.lng);
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

  const handleSelectLocation = (locationId: string, type: 'location' | 'place') => {
    setSelectedLocationId(locationId);
    setSelectedLocationType(type);
    setStep('intention');
  };

  const handleSuggestLocation = async () => {
    if (!newLocationName.trim() || !userCoords) {
      toast({ variant: 'destructive', title: 'Preencha o nome do local' });
      return;
    }

    const { error } = await suggestLocation(newLocationName.trim(), userCoords.lat, userCoords.lng);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao sugerir local' });
    } else {
      toast({ 
        title: 'Local sugerido!', 
        description: 'Seu local será analisado e aprovado em breve' 
      });
      setNewLocationName('');
      setStep('select');
    }
  };

  const handleActivatePresence = async () => {
    if (!selectedLocationId || !selectedIntentionId) return;

    setActivating(true);
    
    // For now, we only support activating presence for manual locations
    // In the future, we can add support for places by creating a temporary location record
    if (selectedLocationType === 'place') {
      // TODO: Create a location record from the place and use that
      toast({ 
        variant: 'destructive', 
        title: 'Funcionalidade em desenvolvimento',
        description: 'Ativar presença em estabelecimentos do Foursquare ainda não está disponível'
      });
      setActivating(false);
      return;
    }
    
    const { error } = await activatePresence(selectedLocationId, selectedIntentionId);
    setActivating(false);

    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao ativar presença' });
    } else {
      toast({ title: 'Você está aqui! 📍' });
      navigate('/home', { replace: true });
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
                Selecione onde você está ou sugira um novo local
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Manual/Demo Locations Section */}
                  {allLocations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground font-medium">Locais cadastrados</p>
                      {allLocations.map((location) => (
                        <Button
                          key={location.id}
                          variant="outline"
                          className={`w-full justify-start h-auto py-3 touch-active ${
                            location.id === DEMO_LOCATION_ID 
                              ? 'border-dashed border-accent bg-accent/5' 
                              : ''
                          }`}
                          onClick={() => handleSelectLocation(location.id, 'location')}
                        >
                          <MapPin className={`h-5 w-5 mr-3 ${
                            location.id === DEMO_LOCATION_ID 
                              ? 'text-accent' 
                              : 'text-primary'
                          }`} />
                          <span>{location.nome}</span>
                        </Button>
                      ))}
                    </div>
                  )}

                  {/* Foursquare Places Section */}
                  {placesLoading ? (
                    <div className="text-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      <p className="text-sm text-muted-foreground mt-2">Buscando locais próximos...</p>
                    </div>
                  ) : nearbyPlaces.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground font-medium">
                        Estabelecimentos próximos ({nearbyPlaces.length})
                      </p>
                      {nearbyPlaces.slice(0, 10).map((place) => (
                        <Button
                          key={place.id}
                          variant="outline"
                          className="w-full justify-start h-auto py-3 touch-active"
                          onClick={() => handleSelectLocation(place.id, 'place')}
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
                  ) : userCoords ? (
                    <p className="text-muted-foreground text-center py-4 text-sm">
                      Nenhum estabelecimento encontrado por perto
                    </p>
                  ) : null}
                </div>
              )}

              <Button
                variant="ghost"
                className="w-full mt-4"
                onClick={() => setStep('suggest')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Sugerir novo local
              </Button>
            </CardContent>
          </Card>
          </>
        )}

        {/* Suggest new location */}
        {step === 'suggest' && (
          <Card>
            <CardHeader>
              <CardTitle>Sugerir local</CardTitle>
              <CardDescription>
                O local será analisado antes de ser aprovado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="locationName">Nome do local</Label>
                <Input
                  id="locationName"
                  placeholder="Ex: Café Central, Praça da Liberdade..."
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('select')} className="flex-1">
                  Voltar
                </Button>
                <Button 
                  onClick={handleSuggestLocation} 
                  className="flex-1 bg-accent text-accent-foreground"
                >
                  Enviar sugestão
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
                <Button variant="outline" onClick={() => setStep('select')} className="flex-1">
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
