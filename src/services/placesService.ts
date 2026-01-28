import { supabase } from '@/integrations/supabase/client';
import { calculateDistanceMeters } from '@/config/presence';

export interface Place {
  id: string;
  provider: string;
  provider_id: string;
  nome: string;
  latitude: number;
  longitude: number;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  pais: string | null;
  categoria: string | null;
  dados_brutos: Record<string, unknown> | null;
  ativo: boolean;
  origem: string;
  criado_em: string;
  atualizado_em: string;
  distance_meters?: number;
  is_temporary?: boolean;
  active_users?: number;
}

export interface SearchPlacesParams {
  latitude: number;
  longitude: number;
  radius?: number;
  limit?: number;
  query?: string;
}

// Distance thresholds for UI decisions
export const PROXIMITY_THRESHOLD_METERS = 30;  // Very close - offer direct entry
export const INITIAL_SEARCH_RADIUS_METERS = 100; // Initial search radius
export const EXPANDED_SEARCH_RADIUS_METERS = 500; // Expanded search if nothing found

// Abort controller for cancelling in-flight requests
let currentSearchController: AbortController | null = null;

/**
 * Service layer for places management.
 * Abstracts the provider (Foursquare) and ensures all data comes from local database.
 */
export const placesService = {
  /**
   * Search for places near a location with optimized parameters for Katuu.
   * Calls the edge function which fetches from provider and caches in database.
   * Always returns data from the local database, sorted by distance.
   */
  async searchNearby(params: SearchPlacesParams): Promise<Place[]> {
    const { 
      latitude, 
      longitude, 
      radius = INITIAL_SEARCH_RADIUS_METERS, 
      limit = 20,
      query 
    } = params;

    // Cancel any previous in-flight request
    if (currentSearchController) {
      currentSearchController.abort();
    }
    currentSearchController = new AbortController();

    try {
      const { data, error } = await supabase.functions.invoke('search-places', {
        body: { latitude, longitude, radius, limit, query },
      });

      if (error) {
        console.error('Error searching places:', error);
        throw new Error('Failed to search places');
      }

      return data.places || [];
    } catch (err: any) {
      // Don't throw on abort - just return empty
      if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
        console.log('[placesService] Request aborted (new request started)');
        return [];
      }
      throw err;
    }
  },

  /**
   * Search with text query (for name search).
   * Uses Foursquare's text search capability.
   */
  async searchByName(params: {
    latitude: number;
    longitude: number;
    query: string;
    limit?: number;
  }): Promise<Place[]> {
    const { latitude, longitude, query, limit = 20 } = params;

    const { data, error } = await supabase.functions.invoke('search-places', {
      body: { 
        latitude, 
        longitude, 
        radius: EXPANDED_SEARCH_RADIUS_METERS,
        limit,
        query 
      },
    });

    if (error) {
      console.error('Error searching places by name:', error);
      throw new Error('Failed to search places by name');
    }

    return data.places || [];
  },

  /**
   * Get the closest place to a location.
   * Returns null if no place is within the proximity threshold.
   */
  async getClosestPlace(latitude: number, longitude: number): Promise<Place | null> {
    const places = await this.searchNearby({
      latitude,
      longitude,
      radius: PROXIMITY_THRESHOLD_METERS,
      limit: 1,
    });

    if (places.length > 0 && places[0].distance_meters !== undefined) {
      return places[0].distance_meters <= PROXIMITY_THRESHOLD_METERS ? places[0] : null;
    }

    return null;
  },

  /**
   * Get cached places from database without calling external API.
   * Adds distance calculation and sorts by distance.
   */
  async getCachedPlaces(params: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
  }): Promise<Place[]> {
    const { latitude, longitude, radiusKm = 5 } = params;
    
    // Approximate degree conversion (1 degree ≈ 111km at equator)
    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.cos(latitude * Math.PI / 180));

    const { data, error } = await supabase
      .from('places')
      .select('*')
      .eq('ativo', true)
      .eq('is_temporary', false)
      .gte('latitude', latitude - latDelta)
      .lte('latitude', latitude + latDelta)
      .gte('longitude', longitude - lngDelta)
      .lte('longitude', longitude + lngDelta);

    if (error) {
      console.error('Error fetching cached places:', error);
      throw error;
    }

    // Add distance and sort
    const placesWithDistance = (data as Place[]).map(place => ({
      ...place,
      distance_meters: Math.round(calculateDistanceMeters(
        latitude, longitude,
        place.latitude, place.longitude
      ))
    })).sort((a, b) => (a.distance_meters || 0) - (b.distance_meters || 0));

    return placesWithDistance;
  },

  /**
   * Get a single place by ID.
   */
  async getPlaceById(id: string): Promise<Place | null> {
    const { data, error } = await supabase
      .from('places')
      .select('*')
      .eq('id', id)
      .eq('ativo', true)
      .maybeSingle();

    if (error) {
      console.error('Error fetching place:', error);
      throw error;
    }

    return data as Place | null;
  },

  /**
   * Get places by category.
   */
  async getPlacesByCategory(categoria: string): Promise<Place[]> {
    const { data, error } = await supabase
      .from('places')
      .select('*')
      .eq('ativo', true)
      .ilike('categoria', `%${categoria}%`);

    if (error) {
      console.error('Error fetching places by category:', error);
      throw error;
    }

    return (data as Place[]) || [];
  },
};
