import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Wave {
  id: string;
  de_user_id: string;
  para_user_id: string;
  location_id: string;
  criado_em: string;
  visualizado: boolean;
}

export function useWaves() {
  const { user } = useAuth();
  const [sentWaves, setSentWaves] = useState<Wave[]>([]);
  const [receivedWaves, setReceivedWaves] = useState<Wave[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchWaves = async () => {
    if (!user) {
      setSentWaves([]);
      setReceivedWaves([]);
      setLoading(false);
      return;
    }

    try {
      const [sentResult, receivedResult] = await Promise.all([
        supabase
          .from('waves')
          .select('*')
          .eq('de_user_id', user.id)
          .order('criado_em', { ascending: false }),
        supabase
          .from('waves')
          .select('*')
          .eq('para_user_id', user.id)
          .order('criado_em', { ascending: false })
      ]);

      if (!sentResult.error) setSentWaves(sentResult.data || []);
      if (!receivedResult.error) {
        setReceivedWaves(receivedResult.data || []);
        setUnreadCount(receivedResult.data?.filter(w => !w.visualizado).length || 0);
      }
    } catch (error) {
      console.error('Error fetching waves:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWaves();
  }, [user]);

  const sendWave = async (toUserId: string, locationId: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    // Check if wave already sent to this user at this location
    const existingWave = sentWaves.find(
      w => w.para_user_id === toUserId && w.location_id === locationId
    );

    if (existingWave) {
      return { error: new Error('Você já acenou para esta pessoa neste local') };
    }

    const { error } = await supabase
      .from('waves')
      .insert({
        de_user_id: user.id,
        para_user_id: toUserId,
        location_id: locationId
      });

    if (!error) {
      await fetchWaves();
    }

    return { error };
  };

  const markAsRead = async (waveId: string) => {
    const { error } = await supabase
      .from('waves')
      .update({ visualizado: true })
      .eq('id', waveId);

    if (!error) {
      await fetchWaves();
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

    await fetchWaves();
  };

  const hasWavedTo = (userId: string, locationId: string) => {
    return sentWaves.some(w => w.para_user_id === userId && w.location_id === locationId);
  };

  return {
    sentWaves,
    receivedWaves,
    unreadCount,
    loading,
    sendWave,
    markAsRead,
    markAllAsRead,
    hasWavedTo,
    refetch: fetchWaves,
  };
}
