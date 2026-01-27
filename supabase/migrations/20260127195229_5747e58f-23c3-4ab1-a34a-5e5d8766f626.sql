-- Permitir usuários criarem locais temporários
CREATE POLICY "Users can create temporary places"
ON public.places
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND is_temporary = true 
  AND created_by = auth.uid()
);