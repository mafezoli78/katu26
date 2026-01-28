import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Foursquare Places API response format (new endpoint - 2025 version)
interface FoursquarePlace {
  fsq_place_id: string;
  name: string;
  latitude: number;
  longitude: number;
  location: {
    address?: string;
    locality?: string;
    region?: string;
    country?: string;
    postcode?: string;
    formatted_address?: string;
  };
  categories: Array<{
    fsq_category_id: string;
    name: string;
    short_name?: string;
  }>;
  distance?: number;
}

interface SearchParams {
  latitude: number;
  longitude: number;
  radius?: number;
  limit?: number;
  query?: string;
  categories?: string; // comma-separated category IDs
}

// Foursquare category IDs - EXCLUSIVELY social/public places for Katuu
// Reference: https://docs.foursquare.com/data-products/docs/categories
const KATUU_CATEGORY_IDS = [
  "4d4b7105d754a06376d81259", // Nightlife Spot (parent - includes bars, clubs, lounges)
  "4bf58dd8d48988d116941735", // Bar
  "4bf58dd8d48988d11f941735", // Nightclub
  "4bf58dd8d48988d121941735", // Lounge
  "5032792091d4171f4202c5b0", // Shopping Mall
  "4bf58dd8d48988d175941735", // Gym / Fitness Center
  "4bf58dd8d48988d1c1941735", // Mexican Restaurant (using as Restaurant proxy)
  "4bf58dd8d48988d16d941735", // Café
  "4bf58dd8d48988d1e0931735", // Coffee Shop
  "4e38bcc692d1c19738b9fea9", // Event Space
  "4bf58dd8d48988d1f1931735", // General Entertainment
  "4bf58dd8d48988d182941735", // Music Venue
  "4bf58dd8d48988d1e5931735", // Concert Hall
  "4bf58dd8d48988d17f941735", // Movie Theater
  "4bf58dd8d48988d163941735", // Park
  "4bf58dd8d48988d1e7941735", // Plaza
  "4d4b7105d754a06374d81259", // Food (parent - restaurants, cafés)
  "4bf58dd8d48988d14e941735", // American Restaurant
  "4bf58dd8d48988d16c941735", // Burger Joint
  "52e81612bcbc57f1066b79f1", // Brewery
  "4bf58dd8d48988d155941735", // Gastropub
  "4bf58dd8d48988d1db931735", // Speakeasy
  "56aa371be4b08b9a8d573529", // Pub
];

// Keywords to EXCLUDE from results (post-filter safety)
const EXCLUDED_CATEGORY_KEYWORDS = [
  "doctor", "doctor's office", "médico", "consultório",
  "pharmacy", "farmácia", "drugstore", "drogaria",
  "store", "loja", "shop", "retail",
  "neighborhood", "bairro", "vizinhança",
  "hospital", "medical", "clinic", "clínica",
  "bank", "banco", "atm",
  "dentist", "dentista",
  "office", "escritório",
  "supermarket", "supermercado", "grocery", "mercado",
];

function isCategoryExcluded(categoryName: string): boolean {
  const lowerName = categoryName.toLowerCase();
  return EXCLUDED_CATEGORY_KEYWORDS.some(keyword => lowerName.includes(keyword));
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FOURSQUARE_API_KEY = Deno.env.get("FOURSQUARE_API_KEY");
    if (!FOURSQUARE_API_KEY) {
      throw new Error("FOURSQUARE_API_KEY not configured");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { 
      latitude, 
      longitude, 
      radius = 500, // Default to 500m for wider coverage
      limit = 20,   // Default to 20 results
      query,
      categories 
    }: SearchParams = await req.json();

    if (!latitude || !longitude) {
      return new Response(
        JSON.stringify({ error: "latitude and longitude are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[search-places] 📍 Received coordinates: lat=${latitude}, lng=${longitude}, radius=${radius}m, limit=${limit}`);

    let places: FoursquarePlace[] = [];
    let foursquareSuccess = false;

    // Build Foursquare API URL with category filters
    const fsqUrl = new URL("https://places-api.foursquare.com/places/search");
    fsqUrl.searchParams.set("ll", `${latitude},${longitude}`);
    fsqUrl.searchParams.set("radius", String(radius));
    fsqUrl.searchParams.set("limit", String(limit));
    fsqUrl.searchParams.set("sort", "distance"); // Always sort by distance
    
    // Apply category filter (use provided categories or default Katuu categories)
    const categoryFilter = categories || KATUU_CATEGORY_IDS.join(",");
    fsqUrl.searchParams.set("categories", categoryFilter);
    
    if (query) {
      fsqUrl.searchParams.set("query", query);
    }

    console.log(`[search-places] 🔍 Calling Foursquare API with categories filter`);
    
    try {
      const fsqResponse = await fetch(fsqUrl.toString(), {
        headers: {
          "Authorization": `Bearer ${FOURSQUARE_API_KEY}`,
          "Accept": "application/json",
          "Accept-Language": "pt-BR", // Request Portuguese (Brazil) names
          "X-Places-Api-Version": "2025-06-17",
        },
      });

      console.log(`[search-places] 📡 Foursquare response status: ${fsqResponse.status}`);

      if (!fsqResponse.ok) {
        const errorText = await fsqResponse.text();
        console.error(`[search-places] ❌ Foursquare API error: ${fsqResponse.status} - ${errorText}`);
      } else {
        const fsqData = await fsqResponse.json();
        const rawPlaces = fsqData.results || [];
        
        // Filter out excluded categories (safety net)
        places = rawPlaces.filter((place: FoursquarePlace) => {
          if (!place.categories?.length) return true;
          return !place.categories.some(cat => isCategoryExcluded(cat.name));
        });
        
        foursquareSuccess = true;
        console.log(`[search-places] ✅ Foursquare returned ${rawPlaces.length} places, ${places.length} after filtering`);
      }
    } catch (apiError) {
      console.error(`[search-places] ⚠️ Foursquare API call failed:`, apiError);
    }

    // Persist places to database if we got results
    if (foursquareSuccess && places.length > 0) {
      let persistedCount = 0;
      
      const upsertPromises = places.map(async (place) => {
        if (!place.fsq_place_id) {
          console.warn(`[search-places] ⚠️ Place missing fsq_place_id:`, place.name);
          return null;
        }

        const placeData = {
          provider: "foursquare",
          provider_id: place.fsq_place_id,
          nome: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
          endereco: place.location?.address || null,
          cidade: place.location?.locality || null,
          estado: place.location?.region || null,
          pais: place.location?.country || null,
          categoria: place.categories?.[0]?.name || null,
          dados_brutos: place,
          ativo: true,
          origem: "api",
          atualizado_em: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("places")
          .upsert(placeData, {
            onConflict: "provider,provider_id",
          });

        if (error) {
          console.error(`[search-places] ⚠️ Error upserting place ${place.fsq_place_id}:`, error.message);
        } else {
          persistedCount++;
        }

        return placeData;
      });

      await Promise.all(upsertPromises);
      console.log(`[search-places] 💾 Persisted ${persistedCount}/${places.length} places to database`);
    }

    // Return places from database (ensures consistent data format)
    // For better proximity results, query database with distance calculation
    const latDelta = (radius * 2) / 111000; // Convert radius to degrees
    const lngDelta = (radius * 2) / (111000 * Math.cos(latitude * Math.PI / 180));

    const { data: dbPlaces, error: dbError } = await supabase
      .from("places")
      .select("*")
      .eq("ativo", true)
      .eq("is_temporary", false) // Only return Foursquare places here
      .gte("latitude", latitude - latDelta)
      .lte("latitude", latitude + latDelta)
      .gte("longitude", longitude - lngDelta)
      .lte("longitude", longitude + lngDelta)
      .limit(limit);

    if (dbError) {
      console.error("[search-places] ❌ Database query error:", dbError);
      throw dbError;
    }

    // Calculate distance for each place and sort by distance
    const placesWithDistance = (dbPlaces || []).map(place => {
      const R = 6371000; // Earth radius in meters
      const dLat = (place.latitude - latitude) * Math.PI / 180;
      const dLon = (place.longitude - longitude) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(latitude * Math.PI / 180) * Math.cos(place.latitude * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      
      return { ...place, distance_meters: Math.round(distance) };
    }).sort((a, b) => a.distance_meters - b.distance_meters);

    console.log(`[search-places] 📤 Returning ${placesWithDistance.length} places from database (sorted by distance)`);

    return new Response(
      JSON.stringify({ 
        places: placesWithDistance,
        source: foursquareSuccess ? "foursquare" : "cache"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[search-places] ❌ Fatal error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
