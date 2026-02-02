import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePresence } from '@/hooks/usePresence';
import { usePeopleNearby } from '@/hooks/usePeopleNearby';
import { useWaves } from '@/hooks/useWaves';
import { useInteractionData } from '@/hooks/useInteractionData';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { PersonCard } from '@/components/home/PersonCard';
import { Clock, RefreshCw, LogOut, Wifi, Store, Users } from 'lucide-react';

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
    loading: presenceLoading 
  } = usePresence();
  const { people, loading: peopleLoading, refetch: refetchPeople } = usePeopleNearby(currentPlace?.id || null);
  const { sendWave, refetch: refetchWaves } = useWaves();
  
  // Buscar todos os dados de interação para o local atual
  const {
    sentWaves,
    receivedWaves,
    conversations,
    activeMutes,
    blocks,
    refetch: refetchInteractionData,
  } = useInteractionData(currentPlace?.id || null);

  useEffect(() => {
    if (!user) {
      navigate('/auth', { replace: true });
    }
  }, [user, navigate]);

  // Handle presence end - refetch waves and clear reason without showing toast
  useEffect(() => {
    if (lastEndReason) {
      refetchWaves();
      refetchInteractionData();
      clearLastEndReason();
    }
  }, [lastEndReason, clearLastEndReason, refetchWaves, refetchInteractionData]);

  const handleWave = async (toUserId: string) => {
    if (!currentPlace) return;
    
    const { error } = await sendWave(toUserId, currentPlace.id);
    if (error) {
      toast({ variant: 'destructive', title: error.message });
    } else {
      toast({ title: 'Aceno enviado! 👋' });
      // Refetch para atualizar estado do botão
      refetchInteractionData();
    }
  };

  // Auto-redirect to location page if no active presence
  // IMPORTANT: Only redirect AFTER loading is complete to prevent premature redirects
  // when returning from background (presence state needs time to refetch from backend)
  useEffect(() => {
    if (presenceLoading) return; // Wait for backend fetch
    if (!currentPresence || !currentPlace) {
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

  // A Home NÃO filtra por interação - apenas mapeia people → PersonCard
  // Visibilidade é controlada EXCLUSIVAMENTE pelo useInteractionState no PersonCard

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
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => {
              refetchPeople();
              refetchInteractionData();
            }} 
            className="h-9 w-9 p-0 rounded-lg"
          >
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
            {people.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                placeId={currentPlace.id}
                sentWaves={sentWaves}
                receivedWaves={receivedWaves}
                conversations={conversations}
                activeMutes={activeMutes}
                blocks={blocks}
                onWave={handleWave}
              />
            ))}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
