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
import { MapPin, Clock, RefreshCw, LogOut, Sparkles, Wifi, Store, Users } from 'lucide-react';

// Waving hand icon
function WavingHand({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      className={className}
    >
      <path d="M7 11.5V14c0 2.5 2 4.5 5 6c3-1.5 5-3.5 5-6v-2.5" />
      <path d="M11.5 6.5c0-1-0.5-2-1.5-2s-1.5 1-1.5 2v4.5" />
      <path d="M14.5 7.5c0-1-0.5-2-1.5-2s-1.5 1-1.5 2v3" />
      <path d="M17.5 9.5c0-1-0.5-2-1.5-2s-1.5 1-1.5 2v2" />
      <path d="M8.5 11V6c0-1-0.5-2-1.5-2S5.5 5 5.5 6v8c0 0.5 0 1.5 0.5 2.5" />
    </svg>
  );
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { 
    currentPresence, 
    currentPlace, 
    formatRemainingTime,
    renewPresence, 
    deactivatePresence,
    lastEndReason,
    clearLastEndReason,
    presenceRadiusMeters,
    loading: presenceLoading 
  } = usePresence();
  const { people, loading: peopleLoading, refetch: refetchPeople } = usePeopleNearby(currentPlace?.id || null);
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
    if (!currentPlace) return;
    
    const { error } = await sendWave(toUserId, currentPlace.id);
    if (error) {
      toast({ variant: 'destructive', title: error.message });
    } else {
      toast({ title: 'Aceno enviado! 👋' });
    }
  };

  // Auto-redirect to location page if no active presence
  useEffect(() => {
    if (!presenceLoading && (!currentPresence || !currentPlace)) {
      navigate('/location', { replace: true });
    }
  }, [presenceLoading, currentPresence, currentPlace, navigate]);

  if (presenceLoading) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-pulse-soft text-muted-foreground">Carregando...</div>
        </div>
      </MobileLayout>
    );
  }

  // If still no presence after loading, show nothing (redirect will happen)
  if (!currentPresence || !currentPlace) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-pulse-soft text-muted-foreground">Carregando...</div>
        </div>
      </MobileLayout>
    );
  }

  const isTemporaryPlace = currentPlace.is_temporary;

  return (
    <MobileLayout>
      <div className="p-4 space-y-4 page-fade">
        {/* Presence status card */}
        <Card className="bg-gradient-to-r from-primary to-primary/90 text-primary-foreground border-0 shadow-lg overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isTemporaryPlace ? 'bg-katu-green/20' : 'bg-white/20'}`}>
                  {isTemporaryPlace ? (
                    <Wifi className="h-5 w-5 text-white" />
                  ) : (
                    <Store className="h-5 w-5 text-white" />
                  )}
                </div>
                <div>
                  <h2 className="font-semibold text-lg leading-tight">{currentPlace.nome}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    {isTemporaryPlace && (
                      <Badge variant="secondary" className="bg-katu-green/20 text-white border-0 text-xs">
                        Temporário
                      </Badge>
                    )}
                    <span className="text-xs text-white/70 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatRemainingTime()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="secondary"
                onClick={renewPresence}
                className="flex-1 h-9 rounded-lg bg-white/20 hover:bg-white/30 text-white border-0"
              >
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Renovar
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={deactivatePresence}
                className="flex-1 h-9 rounded-lg bg-transparent border-white/30 text-white hover:bg-white/10"
              >
                <LogOut className="h-4 w-4 mr-1.5" />
                Sair
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-katu-blue" />
            <h2 className="text-lg font-semibold">
              Pessoas aqui ({people.length})
            </h2>
          </div>
          <Button variant="ghost" size="sm" onClick={refetchPeople} className="h-9 w-9 p-0 rounded-lg">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* People list */}
        {peopleLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : people.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-10 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">Ninguém por aqui ainda...</p>
              <p className="text-sm text-muted-foreground mt-1">Aguarde novas pessoas chegarem!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {people.map((person) => {
              const alreadyWaved = hasWavedTo(person.id, currentPlace.id);
              const age = person.profile.data_nascimento 
                ? new Date().getFullYear() - new Date(person.profile.data_nascimento).getFullYear()
                : null;

              return (
                <Card key={person.id} className="border-0 shadow-sm overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <Avatar className="h-14 w-14 ring-2 ring-background shadow">
                        <AvatarImage src={person.profile.foto_url || undefined} />
                        <AvatarFallback className="bg-katu-blue text-white text-lg font-semibold">
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
                        <Badge variant="outline" className="text-xs mt-1 rounded-md">
                          {person.intention.nome}
                        </Badge>
                        {person.profile.bio && (
                          <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                            {person.profile.bio}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Interests */}
                    {person.interests.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {person.interests.slice(0, 5).map((interest) => {
                          const isCommon = person.commonInterests.includes(interest.tag);
                          return (
                            <Badge 
                              key={interest.id}
                              variant={isCommon ? 'default' : 'secondary'}
                              className={`text-xs rounded-md ${
                                isCommon 
                                  ? 'bg-accent text-accent-foreground' 
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {isCommon && <Sparkles className="h-3 w-3 mr-1" />}
                              {interest.tag}
                            </Badge>
                          );
                        })}
                      </div>
                    )}

                    {/* Wave button */}
                    <Button
                      className={`w-full mt-4 h-11 rounded-xl font-semibold ${
                        alreadyWaved 
                          ? 'bg-muted text-muted-foreground' 
                          : 'bg-accent text-accent-foreground hover:bg-accent/90'
                      }`}
                      variant={alreadyWaved ? 'secondary' : 'default'}
                      disabled={alreadyWaved}
                      onClick={() => handleWave(person.id)}
                    >
                      <WavingHand className={`h-5 w-5 mr-2 ${!alreadyWaved ? 'animate-wave' : ''}`} />
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
