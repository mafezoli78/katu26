import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Profile, UserInterest } from './useProfile';

export interface PersonNearby {
  id: string;
  profile: Profile;
  interests: UserInterest[];
  commonInterests: string[];
  assuntoAtual: string | null;
}

/**
 * Fetch people with active presence at the same place.
 * Uses place_id as the source of truth.
 */
/**
 * Fetch people with active presence at the same place.
 * Uses place_id as the source of truth.
 * 
 * IMPORTANT: This hook returns ALL users present at the location.
 * It does NOT filter by interaction state (conversations, cooldowns, etc.)
 * Visibility filtering is handled EXCLUSIVELY by PersonCard via useInteractionState.
 */
export function usePeopleNearby(placeId: string | null) {
  const { user } = useAuth();
  const [people, setPeople] = useState<PersonNearby[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPeopleNearby = async () => {
    if (!user || !placeId) {
      setPeople([]);
      setLoading(false);
      return;
    }

    try {
      // Get active presences at this place (excluding current user)
      // Query by place_id first, fall back to location_id for backwards compatibility
      const { data: presences, error: presenceError } = await supabase
        .from('presence')
        .select('*')
        .eq('ativo', true)
        .neq('user_id', user.id)
        .or(`place_id.eq.${placeId},location_id.eq.${placeId}`);

      if (presenceError) throw presenceError;
      if (!presences || presences.length === 0) {
        setPeople([]);
        setLoading(false);
        return;
      }

      // Get current user's interests for comparison
      const { data: myInterests } = await supabase
        .from('user_interests')
        .select('tag')
        .eq('user_id', user.id);

      const myTags = myInterests?.map(i => i.tag) || [];

      // Fetch profiles and interests for each person
      // NO FILTERING by conversation state - visibility is handled by PersonCard
      const peopleData: PersonNearby[] = [];

      for (const presence of presences) {
        // Check if presence is still valid (within 1 hour)
        const lastActivity = new Date(presence.ultima_atividade).getTime();
        const now = Date.now();
        if (now - lastActivity > 60 * 60 * 1000) continue; // Skip expired presences

        // I1/I2 FIX: Check if this user has muted the current user
        // Uses SECURITY DEFINER function that bypasses RLS
        const { data: isMutedResult } = await supabase
          .rpc('is_user_muted', {
            p_user_id: presence.user_id,
            p_other_user_id: user.id,
          });

        // If the other user muted me, skip them (I shouldn't see them)
        if (isMutedResult === true) continue;

        const [profileResult, interestsResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('*')
            .eq('id', presence.user_id)
            .single(),
          supabase
            .from('user_interests')
            .select('*')
            .eq('user_id', presence.user_id)
        ]);

        if (profileResult.data) {
          const theirTags = interestsResult.data?.map(i => i.tag) || [];
          const commonInterests = myTags.filter(tag => theirTags.includes(tag));

          peopleData.push({
            id: presence.user_id,
            profile: profileResult.data,
            interests: interestsResult.data || [],
            commonInterests,
            assuntoAtual: presence.assunto_atual || null
          });
        }
      }

      // Sort by number of common interests (descending)
      peopleData.sort((a, b) => b.commonInterests.length - a.commonInterests.length);

      setPeople(peopleData);
    } catch (error) {
      console.error('Error fetching people nearby:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPeopleNearby();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchPeopleNearby, 30000);
    return () => clearInterval(interval);
  }, [user, placeId]);

  // Realtime subscription for user_mutes
  // When A mutes/unmutes B, B receives the event (bilateral RLS) and refetches
  useEffect(() => {
    if (!user?.id || !placeId) return;

    const channel = supabase
      .channel(`people-mutes-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_mutes',
      }, () => {
        fetchPeopleNearby();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, placeId]);

  return {
    people,
    loading,
    refetch: fetchPeopleNearby,
  };
}
