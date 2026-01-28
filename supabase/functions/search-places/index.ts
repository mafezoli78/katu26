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
// CURADORIA DE CATEGORIAS KATUU - BASEADA EXCLUSIVAMENTE EM fsq_category_id
// =============================================================================
// Regra-mãe: O Katuu só exibe lugares onde é socialmente aceitável e esperado
// interagir com desconhecidos. 
// 
// IMPORTANTE: Toda decisão de inclusão/exclusão é feita EXCLUSIVAMENTE por
// fsq_category_id. Nenhum texto, nome ou heurística é utilizado.
//
// Foursquare category IDs reference:
// https://docs.foursquare.com/data-products/docs/categories
// =============================================================================

// -----------------------------------------------------------------------------
// ALLOWED CATEGORY IDS (fsq_category_id)
// Um local é incluído se possuir ao menos um ID nesta lista
// -----------------------------------------------------------------------------

const ALLOWED_CATEGORY_IDS = new Set([
  // ===== NIGHTLIFE =====
  "13003", // Bar
  "13009", // Beer Bar
  "13010", // Beer Garden
  "13014", // Brewery
  "13017", // Champagne Bar
  "13018", // Cocktail Bar
  "13019", // Dive Bar
  "13021", // Hookah Bar
  "13022", // Hotel Bar
  "13024", // Karaoke Bar
  "13025", // Lounge
  "13026", // Night Market
  "13027", // Nightclub
  "13028", // Other Nightlife
  "13029", // Pub
  "13031", // Sake Bar
  "13032", // Speakeasy
  "13033", // Sports Bar
  "13034", // Tiki Bar
  "13035", // Whisky Bar
  "13036", // Wine Bar
  "13037", // Piano Bar
  "13038", // Pool Hall
  "13039", // Rooftop Bar
  
  // ===== DINING (with permanence) =====
  "13065", // Restaurant (generic)
  "13002", // Afghan Restaurant
  "13004", // African Restaurant
  "13005", // American Restaurant
  "13007", // Arepa Restaurant
  "13011", // Australian Restaurant
  "13015", // Austrian Restaurant
  "13023", // BBQ Joint / Churrascaria
  "13040", // Bistro
  "13041", // Brasserie
  "13042", // Brazilian Restaurant
  "13044", // British Restaurant
  "13046", // Cajun / Creole Restaurant
  "13047", // Caribbean Restaurant
  "13048", // Chinese Restaurant
  "13049", // Colombian Restaurant
  "13050", // Cuban Restaurant
  "13051", // Czech Restaurant
  "13052", // Diner
  "13053", // Dim Sum Restaurant
  "13054", // Ethiopian Restaurant
  "13055", // Filipino Restaurant
  "13056", // Fondue Restaurant
  "13057", // French Restaurant
  "13058", // Gastropub
  "13059", // German Restaurant
  "13061", // Greek Restaurant
  "13062", // Hawaiian Restaurant
  "13064", // Indian Restaurant
  "13066", // Indonesian Restaurant
  "13067", // Irish Restaurant
  "13068", // Israeli Restaurant
  "13069", // Italian Restaurant
  "13070", // Japanese Restaurant
  "13071", // Korean Restaurant
  "13072", // Latin American Restaurant
  "13073", // Lebanese Restaurant
  "13074", // Malaysian Restaurant
  "13075", // Mediterranean Restaurant
  "13076", // Mexican Restaurant
  "13077", // Middle Eastern Restaurant
  "13078", // Modern European Restaurant
  "13079", // Molecular Gastronomy Restaurant
  "13080", // Mongolian Restaurant
  "13081", // Moroccan Restaurant
  "13082", // New American Restaurant
  "13083", // Pakistani Restaurant
  "13084", // Peruvian Restaurant
  "13085", // Pizza Place
  "13086", // Polish Restaurant
  "13087", // Portuguese Restaurant
  "13088", // Russian Restaurant
  "13089", // Scandinavian Restaurant
  "13090", // Seafood Restaurant
  "13091", // Singaporean Restaurant
  "13092", // South American Restaurant
  "13093", // Southern / Soul Food Restaurant
  "13094", // Spanish Restaurant
  "13095", // Sri Lankan Restaurant
  "13096", // Steakhouse
  "13097", // Sushi Restaurant
  "13098", // Swiss Restaurant
  "13099", // Syrian Restaurant
  "13100", // Taiwanese Restaurant
  "13101", // Tapas Restaurant
  "13102", // Thai Restaurant
  "13103", // Tibetan Restaurant
  "13104", // Turkish Restaurant
  "13105", // Ukrainian Restaurant
  "13106", // Venezuelan Restaurant
  "13107", // Vietnamese Restaurant
  "13199", // Buffet
  "13236", // Ramen Restaurant
  "13237", // Udon Restaurant
  "13263", // Fine Dining Restaurant
  "13272", // Wine Bar Restaurant
  "13302", // Izakaya
  "13303", // Japanese Curry Restaurant
  "13338", // Tonkatsu Restaurant
  "13339", // Yakitori Restaurant
  "13377", // Trattoria
  "13383", // Teppanyaki Restaurant

  // ===== CAFÉS & COFFEE =====
  "13032", // Coffee Shop
  "13034", // Café
  "13035", // Tea Room
  "13063", // Coffeehouse

  // ===== ARTS & ENTERTAINMENT =====
  "10000", // Arts and Entertainment (parent)
  "10001", // Amphitheater
  "10002", // Aquarium
  "10003", // Arcade
  "10004", // Art Gallery
  "10005", // Bowling Alley
  "10006", // Casino
  "10007", // Circus
  "10008", // Comedy Club
  "10009", // Concert Hall
  "10010", // Country Dance Club
  "10011", // Cultural Center
  "10012", // Disc Golf Course
  "10013", // Drive-in Movie Theater
  "10014", // Escape Room
  "10015", // General Entertainment
  "10016", // Go Kart Track
  "10017", // Haunted House
  "10018", // Karaoke Box
  "10019", // Laser Tag
  "10020", // Mini Golf
  "10021", // Movie Theater
  "10022", // Museum
  "10023", // Music Festival
  "10024", // Music Venue
  "10025", // Opera House
  "10026", // Outdoor Sculpture
  "10027", // Performing Arts Venue
  "10028", // Planetarium
  "10029", // Pool Hall
  "10030", // Public Art
  "10031", // Racetrack
  "10032", // Rock Climbing Spot
  "10033", // Roller Rink
  "10034", // Salsa Club
  "10035", // Shooting Range
  "10036", // Samba School
  "10037", // Stadium
  "10038", // Strip Club
  "10039", // Theme Park
  "10040", // Theater
  "10041", // Water Park
  "10042", // Zoo
  "10043", // Art Museum
  "10044", // History Museum
  "10045", // Science Museum
  "10046", // Children's Museum
  "10047", // Wax Museum
  "10048", // Natural History Museum

  // ===== EVENTS =====
  "14000", // Event (parent)
  "14001", // Christmas Market
  "14002", // Conference
  "14003", // Convention
  "14004", // Festival
  "14005", // Music Festival
  "14006", // Parade
  "14007", // Stoop Sale
  "14008", // Street Fair
  "14009", // Trade Fair
  
  // ===== OUTDOORS & RECREATION (social public spaces) =====
  "16000", // Outdoors and Recreation (parent)
  "16001", // Athletic Field
  "16002", // Baseball Field
  "16003", // Basketball Court
  "16004", // Bay
  "16005", // Beach
  "16006", // Bike Trail
  "16007", // Boardwalk
  "16008", // Botanical Garden
  "16009", // Bridge
  "16010", // Canal
  "16011", // Castle
  "16012", // Cave
  "16014", // Dog Park
  "16015", // Farm
  "16017", // Garden
  "16018", // Golf Course
  "16019", // Harbor / Marina
  "16020", // Hot Spring
  "16021", // Island
  "16024", // Lake
  "16025", // Lighthouse
  "16027", // Monument / Landmark
  "16028", // Mountain
  "16029", // National Park
  "16030", // Nature Preserve
  "16032", // Park
  "16033", // Pedestrian Plaza
  "16034", // Pier
  "16035", // Playground
  "16036", // Plaza
  "16037", // Pool
  "16038", // Recreation Center
  "16039", // Reservoir
  "16040", // River
  "16041", // Rock
  "16042", // Roof Deck
  "16043", // Scenic Lookout
  "16044", // Sculpture Garden
  "16045", // Skate Park
  "16046", // Skating Rink
  "16047", // Ski Area
  "16048", // Ski Chairlift
  "16049", // Ski Chalet
  "16050", // Ski Lodge
  "16051", // Soccer Field
  "16052", // Spiritual Center
  "16053", // State / Provincial Park
  "16054", // Summer Camp
  "16055", // Tennis Court
  "16056", // Track
  "16057", // Volleyball Court
  "16058", // Waterfall
  "16059", // Waterfront
  "16060", // Well
  "16061", // Windmill
  "16062", // Winery
  "16063", // Town Square

  // ===== COLLEGE & UNIVERSITY =====
  "12056", // College & University (parent)
  "12057", // College Academic Building
  "12058", // College Administrative Building
  "12059", // College Arts Building
  "12060", // College Auditorium
  "12061", // College Bookstore
  "12062", // College Cafeteria
  "12063", // College Communications Building
  "12064", // College Engineering Building
  "12065", // College Gym
  "12066", // College History Building
  "12067", // College Lab
  "12068", // College Library
  "12069", // College Math Building
  "12070", // College Quad
  "12071", // College Rec Center
  "12072", // College Residence Hall
  "12073", // College Science Building
  "12074", // College Stadium
  "12075", // College Technology Building
  "12076", // College Theater
  "12077", // Student Center
  "12078", // University
  "12079", // Community College
  "12080", // Fraternity House
  "12081", // Sorority House
  "12082", // Law School
  "12083", // Medical School
  "12084", // Trade School

  // ===== SHOPPING MALLS =====
  "17069", // Mall
  "17114", // Shopping Mall
  "17115", // Shopping Plaza
  "17116", // Outlet Mall
  "17117", // Strip Mall

  // ===== COWORKING & WORKSPACES =====
  "11049", // Coworking Space
]);

// -----------------------------------------------------------------------------
// EXCLUDED CATEGORY IDS (fsq_category_id)
// Um local é excluído se possuir qualquer ID nesta lista, mesmo que tenha permitido
// -----------------------------------------------------------------------------

const EXCLUDED_CATEGORY_IDS = new Set([
  // ===== HEALTH & MEDICAL =====
  "15000", // Health and Medicine (parent)
  "15001", // Acupuncturist
  "15002", // Alternative Healer
  "15003", // Chiropractor
  "15004", // Counseling and Mental Health
  "15005", // Dentist
  "15006", // Doctor
  "15007", // Emergency Room
  "15008", // Eye Doctor
  "15009", // First Aid Station
  "15010", // Hospital
  "15011", // Laboratory
  "15012", // Medical Center
  "15013", // Mental Health Office
  "15014", // Nutritionist
  "15015", // OB-GYN
  "15016", // Optometrist
  "15017", // Orthopedist
  "15018", // Pharmacy
  "15019", // Physical Therapist
  "15020", // Psychologist
  "15021", // Rehabilitation Center
  "15022", // Spa
  "15023", // Urgent Care Center
  "15024", // Veterinarian
  "15025", // Weight Loss Center
  "15026", // Dermatologist
  "15027", // Gastroenterologist
  "15028", // Cardiologist
  "15029", // Pediatrician
  "15030", // Podiatrist
  "15031", // Urologist

  // ===== FAST FOOD & QUICK SERVICE =====
  "13145", // Fast Food Restaurant
  "13146", // Hot Dog Joint
  "13147", // Ice Cream Shop
  "13148", // Juice Bar
  "13149", // Smoothie Shop
  "13150", // Bagel Shop
  "13151", // Bakery
  "13152", // Candy Store
  "13153", // Cheese Shop
  "13154", // Chocolate Shop
  "13155", // Cupcake Shop
  "13156", // Deli
  "13157", // Dessert Shop
  "13158", // Donut Shop
  "13159", // Dumpling Restaurant
  "13160", // Empanada Restaurant
  "13161", // Falafel Restaurant
  "13162", // Food Court
  "13163", // Food Truck
  "13164", // Fried Chicken Joint
  "13165", // Frozen Yogurt Shop
  "13166", // Gluten-Free Restaurant
  "13167", // Gourmet Shop
  "13168", // Halal Restaurant
  "13169", // Health Food Store
  "13170", // Hot Pot Restaurant
  "13171", // Kosher Restaurant
  "13172", // Noodle House
  "13173", // Salad Place
  "13174", // Sandwich Place
  "13175", // Snack Place
  "13176", // Soup Place
  "13177", // Vegetarian / Vegan Restaurant
  "13178", // Wing Joint
  "13179", // Wok Restaurant
  "13180", // Wrap Joint
  "13383", // Food Stand
  "13384", // Kiosk
  "13385", // Street Food Gathering

  // ===== RETAIL & STORES =====
  "17000", // Retail (parent)
  "17001", // Antique Shop
  "17002", // Arts and Crafts Store
  "17003", // Astrologer
  "17004", // Baby Store
  "17005", // Bath House
  "17006", // Beauty Store
  "17007", // Bed and Bath Store
  "17008", // Big Box Store
  "17009", // Bike Shop
  "17010", // Board Shop
  "17011", // Book Store
  "17012", // Bridal Shop
  "17013", // Camera Store
  "17014", // Candy Store
  "17015", // Car Parts and Accessories
  "17016", // Card Shop
  "17017", // Carpet Store
  "17018", // Check Cashing Service
  "17019", // Children's Clothing Store
  "17020", // Clothing Store
  "17021", // Collectibles Store
  "17022", // Consignment Shop
  "17023", // Container Store
  "17024", // Convenience Store
  "17025", // Cosmetics Shop
  "17026", // Costume Shop
  "17027", // Department Store
  "17028", // Design Studio
  "17029", // Discount Store
  "17030", // Dive Shop
  "17031", // Drug Store / Pharmacy
  "17032", // Electronics Store
  "17033", // Eyewear Store
  "17034", // Fabric Shop
  "17035", // Fireplace Store
  "17036", // Fireworks Store
  "17037", // Fishing Store
  "17038", // Flea Market
  "17039", // Florist
  "17040", // Frame Store
  "17041", // Fruit and Vegetable Store
  "17042", // Furniture and Home Store
  "17043", // Game Store
  "17044", // Garden Center
  "17045", // Gift Shop
  "17046", // Golf Shop
  "17047", // Grocery Store
  "17048", // Gun Shop
  "17049", // Hardware Store
  "17050", // Herbs and Spices Store
  "17051", // Hobby Shop
  "17052", // Home Service
  "17053", // Hunting Supply
  "17054", // IT Services
  "17055", // Jewelry Store
  "17056", // Knitting Store
  "17057", // Leather Goods Store
  "17058", // Lighting Store
  "17059", // Lingerie Store
  "17060", // Liquor Store
  "17061", // Luggage Store
  "17062", // Market
  "17063", // Martial Arts Supply
  "17064", // Mattress Store
  "17065", // Men's Store
  "17066", // Miscellaneous Shop
  "17067", // Mobile Phone Shop
  "17068", // Motorcycle Shop
  "17070", // Music Store
  "17071", // Nail Salon
  "17072", // Newsstand
  "17073", // Office Supplies Store
  "17074", // Optical Shop
  "17075", // Organic Grocery
  "17076", // Outdoor Supply Store
  "17077", // Outlet Store
  "17078", // Paper Store
  "17079", // Party Store
  "17080", // Pawn Shop
  "17081", // Perfume Shop
  "17082", // Pet Store
  "17083", // Photography Lab
  "17084", // Piercing Parlor
  "17085", // Pop-Up Shop
  "17086", // Print Shop
  "17087", // Record Shop
  "17088", // Rental Service
  "17089", // Salon / Barbershop
  "17090", // Shoe Store
  "17091", // Skateboard Shop
  "17092", // Ski Shop
  "17093", // Smoke Shop
  "17094", // Souvenir Shop
  "17095", // Spa
  "17096", // Sporting Goods Shop
  "17097", // Stationery Store
  "17098", // Storage Facility
  "17099", // Supermarket
  "17100", // Supplement Shop
  "17101", // Tailor
  "17102", // Tanning Salon
  "17103", // Tattoo Parlor
  "17104", // Thrift / Vintage Store
  "17105", // Tire Shop / Garage
  "17106", // Tobacco Shop
  "17107", // Toy Store
  "17108", // Trophy Shop
  "17109", // Used Bookstore
  "17110", // Video Game Store
  "17111", // Video Store
  "17112", // Watch Shop
  "17113", // Women's Store

  // ===== GROCERY & FOOD RETAIL =====
  "13287", // Butcher
  "13288", // Cheese Shop
  "13289", // Fish Market
  "13290", // Farmers Market
  "13291", // Grocery Store
  "13292", // Organic Grocery
  "13293", // Specialty Food Store
  "13294", // Supermarket

  // ===== GOVERNMENT =====
  "12026", // Government Building (parent)
  "12027", // Capitol Building
  "12028", // City Hall
  "12029", // Consulate
  "12030", // Courthouse
  "12031", // Embassy
  "12032", // Fire Station
  "12033", // Government
  "12034", // Military Base
  "12035", // Police Station
  "12036", // Post Office
  "12037", // Town Hall
  "12038", // Voter Registration Office

  // ===== RELIGION =====
  "12051", // Spiritual Center (parent)
  "12052", // Buddhist Temple
  "12053", // Church
  "12054", // Hindu Temple
  "12055", // Mosque
  "12038", // Shrine
  "12039", // Synagogue
  "12040", // Temple

  // ===== SCHOOLS (not university) =====
  "12041", // School (parent)
  "12042", // Charter School
  "12043", // Elementary School
  "12044", // High School
  "12045", // Homeschool
  "12046", // Kindergarten
  "12047", // Language School
  "12048", // Middle School
  "12049", // Preschool
  "12050", // Private School
  "12085", // Driving School

  // ===== RESIDENTIAL =====
  "12088", // Residential (parent)
  "12089", // Assisted Living
  "12090", // Building
  "12091", // Condominium Complex
  "12092", // Housing Development
  "12093", // Mobile Home Park
  "12094", // Nursing Home
  "12095", // Residential Building (Apartment / Condo)
  "12096", // Retirement Home
  "12097", // Trailer Park

  // ===== TRANSPORT =====
  "19000", // Travel and Transportation (parent)
  "19001", // Airport
  "19002", // Airport Food Court
  "19003", // Airport Gate
  "19004", // Airport Lounge
  "19005", // Airport Terminal
  "19006", // Airport Tram
  "19007", // Bike Rental / Bike Share
  "19008", // Boat or Ferry
  "19009", // Border Crossing
  "19010", // Bus Station
  "19011", // Bus Stop
  "19012", // Cable Car
  "19013", // Cruise
  "19014", // General Travel
  "19015", // Heliport
  "19016", // Hotel
  "19017", // Hostel
  "19018", // Light Rail Station
  "19019", // Metro Station
  "19020", // Motel
  "19021", // Moving Target
  "19022", // Pier
  "19023", // Plane
  "19024", // Port
  "19025", // RV Park
  "19026", // Rental Car Location
  "19027", // Rest Area
  "19028", // Road
  "19029", // Taxi Stand
  "19030", // Toll Booth
  "19031", // Toll Plaza
  "19032", // Train Station
  "19033", // Tram Station
  "19034", // Transportation Service

  // ===== AUTOMOTIVE =====
  "18000", // Automotive (parent)
  "18001", // Auto Dealership
  "18002", // Auto Garage
  "18003", // Auto Wash
  "18004", // Gas Station
  "18005", // Motorcycle Dealership
  "18006", // Motorcycle Repair Shop
  "18007", // Parking
  "18008", // RV Dealership
  "18009", // Towing Company

  // ===== PROFESSIONAL SERVICES =====
  "11000", // Business and Professional Services (parent)
  "11001", // Accountant
  "11002", // Advertising Agency
  "11003", // Architecture Firm
  "11004", // Art Restoration Service
  "11005", // Bail Bondsman
  "11006", // Bank
  "11007", // Carpet Cleaner
  "11008", // Check Cashing Service
  "11009", // Cleaning Service
  "11010", // Construction and Landscaping
  "11011", // Currency Exchange
  "11012", // Distribution Center
  "11013", // Electrical Equipment Supplier
  "11014", // Employment Agency
  "11015", // Engineering Firm
  "11016", // Event Planner
  "11017", // Event Space
  "11018", // Factory
  "11019", // Film Studio
  "11020", // Financial or Legal Service
  "11021", // Funeral Home
  "11022", // General Contractor
  "11023", // Graphic Design Studio
  "11024", // Heating, Ventilating and Air Conditioning Service
  "11025", // Home Improvement Service
  "11026", // Human Resources
  "11027", // Industrial Estate
  "11028", // Insurance Office
  "11029", // Internet Cafe
  "11030", // Investment Office
  "11031", // IT Services
  "11032", // Laundromat
  "11033", // Laundry Service
  "11034", // Lawyer
  "11035", // Locksmith
  "11036", // Marketing Agency
  "11037", // Media Company
  "11038", // Message Board
  "11039", // Miscellaneous Business
  "11040", // Moving Company
  "11041", // Non-Profit
  "11042", // Notary
  "11043", // Office
  "11044", // Packaging Service
  "11045", // Pest Control Service
  "11046", // Plumber
  "11047", // Property Management Office
  "11048", // Publisher
  "11050", // Radio Station
  "11051", // Real Estate Office
  "11052", // Recording Studio
  "11053", // Recycling Facility
  "11054", // Shipping Store
  "11055", // Social Services
  "11056", // Software Company
  "11057", // Surveyor
  "11058", // Talent Agency
  "11059", // Telecom
  "11060", // Travel Agency
  "11061", // TV Station
  "11062", // Warehouse
  "11063", // Wedding Planning Service
  "11064", // Window Cleaning Service

  // ===== GEOGRAPHIC (non-social) =====
  "16012", // Cave
  "16013", // Cemetery
  "16023", // Historic Site
  "16026", // Hiking Trail
  "16031", // Other Great Outdoors
  "16060", // Well

  // ===== NEIGHBORHOODS & STREETS =====
  "12098", // Neighborhood
  "12099", // Intersection
  "12100", // States and Municipalities
  "12101", // City
  "12102", // County
  "12103", // Country
  "12104", // State
  "12105", // Street

  // ===== LODGING (sleeping, not social) =====
  "19016", // Hotel
  "19017", // Hostel
  "19020", // Motel
  "19038", // Bed and Breakfast
  "19039", // Inn
  "19040", // Vacation Rental
  "19041", // Resort
  "19042", // Cabin
  "19043", // Campground
  "19044", // Cottage
  "19045", // Guest House
  "19046", // Lodge
  "19047", // Timeshare

  // ===== FITNESS (personal, not social) =====
  "18021", // Gym
  "18022", // Gym / Fitness Center
  "18023", // Gym Pool
  "18024", // Martial Arts Dojo
  "18025", // Pilates Studio
  "18026", // Yoga Studio
  "18027", // Crossfit Box
  "18028", // Bootcamp
  "18029", // Boxing Gym
  "18030", // Climbing Gym

  // ===== LIBRARIES =====
  "12086", // Library
  "12087", // Public Library
]);

// -----------------------------------------------------------------------------
// FILTERING LOGIC - EXCLUSIVAMENTE POR fsq_category_id
// -----------------------------------------------------------------------------

function getCategoryIds(place: FoursquarePlace): string[] {
  if (!place.categories || place.categories.length === 0) {
    return [];
  }
  return place.categories.map(cat => cat.fsq_category_id).filter(Boolean);
}

function shouldIncludePlace(place: FoursquarePlace): boolean {
  const categoryIds = getCategoryIds(place);
  
  // Sem categorias = não incluir
  if (categoryIds.length === 0) {
    return false;
  }
  
  // Se QUALQUER categoria está na lista de exclusão = rejeitar
  for (const id of categoryIds) {
    if (EXCLUDED_CATEGORY_IDS.has(id)) {
      return false;
    }
  }
  
  // Se ao menos UMA categoria está na lista permitida = aceitar
  for (const id of categoryIds) {
    if (ALLOWED_CATEGORY_IDS.has(id)) {
      return true;
    }
  }
  
  // Não está em nenhuma lista = não incluir
  return false;
}

function shouldIncludePlaceFromDb(place: any): boolean {
  // Se dados_brutos tem categories, usar a mesma lógica
  const rawData = place.dados_brutos as FoursquarePlace | null;
  if (rawData && rawData.categories && rawData.categories.length > 0) {
    return shouldIncludePlace(rawData);
  }
  
  // Sem dados_brutos com categories = não podemos filtrar por ID
  // Fallback: rejeitar (preferimos falso negativo a falso positivo)
  return false;
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
        
        // Apply category-based filtering using ONLY fsq_category_id
        places = rawPlaces.filter((place: FoursquarePlace) => shouldIncludePlace(place));
        
        foursquareSuccess = true;
        console.log(`[search-places] ✅ Foursquare: ${rawPlaces.length} raw → ${places.length} after curadoria`);
        
        // Log what was filtered for debugging (show category IDs)
        const filtered = rawPlaces.filter((p: FoursquarePlace) => !shouldIncludePlace(p));
        if (filtered.length > 0) {
          console.log(`[search-places] 🚫 Filtered: ${filtered.slice(0, 5).map((p: FoursquarePlace) => 
            `${p.name} [${getCategoryIds(p).join(',')}]`
          ).join(', ')}${filtered.length > 5 ? ` +${filtered.length - 5} more` : ''}`);
        }
        
        // Log what was included for debugging
        if (places.length > 0) {
          console.log(`[search-places] ✅ Included: ${places.slice(0, 5).map((p: FoursquarePlace) => 
            `${p.name} [${getCategoryIds(p).join(',')}]`
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
      .limit(limit * 2); // Get more to account for filtering

    if (dbError) {
      console.error("[search-places] ❌ DB error:", dbError);
      throw dbError;
    }

    // Filter database results using the same curadoria logic (by fsq_category_id only)
    const filteredDbPlaces = (dbPlaces || []).filter(place => shouldIncludePlaceFromDb(place));

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
      .sort((a, b) => a.distance_meters - b.distance_meters)
      .slice(0, limit); // Apply final limit

    console.log(`[search-places] 📤 Returning ${placesWithDistance.length} places (from ${dbPlaces?.length || 0} in DB, ${filteredDbPlaces.length} after curadoria)`);

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
