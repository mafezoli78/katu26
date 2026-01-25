-- Create places table to cache external provider data

CREATE TABLE public.places (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL DEFAULT 'foursquare',
  provider_id text NOT NULL,
  nome text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  endereco text,
  cidade text,
  estado text,
  pais text,
  categoria text,
  dados_brutos jsonb,
  ativo boolean NOT NULL DEFAULT true,
  origem text NOT NULL DEFAULT 'api',
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT places_provider_unique UNIQUE (provider, provider_id)
);

-- Enable RLS
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

-- Everyone can view active places
CREATE POLICY "Anyone can view active places" 
ON public.places 
FOR SELECT 
USING (ativo = true);

-- Create indexes for efficient queries
CREATE INDEX idx_places_location ON public.places (latitude, longitude);
CREATE INDEX idx_places_provider ON public.places (provider, provider_id);
CREATE INDEX idx_places_categoria ON public.places (categoria);
CREATE INDEX idx_places_ativo ON public.places (ativo);

-- Trigger to update atualizado_em
CREATE TRIGGER update_places_updated_at
BEFORE UPDATE ON public.places
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();