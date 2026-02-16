import { useState, useEffect, useCallback, useRef } from 'react';
import {
  GPS_CHECK_INTERVAL_MS,
  GPS_ACCURACY_THRESHOLD_METERS,
} from '@/config/presence';

export interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  timestamp: number | null;
  error: GeolocationPositionError | null;
  loading: boolean;
}

interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  watchPosition?: boolean;
  maxAge?: number;
  timeout?: number;
}

/**
 * Hook para gerenciar geolocalização do usuário.
 * Suporta tanto posição única quanto monitoramento contínuo.
 */
export function useGeolocation(options: UseGeolocationOptions = {}) {
  const {
    enableHighAccuracy = true,
    watchPosition = false,
    maxAge = GPS_CHECK_INTERVAL_MS,
    timeout = 10000,
  } = options;

  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    timestamp: null,
    error: null,
    loading: true,
  });

  const watchIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const handleSuccess = useCallback((position: GeolocationPosition) => {
    if (!mountedRef.current) return;

    const { latitude, longitude, accuracy } = position.coords;

    // Ignora leituras com precisão ruim
    if (accuracy > GPS_ACCURACY_THRESHOLD_METERS) {
      console.log(`[useGeolocation] Ignorando leitura com precisão ruim: ${accuracy}m`);
      return;
    }

    setState({
      latitude,
      longitude,
      accuracy,
      timestamp: position.timestamp,
      error: null,
      loading: false,
    });
  }, []);

  const handleError = useCallback((error: GeolocationPositionError) => {
    if (!mountedRef.current) return;

    console.error('[useGeolocation] Erro:', error.message);
    setState(prev => ({
      ...prev,
      error,
      loading: false,
    }));
  }, []);

  const getCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        error: {
          code: 0,
          message: 'Geolocalização não suportada',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError,
        loading: false,
      }));
      return;
    }

    setState(prev => ({ ...prev, loading: true }));

    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
      enableHighAccuracy,
      maximumAge: maxAge,
      timeout,
    });
  }, [enableHighAccuracy, maxAge, timeout, handleSuccess, handleError]);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation || watchIdRef.current !== null) return;

    console.log('[useGeolocation] Iniciando monitoramento GPS...');

    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      {
        enableHighAccuracy,
        maximumAge: maxAge,
        timeout,
      }
    );
  }, [enableHighAccuracy, maxAge, timeout, handleSuccess, handleError]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      console.log('[useGeolocation] Parando monitoramento GPS...');
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Cleanup only - NO auto-requesting permissions on mount
  // Consumers must call refresh(), startWatching() explicitly via user action
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      stopWatching();
    };
  }, [stopWatching]);

  return {
    ...state,
    refresh: getCurrentPosition,
    startWatching,
    stopWatching,
    isWatching: watchIdRef.current !== null,
  };
}
