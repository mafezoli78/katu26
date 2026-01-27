-- Atualizar função para retornar place_id (não location_id)
CREATE OR REPLACE FUNCTION public.get_user_active_place_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT place_id 
  FROM public.presence 
  WHERE user_id = auth.uid() AND ativo = true
  LIMIT 1;
$$;

-- Remover policy problemática
DROP POLICY IF EXISTS "Users can view presence in place" ON public.presence;

-- Criar nova policy sem subquery direta
CREATE POLICY "Users can view presence in place"
ON public.presence
FOR SELECT
TO authenticated
USING (
  ativo = true
  AND place_id IS NOT NULL
  AND (
    user_id = auth.uid()
    OR
    place_id = public.get_user_active_place_id()
  )
);