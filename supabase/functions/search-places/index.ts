import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Foursquare Places API response format
interface FoursquareCategory {
  fsq_category_id: string;
  name: string;
  short_name?: string;
}

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
  categories: FoursquareCategory[];
  distance?: number;
}

interface SearchParams {
  latitude: number;
  longitude: number;
  radius?: number;
  limit?: number;
  query?: string;
}

// =============================================================================
// CURADORIA DE CATEGORIAS KATUU
// =============================================================================
// Regra-mãe: O Katuu só exibe lugares onde é socialmente aceitável e esperado
// interagir com desconhecidos. Locais funcionais, de passagem, privados ou
// sensíveis devem ser excluídos.
// 
// Foursquare uses legacy hexadecimal category IDs (e.g., 4bf58dd8d48988d16a941735)
// This curadoria uses category NAMES for filtering since the hex IDs are not
// easily mappable to a hierarchy.
// =============================================================================

// -----------------------------------------------------------------------------
// ALLOWED CATEGORY PATTERNS (by name - case insensitive)
// -----------------------------------------------------------------------------

// Arts & Entertainment - Cultural and entertainment venues
const ARTS_ENTERTAINMENT_ALLOWED = [
  "arts and entertainment", // Parent category
  "movie theater", "cinema", "multiplex",
  "museum", "art museum", "history museum", "science museum",
  "theater", "teatro", "performing arts",
  "concert hall", "music venue", "live music venue", "jazz club", "rock club",
  "art gallery", "gallery",
  "comedy club", "stand up",
  "stadium", "arena",
  "amusement park", "theme park",
  "zoo", "aquarium",
  "cultural center", "centro cultural",
  "opera house", "ópera",
  "bowling alley", "bowling",
  "arcade", "game arcade",
  "planetarium",
  "casino",
  "escape room",
  "laser tag",
  "pool hall", "billiards",
];

// Events - Public events and festivals (all allowed)
const EVENTS_ALLOWED = [
  "festival", "music festival",
  "conference", "convention",
  "parade", "desfile",
  "fair", "feira",
  "outdoor event",
];

// Nightlife - Bars, clubs, lounges (core Katuu category)
const NIGHTLIFE_ALLOWED = [
  "bar", "pub", "irish pub",
  "cocktail bar", "cocktail lounge",
  "lounge", "whisky bar", "whiskey bar", "wine bar",
  "nightclub", "club", "boate", "balada",
  "karaoke", "karaoke bar",
  "jazz bar", "blues club",
  "beer bar", "beer garden", "cervejaria",
  "brewery", "brewpub",
  "speakeasy",
  "hotel bar", "rooftop bar", "pool bar",
  "gay bar", "lgbtq bar",
  "sports bar",
  "tiki bar",
  "dive bar",
];

// Dining - Restaurants with permanence (excludes fast food, takeaway)
const DINING_ALLOWED = [
  "restaurant", "restaurante",
  "steakhouse", "churrascaria", "brazilian steakhouse", "bbq", "bbq joint", "barbecue", "churrasquinho",
  "bistro", "bistrô",
  "gastropub", "gastro pub",
  "fine dining",
  "brasserie",
  "café", "cafe", "coffee shop", "cafeteria",
  "tea room", "tea house", "casa de chá",
  "winery", "vinícola", "wine tasting",
  "distillery", "destilaria",
  "trattoria",
  "tapas bar", "tapas restaurant",
  "sushi restaurant", "sushi bar", "japanese restaurant",
  "italian restaurant", "pizzeria",
  "mexican restaurant", "taqueria",
  "indian restaurant", "thai restaurant", "chinese restaurant",
  "korean restaurant", "korean bbq",
  "french restaurant", "mediterranean restaurant",
  "greek restaurant", "spanish restaurant",
  "american restaurant", "diner",
  "seafood restaurant", "fish restaurant",
  "vegetarian restaurant", "vegan restaurant",
  "brunch", "breakfast spot",
  "buffet", "buffet restaurant",
  "food hall",
];

// Outdoors - Parks, plazas, beaches (social public spaces)
const OUTDOORS_ALLOWED = [
  "park", "parque", "urban park", "national park", "state park",
  "plaza", "praça", "square", "town square",
  "beach", "praia",
  "botanical garden", "jardim botânico", "garden",
  "scenic lookout", "viewpoint", "mirante",
  "marina", "yacht club", "harbor",
  "waterfront", "pier", "boardwalk",
  "dog park",
  "playground",
  "recreation center",
];

// Education - Universities and colleges (main campus social areas)
const EDUCATION_ALLOWED = [
  "university", "universidade", "faculdade",
  "college", "campus",
  "student center", "centro acadêmico",
];

// Shopping - Only large social venues
const SHOPPING_ALLOWED = [
  "shopping mall", "mall", "shopping center", "shopping centre",
];

// Combine all allowed patterns
const ALL_ALLOWED_PATTERNS = [
  ...ARTS_ENTERTAINMENT_ALLOWED,
  ...EVENTS_ALLOWED,
  ...NIGHTLIFE_ALLOWED,
  ...DINING_ALLOWED,
  ...OUTDOORS_ALLOWED,
  ...EDUCATION_ALLOWED,
  ...SHOPPING_ALLOWED,
];

// -----------------------------------------------------------------------------
// EXCLUDED CATEGORY PATTERNS (always block, even if parent is allowed)
// -----------------------------------------------------------------------------

const ALWAYS_EXCLUDED = [
  // Fast food & Quick service
  "fast food", "fast-food", "fastfood",
  "food truck", "food stand", "food cart",
  "food court",
  "snack bar", "snack place", "lanchonete",
  "kiosk", "quiosque",
  "newsstand", "banca",
  
  // Bakeries & Sweets (quick consumption)
  "bakery", "padaria", "panificadora",
  "bagel shop", "bagel",
  "cupcake", "donut shop", "donuts",
  "dessert shop", "dessert", "sobremesa",
  "frozen yogurt", "froyo",
  "ice cream", "sorveteria", "gelato",
  "waffle", "crepe",
  "candy store", "candy shop", "doces",
  "chocolate shop",
  
  // Retail/Specialty (not dining)
  "deli", "delicatessen",
  "farmers market", "feira livre",
  "gourmet shop", "gourmet store",
  "grocery", "grocery store", "supermercado", "supermarket",
  "butcher", "açougue",
  "fish market", "peixaria",
  "cheese shop", "queijaria",
  "health food store", "organic store",
  "liquor store", "off licence", "wine shop",
  "market", "mercado",
  "convenience store", "conveniência",
  "juice bar", "juice shop", "smoothie",
  
  // Health & Medical
  "hospital", "clinic", "clínica",
  "doctor", "médico", "consultório",
  "dentist", "dentista",
  "pharmacy", "farmácia", "drogaria",
  "optician", "ótica",
  "laboratory", "laboratório",
  "medical center", "health center",
  "urgent care", "emergency room",
  "veterinary", "vet", "veterinário",
  
  // Government & Services
  "city hall", "prefeitura",
  "courthouse", "tribunal", "fórum",
  "police", "polícia", "delegacia",
  "fire station", "bombeiros",
  "post office", "correios",
  "embassy", "consulate", "consulado",
  "government", "governo",
  "dmv", "detran",
  
  // Religion
  "church", "igreja",
  "mosque", "mesquita",
  "synagogue", "sinagoga",
  "temple", "templo",
  "cathedral", "catedral",
  "chapel", "capela",
  "religious", "spiritual center",
  
  // Schools (not university)
  "elementary school", "escola",
  "high school", "colégio",
  "middle school",
  "preschool", "daycare", "creche",
  "kindergarten",
  "school", // generic school
  
  // Residential & Private
  "residential", "residencial",
  "apartment", "apartamento",
  "home", "house", "casa",
  "building", "prédio", "edifício",
  "condo", "condomínio",
  "assisted living", "nursing home",
  "funeral", "funerária", "cemitério", "cemetery",
  
  // Transport & Infrastructure
  "bus stop", "ponto de ônibus",
  "train station", "estação",
  "subway", "metrô", "metro station",
  "airport", "aeroporto",
  "bus station", "rodoviária",
  "taxi stand", "ponto de táxi",
  "gas station", "posto de gasolina", "fuel",
  "parking", "estacionamento",
  "toll", "pedágio",
  "bridge", "ponte",
  "tunnel", "túnel",
  "highway", "rodovia",
  
  // Business & Services
  "bank", "banco", "atm", "caixa eletrônico",
  "office", "escritório",
  "coworking", "co-working",
  "laundry", "lavanderia", "dry clean",
  "car wash", "lava jato", "lava rápido",
  "auto repair", "oficina", "mechanic", "mecânico",
  "insurance", "seguro",
  "real estate", "imobiliária",
  "lawyer", "advogado", "law firm",
  "accountant", "contador",
  "storage", "self storage",
  "printing", "gráfica",
  
  // Retail (non-social)
  "store", "loja", "shop",
  "clothing store", "roupa",
  "shoe store", "sapataria",
  "jewelry", "joalheria",
  "electronics", "eletrônicos",
  "hardware", "ferragem",
  "furniture", "móveis",
  "pet shop", "pet store",
  "florist", "floricultura",
  "bookstore", "livraria",
  "toy store", "brinquedos",
  "sporting goods", "esportes",
  "beauty salon", "salão", "hair salon", "cabeleireiro",
  "spa", "nail salon",
  "gym", "academia", "fitness", "crossfit",
  "yoga studio", "pilates",
  
  // Generic/Transit locations
  "neighborhood", "bairro", "vizinhança",
  "city", "cidade",
  "street", "rua",
  "intersection", "cruzamento",
  "trail", "trilha",
  "forest", "floresta",
  "lake", "lago",
  "river", "rio",
  "mountain", "montanha",
  "camping", "campground", "campsite",
  "public art", "arte pública",
  "monument", "monumento",
  "memorial",
  "historic site", "patrimônio histórico",
  "landmark",
  
  // Hotels (sleeping, not social)
  "hotel", "motel", "hostel", "pousada", "inn",
  "bed and breakfast", "airbnb",
  
  // Library
  "library", "biblioteca",
];

// -----------------------------------------------------------------------------
// FILTERING LOGIC
// -----------------------------------------------------------------------------

function normalizeText(text: string): string {
  return text.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Remove accents
}

function matchesPattern(text: string, patterns: string[]): boolean {
  const normalized = normalizeText(text);
  return patterns.some(pattern => normalized.includes(normalizeText(pattern)));
}

function shouldIncludePlace(place: FoursquarePlace): boolean {
  if (!place.categories || place.categories.length === 0) {
    return false;
  }
  
  // Check all categories of the place
  for (const category of place.categories) {
    const categoryName = category.name || "";
    
    // First check exclusions - if ANY category is excluded, reject the place
    if (matchesPattern(categoryName, ALWAYS_EXCLUDED)) {
      return false;
    }
  }
  
  // Check if primary category matches allowed patterns
  const primaryCategory = place.categories[0].name || "";
  return matchesPattern(primaryCategory, ALL_ALLOWED_PATTERNS);
}

// -----------------------------------------------------------------------------
// MAIN HANDLER
// -----------------------------------------------------------------------------

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
      radius = 100,
      limit = 20,
      query,
    }: SearchParams = await req.json();

    if (!latitude || !longitude) {
      return new Response(
        JSON.stringify({ error: "latitude and longitude are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[search-places] 📍 Searching: lat=${latitude}, lng=${longitude}, radius=${radius}m`);

    let places: FoursquarePlace[] = [];
    let foursquareSuccess = false;

    // Build Foursquare API URL - request more places to account for filtering
    const fsqUrl = new URL("https://places-api.foursquare.com/places/search");
    fsqUrl.searchParams.set("ll", `${latitude},${longitude}`);
    fsqUrl.searchParams.set("radius", String(radius));
    fsqUrl.searchParams.set("limit", String(Math.min(limit * 3, 50))); // Request 3x to account for filtering
    fsqUrl.searchParams.set("sort", "distance");
    
    if (query) {
      fsqUrl.searchParams.set("query", query);
    }

    console.log(`[search-places] 🔍 Calling Foursquare API`);
    
    try {
      const fsqResponse = await fetch(fsqUrl.toString(), {
        headers: {
          "Authorization": `Bearer ${FOURSQUARE_API_KEY}`,
          "Accept": "application/json",
          "X-Places-Api-Version": "2025-06-17",
        },
      });

      console.log(`[search-places] 📡 Foursquare response: ${fsqResponse.status}`);

      if (!fsqResponse.ok) {
        const errorText = await fsqResponse.text();
        console.error(`[search-places] ❌ Foursquare error: ${fsqResponse.status} - ${errorText}`);
      } else {
        const fsqData = await fsqResponse.json();
        const rawPlaces = fsqData.results || [];
        
        // Apply category-based filtering using name patterns
        places = rawPlaces.filter((place: FoursquarePlace) => shouldIncludePlace(place));
        
        foursquareSuccess = true;
        console.log(`[search-places] ✅ Foursquare: ${rawPlaces.length} raw → ${places.length} after curadoria`);
        
        // Log what was filtered for debugging
        const filtered = rawPlaces.filter((p: FoursquarePlace) => !shouldIncludePlace(p));
        if (filtered.length > 0) {
          console.log(`[search-places] 🚫 Filtered: ${filtered.slice(0, 5).map((p: FoursquarePlace) => 
            `${p.name} (${p.categories?.[0]?.name || 'no-cat'})`
          ).join(', ')}${filtered.length > 5 ? ` +${filtered.length - 5} more` : ''}`);
        }
        
        // Log what was included for debugging
        if (places.length > 0) {
          console.log(`[search-places] ✅ Included: ${places.slice(0, 5).map((p: FoursquarePlace) => 
            `${p.name} (${p.categories?.[0]?.name || 'no-cat'})`
          ).join(', ')}${places.length > 5 ? ` +${places.length - 5} more` : ''}`);
        }
      }
    } catch (apiError) {
      console.error(`[search-places] ⚠️ Foursquare API failed:`, apiError);
    }

    // Persist places to database if we got results
    if (foursquareSuccess && places.length > 0) {
      let persistedCount = 0;
      
      const upsertPromises = places.map(async (place) => {
        if (!place.fsq_place_id) {
          console.warn(`[search-places] ⚠️ Missing fsq_place_id:`, place.name);
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
          console.error(`[search-places] ⚠️ Upsert error ${place.fsq_place_id}:`, error.message);
        } else {
          persistedCount++;
        }

        return placeData;
      });

      await Promise.all(upsertPromises);
      console.log(`[search-places] 💾 Persisted ${persistedCount}/${places.length} places`);
    }

    // Return places from database with distance and active user count
    const latDelta = (radius * 2) / 111000;
    const lngDelta = (radius * 2) / (111000 * Math.cos(latitude * Math.PI / 180));

    const { data: dbPlaces, error: dbError } = await supabase
      .from("places")
      .select("*")
      .eq("ativo", true)
      .eq("is_temporary", false)
      .gte("latitude", latitude - latDelta)
      .lte("latitude", latitude + latDelta)
      .gte("longitude", longitude - lngDelta)
      .lte("longitude", longitude + lngDelta)
      .limit(limit);

    if (dbError) {
      console.error("[search-places] ❌ DB error:", dbError);
      throw dbError;
    }

    // Filter database results using the same curadoria logic
    const filteredDbPlaces = (dbPlaces || []).filter(place => {
      // If dados_brutos has categories, use the same filter
      const rawData = place.dados_brutos as FoursquarePlace | null;
      if (rawData && rawData.categories && rawData.categories.length > 0) {
        return shouldIncludePlace(rawData);
      }
      // If no raw data, check categoria field against allowed patterns
      if (place.categoria) {
        return matchesPattern(place.categoria, ALL_ALLOWED_PATTERNS) && 
               !matchesPattern(place.categoria, ALWAYS_EXCLUDED);
      }
      return false;
    });

    // Calculate distance and fetch active user count
    const placesWithDistancePromises = filteredDbPlaces.map(async (place) => {
      const R = 6371000;
      const dLat = (place.latitude - latitude) * Math.PI / 180;
      const dLon = (place.longitude - longitude) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(latitude * Math.PI / 180) * Math.cos(place.latitude * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      
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

    console.log(`[search-places] 📤 Returning ${placesWithDistance.length} places (from ${dbPlaces?.length || 0} in DB)`);

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
