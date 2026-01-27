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
  isWithinRadius,
  formatRemainingTime,
} from '@/config/presence';

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

export interface PresenceEndReason {
  type: 'manual' | 'expired' | 'gps_exit';
  message: string;
}

export function usePresence() {
  const { user } = useAuth();
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [nearbyLocations, setNearbyLocations] = useState<Location[]>([]);
  const [nearbyPlaces, setNearbyPlaces] = useState<Place[]>([]);
  const [currentPresence, setCurrentPresence] = useState<Presence | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(true);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [lastEndReason, setLastEndReason] = useState<PresenceEndReason | null>(null);

  // Refs para GPS monitoring
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

  // Legacy: fetch from locations table (manual/demo locations)
  const fetchNearbyLocations = async (lat: number, lng: number) => {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('status_aprovacao', 'aprovado');

    if (!error && data) {
      // Filter within search radius
      const nearby = data.filter(loc => {
        const distance = calculateDistanceMeters(lat, lng, loc.latitude, loc.longitude);
        return distance <= SEARCH_RADIUS_METERS;
      });
      setNearbyLocations(nearby);
    }
  };

  // Fetch from Foursquare via edge function
  const fetchNearbyPlaces = async (lat: number, lng: number) => {
    setPlacesLoading(true);
    try {
      console.log(`[usePresence] 🔍 Buscando locais: lat=${lat}, lng=${lng}, raio=${SEARCH_RADIUS_METERS}m`);
      const places = await placesService.searchNearby({
        latitude: lat,
        longitude: lng,
        radius: SEARCH_RADIUS_METERS,
      });
      console.log(`[usePresence] ✅ ${places.length} locais encontrados`);
      setNearbyPlaces(places);
    } catch (error) {
      console.error('[usePresence] ❌ Erro ao buscar locais:', error);
      setNearbyPlaces([]);
    } finally {
      setPlacesLoading(false);
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
      .maybeSingle();

    if (!error && data) {
      const lastActivity = new Date(data.ultima_atividade).getTime();
      const now = Date.now();

      if (now - lastActivity > PRESENCE_DURATION_MS) {
        await endPresence('expired');
      } else {
        setCurrentPresence(data);
        setRemainingTime(PRESENCE_DURATION_MS - (now - lastActivity));

        // Fetch the location details
        const { data: locData } = await supabase
          .from('locations')
          .select('*')
          .eq('id', data.location_id)
          .maybeSingle();

        if (locData) {
          setCurrentLocation(locData);
          presenceLocationRef.current = {
            lat: locData.latitude,
            lng: locData.longitude,
          };
          // Start GPS monitoring when presence is active
          startGPSMonitoring();
        }
      }
    } else {
      setCurrentPresence(null);
      setCurrentLocation(null);
    }
  };

  // ============= GPS Monitoring =============
  
  const checkGPSPosition = useCallback((position: GeolocationPosition) => {
    if (!presenceLocationRef.current || !currentPresence) return;

    const { latitude, longitude, accuracy } = position.coords;
    const { lat: locLat, lng: locLng } = presenceLocationRef.current;

    // Ignore readings with poor accuracy
    if (accuracy && accuracy > 100) {
      console.log(`[GPS] Ignorando leitura com precisão ruim: ${accuracy}m`);
      return;
    }

    const distance = calculateDistanceMeters(latitude, longitude, locLat, locLng);
    const isInside = distance <= PRESENCE_RADIUS_METERS;

    console.log(`[GPS] Distância do local: ${Math.round(distance)}m (raio: ${PRESENCE_RADIUS_METERS}m) - ${isInside ? '✅ Dentro' : '⚠️ Fora'}`);

    if (!isInside) {
      outsideRadiusCountRef.current++;
      console.log(`[GPS] Fora do raio (${outsideRadiusCountRef.current}/${GPS_EXIT_THRESHOLD_COUNT})`);

      if (outsideRadiusCountRef.current >= GPS_EXIT_THRESHOLD_COUNT) {
        console.log('[GPS] 🚪 Saída confirmada - encerrando presença');
        endPresence('gps_exit');
      }
    } else {
      // Reset counter when back inside
      if (outsideRadiusCountRef.current > 0) {
        console.log('[GPS] ✅ Voltou para dentro do raio');
      }
      outsideRadiusCountRef.current = 0;
    }
  }, [currentPresence]);

  const startGPSMonitoring = useCallback(() => {
    if (!navigator.geolocation || gpsWatchIdRef.current !== null) return;

    console.log('[GPS] 📍 Iniciando monitoramento de posição...');
    outsideRadiusCountRef.current = 0;

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      checkGPSPosition,
      (error) => {
        console.error('[GPS] Erro:', error.message);
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
      console.log('[GPS] 🛑 Parando monitoramento de posição');
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

    console.log(`[Presence] 🔚 Encerrando presença: ${reason}`);

    // Stop GPS monitoring
    stopGPSMonitoring();

    // End all active conversations due to presence end
    const { data: activeConversations } = await supabase
      .from('conversations')
      .select('id')
      .eq('ativo', true)
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

    if (activeConversations && activeConversations.length > 0) {
      console.log(`[Presence] 🔚 Encerrando ${activeConversations.length} conversa(s)`);
      
      for (const conv of activeConversations) {
        // Update conversation with end info
        await supabase
          .from('conversations')
          .update({
            ativo: false,
            encerrado_por: user.id,
            encerrado_em: new Date().toISOString(),
            encerrado_motivo: 'presence_end',
          })
          .eq('id', conv.id);

        // Delete messages (ephemeral)
        await supabase
          .from('messages')
          .delete()
          .eq('conversation_id', conv.id);
      }
    }

    // Delete user's waves at this location (they expire with presence)
    if (currentLocation) {
      await supabase
        .from('waves')
        .delete()
        .eq('location_id', currentLocation.id)
        .or(`de_user_id.eq.${user.id},para_user_id.eq.${user.id}`);
      
      console.log('[Presence] 🗑️ Acenos limpos');
    }

    // Delete presence
    await supabase
      .from('presence')
      .delete()
      .eq('user_id', user.id);

    setCurrentPresence(null);
    setCurrentLocation(null);
    setRemainingTime(0);
    presenceLocationRef.current = null;
    setLastEndReason({ type: reason, message: messages[reason] });
  };

  const activatePresence = async (locationId: string, intentionId: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    // Clear last end reason
    setLastEndReason(null);

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
        .maybeSingle();

      if (locData) {
        setCurrentLocation(locData);
        presenceLocationRef.current = {
          lat: locData.latitude,
          lng: locData.longitude,
        };
        // Start GPS monitoring
        startGPSMonitoring();
      }
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
    await endPresence('manual');
  };

  const suggestLocation = async (nome: string, latitude: number, longitude: number) => {
    if (!user) return { error: new Error('Not authenticated') };

    const { error } = await supabase
      .from('locations')
      .insert({
        nome,
        latitude,
        longitude,
        raio: PRESENCE_RADIUS_METERS,
        status_aprovacao: 'pendente',
        criado_por: user.id
      });

    return { error };
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
    nearbyLocations,
    nearbyPlaces,
    currentPresence,
    currentLocation,
    loading,
    placesLoading,
    remainingTime,
    lastEndReason,
    
    // Config (exposed for UI)
    presenceRadiusMeters: PRESENCE_RADIUS_METERS,
    presenceDurationMs: PRESENCE_DURATION_MS,
    
    // Actions
    formatRemainingTime: getFormattedRemainingTime,
    fetchNearbyLocations,
    fetchNearbyPlaces,
    activatePresence,
    renewPresence,
    deactivatePresence,
    suggestLocation,
    refetch: fetchCurrentPresence,
    clearLastEndReason: () => setLastEndReason(null),
  };
}
