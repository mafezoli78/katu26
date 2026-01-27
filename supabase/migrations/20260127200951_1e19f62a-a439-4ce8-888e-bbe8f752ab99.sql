-- 1. Remover a foreign key constraint legacy
ALTER TABLE public.presence 
DROP CONSTRAINT IF EXISTS presence_location_id_fkey;

-- 2. Tornar location_id nullable (campo legacy, será removido futuramente)
ALTER TABLE public.presence 
ALTER COLUMN location_id DROP NOT NULL;