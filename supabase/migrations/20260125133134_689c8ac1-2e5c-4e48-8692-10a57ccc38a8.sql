-- Fix infinite recursion in presence RLS policy
-- The current policy has a subquery on presence within a policy on presence

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view presence in same location" ON public.presence;

-- Create a simpler policy that avoids self-referencing
-- Users can view their own presence OR active presence in the same location as their active presence
-- We use a security definer function to avoid recursion

CREATE OR REPLACE FUNCTION public.get_user_active_location_id()
RETURNS uuid AS $$
  SELECT location_id 
  FROM public.presence 
  WHERE user_id = auth.uid() AND ativo = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Recreate the policy using the function
CREATE POLICY "Users can view presence in same location" 
ON public.presence 
FOR SELECT 
USING (
  ativo = true AND (
    auth.uid() = user_id 
    OR location_id = public.get_user_active_location_id()
  )
);