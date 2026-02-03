-- 1. Add is_confirmed column to presence table
-- Presence starts as provisional (false) and becomes confirmed when user is detected inside radius
ALTER TABLE public.presence 
ADD COLUMN IF NOT EXISTS is_confirmed boolean NOT NULL DEFAULT false;

-- 2. Add confirmed_at timestamp for auditing
ALTER TABLE public.presence 
ADD COLUMN IF NOT EXISTS confirmed_at timestamp with time zone DEFAULT NULL;

-- 3. Create function to confirm presence (called when user is detected inside radius)
CREATE OR REPLACE FUNCTION public.confirm_presence(p_user_id uuid, p_place_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated boolean := false;
BEGIN
  UPDATE public.presence
  SET 
    is_confirmed = true,
    confirmed_at = now()
  WHERE user_id = p_user_id
    AND place_id = p_place_id
    AND ativo = true
    AND is_confirmed = false;
  
  v_updated := FOUND;
  
  IF v_updated THEN
    RAISE LOG '[confirm_presence] Presence confirmed for user % at place %', p_user_id, p_place_id;
  END IF;
  
  RETURN v_updated;
END;
$$;

-- 4. Create function to check if automatic end is allowed
-- Only confirmed presences can be automatically ended
CREATE OR REPLACE FUNCTION public.can_auto_end_presence(p_user_id uuid, p_place_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT is_confirmed 
     FROM public.presence 
     WHERE user_id = p_user_id 
       AND place_id = p_place_id 
       AND ativo = true
     LIMIT 1),
    false
  );
$$;

-- 5. Update end_presence_cascade to respect is_confirmed for automatic endings
-- Add a parameter to indicate if it's a human-initiated action
CREATE OR REPLACE FUNCTION public.end_presence_cascade(
  p_user_id uuid, 
  p_place_id uuid, 
  p_motivo text DEFAULT 'presence_end'::text,
  p_force boolean DEFAULT false  -- Force end even if not confirmed (for manual/expired)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  conv_record RECORD;
  v_is_confirmed boolean;
  v_is_human_action boolean;
BEGIN
  -- Determine if this is a human-initiated action
  -- Human actions: manual, expired, user_left_location, presence_expired
  -- Automatic actions: gps_exit, background, revalidation, network
  v_is_human_action := p_motivo IN ('manual', 'expired', 'user_left_location', 'presence_expired', 'switched_place');
  
  -- Check if presence is confirmed
  SELECT is_confirmed INTO v_is_confirmed
  FROM public.presence
  WHERE user_id = p_user_id
    AND place_id = p_place_id
    AND ativo = true
  LIMIT 1;
  
  -- CRITICAL: Block automatic endings for unconfirmed presences
  -- Only human actions or forced ends can terminate unconfirmed presences
  IF NOT COALESCE(v_is_confirmed, false) AND NOT v_is_human_action AND NOT p_force THEN
    RAISE LOG '[end_presence_cascade] BLOCKED: Cannot auto-end unconfirmed presence. user=% place=% reason=%', 
      p_user_id, p_place_id, p_motivo;
    RETURN; -- Early exit - do not end the presence
  END IF;

  -- Step 1: End user presence
  UPDATE public.presence
  SET ativo = false
  WHERE user_id = p_user_id
    AND place_id = p_place_id
    AND ativo = true;
  
  RAISE LOG '[end_presence_cascade] Presence ended for user % at place % (reason: %, confirmed: %)', 
    p_user_id, p_place_id, p_motivo, COALESCE(v_is_confirmed, false);

  -- Step 2: Delete pending waves for this place only
  DELETE FROM public.waves
  WHERE status = 'pending'
    AND (de_user_id = p_user_id OR para_user_id = p_user_id)
    AND place_id = p_place_id;
  
  RAISE LOG '[end_presence_cascade] Deleted pending waves for user % at place %', p_user_id, p_place_id;

  -- Step 3: End active conversations for this place with 24h cooldown
  FOR conv_record IN
    SELECT id FROM public.conversations
    WHERE ativo = true
      AND place_id = p_place_id
      AND (user1_id = p_user_id OR user2_id = p_user_id)
  LOOP
    DELETE FROM public.messages
    WHERE conversation_id = conv_record.id;
    
    UPDATE public.conversations
    SET 
      ativo = false,
      encerrado_por = p_user_id,
      encerrado_em = now(),
      encerrado_motivo = p_motivo,
      reinteracao_permitida_em = now() + interval '24 hours'
    WHERE id = conv_record.id;
    
    RAISE LOG '[end_presence_cascade] Ended conversation % with 24h cooldown (reason: %)', conv_record.id, p_motivo;
  END LOOP;

  -- Step 4: Deactivate temporary place if no users remain
  IF EXISTS (
    SELECT 1 FROM public.places
    WHERE id = p_place_id
      AND is_temporary = true
      AND ativo = true
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.presence
      WHERE place_id = p_place_id
        AND ativo = true
        AND user_id != p_user_id
    ) THEN
      UPDATE public.places
      SET ativo = false
      WHERE id = p_place_id AND is_temporary = true;
      
      RAISE LOG '[end_presence_cascade] Deactivated temporary place %', p_place_id;
    END IF;
  END IF;
  
  RAISE LOG '[end_presence_cascade] Cascade cleanup completed for user % at place %', p_user_id, p_place_id;
END;
$$;