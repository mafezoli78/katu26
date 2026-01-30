-- Remover constraint antigo que não inclui 'expired'
ALTER TABLE public.waves DROP CONSTRAINT IF EXISTS waves_status_check;

-- Recriar constraint com os 3 valores válidos do domínio
ALTER TABLE public.waves ADD CONSTRAINT waves_status_check 
  CHECK (status IN ('pending', 'accepted', 'expired'));