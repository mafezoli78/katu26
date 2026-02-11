import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePresence } from '@/hooks/usePresence';
import { usePeopleNearby } from '@/hooks/usePeopleNearby';
import { useWaves } from '@/hooks/useWaves';
import { useInteractionData } from '@/hooks/useInteractionData';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { PersonCard } from '@/components/home/PersonCard';
import { Clock, RefreshCw, LogOut, Store, Users } from 'lucide-react';
import { TemporaryPlaceIcon } from '@/components/icons/TemporaryPlaceIcon';
import { supabase } from '@/integrations/supabase/client';

export default function Home() {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
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
    loading: presenceLoading,
    presenceState,
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

  // A3: Handle presence end - show toast for automatic endings, refetch data
  useEffect(() => {
    if (lastEndReason) {
      refetchWaves();
      refetchInteractionData();
      
      // Show toast only for non-manual endings (automatic/system-initiated)
      // Manual exits (user clicked "Sair") are intentional — silence is valid
      const reasonType = lastEndReason.type;
      if (reasonType === 'presence_expired' || reasonType === 'expired') {
        toast({ title: 'Presença expirada', description: 'Seu tempo no local terminou' });
      } else if (reasonType === 'gps_exit') {
        toast({ title: 'Você saiu da área', description: 'Presença encerrada automaticamente' });
      }
      // 'manual' / 'user_left_location': silence (explicit user action)
      
      clearLastEndReason();
    }
  }, [lastEndReason, clearLastEndReason, refetchWaves, refetchInteractionData, toast]);

  const handleWave = async (toUserId: string) => {
    if (!currentPlace) return;
    
    const { error } = await sendWave(toUserId, currentPlace.id);
    if (error) {
      toast({ variant: 'destructive', title: error.message });
    } else {
      toast({ title: 'Aceno enviado! 👋' });
      refetchInteractionData();
    }
  };

  const handleMute = async (targetUserId: string) => {
    if (!user || !currentPlace) return;
    
    // Check if already muted
    const existingMute = activeMutes.find(
      m => m.user_id === user.id && m.muted_user_id === targetUserId
    );
    
    if (existingMute) {
      // Remove mute
      const { error } = await supabase
        .from('user_mutes')
        .delete()
        .eq('id', existingMute.id);
      
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao remover silenciamento' });
      } else {
      toast({ title: 'Silenciamento removido' });
        await refetchInteractionData();
      }
    } else {
      // Create mute
      const { error } = await supabase
        .from('user_mutes')
        .insert({
          user_id: user.id,
          muted_user_id: targetUserId,
          place_id: currentPlace.id,
        });
      
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao silenciar' });
      } else {
      toast({ title: 'Usuário silenciado por 24h' });
        await refetchInteractionData();
      }
    }
  };

  const handleBlock = async (targetUserId: string) => {
    if (!user) return;
    
    // Check if already blocked by me
    const existingBlock = blocks.find(
      b => b.user_id === user.id && b.blocked_user_id === targetUserId
    );
    
    if (existingBlock) {
      // Remove block
      const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('id', existingBlock.id);
      
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao remover bloqueio' });
      } else {
      toast({ title: 'Bloqueio removido' });
        await refetchInteractionData();
      }
    } else {
      // Create block
      const { error } = await supabase
        .from('user_blocks')
        .insert({
          user_id: user.id,
          blocked_user_id: targetUserId,
        });
      
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao bloquear' });
      } else {
      toast({ title: 'Usuário bloqueado' });
        await refetchInteractionData();
      }
    }
  };

  // Auto-redirect to location page if no active presence
  // CRITICAL: Use logical state model to prevent false redirects during revalidation
  // Rules:
  // 1. Wait for initial load to complete
  // 2. NEVER redirect while revalidating (background/foreground, network delays)
  // 3. Only redirect if logical state is 'ended' (human-initiated termination)
  // 4. 'suspended' state = keep user in place, may recover
  useEffect(() => {
    // Wait for initial backend fetch
    if (presenceLoading) return;
    
    // CRITICAL: Never redirect while entering a place (transition in progress)
    // This is the primary guard against premature redirects after place selection
    if (presenceState.isEnteringPlace) {
      console.log('[Home] 🚧 Entering place - blocking redirect');
      return;
    }
    
    // CRITICAL: Never redirect during revalidation (prevents race condition)
    if (presenceState.isRevalidating) {
      console.log('[Home] ⏳ Revalidating - blocking redirect');
      return;
    }
    
    // Only redirect if presence definitively ended (human-initiated)
    // 'ended' = user explicitly left, GPS exit, or time expired
    // 'suspended' = technical issue, may recover - keep user in place
    if (presenceState.logicalState === 'ended') {
      console.log('[Home] 🚪 Presence ended - redirecting to location');
      navigate('/location', { replace: true });
      return;
    }
    
    // Also redirect if there's genuinely no presence AND we're not in a transitional state
    // This handles the case of a fresh page load with no presence
    if (!currentPresence && !currentPlace && presenceState.logicalState !== 'suspended') {
      console.log('[Home] ℹ️ No presence found - redirecting to location');
      navigate('/location', { replace: true });
    }
  }, [presenceLoading, presenceState, currentPresence, currentPlace, navigate]);

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
                    <TemporaryPlaceIcon className="h-5 w-5 text-white" />
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
                onClick={async () => {
                  const { error } = await renewPresence();
                  if (!error) {
                    toast({ title: 'Presença renovada', description: 'Mais 60 minutos neste local' });
                  }
                }}
                className="flex-1 h-9 rounded-lg bg-white/20 hover:bg-white/30 text-white border-0"
              >
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Renovar
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="flex-1 h-9 rounded-lg bg-transparent border-white/30 text-white hover:bg-white/10"
                  >
                    <LogOut className="h-4 w-4 mr-1.5" />
                    Sair
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sair do local?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Ao sair, suas conversas e acenos deste local serão apagados permanentemente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Ficar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={deactivatePresence}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Sair do local
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
                onMute={handleMute}
                onBlock={handleBlock}
                openCardId={openCardId}
                onSwipeOpen={setOpenCardId}
              />
            ))}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
