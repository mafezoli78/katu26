import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FoursquarePlace {
  fsq_id: string;
  name: string;
  geocodes: {
    main: {
      latitude: number;
      longitude: number;
    };
  };
  location: {
    address?: string;
    locality?: string;
    region?: string;
    country?: string;
  };
  categories: Array<{
    id: number;
    name: string;
  }>;
}

interface SearchParams {
  latitude: number;
  longitude: number;
  radius?: number;
  query?: string;
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

    const { latitude, longitude, radius = 1000, query }: SearchParams = await req.json();

    if (!latitude || !longitude) {
      return new Response(
        JSON.stringify({ error: "latitude and longitude are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[search-places] 📍 Received coordinates: lat=${latitude}, lng=${longitude}, radius=${radius}m`);

    // Build Foursquare API URL
    const fsqUrl = new URL("https://api.foursquare.com/v3/places/search");
    fsqUrl.searchParams.set("ll", `${latitude},${longitude}`);
    fsqUrl.searchParams.set("radius", String(radius));
    fsqUrl.searchParams.set("limit", "50");
    
    if (query) {
      fsqUrl.searchParams.set("query", query);
    }

    let places: FoursquarePlace[] = [];
    let foursquareSuccess = false;

    try {
      // Call Foursquare API
      // Foursquare API v3 expects the API key in the Authorization header
      // Format varies: some keys work with just the key, others need no prefix
      console.log(`[search-places] 🔍 Calling Foursquare API...`);
      const keyPrefix = FOURSQUARE_API_KEY.substring(0, 4);
      console.log(`[search-places] 🔑 API Key prefix: ${keyPrefix}`);
      
      // If key doesn't start with 'fsq3', it might be a legacy key format
      // Foursquare Places API v3 uses API keys directly in Authorization header
      const authHeader = FOURSQUARE_API_KEY.startsWith('fsq') ? FOURSQUARE_API_KEY : FOURSQUARE_API_KEY;
      
      console.log(`[search-places] 📡 Request URL: ${fsqUrl.toString()}`);
      
      const fsqResponse = await fetch(fsqUrl.toString(), {
        headers: {
          "Authorization": authHeader,
          "Accept": "application/json",
        },
      });

      if (!fsqResponse.ok) {
        const errorText = await fsqResponse.text();
        console.error("[search-places] ❌ Foursquare API error:", fsqResponse.status, errorText);
        throw new Error(`Foursquare API error: ${fsqResponse.status}`);
      }

      const fsqData = await fsqResponse.json();
      places = fsqData.results || [];
      foursquareSuccess = true;

      console.log(`[search-places] ✅ Foursquare returned ${places.length} places`);

      // Transform and upsert places into database
      let persistedCount = 0;
      const upsertPromises = places.map(async (place) => {
        const placeData = {
          provider: "foursquare",
          provider_id: place.fsq_id,
          nome: place.name,
          latitude: place.geocodes?.main?.latitude,
          longitude: place.geocodes?.main?.longitude,
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
          console.error(`[search-places] ⚠️ Error upserting place ${place.fsq_id}:`, error.message);
        } else {
          persistedCount++;
        }

        return placeData;
      });

      await Promise.all(upsertPromises);
      console.log(`[search-places] 💾 Persisted ${persistedCount}/${places.length} places to database`);

    } catch (fsqError) {
      console.error("[search-places] ⚠️ Foursquare fetch failed, falling back to cached data:", fsqError);
      // Continue to return cached data
    }

    // Return places from database (ensures consistent data format)
    // Use a bounding box for the query
    const latDelta = 0.05; // ~5km
    const lngDelta = 0.05;

    const { data: dbPlaces, error: dbError } = await supabase
      .from("places")
      .select("*")
      .eq("ativo", true)
      .gte("latitude", latitude - latDelta)
      .lte("latitude", latitude + latDelta)
      .gte("longitude", longitude - lngDelta)
      .lte("longitude", longitude + lngDelta);

    if (dbError) {
      console.error("[search-places] ❌ Database query error:", dbError);
      throw dbError;
    }

    console.log(`[search-places] 📤 Returning ${dbPlaces?.length || 0} places from database (Foursquare success: ${foursquareSuccess})`);

    return new Response(
      JSON.stringify({ 
        places: dbPlaces,
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
