import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

/**
 * Hook para buscar todos os dados necessários para alimentar useInteractionState.
 * 
 * Retorna dados normalizados (usando apenas place_id, sem location_id) para:
 * - Acenos enviados/recebidos pendentes
 * - Conversas (ativas e em cooldown)
 * - Silenciamentos ativos
 * - Bloqueios
 * 
 * GARANTIAS DE ESTABILIDADE:
 * 1. Dados NUNCA são limpos durante refetch - mantém estado anterior até novo chegar
 * 2. Race conditions são tratadas via fetchIdRef
 * 3. Subscriptions realtime garantem atualizações imediatas
 * 4. O estado do botão permanece consistente durante todo o ciclo de vida
 */

export interface NormalizedWave {
  id: string;
  de_user_id: string;
  para_user_id: string;
  place_id: string;
  status: string;
  expires_at: string | null;
  ignore_cooldown_until?: string | null;
}

export interface NormalizedConversation {
  id: string;
  user1_id: string;
  user2_id: string;
  place_id: string;
  ativo: boolean;
  encerrado_por: string | null;
  reinteracao_permitida_em: string | null;
}

export interface NormalizedMute {
  id: string;
  user_id: string;
  muted_user_id: string;
  expira_em: string;
}

export interface NormalizedBlock {
  id: string;
  user_id: string;
  blocked_user_id: string;
}

interface UseInteractionDataResult {
  sentWaves: NormalizedWave[];
  receivedWaves: NormalizedWave[];
  conversations: NormalizedConversation[];
  activeMutes: NormalizedMute[];
  blocks: NormalizedBlock[];
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Busca todos os dados de interação para um local específico.
 * Mantém subscription realtime para conversations evitando flickering.
 * 
 * IMPORTANTE: Este hook NUNCA limpa os dados durante refetch.
 * Dados anteriores são mantidos até que novos dados cheguem.
 * Isso garante que o botão do card nunca volte para "Acenar" durante um chat ativo.
 * 
 * @param placeId - ID do local atual (obrigatório para normalização)
 */
export function useInteractionData(placeId: string | null): UseInteractionDataResult {
  const { user } = useAuth();
  const [sentWaves, setSentWaves] = useState<NormalizedWave[]>([]);
  const [receivedWaves, setReceivedWaves] = useState<NormalizedWave[]>([]);
  const [conversations, setConversations] = useState<NormalizedConversation[]>([]);
  const [activeMutes, setActiveMutes] = useState<NormalizedMute[]>([]);
  const [blocks, setBlocks] = useState<NormalizedBlock[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Refs para evitar race conditions e re-criação de callbacks
  const fetchIdRef = useRef(0);
  const userIdRef = useRef<string | undefined>(undefined);
  const placeIdRef = useRef<string | null>(null);
  
  // Atualizar refs quando valores mudam
  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);
  
  useEffect(() => {
    placeIdRef.current = placeId;
  }, [placeId]);

  // Função de fetch estável (não recria em cada render)
  const fetchData = useCallback(async () => {
    const currentUserId = userIdRef.current;
    const currentPlaceId = placeIdRef.current;
    
    if (!currentUserId || !currentPlaceId) {
      // IMPORTANTE: Só limpar dados se realmente não há user/place
      // Isso acontece apenas na saída do local, não durante refetch
      setSentWaves([]);
      setReceivedWaves([]);
      setConversations([]);
      setActiveMutes([]);
      setBlocks([]);
      setLoading(false);
      return;
    }

    // Incrementar ID para detectar chamadas obsoletas
    const currentFetchId = ++fetchIdRef.current;

    try {
      const now = new Date().toISOString();

      // Buscar tudo em paralelo
      const [
        sentResult,
        receivedResult,
        conversationsResult,
        mutesResult,
        blocksResult
      ] = await Promise.all([
        // 1. Acenos enviados (pendentes + expirados com cooldown ativo)
        supabase
          .from('waves')
          .select('id, de_user_id, para_user_id, place_id, location_id, status, expires_at, ignore_cooldown_until')
          .eq('de_user_id', currentUserId)
          .in('status', ['pending', 'expired']),
        
        // 2. Acenos recebidos (pendentes, não expirados)
        supabase
          .from('waves')
          .select('id, de_user_id, para_user_id, place_id, location_id, status, expires_at, ignore_cooldown_until')
          .eq('para_user_id', currentUserId)
          .in('status', ['pending', 'expired']),
        
        // 3. Conversas (ativas OU em cooldown neste local)
        supabase
          .from('conversations')
          .select('id, user1_id, user2_id, place_id, ativo, encerrado_por, reinteracao_permitida_em')
          .eq('place_id', currentPlaceId)
          .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`),
        
        // 4. Silenciamentos ativos (não expirados)
        supabase
          .from('user_mutes')
          .select('id, user_id, muted_user_id, expira_em')
          .eq('user_id', currentUserId)
          .gt('expira_em', now),
        
        // 5. Bloqueios (como autor ou alvo)
        supabase
          .from('user_blocks')
          .select('id, user_id, blocked_user_id')
          .or(`user_id.eq.${currentUserId},blocked_user_id.eq.${currentUserId}`)
      ]);

      // Se esta chamada ficou obsoleta (outra mais recente foi feita), ignorar
      if (currentFetchId !== fetchIdRef.current) {
        return;
      }

      // Normalizar waves (usar place_id, fallback para location_id)
      const normalizeWave = (wave: any): NormalizedWave => ({
        id: wave.id,
        de_user_id: wave.de_user_id,
        para_user_id: wave.para_user_id,
        place_id: wave.place_id || wave.location_id || '',
        status: wave.status,
        expires_at: wave.expires_at,
        ignore_cooldown_until: wave.ignore_cooldown_until ?? null,
      });

      // IMPORTANTE: Só atualizar se temos dados válidos (sem erro)
      // Isso garante que dados anteriores são mantidos em caso de erro de rede
      if (!sentResult.error && sentResult.data) {
        setSentWaves(sentResult.data.map(normalizeWave).filter(w => w.place_id));
      }

      if (!receivedResult.error && receivedResult.data) {
        setReceivedWaves(receivedResult.data.map(normalizeWave).filter(w => w.place_id));
      }

      if (!conversationsResult.error && conversationsResult.data) {
        setConversations(conversationsResult.data as NormalizedConversation[]);
      }

      if (!mutesResult.error && mutesResult.data) {
        setActiveMutes(mutesResult.data as NormalizedMute[]);
      }

      if (!blocksResult.error && blocksResult.data) {
        setBlocks(blocksResult.data as NormalizedBlock[]);
      }

    } catch (error) {
      console.error('[useInteractionData] Error fetching data:', error);
      // Em caso de erro, NÃO limpar dados existentes
      // Mantém o último estado válido
    } finally {
      // Só marcar loading=false se esta é a chamada mais recente
      if (currentFetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, []); // Dependências vazias - usa refs para valores atuais

  // Fetch inicial e quando placeId/user mudam
  useEffect(() => {
    if (user?.id && placeId) {
      fetchData();
    } else if (!user?.id || !placeId) {
      // Limpar dados apenas quando realmente não há contexto
      setSentWaves([]);
      setReceivedWaves([]);
      setConversations([]);
      setActiveMutes([]);
      setBlocks([]);
      setLoading(false);
    }
  }, [user?.id, placeId, fetchData]);

  // Realtime subscription para conversations
  // Garante que mudanças (chat iniciado, chat encerrado) reflitam imediatamente
  useEffect(() => {
    if (!user?.id || !placeId) return;

    const channel = supabase
      .channel(`interaction-conversations-${placeId}-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `place_id=eq.${placeId}`,
        },
        (payload) => {
          const record = payload.new as any;
          const oldRecord = payload.old as any;
          
          // Verificar se a mudança envolve o usuário atual
          const involvesUser = 
            record?.user1_id === user.id || 
            record?.user2_id === user.id ||
            oldRecord?.user1_id === user.id ||
            oldRecord?.user2_id === user.id;
          
          if (involvesUser) {
            // Refetch para garantir consistência
            fetchData();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, placeId, fetchData]);

  // Realtime subscription para waves
  // Garante que acenos enviados/recebidos reflitam imediatamente
  useEffect(() => {
    if (!user?.id || !placeId) return;

    const channel = supabase
      .channel(`interaction-waves-${placeId}-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'waves',
        },
        (payload) => {
          const record = payload.new as any;
          const oldRecord = payload.old as any;
          
          const involvesUser = 
            record?.de_user_id === user.id || 
            record?.para_user_id === user.id ||
            oldRecord?.de_user_id === user.id ||
            oldRecord?.para_user_id === user.id;
          
          const isCurrentPlace = 
            record?.place_id === placeId ||
            oldRecord?.place_id === placeId;
          
          if (involvesUser && isCurrentPlace) {
            if (payload.eventType === 'INSERT' && record?.para_user_id === user.id && record?.status === 'pending') {
              toast({ title: 'Você recebeu um aceno! 👋' });
            }
            // Toast para remetente quando aceno é ignorado com cooldown
            if (
              payload.eventType === 'UPDATE' &&
              record?.status === 'expired' &&
              record?.de_user_id === user.id &&
              record?.ignore_cooldown_until &&
              new Date(record.ignore_cooldown_until) > new Date() &&
              oldRecord?.status === 'pending' // só na transição real
            ) {
              toast({
                title: 'A pessoa está indisponível no momento',
                description: 'Tente novamente mais tarde.',
              });
            }
            fetchData();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, placeId, fetchData]);

  // Realtime subscription para user_mutes
  // RLS já filtra por user_id = auth.uid(), então qualquer evento recebido é relevante
  // Não verificar involvesUser pois DELETE events podem não ter payload.old completo
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`interaction-mutes-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_mutes',
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchData]);

  // Realtime subscription para user_blocks
  // RLS já filtra por user_id/blocked_user_id = auth.uid(), qualquer evento é relevante
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`interaction-blocks-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_blocks',
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchData]);

  return {
    sentWaves,
    receivedWaves,
    conversations,
    activeMutes,
    blocks,
    loading,
    refetch: fetchData,
  };
}
