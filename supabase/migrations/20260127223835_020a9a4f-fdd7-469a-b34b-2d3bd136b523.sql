-- Adicionar coluna place_id à tabela waves
ALTER TABLE public.waves
ADD COLUMN place_id uuid REFERENCES public.places(id);

-- Copiar dados de location_id para place_id (se houver correspondência em places)
UPDATE public.waves w
SET place_id = w.location_id
WHERE EXISTS (SELECT 1 FROM public.places p WHERE p.id = w.location_id);

-- Comentário para invalidar cache e forçar refresh
COMMENT ON COLUMN public.waves.place_id IS 'ID do place onde o aceno foi enviado';