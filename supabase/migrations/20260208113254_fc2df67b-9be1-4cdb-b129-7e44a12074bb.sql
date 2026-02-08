
-- Drop the current SELECT policy
DROP POLICY "Users can view their own mutes" ON public.user_mutes;

-- Create bilateral SELECT policy (matches user_blocks pattern)
CREATE POLICY "Users can view mutes involving them"
ON public.user_mutes
FOR SELECT
USING (auth.uid() = user_id OR auth.uid() = muted_user_id);
