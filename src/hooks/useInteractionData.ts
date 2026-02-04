import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook para buscar todos os dados necessários para alimentar useInteractionState.
 * 
 * Retorna dados normalizados (usando apenas place_id, sem location_id) para:
 * - Acenos enviados/recebidos pendentes
 * - Conversas (ativas e em cooldown)
 * - Silenciamentos ativos
 * - Bloqueios
 * 
 * IMPORTANTE: Este hook mantém subscriptions realtime para conversations
 * garantindo que o estado do card/botão reflita imediatamente mudanças
 * (ex: chat iniciado, chat encerrado) sem flickering.
 */

export interface NormalizedWave {
  id: string;
  de_user_id: string;
  para_user_id: string;
  place_id: string;
  status: string;
  expires_at: string | null;
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
  
  // Ref para evitar race conditions durante refetch
  const fetchIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    if (!user || !placeId) {
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
        // 1. Acenos enviados (pendentes, não expirados)
        supabase
          .from('waves')
          .select('id, de_user_id, para_user_id, place_id, location_id, status, expires_at')
          .eq('de_user_id', user.id)
          .eq('status', 'pending')
          .or(`expires_at.is.null,expires_at.gt.${now}`),
        
        // 2. Acenos recebidos (pendentes, não expirados)
        supabase
          .from('waves')
          .select('id, de_user_id, para_user_id, place_id, location_id, status, expires_at')
          .eq('para_user_id', user.id)
          .eq('status', 'pending')
          .or(`expires_at.is.null,expires_at.gt.${now}`),
        
        // 3. Conversas (ativas OU em cooldown neste local)
        supabase
          .from('conversations')
          .select('id, user1_id, user2_id, place_id, ativo, encerrado_por, reinteracao_permitida_em')
          .eq('place_id', placeId)
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`),
        
        // 4. Silenciamentos ativos (não expirados)
        supabase
          .from('user_mutes')
          .select('id, user_id, muted_user_id, expira_em')
          .eq('user_id', user.id)
          .gt('expira_em', now),
        
        // 5. Bloqueios (como autor ou alvo)
        supabase
          .from('user_blocks')
          .select('id, user_id, blocked_user_id')
          .or(`user_id.eq.${user.id},blocked_user_id.eq.${user.id}`)
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
      });

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
    } finally {
      // Só marcar loading=false se esta é a chamada mais recente
      if (currentFetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [user, placeId]);

  // Fetch inicial
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription para conversations
  // Garante que mudanças (chat iniciado, chat encerrado) reflitam imediatamente
  useEffect(() => {
    if (!user || !placeId) return;

    const channel = supabase
      .channel(`interaction-conversations-${placeId}`)
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
  }, [user, placeId, fetchData]);

  // Realtime subscription para waves
  // Garante que acenos enviados/recebidos reflitam imediatamente
  useEffect(() => {
    if (!user || !placeId) return;

    const channel = supabase
      .channel(`interaction-waves-${placeId}`)
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
          
          // Verificar se a mudança envolve o usuário atual
          const involvesUser = 
            record?.de_user_id === user.id || 
            record?.para_user_id === user.id ||
            oldRecord?.de_user_id === user.id ||
            oldRecord?.para_user_id === user.id;
          
          // Verificar se é no local atual
          const isCurrentPlace = 
            record?.place_id === placeId ||
            oldRecord?.place_id === placeId;
          
          if (involvesUser && isCurrentPlace) {
            fetchData();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, placeId, fetchData]);

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
