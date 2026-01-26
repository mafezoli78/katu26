import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Support both old (fsq_id) and new (fsq_place_id) API response formats
interface FoursquarePlace {
  fsq_id?: string;
  fsq_place_id?: string;
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

    let places: FoursquarePlace[] = [];
    let foursquareSuccess = false;

    // Try new endpoint first, fallback to legacy endpoint
    const endpoints: Array<{
      name: string;
      url: string;
      headers: Record<string, string>;
    }> = [
      {
        name: "new",
        url: "https://places-api.foursquare.com/places/search",
        headers: {
          "Authorization": `Bearer ${FOURSQUARE_API_KEY}`,
          "Accept": "application/json",
          "X-Places-Api-Version": "2025-06-17",
        }
      },
      {
        name: "legacy",
        url: "https://api.foursquare.com/v3/places/search",
        headers: {
          "Authorization": FOURSQUARE_API_KEY,
          "Accept": "application/json",
        }
      }
    ];

    for (const endpoint of endpoints) {
      try {
        const fsqUrl = new URL(endpoint.url);
        fsqUrl.searchParams.set("ll", `${latitude},${longitude}`);
        fsqUrl.searchParams.set("radius", String(radius));
        fsqUrl.searchParams.set("limit", "50");
        
        if (query) {
          fsqUrl.searchParams.set("query", query);
        }

        console.log(`[search-places] 🔍 Trying ${endpoint.name} endpoint: ${fsqUrl.toString()}`);
        
        const fsqResponse = await fetch(fsqUrl.toString(), {
          headers: endpoint.headers,
        });

        if (!fsqResponse.ok) {
          const errorText = await fsqResponse.text();
          console.error(`[search-places] ❌ ${endpoint.name} endpoint error:`, fsqResponse.status, errorText);
          continue; // Try next endpoint
        }

        const fsqData = await fsqResponse.json();
        places = fsqData.results || [];
        foursquareSuccess = true;

        console.log(`[search-places] ✅ ${endpoint.name} endpoint returned ${places.length} places`);
        break; // Success, stop trying endpoints

      } catch (endpointError) {
        console.error(`[search-places] ⚠️ ${endpoint.name} endpoint failed:`, endpointError);
        continue;
      }
    }

    if (foursquareSuccess && places.length > 0) {
      // Transform and upsert places into database
      let persistedCount = 0;
      const upsertPromises = places.map(async (place) => {
        // Support both old and new ID field names
        const placeId = place.fsq_place_id || place.fsq_id;
        if (!placeId) {
          console.warn(`[search-places] ⚠️ Place missing ID:`, place.name);
          return null;
        }

        const placeData = {
          provider: "foursquare",
          provider_id: placeId,
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
          console.error(`[search-places] ⚠️ Error upserting place ${placeId}:`, error.message);
        } else {
          persistedCount++;
        }

        return placeData;
      });

      await Promise.all(upsertPromises);
      console.log(`[search-places] 💾 Persisted ${persistedCount}/${places.length} places to database`);
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
