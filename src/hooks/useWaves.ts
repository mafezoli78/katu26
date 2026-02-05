import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PRESENCE_DURATION_MS } from '@/config/presence';

/**
 * IMPORTANTE: Este hook mantém estado local de waves para a UI da página Waves.
 * 
 * Para validação de ações (sendWave, acceptWave), SEMPRE consultamos o banco
 * diretamente para evitar decisões baseadas em estado stale.
 * 
 * O useInteractionData é a fonte de verdade para o estado do botão no PersonCard.
 * Este hook NÃO deve ser usado para determinar se uma ação é permitida - 
 * a validação deve sempre ir ao banco.
 */

export interface Wave {
  id: string;
  de_user_id: string;
  para_user_id: string;
  location_id: string;
  place_id: string | null;
  criado_em: string;
  visualizado: boolean;
  status: 'pending' | 'accepted' | 'expired';
  expires_at: string | null;
  accepted_by: string | null;
}

export interface Conversation {
  id: string;
  user1_id: string;
  user2_id: string;
  place_id: string;
  origem_wave_id: string | null;
  criado_em: string;
  ativo: boolean;
  encerrado_por: string | null;
  encerrado_em: string | null;
  encerrado_motivo: 'manual' | 'presence_end' | null;
}

export function useWaves() {
  const { user } = useAuth();
  const [sentWaves, setSentWaves] = useState<Wave[]>([]);
  const [receivedWaves, setReceivedWaves] = useState<Wave[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // Filter valid waves (pending and not expired by time or status)
  const filterValidWaves = useCallback((waves: Wave[]) => {
    const now = new Date();
    return waves.filter(wave => {
      // Exclude waves with expired status (set when user changes location)
      if (wave.status === 'expired') return false;
      // Only include pending waves
      if (wave.status !== 'pending') return false;
      // Check time-based expiration
      if (wave.expires_at && new Date(wave.expires_at) <= now) return false;
      return true;
    });
  }, []);

  const fetchWaves = useCallback(async () => {
    if (!user) {
      setSentWaves([]);
      setReceivedWaves([]);
      setLoading(false);
      return;
    }

    try {
      const now = new Date().toISOString();
      
      const [sentResult, receivedResult] = await Promise.all([
        supabase
          .from('waves')
          .select('*')
          .eq('de_user_id', user.id)
          .eq('status', 'pending')
          .or(`expires_at.is.null,expires_at.gt.${now}`)
          .order('criado_em', { ascending: false }),
        supabase
          .from('waves')
          .select('*')
          .eq('para_user_id', user.id)
          .eq('status', 'pending')
          .or(`expires_at.is.null,expires_at.gt.${now}`)
          .order('criado_em', { ascending: false })
      ]);

      if (!sentResult.error) {
        setSentWaves(filterValidWaves(sentResult.data as Wave[] || []));
      }
      if (!receivedResult.error) {
        const validReceived = filterValidWaves(receivedResult.data as Wave[] || []);
        setReceivedWaves(validReceived);
        setUnreadCount(validReceived.filter(w => !w.visualizado).length);
      }
    } catch (error) {
      console.error('Error fetching waves:', error);
    } finally {
      setLoading(false);
    }
  }, [user, filterValidWaves]);

  useEffect(() => {
    fetchWaves();
  }, [fetchWaves]);

  /**
   * Send a wave to another user at a specific place.
   * REQUIRES: placeId (the user's current place)
   * R1: Prevents waving to users with active conversations
   */
  const sendWave = async (toUserId: string, placeId: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    // CRITICAL: place_id is mandatory
    if (!placeId) {
      return { error: new Error('place_id é obrigatório para enviar aceno') };
    }

    // Prevent sending wave to self
    if (toUserId === user.id) {
      return { error: new Error('Você não pode acenar para si mesmo') };
    }

    // =========================================================================
    // VALIDAÇÃO ÚNICA: Consulta o banco diretamente (nunca estado local)
    // Isso garante que decisões de UI e backend estejam sempre alinhadas.
    // =========================================================================
    
    // 1. Verificar conversas neste local entre os dois usuários
    // Usando duas queries separadas para evitar problemas com OR/AND complexos
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id, user1_id, user2_id, ativo, reinteracao_permitida_em')
      .eq('place_id', placeId)
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

    // Erro real de banco (não ausência de dados)
    if (convError) {
      console.error('[useWaves] Error checking conversation:', convError);
      return { error: new Error('Erro ao verificar estado da conversa') };
    }

    // Filtrar apenas conversas com o usuário alvo
    const relevantConversation = (conversations || []).find(conv => {
      // Verifica se a conversa envolve ambos os usuários
      const isUser1 = conv.user1_id === user.id || conv.user1_id === toUserId;
      const isUser2 = conv.user2_id === user.id || conv.user2_id === toUserId;
      return isUser1 && isUser2;
    }) as { id: string; ativo: boolean; reinteracao_permitida_em: string | null } | undefined;

    if (relevantConversation) {
      // Conversa ativa
      if (relevantConversation.ativo) {
        return { error: new Error('Você já tem uma conversa ativa com esta pessoa') };
      }
      
      // Conversa em cooldown
      const cooldownEnd = relevantConversation.reinteracao_permitida_em
        ? new Date(relevantConversation.reinteracao_permitida_em)
        : null;
      
      if (cooldownEnd && cooldownEnd > new Date()) {
        return { error: new Error('Não é possível acenar - interação recente neste local') };
      }
    }

    // 2. Verificar aceno pendente (consulta o banco, não estado local)
    const now = new Date().toISOString();
    const { data: existingWaves, error: waveError } = await supabase
      .from('waves')
      .select('id, place_id, location_id, expires_at')
      .eq('de_user_id', user.id)
      .eq('para_user_id', toUserId)
      .eq('status', 'pending');

    // Erro real de banco (não ausência de dados)
    if (waveError) {
      console.error('[useWaves] Error checking existing wave:', waveError);
      return { error: new Error('Erro ao verificar acenos existentes') };
    }

    // Filtrar waves válidos no cliente (evita OR complexo no Supabase)
    const existingWave = (existingWaves || []).find(wave => {
      const isCurrentPlace = wave.place_id === placeId || wave.location_id === placeId;
      const isNotExpired = !wave.expires_at || new Date(wave.expires_at) > new Date();
      return isCurrentPlace && isNotExpired;
    });

    if (existingWave) {
      return { error: new Error('Você já acenou para esta pessoa neste local') };
    }

    // Calculate expiration based on presence duration
    const expiresAt = new Date(Date.now() + PRESENCE_DURATION_MS).toISOString();

    const { data, error } = await supabase
      .from('waves')
      .insert({
        de_user_id: user.id,
        para_user_id: toUserId,
        location_id: placeId, // Keep for backwards compatibility
        place_id: placeId,    // New source of truth
        expires_at: expiresAt,
        status: 'pending'
      })
      .select()
      .single();

    if (!error && data) {
      // Update local state immediately
      setSentWaves(prev => [data as Wave, ...prev]);
    }

    return { error, data: data as Wave | null };
  };

  /**
   * Accept a wave and create a conversation.
   * Validates that both users are at the same place.
   */
  const acceptWave = async (waveId: string): Promise<{ error: Error | null; conversation: Conversation | null }> => {
    if (!user) return { error: new Error('Not authenticated'), conversation: null };

    // Find the wave in received waves
    const wave = receivedWaves.find(w => w.id === waveId);
    if (!wave) {
      return { error: new Error('Aceno não encontrado'), conversation: null };
    }

    // Prevent accepting own wave
    if (wave.de_user_id === user.id) {
      return { error: new Error('Você não pode aceitar seu próprio aceno'), conversation: null };
    }

    // Check if wave is still valid
    if (wave.expires_at && new Date(wave.expires_at) <= new Date()) {
      // Remove expired wave from local state
      setReceivedWaves(prev => prev.filter(w => w.id !== waveId));
      return { error: new Error('Este aceno expirou'), conversation: null };
    }

    // Check if already accepted
    if (wave.status === 'accepted') {
      return { error: new Error('Este aceno já foi aceito'), conversation: null };
    }

    // Get place_id - prefer the new field, fall back to location_id
    const placeId = wave.place_id || wave.location_id;

    if (!placeId) {
      return { error: new Error('Este aceno não possui um local válido'), conversation: null };
    }

    try {
      // Step 1: Verify place exists
      const { data: place, error: placeError } = await supabase
        .from('places')
        .select('id')
        .eq('id', placeId)
        .maybeSingle();

      if (placeError || !place) {
        console.error('[useWaves] Place not found:', placeId);
        return { error: new Error('Local não encontrado'), conversation: null };
      }

      // Step 2: Update wave status
      const { error: updateError } = await supabase
        .from('waves')
        .update({
          status: 'accepted',
          accepted_by: user.id,
          visualizado: true
        })
        .eq('id', waveId)
        .eq('status', 'pending'); // Ensure it's still pending (race condition protection)

      if (updateError) {
        // Check if it was already accepted by someone else
        if (updateError.message.includes('0 rows')) {
          setReceivedWaves(prev => prev.filter(w => w.id !== waveId));
          return { error: new Error('Este aceno já foi aceito por outro usuário'), conversation: null };
        }
        throw updateError;
      }

      // Step 3: Create conversation with validated place_id
      const { data: conversationData, error: conversationError } = await supabase
        .from('conversations')
        .insert({
          user1_id: wave.de_user_id,
          user2_id: user.id,
          place_id: placeId,
          origem_wave_id: waveId
        })
        .select()
        .single();

      if (conversationError) {
        // Check if it's a duplicate (unique constraint violation)
        if (conversationError.code === '23505') {
          // Conversation already exists, fetch it
          const { data: existingConversation } = await supabase
            .from('conversations')
            .select('*')
            .eq('ativo', true)
            .or(`and(user1_id.eq.${wave.de_user_id},user2_id.eq.${user.id}),and(user1_id.eq.${user.id},user2_id.eq.${wave.de_user_id})`)
            .eq('place_id', placeId)
            .maybeSingle();

          if (existingConversation) {
            // Remove wave from local state
            setReceivedWaves(prev => prev.filter(w => w.id !== waveId));
            return { error: null, conversation: existingConversation as Conversation };
          }
        }

        // Rollback wave status if conversation creation failed
        await supabase
          .from('waves')
          .update({
            status: 'pending',
            accepted_by: null
          })
          .eq('id', waveId);

        throw conversationError;
      }

      // Step 4: Update local state
      setReceivedWaves(prev => prev.filter(w => w.id !== waveId));
      setUnreadCount(prev => Math.max(0, prev - 1));

      return { error: null, conversation: conversationData as Conversation };
    } catch (error) {
      console.error('Error accepting wave:', error);
      return { error: error as Error, conversation: null };
    }
  };

  const ignoreWave = async (waveId: string) => {
    // Simply remove from local state - no database action needed
    // The wave will naturally expire or be cleaned up when presence ends
    setReceivedWaves(prev => prev.filter(w => w.id !== waveId));
    
    // Mark as visualized so it doesn't count as unread
    await supabase
      .from('waves')
      .update({ visualizado: true })
      .eq('id', waveId);

    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAsRead = async (waveId: string) => {
    const { error } = await supabase
      .from('waves')
      .update({ visualizado: true })
      .eq('id', waveId);

    if (!error) {
      setReceivedWaves(prev => 
        prev.map(w => w.id === waveId ? { ...w, visualizado: true } : w)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }

    return { error };
  };

  const markAllAsRead = async () => {
    if (!user) return;

    await supabase
      .from('waves')
      .update({ visualizado: true })
      .eq('para_user_id', user.id)
      .eq('visualizado', false);

    setReceivedWaves(prev => prev.map(w => ({ ...w, visualizado: true })));
    setUnreadCount(0);
  };

  /**
   * Check if user has already waved to another user at a specific place.
   */
  const hasWavedTo = (userId: string, placeId: string) => {
    return sentWaves.some(w => 
      w.para_user_id === userId && 
      (w.place_id === placeId || w.location_id === placeId)
    );
  };

  // Delete all waves for current user (called when presence ends)
  const deleteUserWaves = async () => {
    if (!user) return;

    await supabase
      .from('waves')
      .delete()
      .or(`de_user_id.eq.${user.id},para_user_id.eq.${user.id}`)
      .eq('status', 'pending');

    setSentWaves([]);
    setReceivedWaves([]);
    setUnreadCount(0);
  };

  return {
    sentWaves,
    receivedWaves,
    unreadCount,
    loading,
    sendWave,
    acceptWave,
    ignoreWave,
    markAsRead,
    markAllAsRead,
    hasWavedTo,
    deleteUserWaves,
    refetch: fetchWaves,
  };
}
