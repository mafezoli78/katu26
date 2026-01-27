-- Dropar constraint legada que referencia locations
ALTER TABLE public.waves DROP CONSTRAINT IF EXISTS waves_location_id_fkey;

-- Tornar location_id nullable (não mais obrigatório)
ALTER TABLE public.waves ALTER COLUMN location_id DROP NOT NULL;