-- Adicionar colunas faltantes para locais temporários
ALTER TABLE public.places 
ADD COLUMN IF NOT EXISTS is_temporary boolean NOT NULL DEFAULT false;

ALTER TABLE public.places 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id);

ALTER TABLE public.places 
ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;