-- Remover policy antiga (nome pode variar)
DROP POLICY IF EXISTS "Users can view presence in same place" ON public.presence;
DROP POLICY IF EXISTS "Users can view presence in same location" ON public.presence;

-- Criar nova policy de SELECT para presence
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
    place_id = (
      SELECT place_id
      FROM public.presence
      WHERE user_id = auth.uid()
        AND ativo = true
      LIMIT 1
    )
  )
);