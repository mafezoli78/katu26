-- 1. Adicionar place_id na tabela presence
ALTER TABLE public.presence 
ADD COLUMN IF NOT EXISTS place_id uuid REFERENCES public.places(id);

-- 2. Criar função para buscar locais temporários próximos
CREATE OR REPLACE FUNCTION public.find_nearby_temporary_places(
  user_lat double precision,
  user_lng double precision,
  radius_meters double precision DEFAULT 150
)
RETURNS TABLE (
  id uuid,
  nome text,
  distance_meters double precision,
  active_users bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.nome,
    -- Haversine formula for distance in meters
    (6371000 * acos(
      cos(radians(user_lat)) * cos(radians(p.latitude)) *
      cos(radians(p.longitude) - radians(user_lng)) +
      sin(radians(user_lat)) * sin(radians(p.latitude))
    )) AS distance_meters,
    (SELECT COUNT(*) FROM public.presence pr WHERE pr.place_id = p.id AND pr.ativo = true) AS active_users
  FROM public.places p
  WHERE p.is_temporary = true
    AND p.ativo = true
    AND (p.expires_at IS NULL OR p.expires_at > now())
    AND (6371000 * acos(
      cos(radians(user_lat)) * cos(radians(p.latitude)) *
      cos(radians(p.longitude) - radians(user_lng)) +
      sin(radians(user_lat)) * sin(radians(p.latitude))
    )) <= radius_meters
  ORDER BY distance_meters ASC;
$$;