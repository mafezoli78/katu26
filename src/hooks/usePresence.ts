import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Intention {
  id: string;
  nome: string;
  descricao: string | null;
}

export interface Location {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  raio: number;
  status_aprovacao: string;
}

export interface Presence {
  id: string;
  user_id: string;
  location_id: string;
  intention_id: string;
  inicio: string;
  ultima_atividade: string;
  ativo: boolean;
}

const PRESENCE_DURATION_MS = 60 * 60 * 1000; // 1 hour

export function usePresence() {
  const { user } = useAuth();
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [nearbyLocations, setNearbyLocations] = useState<Location[]>([]);
  const [currentPresence, setCurrentPresence] = useState<Presence | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(true);
  const [remainingTime, setRemainingTime] = useState<number>(0);

  const fetchIntentions = async () => {
    const { data, error } = await supabase
      .from('intentions')
      .select('*');

    if (!error && data) {
      setIntentions(data);
    }
  };

  const fetchNearbyLocations = async (lat: number, lng: number) => {
    // Get approved locations - in a real app, filter by distance
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('status_aprovacao', 'aprovado');

    if (!error && data) {
      // Simple distance filtering (within ~5km)
      const nearby = data.filter(loc => {
        const distance = getDistanceFromLatLonInKm(lat, lng, loc.latitude, loc.longitude);
        return distance <= 5;
      });
      setNearbyLocations(nearby);
    }
  };

  const fetchCurrentPresence = async () => {
    if (!user) {
      setCurrentPresence(null);
      setCurrentLocation(null);
      return;
    }

    const { data, error } = await supabase
      .from('presence')
      .select('*')
      .eq('user_id', user.id)
      .eq('ativo', true)
      .single();

    if (!error && data) {
      // Check if presence has expired
      const lastActivity = new Date(data.ultima_atividade).getTime();
      const now = Date.now();
      
      if (now - lastActivity > PRESENCE_DURATION_MS) {
        await deactivatePresence();
      } else {
        setCurrentPresence(data);
        setRemainingTime(PRESENCE_DURATION_MS - (now - lastActivity));

        // Fetch the location details
        const { data: locData } = await supabase
          .from('locations')
          .select('*')
          .eq('id', data.location_id)
          .single();

        if (locData) setCurrentLocation(locData);
      }
    } else {
      setCurrentPresence(null);
      setCurrentLocation(null);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchIntentions();
      await fetchCurrentPresence();
      setLoading(false);
    };
    init();
  }, [user]);

  // Timer countdown
  useEffect(() => {
    if (!currentPresence || remainingTime <= 0) return;

    const interval = setInterval(() => {
      setRemainingTime(prev => {
        if (prev <= 1000) {
          deactivatePresence();
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentPresence]);

  const activatePresence = async (locationId: string, intentionId: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    // Deactivate any existing presence first
    await supabase
      .from('presence')
      .delete()
      .eq('user_id', user.id);

    const { data, error } = await supabase
      .from('presence')
      .insert({
        user_id: user.id,
        location_id: locationId,
        intention_id: intentionId,
        inicio: new Date().toISOString(),
        ultima_atividade: new Date().toISOString(),
        ativo: true
      })
      .select()
      .single();

    if (!error && data) {
      setCurrentPresence(data);
      setRemainingTime(PRESENCE_DURATION_MS);

      const { data: locData } = await supabase
        .from('locations')
        .select('*')
        .eq('id', locationId)
        .single();

      if (locData) setCurrentLocation(locData);
    }

    return { error };
  };

  const renewPresence = async () => {
    if (!user || !currentPresence) return { error: new Error('No active presence') };

    const { error } = await supabase
      .from('presence')
      .update({ ultima_atividade: new Date().toISOString() })
      .eq('id', currentPresence.id);

    if (!error) {
      setRemainingTime(PRESENCE_DURATION_MS);
      await fetchCurrentPresence();
    }

    return { error };
  };

  const deactivatePresence = async () => {
    if (!user) return;

    await supabase
      .from('presence')
      .delete()
      .eq('user_id', user.id);

    setCurrentPresence(null);
    setCurrentLocation(null);
    setRemainingTime(0);
  };

  const suggestLocation = async (nome: string, latitude: number, longitude: number) => {
    if (!user) return { error: new Error('Not authenticated') };

    const { error } = await supabase
      .from('locations')
      .insert({
        nome,
        latitude,
        longitude,
        raio: 100,
        status_aprovacao: 'pendente',
        criado_por: user.id
      });

    return { error };
  };

  const formatRemainingTime = useCallback(() => {
    const minutes = Math.floor(remainingTime / 60000);
    const seconds = Math.floor((remainingTime % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [remainingTime]);

  return {
    intentions,
    nearbyLocations,
    currentPresence,
    currentLocation,
    loading,
    remainingTime,
    formatRemainingTime,
    fetchNearbyLocations,
    activatePresence,
    renewPresence,
    deactivatePresence,
    suggestLocation,
    refetch: fetchCurrentPresence,
  };
}

// Helper function to calculate distance between two coordinates
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}
