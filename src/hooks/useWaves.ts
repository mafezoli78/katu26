import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PRESENCE_DURATION_MS } from '@/config/presence';
import { 
  deriveFacts, 
  canWave, 
  canAcceptWave,
  type InteractionData,
} from '@/lib/interactionRules';

/**
 * IMPORTANTE: Este hook mantém estado local de waves para a UI da página Waves.
 * 
 * Para validação de ações (sendWave, acceptWave), usamos a função canônica
 * de interactionRules.ts após buscar dados frescos do banco.
 * 
 * O useInteractionData é a fonte de verdade para o estado do botão no PersonCard.
 * Este hook NÃO deve ser usado para determinar se uma ação é permitida - 
 * a validação deve sempre ir ao banco via função canônica.
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
   * USA A FUNÇÃO CANÔNICA de interactionRules.ts para validação.
   */
  const sendWave = async (toUserId: string, placeId: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    if (!placeId) {
      return { error: new Error('place_id é obrigatório para enviar aceno') };
    }

    if (toUserId === user.id) {
      return { error: new Error('Você não pode acenar para si mesmo') };
    }

    // =========================================================================
    // VALIDAÇÃO CANÔNICA: Busca dados frescos e usa função única
    // =========================================================================
    try {
      const now = new Date();
      const nowISO = now.toISOString();

      // Buscar todos os dados necessários em paralelo
      const [blocksResult, mutesResult, conversationsResult, wavesResult] = await Promise.all([
        // Bloqueios envolvendo ambos os usuários
        supabase
          .from('user_blocks')
          .select('user_id, blocked_user_id')
          .or(`user_id.eq.${user.id},blocked_user_id.eq.${user.id}`),
        
        // Mutes ativos do usuário atual
        supabase
          .from('user_mutes')
          .select('user_id, muted_user_id, expira_em')
          .eq('user_id', user.id)
          .gt('expira_em', nowISO),
        
        // Conversas neste local
        supabase
          .from('conversations')
          .select('id, user1_id, user2_id, place_id, ativo, encerrado_por, reinteracao_permitida_em')
          .eq('place_id', placeId)
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`),
        
        // Waves pendentes entre os usuários neste local
        supabase
          .from('waves')
          .select('id, de_user_id, para_user_id, place_id, status, expires_at')
          .eq('place_id', placeId)
          .eq('status', 'pending')
          .or(`de_user_id.eq.${user.id},para_user_id.eq.${user.id}`),
      ]);

      // Verificar erros de banco
      if (blocksResult.error) throw blocksResult.error;
      if (mutesResult.error) throw mutesResult.error;
      if (conversationsResult.error) throw conversationsResult.error;
      if (wavesResult.error) throw wavesResult.error;

      // Preparar dados para função canônica
      const data: InteractionData = {
        blocks: (blocksResult.data || []).filter(
          b => b.blocked_user_id === toUserId || b.user_id === toUserId
        ),
        mutes: (mutesResult.data || []).filter(
          m => m.muted_user_id === toUserId
        ),
        conversations: (conversationsResult.data || []).filter(
          c => c.user1_id === toUserId || c.user2_id === toUserId
        ),
        waves: (wavesResult.data || []).filter(
          w => w.de_user_id === toUserId || w.para_user_id === toUserId
        ),
      };

      // Derivar fatos e verificar permissão
      const facts = deriveFacts(user.id, toUserId, placeId, now, data);
      const permission = canWave(facts);

      if (!permission.allowed) {
        return { error: new Error(permission.reason || 'Ação não permitida') };
      }

    } catch (error) {
      console.error('[useWaves] Error validating wave:', error);
      return { error: new Error('Erro ao verificar permissões') };
    }

    // =========================================================================
    // EXECUÇÃO: Criar wave no banco
    // =========================================================================
    const expiresAt = new Date(Date.now() + PRESENCE_DURATION_MS).toISOString();

    const { data, error } = await supabase
      .from('waves')
      .insert({
        de_user_id: user.id,
        para_user_id: toUserId,
        location_id: placeId,
        place_id: placeId,
        expires_at: expiresAt,
        status: 'pending'
      })
      .select()
      .single();

    if (!error && data) {
      setSentWaves(prev => [data as Wave, ...prev]);
    }

    return { error, data: data as Wave | null };
  };

  /**
   * Accept a wave and create a conversation.
   * USA A FUNÇÃO CANÔNICA de interactionRules.ts para validação.
   */
  const acceptWave = async (waveId: string): Promise<{ error: Error | null; conversation: Conversation | null }> => {
    if (!user) return { error: new Error('Not authenticated'), conversation: null };

    // =========================================================================
    // 1. BUSCAR WAVE NO BANCO
    // =========================================================================
    const { data: wave, error: waveError } = await supabase
      .from('waves')
      .select('id, de_user_id, para_user_id, place_id, location_id, status, expires_at')
      .eq('id', waveId)
      .maybeSingle();

    if (waveError) {
      console.error('[useWaves] Error fetching wave:', waveError);
      return { error: new Error('Erro ao buscar aceno'), conversation: null };
    }

    if (!wave) {
      return { error: new Error('Aceno não encontrado'), conversation: null };
    }

    // Validações básicas do wave
    if (wave.de_user_id === user.id) {
      return { error: new Error('Você não pode aceitar seu próprio aceno'), conversation: null };
    }

    if (wave.para_user_id !== user.id) {
      return { error: new Error('Este aceno não é para você'), conversation: null };
    }

    if (wave.expires_at && new Date(wave.expires_at) <= new Date()) {
      setReceivedWaves(prev => prev.filter(w => w.id !== waveId));
      return { error: new Error('Este aceno expirou'), conversation: null };
    }

    if (wave.status !== 'pending') {
      setReceivedWaves(prev => prev.filter(w => w.id !== waveId));
      return { error: new Error('Este aceno não está mais disponível'), conversation: null };
    }

    const placeId = wave.place_id || wave.location_id;
    if (!placeId) {
      return { error: new Error('Este aceno não possui um local válido'), conversation: null };
    }

    // =========================================================================
    // 2. VALIDAÇÃO CANÔNICA: Busca dados frescos e usa função única
    // =========================================================================
    try {
      const now = new Date();
      const nowISO = now.toISOString();
      const otherUserId = wave.de_user_id;

      const [blocksResult, mutesResult, conversationsResult, wavesResult] = await Promise.all([
        supabase
          .from('user_blocks')
          .select('user_id, blocked_user_id')
          .or(`user_id.eq.${user.id},blocked_user_id.eq.${user.id}`),
        
        supabase
          .from('user_mutes')
          .select('user_id, muted_user_id, expira_em')
          .eq('user_id', user.id)
          .gt('expira_em', nowISO),
        
        supabase
          .from('conversations')
          .select('id, user1_id, user2_id, place_id, ativo, encerrado_por, reinteracao_permitida_em')
          .eq('place_id', placeId)
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`),
        
        supabase
          .from('waves')
          .select('id, de_user_id, para_user_id, place_id, status, expires_at')
          .eq('place_id', placeId)
          .eq('status', 'pending')
          .or(`de_user_id.eq.${user.id},para_user_id.eq.${user.id}`),
      ]);

      if (blocksResult.error) throw blocksResult.error;
      if (mutesResult.error) throw mutesResult.error;
      if (conversationsResult.error) throw conversationsResult.error;
      if (wavesResult.error) throw wavesResult.error;

      const data: InteractionData = {
        blocks: (blocksResult.data || []).filter(
          b => b.blocked_user_id === otherUserId || b.user_id === otherUserId
        ),
        mutes: (mutesResult.data || []).filter(
          m => m.muted_user_id === otherUserId
        ),
        conversations: (conversationsResult.data || []).filter(
          c => c.user1_id === otherUserId || c.user2_id === otherUserId
        ),
        waves: (wavesResult.data || []).filter(
          w => w.de_user_id === otherUserId || w.para_user_id === otherUserId
        ),
      };

      const facts = deriveFacts(user.id, otherUserId, placeId, now, data);
      const permission = canAcceptWave(facts);

      if (!permission.allowed) {
        return { error: new Error(permission.reason || 'Ação não permitida'), conversation: null };
      }

      // =========================================================================
      // 3. EXECUÇÃO: Atualizar wave e criar conversa
      // =========================================================================
      
      // Verificar se place existe
      const { data: place, error: placeError } = await supabase
        .from('places')
        .select('id')
        .eq('id', placeId)
        .maybeSingle();

      if (placeError || !place) {
        console.error('[useWaves] Place not found:', placeId);
        return { error: new Error('Local não encontrado'), conversation: null };
      }

      // Atualizar status do wave
      const { error: updateError } = await supabase
        .from('waves')
        .update({
          status: 'accepted',
          accepted_by: user.id,
          visualizado: true
        })
        .eq('id', waveId)
        .eq('status', 'pending');

      if (updateError) {
        if (updateError.message.includes('0 rows')) {
          setReceivedWaves(prev => prev.filter(w => w.id !== waveId));
          return { error: new Error('Este aceno já foi aceito por outro usuário'), conversation: null };
        }
        throw updateError;
      }

      // Criar conversa
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
        if (conversationError.code === '23505') {
          const { data: existingConversation } = await supabase
            .from('conversations')
            .select('*')
            .eq('ativo', true)
            .or(`and(user1_id.eq.${wave.de_user_id},user2_id.eq.${user.id}),and(user1_id.eq.${user.id},user2_id.eq.${wave.de_user_id})`)
            .eq('place_id', placeId)
            .maybeSingle();

          if (existingConversation) {
            setReceivedWaves(prev => prev.filter(w => w.id !== waveId));
            return { error: null, conversation: existingConversation as Conversation };
          }
        }

        // Rollback wave status
        await supabase
          .from('waves')
          .update({ status: 'pending', accepted_by: null })
          .eq('id', waveId);

        throw conversationError;
      }

      // Atualizar estado local
      setReceivedWaves(prev => prev.filter(w => w.id !== waveId));
      setUnreadCount(prev => Math.max(0, prev - 1));

      return { error: null, conversation: conversationData as Conversation };
    } catch (error) {
      console.error('Error accepting wave:', error);
      return { error: error as Error, conversation: null };
    }
  };

  const ignoreWave = async (waveId: string) => {
    // Optimistically remove from local state
    setReceivedWaves(prev => prev.filter(w => w.id !== waveId));
    setUnreadCount(prev => Math.max(0, prev - 1));

    // Persist: set status to 'expired' so both users return to NONE
    // This ensures deriveFacts no longer sees a pending wave
    const { error } = await supabase
      .from('waves')
      .update({ status: 'expired', visualizado: true })
      .eq('id', waveId);

    if (error) {
      console.error('[useWaves] Error ignoring wave:', error);
    }
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
