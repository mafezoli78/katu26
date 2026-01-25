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

    console.log(`Searching places near ${latitude}, ${longitude} with radius ${radius}m`);

    // Build Foursquare API URL
    const fsqUrl = new URL("https://api.foursquare.com/v3/places/search");
    fsqUrl.searchParams.set("ll", `${latitude},${longitude}`);
    fsqUrl.searchParams.set("radius", String(radius));
    fsqUrl.searchParams.set("limit", "50");
    
    if (query) {
      fsqUrl.searchParams.set("query", query);
    }

    // Call Foursquare API
    const fsqResponse = await fetch(fsqUrl.toString(), {
      headers: {
        "Authorization": FOURSQUARE_API_KEY,
        "Accept": "application/json",
      },
    });

    if (!fsqResponse.ok) {
      const errorText = await fsqResponse.text();
      console.error("Foursquare API error:", errorText);
      throw new Error(`Foursquare API error: ${fsqResponse.status}`);
    }

    const fsqData = await fsqResponse.json();
    const places: FoursquarePlace[] = fsqData.results || [];

    console.log(`Found ${places.length} places from Foursquare`);

    // Transform and upsert places into database
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
        console.error(`Error upserting place ${place.fsq_id}:`, error);
      }

      return placeData;
    });

    await Promise.all(upsertPromises);

    // Return places from database (ensures consistent data format)
    const { data: dbPlaces, error: dbError } = await supabase
      .from("places")
      .select("*")
      .eq("ativo", true)
      .gte("latitude", latitude - 0.05)
      .lte("latitude", latitude + 0.05)
      .gte("longitude", longitude - 0.05)
      .lte("longitude", longitude + 0.05);

    if (dbError) {
      console.error("Database query error:", dbError);
      throw dbError;
    }

    console.log(`Returning ${dbPlaces?.length || 0} places from database`);

    return new Response(
      JSON.stringify({ places: dbPlaces }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Search places error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
