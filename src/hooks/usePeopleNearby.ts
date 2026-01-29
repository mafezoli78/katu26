import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Profile, UserInterest } from './useProfile';
import { Intention } from './usePresence';

export interface PersonNearby {
  id: string;
  profile: Profile;
  interests: UserInterest[];
  intention: Intention;
  commonInterests: string[];
}

/**
 * Fetch people with active presence at the same place.
 * Uses place_id as the source of truth.
 */
export function usePeopleNearby(placeId: string | null) {
  const { user } = useAuth();
  const [people, setPeople] = useState<PersonNearby[]>([]);
  const [loading, setLoading] = useState(true);
  const [conversationUserIds, setConversationUserIds] = useState<Set<string>>(new Set());

  const fetchPeopleNearby = async () => {
    if (!user || !placeId) {
      setPeople([]);
      setConversationUserIds(new Set());
      setLoading(false);
      return;
    }

    try {
      // R1: Get active conversations at this place to exclude matched users
      const { data: activeConversations } = await supabase
        .from('conversations')
        .select('user1_id, user2_id')
        .eq('ativo', true)
        .eq('place_id', placeId)
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

      // R2: Get conversations in cooldown period (reinteracao_permitida_em > now)
      // These users should also be hidden from the list
      const { data: cooldownConversations } = await supabase
        .from('conversations')
        .select('user1_id, user2_id, reinteracao_permitida_em')
        .eq('ativo', false)
        .eq('place_id', placeId)
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .gt('reinteracao_permitida_em', new Date().toISOString());

      // Build set of user IDs that have active conversations OR are in cooldown
      const matchedUserIds = new Set<string>();
      
      // Add users with active conversations
      if (activeConversations) {
        activeConversations.forEach(conv => {
          if (conv.user1_id === user.id) {
            matchedUserIds.add(conv.user2_id);
          } else {
            matchedUserIds.add(conv.user1_id);
          }
        });
      }
      
      // Add users in cooldown period
      if (cooldownConversations) {
        cooldownConversations.forEach(conv => {
          if (conv.user1_id === user.id) {
            matchedUserIds.add(conv.user2_id);
          } else {
            matchedUserIds.add(conv.user1_id);
          }
        });
      }
      
      setConversationUserIds(matchedUserIds);

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

      // Fetch profiles, interests, and intentions for each person
      const peopleData: PersonNearby[] = [];

      for (const presence of presences) {
        // R1: Skip users who have active conversations with current user
        if (matchedUserIds.has(presence.user_id)) {
          console.log(`[usePeopleNearby] Skipping user ${presence.user_id} - has active conversation`);
          continue;
        }

        // Check if presence is still valid (within 1 hour)
        const lastActivity = new Date(presence.ultima_atividade).getTime();
        const now = Date.now();
        if (now - lastActivity > 60 * 60 * 1000) continue; // Skip expired presences

        const [profileResult, interestsResult, intentionResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('*')
            .eq('id', presence.user_id)
            .single(),
          supabase
            .from('user_interests')
            .select('*')
            .eq('user_id', presence.user_id),
          supabase
            .from('intentions')
            .select('*')
            .eq('id', presence.intention_id)
            .single()
        ]);

        if (profileResult.data && intentionResult.data) {
          const theirTags = interestsResult.data?.map(i => i.tag) || [];
          const commonInterests = myTags.filter(tag => theirTags.includes(tag));

          peopleData.push({
            id: presence.user_id,
            profile: profileResult.data,
            interests: interestsResult.data || [],
            intention: intentionResult.data,
            commonInterests
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

  /**
   * R1: Check if user has an active conversation with another user at this place.
   * Used to hide wave button for matched users.
   */
  const hasActiveConversationWith = (userId: string): boolean => {
    return conversationUserIds.has(userId);
  };

  return {
    people,
    loading,
    refetch: fetchPeopleNearby,
    hasActiveConversationWith,
  };
}
