import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { placesService, Place } from '@/services/placesService';
import {
  PRESENCE_RADIUS_METERS,
  SEARCH_RADIUS_METERS,
  PRESENCE_DURATION_MS,
  GPS_CHECK_INTERVAL_MS,
  GPS_EXIT_THRESHOLD_COUNT,
  calculateDistanceMeters,
  formatRemainingTime,
} from '@/config/presence';

export interface Intention {
  id: string;
  nome: string;
  descricao: string | null;
}

export interface Presence {
  id: string;
  user_id: string;
  location_id: string; // Legacy - manter para compatibilidade
  place_id: string;    // Fonte única de verdade
  intention_id: string;
  inicio: string;
  ultima_atividade: string;
  ativo: boolean;
}

export interface PresenceEndReason {
  type: 'manual' | 'expired' | 'gps_exit';
  message: string;
}

export interface NearbyTemporaryPlace {
  id: string;
  nome: string;
  distance_meters: number;
  active_users: number;
}

// Temporary place default expiration (6 hours)
const TEMPORARY_PLACE_DURATION_MS = 6 * 60 * 60 * 1000;

export function usePresence() {
  const { user } = useAuth();
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [nearbyPlaces, setNearbyPlaces] = useState<Place[]>([]);
  const [nearbyTemporaryPlaces, setNearbyTemporaryPlaces] = useState<NearbyTemporaryPlace[]>([]);
  const [currentPresence, setCurrentPresence] = useState<Presence | null>(null);
  const [currentPlace, setCurrentPlace] = useState<Place | null>(null);
  const [loading, setLoading] = useState(true);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [lastEndReason, setLastEndReason] = useState<PresenceEndReason | null>(null);

  // Refs for GPS monitoring
  const gpsWatchIdRef = useRef<number | null>(null);
  const outsideRadiusCountRef = useRef(0);
  const presenceLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  const fetchIntentions = async () => {
    const { data, error } = await supabase
      .from('intentions')
      .select('*');

    if (!error && data) {
      setIntentions(data);
    }
  };

  // Fetch nearby temporary places using database function
  const fetchNearbyTemporaryPlaces = async (lat: number, lng: number): Promise<NearbyTemporaryPlace[]> => {
    try {
      const { data, error } = await supabase.rpc('find_nearby_temporary_places', {
        user_lat: lat,
        user_lng: lng,
        radius_meters: PRESENCE_RADIUS_METERS
      });

      if (error) {
        console.error('[usePresence] Error fetching nearby temporary places:', error);
        return [];
      }

      const places = (data || []).map((p: any) => ({
        id: p.id,
        nome: p.nome,
        distance_meters: p.distance_meters,
        active_users: p.active_users,
      }));

      setNearbyTemporaryPlaces(places);
      return places;
    } catch (error) {
      console.error('[usePresence] Error in fetchNearbyTemporaryPlaces:', error);
      return [];
    }
  };

  // Fetch from Foursquare via edge function
  const fetchNearbyPlaces = async (lat: number, lng: number) => {
    setPlacesLoading(true);
    try {
      console.log(`[usePresence] 🔍 Searching places: lat=${lat}, lng=${lng}, radius=${SEARCH_RADIUS_METERS}m`);
      
      // Fetch both Foursquare places and temporary places in parallel
      const [places, temporaryPlaces] = await Promise.all([
        placesService.searchNearby({
          latitude: lat,
          longitude: lng,
          radius: SEARCH_RADIUS_METERS,
        }),
        fetchNearbyTemporaryPlaces(lat, lng)
      ]);
      
      console.log(`[usePresence] ✅ ${places.length} places found, ${temporaryPlaces.length} temporary places nearby`);
      setNearbyPlaces(places);
    } catch (error) {
      console.error('[usePresence] ❌ Error fetching places:', error);
      setNearbyPlaces([]);
    } finally {
      setPlacesLoading(false);
    }
  };

  const fetchCurrentPresence = async () => {
    if (!user) {
      setCurrentPresence(null);
      setCurrentPlace(null);
      return;
    }

    const { data, error } = await supabase
      .from('presence')
      .select('*')
      .eq('user_id', user.id)
      .eq('ativo', true)
      .maybeSingle();

    if (!error && data) {
      const lastActivity = new Date(data.ultima_atividade).getTime();
      const now = Date.now();

      if (now - lastActivity > PRESENCE_DURATION_MS) {
        await endPresence('expired');
      } else {
        setCurrentPresence(data);
        setRemainingTime(PRESENCE_DURATION_MS - (now - lastActivity));

        // Fetch the place details using place_id (source of truth)
        const placeId = data.place_id;
        if (placeId) {
          const { data: placeData } = await supabase
            .from('places')
            .select('*')
            .eq('id', placeId)
            .maybeSingle();

          if (placeData) {
            setCurrentPlace(placeData as Place);
            presenceLocationRef.current = {
              lat: placeData.latitude,
              lng: placeData.longitude,
            };
            // Start GPS monitoring when presence is active
            startGPSMonitoring();
          }
        }
      }
    } else {
      setCurrentPresence(null);
      setCurrentPlace(null);
    }
  };

  // ============= GPS Monitoring =============
  
  const checkGPSPosition = useCallback((position: GeolocationPosition) => {
    if (!presenceLocationRef.current || !currentPresence) return;

    const { latitude, longitude, accuracy } = position.coords;
    const { lat: locLat, lng: locLng } = presenceLocationRef.current;

    // Ignore readings with poor accuracy
    if (accuracy && accuracy > 100) {
      console.log(`[GPS] Ignoring reading with poor accuracy: ${accuracy}m`);
      return;
    }

    const distance = calculateDistanceMeters(latitude, longitude, locLat, locLng);
    const isInside = distance <= PRESENCE_RADIUS_METERS;

    console.log(`[GPS] Distance from place: ${Math.round(distance)}m (radius: ${PRESENCE_RADIUS_METERS}m) - ${isInside ? '✅ Inside' : '⚠️ Outside'}`);

    if (!isInside) {
      outsideRadiusCountRef.current++;
      console.log(`[GPS] Outside radius (${outsideRadiusCountRef.current}/${GPS_EXIT_THRESHOLD_COUNT})`);

      if (outsideRadiusCountRef.current >= GPS_EXIT_THRESHOLD_COUNT) {
        console.log('[GPS] 🚪 Exit confirmed - ending presence');
        endPresence('gps_exit');
      }
    } else {
      // Reset counter when back inside
      if (outsideRadiusCountRef.current > 0) {
        console.log('[GPS] ✅ Back inside radius');
      }
      outsideRadiusCountRef.current = 0;
    }
  }, [currentPresence]);

  const startGPSMonitoring = useCallback(() => {
    if (!navigator.geolocation || gpsWatchIdRef.current !== null) return;

    console.log('[GPS] 📍 Starting position monitoring...');
    outsideRadiusCountRef.current = 0;

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      checkGPSPosition,
      (error) => {
        console.error('[GPS] Error:', error.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: GPS_CHECK_INTERVAL_MS,
        timeout: 15000,
      }
    );
  }, [checkGPSPosition]);

  const stopGPSMonitoring = useCallback(() => {
    if (gpsWatchIdRef.current !== null) {
      console.log('[GPS] 🛑 Stopping position monitoring');
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
      outsideRadiusCountRef.current = 0;
    }
  }, []);

  // ============= Presence Actions =============

  const endPresence = async (reason: 'manual' | 'expired' | 'gps_exit') => {
    if (!user) return;

    const messages = {
      manual: 'Você saiu do local',
      expired: 'Sua presença expirou',
      gps_exit: 'Você saiu da área do local',
    };

    console.log(`[Presence] 🔚 Ending presence: ${reason}`);

    // Stop GPS monitoring
    stopGPSMonitoring();

    // Get current place_id before ending
    const placeId = currentPresence?.place_id || currentPlace?.id;

    // Call the cascade cleanup function if we have a place_id
    if (placeId) {
      try {
        const { error } = await supabase.rpc('end_presence_cascade', {
          p_user_id: user.id,
          p_place_id: placeId
        });
        
        if (error) {
          console.error('[Presence] Error in cascade cleanup:', error);
        } else {
          console.log('[Presence] ✅ Cascade cleanup completed');
        }
      } catch (err) {
        console.error('[Presence] Error calling end_presence_cascade:', err);
      }
    }

    // Delete presence
    await supabase
      .from('presence')
      .delete()
      .eq('user_id', user.id);

    setCurrentPresence(null);
    setCurrentPlace(null);
    setRemainingTime(0);
    presenceLocationRef.current = null;
    setLastEndReason({ type: reason, message: messages[reason] });
  };

  // Activate presence using place_id (the new source of truth)
  // Fluxo: 1) Encerrar presença anterior, 2) Expirar waves pendentes, 3) Criar nova presença
  const activatePresenceAtPlace = async (placeId: string, intentionId: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    if (!placeId) {
      return { error: new Error('place_id é obrigatório para criar presença') };
    }

    console.log(`[Presence] 🔄 Switching to place: ${placeId}`);

    // Clear last end reason
    setLastEndReason(null);

    // Stop GPS monitoring from previous presence
    stopGPSMonitoring();

    // ============= STEP 1: Encerrar presença ativa anterior =============
    console.log('[Presence] Step 1: Deactivating previous presence...');
    const { error: deactivateError } = await supabase
      .from('presence')
      .update({ ativo: false })
      .eq('user_id', user.id)
      .eq('ativo', true);

    if (deactivateError) {
      console.error('[Presence] Error deactivating previous presence:', deactivateError);
      // Continue anyway - might not have previous presence
    } else {
      console.log('[Presence] ✅ Previous presence deactivated');
    }

    // ============= STEP 2: Expirar waves pendentes do local anterior =============
    console.log('[Presence] Step 2: Expiring pending waves...');
    const { error: wavesError, count: expiredCount } = await supabase
      .from('waves')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .or(`de_user_id.eq.${user.id},para_user_id.eq.${user.id}`);

    if (wavesError) {
      console.error('[Presence] Error expiring waves:', wavesError);
      // Continue anyway - waves expiration is secondary
    } else {
      console.log(`[Presence] ✅ Expired ${expiredCount ?? 0} pending waves`);
    }

    // Delete old inactive presence records (cleanup)
    await supabase
      .from('presence')
      .delete()
      .eq('user_id', user.id)
      .eq('ativo', false);

    // ============= STEP 3: Criar nova presença =============
    console.log('[Presence] Step 3: Creating new presence...');
    const { data, error } = await supabase
      .from('presence')
      .insert({
        user_id: user.id,
        place_id: placeId,
        intention_id: intentionId,
        inicio: new Date().toISOString(),
        ultima_atividade: new Date().toISOString(),
        ativo: true
      })
      .select()
      .single();

    if (error) {
      console.error('[Presence] ❌ Error creating presence:', error);
      return { error };
    }

    console.log(`[Presence] ✅ New presence created at place: ${placeId}`);
    setCurrentPresence(data);
    setRemainingTime(PRESENCE_DURATION_MS);

    // Fetch place details
    const { data: placeData } = await supabase
      .from('places')
      .select('*')
      .eq('id', placeId)
      .maybeSingle();

    if (placeData) {
      setCurrentPlace(placeData as Place);
      presenceLocationRef.current = {
        lat: placeData.latitude,
        lng: placeData.longitude,
      };
      // Start GPS monitoring for new place
      startGPSMonitoring();
    }

    return { error: null };
  };

  // Create a temporary place and activate presence
  const createTemporaryPlace = async (
    nome: string, 
    latitude: number, 
    longitude: number, 
    intentionId: string
  ): Promise<{ error: Error | null; placeId: string | null }> => {
    if (!user) return { error: new Error('Not authenticated'), placeId: null };

    // Calculate expiration
    const expiresAt = new Date(Date.now() + TEMPORARY_PLACE_DURATION_MS).toISOString();

    // Create the temporary place
    const { data: placeData, error: placeError } = await supabase
      .from('places')
      .insert({
        provider: 'user',
        provider_id: `temp_${user.id}_${Date.now()}`,
        nome: nome.trim(),
        latitude,
        longitude,
        origem: 'user_created',
        is_temporary: true,
        created_by: user.id,
        expires_at: expiresAt,
        ativo: true
      })
      .select('id')
      .single();

    if (placeError) {
      console.error('[usePresence] Error creating temporary place:', placeError);
      return { error: new Error('Não foi possível criar o local temporário'), placeId: null };
    }

    console.log(`[usePresence] ✅ Temporary place created: ${placeData.id}`);

    // Activate presence at the new place
    const { error: presenceError } = await activatePresenceAtPlace(placeData.id, intentionId);

    if (presenceError) {
      return { error: presenceError, placeId: null };
    }

    return { error: null, placeId: placeData.id };
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
    await endPresence('manual');
  };

  // ============= Effects =============

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchIntentions();
      await fetchCurrentPresence();
      setLoading(false);
    };
    init();

    return () => {
      stopGPSMonitoring();
    };
  }, [user]);

  // Timer countdown
  useEffect(() => {
    if (!currentPresence || remainingTime <= 0) return;

    const interval = setInterval(() => {
      setRemainingTime(prev => {
        if (prev <= 1000) {
          endPresence('expired');
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentPresence]);

  const getFormattedRemainingTime = useCallback(() => {
    return formatRemainingTime(remainingTime);
  }, [remainingTime]);

  return {
    // Data
    intentions,
    nearbyPlaces,
    nearbyTemporaryPlaces,
    currentPresence,
    currentPlace, // Renamed from currentLocation
    loading,
    placesLoading,
    remainingTime,
    lastEndReason,
    
    // Config (exposed for UI)
    presenceRadiusMeters: PRESENCE_RADIUS_METERS,
    presenceDurationMs: PRESENCE_DURATION_MS,
    
    // Actions
    formatRemainingTime: getFormattedRemainingTime,
    fetchNearbyPlaces,
    fetchNearbyTemporaryPlaces,
    activatePresenceAtPlace,
    createTemporaryPlace,
    renewPresence,
    deactivatePresence,
    refetch: fetchCurrentPresence,
    clearLastEndReason: () => setLastEndReason(null),
  };
}
