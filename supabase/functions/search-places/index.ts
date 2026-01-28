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

// Foursquare category IDs for Katuu-compatible places (social venues with traffic potential)
// Reference: https://docs.foursquare.com/data-products/docs/categories
const KATUU_CATEGORY_IDS = [
  // Nightlife (high social flow)
  "13003", // Bar
  "13009", // Cocktail Bar
  "13017", // Lounge
  "13032", // Nightclub
  "13029", // Music Venue
  "13035", // Pub
  "13005", // Beer Bar
  "13006", // Beer Garden
  "13038", // Wine Bar
  
  // Dining (medium-large venues only filtered by scale keywords)
  "13065", // Restaurant
  "13034", // Pizzeria
  "13031", // Café, Coffee, and Tea House
  "13145", // Coffee Shop
  "13002", // Bakery (larger ones)
  "13039", // Steakhouse
  "13050", // Japanese Restaurant
  "13064", // Italian Restaurant
  "13046", // Brazilian Restaurant
  "13047", // Brewery
  "13058", // Gastropub
  
  // Shopping & Entertainment (high traffic)
  "17114", // Shopping Mall
  "17069", // Mall
  "17000", // Retail (parent - for shopping centers)
  "10000", // Arts and Entertainment (parent category)
  "10001", // Arcade
  "10002", // Art Gallery
  "10024", // Concert Hall
  "10027", // Cultural Center
  "10032", // Live Music Venue
  "10039", // Movie Theater
  "10041", // Museum
  "10049", // Performing Arts Venue
  "10056", // Theater
  "10004", // Bowling Alley
  "10005", // Casino
  "10043", // Amusement Park
  
  // Outdoors & Recreation (large public spaces)
  "16032", // Park
  "16020", // Garden
  "16019", // Plaza
  "16051", // Beach
  "16026", // Harbor / Marina
  
  // Sports & Fitness (social venues)
  "18021", // Gym / Fitness Center
  "18075", // Yoga Studio
  "18000", // Sports and Recreation (parent)
  "18008", // Stadium
  "18050", // Sports Club
  
  // Education & Work (high concentration venues)
  "12058", // University
  "12013", // College
  "11046", // Coworking Space
  "11035", // Convention Center
  "11039", // Event Space
  
  // Hotels & Venues (social areas)
  "19014", // Hotel
  "19009", // Hotel Bar
  "19025", // Rooftop Bar
];

// Categories to explicitly EXCLUDE (safety check - even if returned by API)
const EXCLUDED_CATEGORY_KEYWORDS = [
  // Medical
  "pharmacy", "farmácia", "drogaria",
  "hospital", "medical", "clinic", "clínica",
  "doctor", "médico", "dentist", "dentista",
  "optician", "ótica", "laboratory", "laboratório",
  
  // Services & Utilities
  "bank", "banco", "atm", "caixa eletrônico",
  "gas station", "posto de gasolina", "fuel",
  "laundry", "lavanderia", "dry clean",
  "car wash", "lava jato", "lava rápido",
  "auto repair", "oficina", "mechanic", "mecânico",
  "insurance", "seguro", "seguros",
  "post office", "correios",
  "police", "polícia", "fire station", "bombeiros",
  
  // Retail (small scale / non-social)
  "supermarket", "supermercado", "grocery", "mercearia",
  "hardware", "ferragem", "ferramenta",
  "convenience", "conveniência",
  "pet shop", "pet store",
  "electronics store", "loja de eletrônicos",
  "clothing store", "loja de roupa", // small retail
  "shoe store", "sapataria",
  "jewelry", "joalheria",
  "florist", "floricultura",
  "butcher", "açougue",
  "fish market", "peixaria",
  
  // Residential & Generic
  "neighborhood", "bairro", "vizinhança",
  "residential", "residencial",
  "apartment", "apartamento",
  "office", "escritório", // generic offices (not coworking)
  "building", "prédio", "edifício",
  
  // Religious (private)
  "church", "igreja", "temple", "templo", "mosque", "mesquita",
];

// Keywords that indicate small-scale venues (low social flow potential)
const SMALL_SCALE_KEYWORDS = [
  "kiosk", "quiosque",
  "stand", "barraca",
  "cart", "carrinho",
  "trailer",
  "food truck", // too small
  "lanchonete", "snack bar", // usually very small
  "banca", "newsstand",
  "booth",
  "stall",
];

function isCategoryExcluded(categoryName: string): boolean {
  const lowerName = categoryName.toLowerCase();
  return EXCLUDED_CATEGORY_KEYWORDS.some(keyword => lowerName.includes(keyword));
}

function isSmallScaleVenue(place: FoursquarePlace): boolean {
  const name = place.name.toLowerCase();
  const category = place.categories?.[0]?.name?.toLowerCase() || '';
  
  // Check name and category against small scale keywords
  return SMALL_SCALE_KEYWORDS.some(keyword => 
    name.includes(keyword) || category.includes(keyword)
  );
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
      radius = 100, // Default to 100m for initial search
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
        
        // Filter out excluded categories AND small-scale venues
        places = rawPlaces.filter((place: FoursquarePlace) => {
          // Exclude by category keywords
          if (place.categories?.length) {
            if (place.categories.some(cat => isCategoryExcluded(cat.name))) {
              return false;
            }
          }
          // Exclude small-scale venues
          if (isSmallScaleVenue(place)) {
            return false;
          }
          return true;
        });
        
        foursquareSuccess = true;
        console.log(`[search-places] ✅ Foursquare returned ${rawPlaces.length} places, ${places.length} after category+scale filtering`);
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

    // Calculate distance and fetch active user count for each place
    const placesWithDistancePromises = (dbPlaces || []).map(async (place) => {
      const R = 6371000; // Earth radius in meters
      const dLat = (place.latitude - latitude) * Math.PI / 180;
      const dLon = (place.longitude - longitude) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(latitude * Math.PI / 180) * Math.cos(place.latitude * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      
      // Fetch active presence count for this place
      const { count } = await supabase
        .from("presence")
        .select("*", { count: "exact", head: true })
        .eq("place_id", place.id)
        .eq("ativo", true);
      
      return { 
        ...place, 
        distance_meters: Math.round(distance),
        active_users: count || 0
      };
    });
    
    const placesWithDistance = (await Promise.all(placesWithDistancePromises))
      .sort((a, b) => a.distance_meters - b.distance_meters);

    console.log(`[search-places] 📤 Returning ${placesWithDistance.length} places from database (with active_users count)`);

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
