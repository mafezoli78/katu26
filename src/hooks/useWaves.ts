import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PRESENCE_DURATION_MS } from '@/config/presence';

export interface Wave {
  id: string;
  de_user_id: string;
  para_user_id: string;
  location_id: string;
  criado_em: string;
  visualizado: boolean;
  status: 'pending' | 'accepted';
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

  // Filter valid waves (pending and not expired)
  const filterValidWaves = useCallback((waves: Wave[]) => {
    const now = new Date();
    return waves.filter(wave => {
      if (wave.status !== 'pending') return false;
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

  const sendWave = async (toUserId: string, locationId: string, placeId?: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    // Prevent sending wave to self
    if (toUserId === user.id) {
      return { error: new Error('Você não pode acenar para si mesmo') };
    }

    // Check if wave already sent to this user at this location
    const existingWave = sentWaves.find(
      w => w.para_user_id === toUserId && w.location_id === locationId
    );

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
        location_id: locationId,
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

    try {
      // Step 1: Update wave status (optimistic)
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

      // Step 2: Create conversation
      // user1_id = wave creator, user2_id = acceptor
      const { data: conversationData, error: conversationError } = await supabase
        .from('conversations')
        .insert({
          user1_id: wave.de_user_id,
          user2_id: user.id,
          place_id: wave.location_id, // Using location_id which maps to place
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
            .eq('place_id', wave.location_id)
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

      // Step 3: Update local state
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

  const hasWavedTo = (userId: string, locationId: string) => {
    return sentWaves.some(w => w.para_user_id === userId && w.location_id === locationId);
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
