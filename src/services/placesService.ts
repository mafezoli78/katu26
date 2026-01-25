import { supabase } from '@/integrations/supabase/client';

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
}

export interface SearchPlacesParams {
  latitude: number;
  longitude: number;
  radius?: number;
  query?: string;
}

/**
 * Service layer for places management.
 * Abstracts the provider (Foursquare) and ensures all data comes from local database.
 */
export const placesService = {
  /**
   * Search for places near a location.
   * Calls the edge function which fetches from provider and caches in database.
   * Always returns data from the local database.
   */
  async searchNearby(params: SearchPlacesParams): Promise<Place[]> {
    const { data, error } = await supabase.functions.invoke('search-places', {
      body: params,
    });

    if (error) {
      console.error('Error searching places:', error);
      throw new Error('Failed to search places');
    }

    return data.places || [];
  },

  /**
   * Get cached places from database without calling external API.
   * Useful for displaying previously fetched places.
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
      .gte('latitude', latitude - latDelta)
      .lte('latitude', latitude + latDelta)
      .gte('longitude', longitude - lngDelta)
      .lte('longitude', longitude + lngDelta);

    if (error) {
      console.error('Error fetching cached places:', error);
      throw error;
    }

    return (data as Place[]) || [];
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
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      console.error('Error fetching place:', error);
      throw error;
    }

    return data as Place;
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
