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

export function usePeopleNearby(locationId: string | null) {
  const { user } = useAuth();
  const [people, setPeople] = useState<PersonNearby[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPeopleNearby = async () => {
    if (!user || !locationId) {
      setPeople([]);
      setLoading(false);
      return;
    }

    try {
      // Get active presences at this location (excluding current user)
      const { data: presences, error: presenceError } = await supabase
        .from('presence')
        .select('*')
        .eq('location_id', locationId)
        .eq('ativo', true)
        .neq('user_id', user.id);

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
  }, [user, locationId]);

  return {
    people,
    loading,
    refetch: fetchPeopleNearby,
  };
}
