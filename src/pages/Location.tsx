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
import { MapPin, Plus, Navigation, Loader2, ArrowLeft } from 'lucide-react';
import logoKatu from '@/assets/logo-katu-branco.png';

export default function Location() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { 
    intentions, 
    nearbyLocations, 
    fetchNearbyLocations, 
    activatePresence, 
    suggestLocation,
    loading 
  } = usePresence();

  const [step, setStep] = useState<'detecting' | 'select' | 'suggest' | 'intention'>('detecting');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  
  // Demo location for testing - always visible
  const DEMO_LOCATION = {
    id: 'demo-test-location',
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
          setUserCoords(coords);
          fetchNearbyLocations(coords.lat, coords.lng);
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

  const handleSelectLocation = (locationId: string) => {
    setSelectedLocationId(locationId);
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
                ) : allLocations.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    Nenhum local aprovado encontrado por perto
                  </p>
                ) : (
                  <div className="space-y-2">
                    {allLocations.map((location) => (
                      <Button
                        key={location.id}
                        variant="outline"
                        className={`w-full justify-start h-auto py-3 touch-active ${
                          location.id === 'demo-test-location' 
                            ? 'border-dashed border-accent bg-accent/5' 
                            : ''
                        }`}
                        onClick={() => handleSelectLocation(location.id)}
                      >
                        <MapPin className={`h-5 w-5 mr-3 ${
                          location.id === 'demo-test-location' 
                            ? 'text-accent' 
                            : 'text-primary'
                        }`} />
                        <span>{location.nome}</span>
                      </Button>
                    ))}
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
