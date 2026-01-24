-- Add availability columns to presence table
ALTER TABLE public.presence
ADD COLUMN IF NOT EXISTS disponivel boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS assunto_atual text,
ADD COLUMN IF NOT EXISTS disponivel_desde timestamp with time zone,
ADD COLUMN IF NOT EXISTS disponivel_expira_em timestamp with time zone;

-- Create validation trigger function
CREATE OR REPLACE FUNCTION public.validate_availability()
RETURNS TRIGGER AS $$
BEGIN
  -- When becoming available
  IF NEW.disponivel = true AND (OLD.disponivel IS DISTINCT FROM true) THEN
    
    -- Validate assunto_atual
    IF NEW.assunto_atual IS NULL OR TRIM(NEW.assunto_atual) = '' THEN
      RAISE EXCEPTION 'assunto_atual é obrigatório quando disponivel = true';
    END IF;

    -- Set timestamps only once
    NEW.disponivel_desde := now();
    NEW.disponivel_expira_em := now() + interval '60 minutes';
  
  END IF;

  -- When becoming unavailable
  IF NEW.disponivel = false AND OLD.disponivel = true THEN
    NEW.assunto_atual := NULL;
    NEW.disponivel_desde := NULL;
    NEW.disponivel_expira_em := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_validate_availability ON public.presence;
CREATE TRIGGER trigger_validate_availability
BEFORE INSERT OR UPDATE ON public.presence
FOR EACH ROW
EXECUTE FUNCTION public.validate_availability();

-- Create optimized index for querying available users by location
CREATE INDEX IF NOT EXISTS idx_presence_available_by_location 
ON public.presence (location_id, disponivel, disponivel_expira_em)
WHERE disponivel = true AND ativo = true;