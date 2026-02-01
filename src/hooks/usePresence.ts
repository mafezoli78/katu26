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
import {
  PresenceLogicalState,
  PresenceEndReason,
  PresenceState,
  PresenceEndReasonType,
  mapToSemanticReason,
  END_REASON_MESSAGES,
  isHumanEndReason,
} from '@/types/presence';

// Re-export types for consumers
export type { PresenceLogicalState, PresenceEndReason, PresenceState };

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
  // Start with loading=true to prevent redirects before backend fetch
  const [loading, setLoading] = useState(true);
  // Track if initial fetch completed (prevents state reset on remount)
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [lastEndReason, setLastEndReason] = useState<PresenceEndReason | null>(null);
  
  // Logical state tracking
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [lastValidatedAt, setLastValidatedAt] = useState<string | null>(null);
  const [isSuspended, setIsSuspended] = useState(false);

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

  const fetchCurrentPresence = useCallback(async (isRevalidation = false) => {
    if (!user) {
      setCurrentPresence(null);
      setCurrentPlace(null);
      return { valid: false };
    }

    if (isRevalidation) {
      setIsRevalidating(true);
    }

    try {
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
          return { valid: false };
        } else {
          setCurrentPresence(data);
          setRemainingTime(PRESENCE_DURATION_MS - (now - lastActivity));
          setLastValidatedAt(new Date().toISOString());
          setIsSuspended(false);

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
          return { valid: true };
        }
      } else {
        // No valid presence in backend
        const wasActive = currentPresence !== null;
        setCurrentPresence(null);
        setCurrentPlace(null);
        
        // If we had presence and now it's gone during revalidation,
        // mark as SUSPENDED (technical), not ended
        // This allows potential recovery or proper human-initiated end
        if (wasActive && isRevalidation) {
          setIsSuspended(true); // Mark as suspended, not ended
          setLastEndReason({
            type: 'presence_lost_background',
            message: END_REASON_MESSAGES.presence_lost_background,
            timestamp: new Date().toISOString(),
            isHumanInitiated: false, // Technical reason, not human action
          });
        }
        return { valid: false };
      }
    } finally {
      if (isRevalidation) {
        setIsRevalidating(false);
      }
    }
  }, [user, currentPresence]);

  // Derive the logical state based on presence + reason semantics
  // RULE: 'ended' only for human-initiated actions
  const deriveLogicalState = useCallback((): PresenceLogicalState => {
    // Active presence = active state
    if (currentPresence && currentPresence.ativo) return 'active';
    
    // No presence - check why
    if (isSuspended) return 'suspended';
    
    // Check if last reason was human-initiated
    if (lastEndReason && isHumanEndReason(lastEndReason.type)) {
      return 'ended';
    }
    
    // Technical/unknown reason = suspended (recoverable)
    if (lastEndReason && !lastEndReason.isHumanInitiated) {
      return 'suspended';
    }
    
    // No presence and no reason = ended (initial state or clean end)
    return 'ended';
  }, [currentPresence, isSuspended, lastEndReason]);

  // Computed presence state object
  const presenceState: PresenceState = {
    logicalState: deriveLogicalState(),
    endReason: lastEndReason,
    isRevalidating,
    lastValidatedAt,
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
        // Use ref to avoid stale closure
        endPresenceRef.current?.('gps_exit');
      }
    } else {
      // Reset counter when back inside
      if (outsideRadiusCountRef.current > 0) {
        console.log('[GPS] ✅ Back inside radius');
      }
      outsideRadiusCountRef.current = 0;
    }
  }, [currentPresence]);
  
  // Ref to avoid stale closure in GPS callback
  const endPresenceRef = useRef<((reason: 'manual' | 'expired' | 'gps_exit') => Promise<void>) | null>(null);

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

  const endPresence = useCallback(async (reason: 'manual' | 'expired' | 'gps_exit') => {
    if (!user) return;

    const semanticReason = mapToSemanticReason(reason);
    const message = END_REASON_MESSAGES[semanticReason];

    console.log(`[Presence] 🔚 Ending presence: ${reason} → ${semanticReason} (human-initiated)`);

    // Stop GPS monitoring
    stopGPSMonitoring();

    // Get current place_id before ending
    const placeId = currentPresence?.place_id || currentPlace?.id;

    // Call the cascade cleanup function if we have a place_id
    // Pass the reason (p_motivo) to preserve distinction in conversations
    if (placeId) {
      try {
        const { error } = await supabase.rpc('end_presence_cascade', {
          p_user_id: user.id,
          p_place_id: placeId,
          p_motivo: reason
        });
        
        if (error) {
          console.error('[Presence] Error in cascade cleanup:', error);
        } else {
          console.log('[Presence] ✅ Cascade cleanup completed with reason:', reason);
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
    setIsSuspended(false);
    // Mark as human-initiated = definitive end
    setLastEndReason({ 
      type: semanticReason, 
      message,
      timestamp: new Date().toISOString(),
      isHumanInitiated: true, // Human action = definitive
    });
  }, [user, currentPresence, currentPlace, stopGPSMonitoring]);
  
  // Keep ref updated for GPS callback
  useEffect(() => {
    endPresenceRef.current = endPresence;
  }, [endPresence]);

  // Activate presence using centralized RPC (atomic, with concurrency lock)
  // The RPC handles: cleanup of previous presence, wave expiration, and new presence creation
  const activatePresenceAtPlace = async (placeId: string, intentionId: string, assuntoAtual?: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    if (!placeId) {
      return { error: new Error('place_id é obrigatório para criar presença') };
    }

    console.log(`[Presence] 🔄 Activating presence at place: ${placeId}`);

    // Clear last end reason
    setLastEndReason(null);

    // Stop GPS monitoring from previous presence
    stopGPSMonitoring();

    // Call centralized RPC - handles all cleanup atomically with advisory lock
    const { data: newPresenceId, error } = await supabase.rpc('activate_presence', {
      p_user_id: user.id,
      p_place_id: placeId,
      p_intention_id: intentionId,
      p_assunto_atual: assuntoAtual?.trim() || null
    });

    if (error) {
      console.error('[Presence] ❌ Error in activate_presence RPC:', error);
      return { error };
    }

    console.log(`[Presence] ✅ Presence activated: ${newPresenceId}`);
    setRemainingTime(PRESENCE_DURATION_MS);

    // Fetch the newly created presence and place details
    await fetchCurrentPresence();

    return { error: null };
  };

  // Create a temporary place and activate presence
  const createTemporaryPlace = async (
    nome: string, 
    latitude: number, 
    longitude: number, 
    intentionId: string,
    assuntoAtual?: string
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

    // Activate presence at the new place with optional expression
    const { error: presenceError } = await activatePresenceAtPlace(placeData.id, intentionId, assuntoAtual);

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

  // Visibility change handler - set suspended on hide, revalidate on return
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Mark as suspended when going to background
        if (currentPresence) {
          console.log('[usePresence] App going to background - marking as suspended');
          setIsSuspended(true);
        }
      } else if (document.visibilityState === 'visible' && user && hasFetchedOnce) {
        console.log('[usePresence] App returned to foreground - revalidating presence');
        // Revalidate presence from backend
        fetchCurrentPresence(true);
      }
    };

    // Also handle focus for iOS PWA fallback
    const handleFocus = () => {
      if (user && hasFetchedOnce) {
        console.log('[usePresence] Window focus - revalidating presence');
        fetchCurrentPresence(true);
      }
    };

    // Also handle pageshow for bfcache restoration
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && user && hasFetchedOnce) {
        console.log('[usePresence] Page restored from bfcache - revalidating presence');
        fetchCurrentPresence(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [user, hasFetchedOnce, currentPresence, fetchCurrentPresence]);

  // Initial fetch - only runs once per user session
  useEffect(() => {
    const init = async () => {
      if (!user) {
        setCurrentPresence(null);
        setCurrentPlace(null);
        setLoading(false);
        setHasFetchedOnce(false);
        return;
      }
      
      // Only set loading=true on first fetch, not on refetch
      if (!hasFetchedOnce) {
        setLoading(true);
      }
      
      await fetchIntentions();
      await fetchCurrentPresence();
      
      setLoading(false);
      setHasFetchedOnce(true);
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
    
    // Logical state (new model)
    presenceState,
    
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
