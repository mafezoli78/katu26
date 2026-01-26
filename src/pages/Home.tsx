import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePresence } from '@/hooks/usePresence';
import { usePeopleNearby } from '@/hooks/usePeopleNearby';
import { useWaves } from '@/hooks/useWaves';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Clock, RefreshCw, LogOut, Hand, Sparkles, AlertCircle } from 'lucide-react';

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { 
    currentPresence, 
    currentLocation, 
    formatRemainingTime,
    renewPresence, 
    deactivatePresence,
    lastEndReason,
    clearLastEndReason,
    presenceRadiusMeters,
    loading: presenceLoading 
  } = usePresence();
  const { people, loading: peopleLoading, refetch: refetchPeople } = usePeopleNearby(currentLocation?.id || null);
  const { sendWave, hasWavedTo, refetch: refetchWaves } = useWaves();

  useEffect(() => {
    if (!user) {
      navigate('/auth', { replace: true });
    }
  }, [user, navigate]);

  // Show toast when presence ends (by GPS exit or expiration)
  useEffect(() => {
    if (lastEndReason) {
      const variant = lastEndReason.type === 'gps_exit' ? 'destructive' : 'default';
      const icon = lastEndReason.type === 'gps_exit' ? '📍' : '⏰';
      
      toast({
        variant,
        title: `${icon} ${lastEndReason.message}`,
        description: lastEndReason.type === 'gps_exit' 
          ? 'Seus acenos foram encerrados automaticamente.'
          : 'Selecione um novo local para continuar.',
      });
      
      // Refetch waves since they were cleared
      refetchWaves();
      clearLastEndReason();
    }
  }, [lastEndReason, toast, clearLastEndReason, refetchWaves]);

  const handleWave = async (toUserId: string) => {
    if (!currentLocation) return;
    
    const { error } = await sendWave(toUserId, currentLocation.id);
    if (error) {
      toast({ variant: 'destructive', title: error.message });
    } else {
      toast({ title: 'Aceno enviado! 👋' });
    }
  };

  if (presenceLoading) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="animate-pulse-soft text-muted-foreground">Carregando...</div>
        </div>
      </MobileLayout>
    );
  }

  // No active presence - prompt to select location
  if (!currentPresence || !currentLocation) {
    return (
      <MobileLayout>
        <div className="p-4 space-y-6">
          <div className="text-center py-12">
            <MapPin className="h-16 w-16 text-primary mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Onde você está?</h1>
            <p className="text-muted-foreground mb-6">
              Confirme sua localização para ver quem está por perto
            </p>
            <Button 
              onClick={() => navigate('/location')}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Confirmar localização
            </Button>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="p-4 space-y-4 page-fade">
        {/* Presence status card */}
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                <span className="font-medium">{currentLocation.nome}</span>
              </div>
              <div className="flex items-center gap-1 text-sm opacity-80">
                <Clock className="h-4 w-4" />
                <span>{formatRemainingTime()}</span>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button 
                size="sm" 
                variant="secondary"
                onClick={renewPresence}
                className="flex-1"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Renovar
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={deactivatePresence}
                className="flex-1 bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
              >
                <LogOut className="h-4 w-4 mr-1" />
                Sair
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Pessoas aqui ({people.length})
          </h2>
          <Button variant="ghost" size="sm" onClick={refetchPeople}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* People list */}
        {peopleLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : people.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">Ninguém por aqui ainda...</p>
              <p className="text-sm text-muted-foreground mt-1">Aguarde novas pessoas chegarem!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {people.map((person) => {
              const alreadyWaved = hasWavedTo(person.id, currentLocation.id);
              const age = person.profile.data_nascimento 
                ? new Date().getFullYear() - new Date(person.profile.data_nascimento).getFullYear()
                : null;

              return (
                <Card key={person.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <Avatar className="h-16 w-16">
                        <AvatarImage src={person.profile.foto_url || undefined} />
                        <AvatarFallback className="bg-secondary text-secondary-foreground text-lg">
                          {person.profile.nome?.[0]?.toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">
                            {person.profile.nome}
                            {age && <span className="text-muted-foreground font-normal">, {age}</span>}
                          </h3>
                        </div>
                        <Badge variant="outline" className="text-xs mt-1">
                          {person.intention.nome}
                        </Badge>
                        {person.profile.bio && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {person.profile.bio}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Interests */}
                    <div className="flex flex-wrap gap-1 mt-3">
                      {person.interests.slice(0, 5).map((interest) => (
                        <Badge 
                          key={interest.id}
                          variant={person.commonInterests.includes(interest.tag) ? 'default' : 'secondary'}
                          className={`text-xs ${person.commonInterests.includes(interest.tag) ? 'bg-accent text-accent-foreground' : ''}`}
                        >
                          {person.commonInterests.includes(interest.tag) && (
                            <Sparkles className="h-3 w-3 mr-1" />
                          )}
                          {interest.tag}
                        </Badge>
                      ))}
                    </div>

                    {/* Wave button */}
                    <Button
                      className={`w-full mt-3 ${alreadyWaved ? '' : 'bg-accent text-accent-foreground hover:bg-accent/90'}`}
                      variant={alreadyWaved ? 'secondary' : 'default'}
                      disabled={alreadyWaved}
                      onClick={() => handleWave(person.id)}
                    >
                      <Hand className={`h-4 w-4 mr-2 ${!alreadyWaved ? 'animate-wave' : ''}`} />
                      {alreadyWaved ? 'Você já acenou' : 'Acenar'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
