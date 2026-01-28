import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Foursquare Places API response format
// Note: The API returns categories with 'id' field which contains legacy v2 hex IDs
// When stored in DB, we use 'fsq_category_id' for compatibility
interface FoursquareCategory {
  id?: string;              // Direct API response uses 'id'
  fsq_category_id?: string; // DB stored data uses 'fsq_category_id'  
  name: string;
  short_name?: string;
}

interface FoursquarePlace {
  fsq_id?: string;
  fsq_place_id?: string;  // API returns this field name
  name: string;
  latitude?: number;
  longitude?: number;
  geocodes?: {
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
// fsq_category_id no formato LEGADO V2 (hex strings como 4bf58dd8d48988d...).
//
// Referência: Foursquare Legacy Category IDs (v2 format)
// =============================================================================

// -----------------------------------------------------------------------------
// ALLOWED CATEGORY IDS (Legacy v2 hex format)
// Um local é incluído se possuir ao menos um ID nesta lista
// -----------------------------------------------------------------------------

const ALLOWED_CATEGORY_IDS = new Set([
  // ===== NIGHTLIFE (parent: 4d4b7105d754a06376d81259) =====
  "4d4b7105d754a06376d81259", // Nightlife Spot (parent)
  "4bf58dd8d48988d116941735", // Bar
  "52e81612bcbc57f1066b7a0d", // Beach Bar
  "4bf58dd8d48988d117941735", // Beer Garden
  "50327c8591d4c4b30a586d5d", // Brewery
  "52e81612bcbc57f1066b7a0e", // Champagne Bar
  "4bf58dd8d48988d11e941735", // Cocktail Bar
  "4bf58dd8d48988d118941735", // Dive Bar
  "4bf58dd8d48988d119941735", // Hookah Bar
  "4bf58dd8d48988d1d5941735", // Hotel Bar
  "4bf58dd8d48988d120941735", // Karaoke Bar
  "4bf58dd8d48988d121941735", // Lounge
  "4bf58dd8d48988d11f941735", // Nightclub
  "4bf58dd8d48988d11a941735", // Other Nightlife
  "4bf58dd8d48988d11b941735", // Pub
  "4bf58dd8d48988d11c941735", // Sake Bar
  "4bf58dd8d48988d1d4941735", // Speakeasy
  "4bf58dd8d48988d11d941735", // Sports Bar
  "4bf58dd8d48988d122941735", // Whisky Bar
  "4bf58dd8d48988d123941735", // Wine Bar
  "4bf58dd8d48988d1e8931735", // Piano Bar
  "4bf58dd8d48988d1e3931735", // Pool Hall
  "4bf58dd8d48988d1ea941735", // Apres Ski Bar

  // ===== DINING (parent: 4d4b7105d754a06374d81259) =====
  "4bf58dd8d48988d1c4941735", // Restaurant (generic)
  "503288ae91d4c4b30a586d67", // Afghan Restaurant
  "4bf58dd8d48988d1c8941735", // African Restaurant
  "4bf58dd8d48988d14e941735", // American Restaurant
  "4bf58dd8d48988d152941735", // Arepa Restaurant
  "4bf58dd8d48988d107941735", // Argentinian Restaurant
  "4bf58dd8d48988d142941735", // Asian Restaurant
  "4bf58dd8d48988d169941735", // Australian Restaurant
  "52e81612bcbc57f1066b7a01", // Austrian Restaurant
  "4bf58dd8d48988d1df931735", // BBQ Joint / Churrascaria
  "52e81612bcbc57f1066b79f1", // Bistro
  "4bf58dd8d48988d16b941735", // Brazilian Restaurant
  "52939a643cf9994f4e043a33", // Churrascaria
  "4bf58dd8d48988d143941735", // Breakfast Spot
  "52e81612bcbc57f1066b79f4", // Buffet
  "4bf58dd8d48988d16c941735", // Burger Joint
  "4bf58dd8d48988d17a941735", // Cajun / Creole Restaurant
  "4bf58dd8d48988d144941735", // Caribbean Restaurant
  "4bf58dd8d48988d145941735", // Chinese Restaurant
  "4bf58dd8d48988d154941735", // Cuban Restaurant
  "52f2ae52bcbc57f1066b8b81", // Czech Restaurant
  "4bf58dd8d48988d1f5931735", // Dim Sum Restaurant
  "4bf58dd8d48988d147941735", // Diner
  "4e0e22f5a56208c4ea9a85a0", // Distillery
  "4bf58dd8d48988d10a941735", // Ethiopian Restaurant
  "4eb1bd1c3b7b55596b4a748f", // Filipino Restaurant
  "52e81612bcbc57f1066b7a09", // Fondue Restaurant
  "4bf58dd8d48988d10c941735", // French Restaurant
  "4bf58dd8d48988d155941735", // Gastropub
  "4bf58dd8d48988d10d941735", // German Restaurant
  "4bf58dd8d48988d10e941735", // Greek Restaurant
  "52e81612bcbc57f1066b79fe", // Hawaiian Restaurant
  "4bf58dd8d48988d10f941735", // Indian Restaurant
  "4deefc054765f83613cdba6f", // Indonesian Restaurant
  "52e81612bcbc57f1066b7a06", // Irish Pub
  "4bf58dd8d48988d110941735", // Italian Restaurant
  "4bf58dd8d48988d111941735", // Japanese Restaurant
  "4bf58dd8d48988d113941735", // Korean Restaurant
  "4bf58dd8d48988d1be941735", // Latin American Restaurant
  "4bf58dd8d48988d156941735", // Malaysian Restaurant
  "4bf58dd8d48988d1c0941735", // Mediterranean Restaurant
  "4bf58dd8d48988d1c1941735", // Mexican Restaurant
  "4bf58dd8d48988d115941735", // Middle Eastern Restaurant
  "52e81612bcbc57f1066b79f9", // Modern European Restaurant
  "4bf58dd8d48988d1c2941735", // Molecular Gastronomy Restaurant
  "4eb1d5724b900d56c88a45fe", // Mongolian Restaurant
  "4bf58dd8d48988d1c3941735", // Moroccan Restaurant
  "4bf58dd8d48988d157941735", // New American Restaurant
  "52e81612bcbc57f1066b79f8", // Pakistani Restaurant
  "4eb1bfa43b7b52c0e1adc2e8", // Peruvian Restaurant
  "4bf58dd8d48988d1ca941735", // Pizza Place
  "52e81612bcbc57f1066b7a04", // Polish Restaurant
  "4def73e84765ae376e57713a", // Portuguese Restaurant
  "5293a7563cf9994f4e043a44", // Russian Restaurant
  "4bf58dd8d48988d1c6941735", // Scandinavian Restaurant
  "4bf58dd8d48988d1ce941735", // Seafood Restaurant
  "4bf58dd8d48988d14f941735", // Southern / Soul Food Restaurant
  "4bf58dd8d48988d1cd941735", // South American Restaurant
  "4bf58dd8d48988d150941735", // Spanish Restaurant
  "4bf58dd8d48988d1cc941735", // Steakhouse
  "4bf58dd8d48988d1d2941735", // Sushi Restaurant
  "4bf58dd8d48988d158941735", // Swiss Restaurant
  "4bf58dd8d48988d1db931735", // Tapas Restaurant
  "4bf58dd8d48988d1dc931735", // Tea Room
  "4bf58dd8d48988d149941735", // Thai Restaurant
  "52af39fb3cf9994f4e043be9", // Tibetan Restaurant
  "4f04af1f2fb6e1c99f3db0bb", // Turkish Restaurant
  "52e928d0bcbc57f1066b7e96", // Ukrainian Restaurant
  "4bf58dd8d48988d14a941735", // Vietnamese Restaurant
  "4bf58dd8d48988d14b941735", // Winery
  "4bf58dd8d48988d1d1941735", // Ramen / Noodle House
  "52af0bd33cf9994f4e043bdd", // Hotpot Restaurant

  // ===== CAFÉS & COFFEE =====
  "4bf58dd8d48988d1e0931735", // Coffee Shop
  "4bf58dd8d48988d16d941735", // Café
  "52e81612bcbc57f1066b7a0c", // Bubble Tea Shop

  // ===== ARTS & ENTERTAINMENT (parent: 4d4b7104d754a06370d81259) =====
  "4d4b7104d754a06370d81259", // Arts and Entertainment (parent)
  "4fceea171983d5d06c3e9823", // Aquarium
  "4bf58dd8d48988d1e1931735", // Arcade
  "4bf58dd8d48988d1e2931735", // Art Gallery
  "4bf58dd8d48988d1e4931735", // Bowling Alley
  "4bf58dd8d48988d17c941735", // Casino
  "52e81612bcbc57f1066b79e7", // Circus
  "4bf58dd8d48988d18e941735", // Comedy Club
  "5032792091d4c4b30a586d5c", // Concert Hall
  "52e81612bcbc57f1066b79ef", // Country Dance Club
  "4bf58dd8d48988d1f1931735", // General Entertainment
  "52e81612bcbc57f1066b79ea", // Go Kart Track
  "52e81612bcbc57f1066b7a11", // Gun Range
  "52e81612bcbc57f1066b7a06", // Laser Tag (exists but in different section)
  "52e81612bcbc57f1066b79eb", // Mini Golf
  "4bf58dd8d48988d17f941735", // Movie Theater
  "4bf58dd8d48988d17e941735", // Indie Movie Theater
  "4bf58dd8d48988d180941735", // Multiplex
  "4bf58dd8d48988d181941735", // Museum
  "4bf58dd8d48988d18f941735", // Art Museum
  "4bf58dd8d48988d190941735", // History Museum
  "4bf58dd8d48988d192941735", // Planetarium
  "4bf58dd8d48988d191941735", // Science Museum
  "4bf58dd8d48988d1e5931735", // Music Venue
  "4bf58dd8d48988d1e7931735", // Jazz Club
  "4bf58dd8d48988d1e9931735", // Rock Club
  "4bf58dd8d48988d1f2931735", // Performing Arts Venue
  "4bf58dd8d48988d136941735", // Opera House
  "4bf58dd8d48988d137941735", // Theater
  "4bf58dd8d48988d1f4931735", // Racetrack
  "52e81612bcbc57f1066b79e9", // Roller Rink
  "52e81612bcbc57f1066b79ec", // Salsa Club
  "4bf58dd8d48988d184941735", // Stadium
  "4bf58dd8d48988d18c941735", // Baseball Stadium
  "4bf58dd8d48988d18b941735", // Basketball Stadium
  "4bf58dd8d48988d189941735", // Football Stadium
  "4bf58dd8d48988d185941735", // Hockey Arena
  "4bf58dd8d48988d188941735", // Soccer Stadium
  "4bf58dd8d48988d182941735", // Theme Park
  "5109983191d435c0d71c2bb1", // Theme Park Ride / Attraction
  "4bf58dd8d48988d193941735", // Water Park
  "4bf58dd8d48988d17b941735", // Zoo

  // ===== EVENTS (parent: 4d4b7105d754a06373d81259) =====
  "4d4b7105d754a06373d81259", // Event (parent)
  "5267e4d9e4b0ec79466e48c6", // Conference
  "5267e4d9e4b0ec79466e48c9", // Convention
  "5267e4d9e4b0ec79466e48c7", // Festival
  "5267e4d9e4b0ec79466e48d1", // Music Festival
  "5267e4d9e4b0ec79466e48c8", // Other Event
  "52741d85e4b0d5d1e3c6a6d9", // Parade
  "52f2ab2ebcbc57f1066b8b54", // Stoop Sale
  "5267e4d8e4b0ec79466e48c5", // Street Fair

  // ===== OUTDOORS & RECREATION (parent: 4d4b7105d754a06377d81259) =====
  "4d4b7105d754a06377d81259", // Outdoors and Recreation (parent)
  "4f4528bc4b90abdf24c9de85", // Athletics & Sports
  "4bf58dd8d48988d1e8941735", // Baseball Field (note: different from above)
  "4bf58dd8d48988d1e1941735", // Basketball Court (conflicts with Arcade - different ID in outdoors)
  "4bf58dd8d48988d1e6941735", // Golf Course
  "4bf58dd8d48988d167941735", // Skate Park
  "4bf58dd8d48988d168941735", // Skating Rink
  "4cce455aebf7b749d5e191f5", // Soccer Field
  "4e39a956bd410d7aed40cbc3", // Tennis Court
  "4eb1bf013b7b6f98df247e07", // Volleyball Court
  "4bf58dd8d48988d1e2941735", // Beach (note: same ID as Art Gallery? Using outdoors)
  "52e81612bcbc57f1066b7a22", // Botanical Garden
  "4bf58dd8d48988d1e5941735", // Dog Run
  "4bf58dd8d48988d15a941735", // Garden
  "4bf58dd8d48988d1e0941735", // Harbor / Marina
  "4bf58dd8d48988d160941735", // Hot Spring
  "50aaa4314b90af0d42d5de10", // Island
  "4bf58dd8d48988d161941735", // Lake
  "4bf58dd8d48988d15d941735", // Lighthouse
  "4eb1d4d54b900d56c88a45fc", // Mountain
  "52e81612bcbc57f1066b7a21", // National Park
  "52e81612bcbc57f1066b7a13", // Nature Preserve
  "4bf58dd8d48988d163941735", // Park
  "52e81612bcbc57f1066b7a25", // Pedestrian Plaza
  "4bf58dd8d48988d1e7941735", // Playground
  "4bf58dd8d48988d164941735", // Plaza
  "4bf58dd8d48988d15e941735", // Pool
  "52e81612bcbc57f1066b7a26", // Recreation Center
  "4eb1d4dd4b900d56c88a45fd", // River
  "50328a4b91d4c4b30a586d6b", // Rock Climbing Spot
  "4bf58dd8d48988d165941735", // Scenic Lookout
  "4bf58dd8d48988d166941735", // Sculpture Garden
  "4bf58dd8d48988d1e9941735", // Ski Area
  "4eb1c0ed3b7b52c0e1adc2ea", // Ski Chairlift
  "4bf58dd8d48988d1ec941735", // Ski Chalet
  "4bf58dd8d48988d1eb941735", // Ski Lodge
  "4bf58dd8d48988d1de941735", // Vineyard
  "52e81612bcbc57f1066b7a10", // Summer Camp
  "50aaa49e4b90af0d42d5de11", // Castle

  // ===== COLLEGE & UNIVERSITY (parent: 4d4b7105d754a06372d81259) =====
  "4d4b7105d754a06372d81259", // College & University (parent)
  "4bf58dd8d48988d198941735", // College Academic Building
  "4bf58dd8d48988d199941735", // College Arts Building
  "4bf58dd8d48988d19a941735", // College Communications Building
  "4bf58dd8d48988d19e941735", // College Engineering Building
  "4bf58dd8d48988d197941735", // College Administrative Building
  "4bf58dd8d48988d1af941735", // College Auditorium
  "4bf58dd8d48988d1b1941735", // College Bookstore
  "4bf58dd8d48988d1a1941735", // College Cafeteria
  "4bf58dd8d48988d1b2941735", // College Gym
  "4bf58dd8d48988d1aa941735", // College Quad
  "4bf58dd8d48988d1a9941735", // College Rec Center
  "4bf58dd8d48988d1b4941735", // College Stadium
  "4bf58dd8d48988d1ac941735", // College Theater
  "4bf58dd8d48988d1a2941735", // Community College
  "4bf58dd8d48988d1b0941735", // Fraternity House
  "4bf58dd8d48988d1a8941735", // General College & University
  "4bf58dd8d48988d141941735", // Sorority House
  "4bf58dd8d48988d1ab941735", // Student Center
  "4bf58dd8d48988d1ae941735", // University

  // ===== SHOPPING MALLS =====
  "4bf58dd8d48988d1fd941735", // Mall
  "52e816a6bcbc57f1066b7a54", // Warehouse Store (may be mall-like)

  // ===== COWORKING & WORKSPACES =====
  "4bf58dd8d48988d174941735", // Coworking Space

  // ===== SOCIAL CLUBS & COMMUNITY =====
  "52e81612bcbc57f1066b7a33", // Social Club
  "52e81612bcbc57f1066b7a34", // Community Center
  "52e81612bcbc57f1066b7a32", // Cultural Center
  "4bf58dd8d48988d171941735", // Event Space
  "4bf58dd8d48988d1ff931735", // Convention Center
]);

// -----------------------------------------------------------------------------
// EXCLUDED CATEGORY IDS (Legacy v2 hex format)
// Um local é excluído se possuir qualquer ID nesta lista
// -----------------------------------------------------------------------------

const EXCLUDED_CATEGORY_IDS = new Set([
  // ===== HEALTH & MEDICAL =====
  "4bf58dd8d48988d104941735", // Medical Center
  "52e81612bcbc57f1066b7a3b", // Acupuncturist
  "52e81612bcbc57f1066b7a3c", // Alternative Healer
  "52e81612bcbc57f1066b7a3a", // Chiropractor
  "4bf58dd8d48988d178941735", // Dentist's Office
  "4bf58dd8d48988d177941735", // Doctor's Office
  "4bf58dd8d48988d194941735", // Emergency Room
  "522e32fae4b09b556e370f19", // Eye Doctor
  "4bf58dd8d48988d196941735", // Hospital
  "4f4531b14b9074f6e4fb0103", // Laboratory
  "52e81612bcbc57f1066b7a39", // Mental Health Office
  "4d954af4a243a5684765b473", // Veterinarian

  // ===== PHARMACY & DRUGSTORE =====
  "4bf58dd8d48988d10f951735", // Drugstore / Pharmacy

  // ===== FAST FOOD & QUICK SERVICE =====
  "4bf58dd8d48988d16e941735", // Fast Food Restaurant
  "4bf58dd8d48988d16f941735", // Hot Dog Joint
  "4bf58dd8d48988d1c9941735", // Ice Cream Shop
  "4bf58dd8d48988d112941735", // Juice Bar
  "52f2ab2ebcbc57f1066b8b41", // Smoothie Shop
  "4bf58dd8d48988d179941735", // Bagel Shop
  "4bf58dd8d48988d16a941735", // Bakery
  "4bf58dd8d48988d117951735", // Candy Store
  "4bf58dd8d48988d1bc941735", // Cupcake Shop
  "4bf58dd8d48988d1d0941735", // Dessert Shop
  "4bf58dd8d48988d148941735", // Donut Shop
  "4bf58dd8d48988d108941735", // Dumpling Restaurant
  "4bf58dd8d48988d10b941735", // Falafel Restaurant
  "4bf58dd8d48988d1cb941735", // Food Truck
  "4d4ae6fc7a7b7dea34424761", // Fried Chicken Joint
  "512e7cae91d4cbb4e5efe0af", // Frozen Yogurt
  "4bf58dd8d48988d1bd941735", // Salad Place
  "4bf58dd8d48988d1c5941735", // Sandwich Place
  "4bf58dd8d48988d1c7941735", // Snack Place
  "4bf58dd8d48988d1dd931735", // Soup Place
  "4bf58dd8d48988d14c941735", // Wings Joint
  "4bf58dd8d48988d151941735", // Taco Place
  "4bf58dd8d48988d153941735", // Burrito Place

  // ===== RETAIL & STORES (parent: 4d4b7105d754a06378d81259) =====
  "4d4b7105d754a06378d81259", // Shop & Service (parent)
  "4bf58dd8d48988d116951735", // Antique Shop
  "4bf58dd8d48988d127951735", // Arts & Crafts Store
  "4bf58dd8d48988d124951735", // Automotive Shop
  "4bf58dd8d48988d10a951735", // Bank
  "52f2ab2ebcbc57f1066b8b56", // ATM
  "52f2ab2ebcbc57f1066b8b42", // Big Box Store
  "4bf58dd8d48988d115951735", // Bike Shop
  "4bf58dd8d48988d114951735", // Bookstore
  "4bf58dd8d48988d103951735", // Clothing Store
  "4d954b0ea243a5684a65b473", // Convenience Store
  "4bf58dd8d48988d10c951735", // Cosmetics Shop
  "4bf58dd8d48988d1f6941735", // Department Store
  "4bf58dd8d48988d122951735", // Electronics Store
  "4bf58dd8d48988d1f7941735", // Flea Market
  "4bf58dd8d48988d11b951735", // Flower Shop
  "4bf58dd8d48988d1f9941735", // Food & Drink Shop
  "4bf58dd8d48988d1fa941735", // Farmers Market
  "4bf58dd8d48988d113951735", // Gas Station / Garage
  "4bf58dd8d48988d128951735", // Gift Shop
  "4bf58dd8d48988d118951735", // Grocery Store
  "4bf58dd8d48988d112951735", // Hardware Store
  "4bf58dd8d48988d1fb941735", // Hobby Shop
  "4bf58dd8d48988d111951735", // Jewelry Store
  "52f2ab2ebcbc57f1066b8b33", // Laundromat
  "4bf58dd8d48988d1fc941735", // Laundry Service
  "4bf58dd8d48988d186941735", // Liquor Store
  "52f2ab2ebcbc57f1066b8b3c", // Massage Studio
  "4bf58dd8d48988d1ff941735", // Miscellaneous Shop
  "4f04afc02fb6e1c99f3db0bc", // Mobile Phone Shop
  "4bf58dd8d48988d1fe941735", // Music Store
  "4f04aa0c2fb6e1c99f3db0b8", // Nail Salon
  "4d954afda243a5684865b473", // Optical Shop
  "4bf58dd8d48988d100951735", // Pet Store
  "4bf58dd8d48988d0d951735", // Record Shop
  "4bf58dd8d48988d110951735", // Salon / Barbershop
  "4bf58dd8d48988d123951735", // Smoke Shop
  "4bf58dd8d48988d1ed941735", // Spa
  "4bf58dd8d48988d1f2941735", // Sporting Goods Shop
  "52f2ab2ebcbc57f1066b8b46", // Supermarket
  "4bf58dd8d48988d1f3941735", // Toy / Game Store

  // ===== GROCERY & FOOD RETAIL =====
  "4bf58dd8d48988d11d951735", // Butcher
  "4bf58dd8d48988d11e951735", // Cheese Shop
  "4bf58dd8d48988d10e951735", // Fish Market

  // ===== GOVERNMENT =====
  "4bf58dd8d48988d126941735", // Government Building
  "4bf58dd8d48988d12a941735", // Capitol Building
  "4bf58dd8d48988d129941735", // City Hall
  "4bf58dd8d48988d12b941735", // Courthouse
  "4bf58dd8d48988d12c951735", // Embassy / Consulate
  "4bf58dd8d48988d12c941735", // Fire Station
  "4bf58dd8d48988d12e941735", // Police Station
  "52e81612bcbc57f1066b7a38", // Town Hall
  "4e52adeebd41615f56317744", // Military Base
  "4bf58dd8d48988d172941735", // Post Office

  // ===== RELIGION =====
  "4bf58dd8d48988d131941735", // Spiritual Center
  "52e81612bcbc57f1066b7a3e", // Buddhist Temple
  "4bf58dd8d48988d132941735", // Church
  "52e81612bcbc57f1066b7a3f", // Hindu Temple
  "4bf58dd8d48988d138941735", // Mosque
  "4eb1d80a4b900d56c88a45ff", // Shrine
  "4bf58dd8d48988d139941735", // Synagogue
  "4bf58dd8d48988d13a941735", // Temple

  // ===== SCHOOLS (not university) =====
  "4bf58dd8d48988d13b941735", // School
  "4f4533804b9074f6e4fb0105", // Elementary School
  "4bf58dd8d48988d13d941735", // High School
  "4f4533814b9074f6e4fb0106", // Middle School
  "4f4533814b9074f6e4fb0107", // Nursery School
  "52e81612bcbc57f1066b7a45", // Preschool
  "52e81612bcbc57f1066b7a46", // Private School
  "52e81612bcbc57f1066b7a42", // Driving School

  // ===== RESIDENTIAL (parent: 4e67e38e036454776db1fb3a) =====
  "4e67e38e036454776db1fb3a", // Residence (parent)
  "5032891291d4c4b30a586d68", // Assisted Living
  "4bf58dd8d48988d103941735", // Home (private)
  "4f2a210c4b9023bd5841ed28", // Housing Development
  "4d954b06a243a5684965b473", // Residential Building (Apartment / Condo)
  "52f2ab2ebcbc57f1066b8b55", // Trailer Park

  // ===== TRANSPORT (parent: 4d4b7105d754a06379d81259) =====
  "4d4b7105d754a06379d81259", // Travel & Transport (parent)
  "4bf58dd8d48988d1ed931735", // Airport
  "4bf58dd8d48988d1ef931735", // Airport Food Court
  "4bf58dd8d48988d1f0931735", // Airport Gate
  "4eb1bc533b7b2c5b1d4306cb", // Airport Lounge
  "4bf58dd8d48988d1eb931735", // Airport Terminal
  "4e4c9077bd41f78e849722f9", // Bike Rental / Bike Share
  "4bf58dd8d48988d12d951735", // Boat or Ferry
  "52f2ab2ebcbc57f1066b8b4b", // Border Crossing
  "4bf58dd8d48988d1fe931735", // Bus Station
  "4bf58dd8d48988d12b951735", // Bus Line
  "52f2ab2ebcbc57f1066b8b4f", // Bus Stop
  "52f2ab2ebcbc57f1066b8b50", // Cable Car
  "4bf58dd8d48988d1f6931735", // General Travel
  "4bf58dd8d48988d1fa931735", // Hotel
  "4bf58dd8d48988d1f8931735", // Bed & Breakfast
  "4bf58dd8d48988d1ee931735", // Hostel
  "4bf58dd8d48988d1fb931735", // Motel
  "4bf58dd8d48988d12f951735", // Resort
  "4bf58dd8d48988d1fc931735", // Light Rail
  "4f2a23984b9023bd5841ed2c", // Moving Target
  "4e74f6cabd41c4836eac4c31", // Pier
  "4bf58dd8d48988d1ef941735", // Rental Car Location
  "4d954b16a243a5684b65b473", // Rest Area
  "4bf58dd8d48988d1f9931735", // Road
  "52f2ab2ebcbc57f1066b8b52", // Street
  "4bf58dd8d48988d1fd931735", // Subway
  "4bf58dd8d48988d130951735", // Taxi
  "52f2ab2ebcbc57f1066b8b4d", // Toll Booth
  "52f2ab2ebcbc57f1066b8b4e", // Toll Plaza
  "4bf58dd8d48988d129951735", // Train Station
  "52f2ab2ebcbc57f1066b8b51", // Tram

  // ===== AUTOMOTIVE =====
  "4eb1c1623b7b52c0e1adc2ec", // Car Dealership
  "4f04ae1f2fb6e1c99f3db0ba", // Car Wash
  "52f2ab2ebcbc57f1066b8b44", // Auto Garage

  // ===== PROFESSIONAL SERVICES =====
  "4bf58dd8d48988d124941735", // Office
  "52e81612bcbc57f1066b7a3d", // Advertising Agency
  "4bf58dd8d48988d130941735", // Building
  "4eb1bea83b7b6f98df247e06", // Factory
  "4f4534884b9074f6e4fb0174", // Funeral Home
  "52f2ab2ebcbc57f1066b8b3f", // Lawyer
  "4bf58dd8d48988d12f941735", // Library
  "50328a8e91d4c4b30a586d6c", // Non-Profit
  "4c38df4de52ce0d596b336e1", // Parking
  "5310b8e5bcbc57f1066bcbf1", // Prison
  "5032856091d4c4b30a586d63", // Radio Station
  "5032885091d4c4b30a586d66", // Real Estate Office
  "52f2ab2ebcbc57f1066b8b37", // Recording Studio
  "4f4531084b9074f6e4fb0101", // Recycling Facility
  "4f04b1572fb6e1c99f3db0bf", // Storage Facility
  "52e81612bcbc57f1066b7a36", // Warehouse
  "52e81612bcbc57f1066b7a31", // TV Station

  // ===== GEOGRAPHIC (non-social) =====
  "4bf58dd8d48988d15c941735", // Cemetery
  "4deefb944765f83613cdba6e", // Historic Site
  "4bf58dd8d48988d159941735", // Trail
  "4bf58dd8d48988d1e4941735", // Campground
  "52e81612bcbc57f1066b7a23", // Forest
  "4bf58dd8d48988d1df941735", // Bridge

  // ===== NEIGHBORHOODS & STREETS (States & Municipalities) =====
  "530e33ccbcbc57f1066bbfe4", // States & Municipalities (parent)
  "50aa9e094b90af0d42d5de0d", // City
  "5345731ebcbc57f1066c39b2", // County
  "530e33ccbcbc57f1066bbff7", // Country
  "4f2a25ac4b909258e854f55f", // Neighborhood
  "530e33ccbcbc57f1066bbff8", // State
  "530e33ccbcbc57f1066bbff3", // Town
  "530e33ccbcbc57f1066bbff9", // Village

  // ===== FITNESS (personal, not social) =====
  "4bf58dd8d48988d175941735", // Gym / Fitness Center
  "52f2ab2ebcbc57f1066b8b47", // Boxing Gym
  "503289d391d4c4b30a586d6a", // Climbing Gym
  "4bf58dd8d48988d176941735", // Gym
  "4bf58dd8d48988d101941735", // Martial Arts Dojo
  "4bf58dd8d48988d102941735", // Yoga Studio
]);

// -----------------------------------------------------------------------------
// FILTERING LOGIC - EXCLUSIVAMENTE POR fsq_category_id (Legacy v2 format)
// -----------------------------------------------------------------------------

function getCategoryIds(place: FoursquarePlace): string[] {
  if (!place.categories || place.categories.length === 0) {
    return [];
  }
  // Handle both API response (id) and DB stored data (fsq_category_id)
  return place.categories.map(cat => cat.id || cat.fsq_category_id).filter(Boolean) as string[];
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
    // Using Places API endpoint with Bearer token authentication
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
        
        // Apply category-based filtering using ONLY fsq_category_id (legacy v2 format)
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
        const placeId = place.fsq_id || place.fsq_place_id;
        if (!placeId) {
          console.warn(`[search-places] ⚠️ Missing fsq_id:`, place.name);
          return null;
        }

        const placeData = {
          provider: "foursquare",
          provider_id: placeId,
          nome: place.name,
          latitude: place.latitude || place.geocodes?.main?.latitude,
          longitude: place.longitude || place.geocodes?.main?.longitude,
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
          console.error(`[search-places] ⚠️ Upsert error ${placeId}:`, error.message);
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
