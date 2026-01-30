-- ============================================================
-- MIGRAÇÃO: Integridade Global de Presença + RPC Centralizada
-- ============================================================
-- 1. Saneamento de dados existentes
-- 2. Índice único global (1 presença ativa por usuário)
-- 3. Função activate_presence com lock de concorrência
-- ============================================================

-- STEP 1: Sanear dados - manter apenas a presença mais recente por usuário
WITH ranked_presences AS (
  SELECT 
    id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY inicio DESC) as rn
  FROM public.presence
  WHERE ativo = true
)
UPDATE public.presence
SET ativo = false
WHERE id IN (
  SELECT id FROM ranked_presences WHERE rn > 1
);

-- STEP 2: Criar índice único garantindo 1 presença ativa por usuário globalmente
CREATE UNIQUE INDEX IF NOT EXISTS presence_unique_active_per_user
ON public.presence (user_id)
WHERE ativo = true;

-- STEP 3: Função RPC centralizada com lock de concorrência
CREATE OR REPLACE FUNCTION public.activate_presence(
  p_user_id UUID,
  p_place_id UUID,
  p_intention_id UUID,
  p_assunto_atual TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_place_id UUID;
  v_new_presence_id UUID;
BEGIN
  -- 0. Lock lógico por usuário (evita concorrência humana / rede)
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- 1. Verificar presença ativa atual
  SELECT place_id
  INTO v_old_place_id
  FROM public.presence
  WHERE user_id = p_user_id
    AND ativo = true
  LIMIT 1;

  -- 2. Encerrar presença anterior (se existir)
  IF v_old_place_id IS NOT NULL THEN
    PERFORM end_presence_cascade(
      p_user_id,
      v_old_place_id,
      'switched_place'
    );
  END IF;

  -- 3. Expirar waves pendentes globalmente
  UPDATE public.waves
  SET status = 'expired'
  WHERE status = 'pending'
    AND (de_user_id = p_user_id OR para_user_id = p_user_id);

  -- 4. Criar nova presença
  INSERT INTO public.presence (
    user_id,
    place_id,
    intention_id,
    assunto_atual,
    inicio,
    ultima_atividade,
    ativo
  ) VALUES (
    p_user_id,
    p_place_id,
    p_intention_id,
    NULLIF(TRIM(p_assunto_atual), ''),
    now(),
    now(),
    true
  )
  RETURNING id INTO v_new_presence_id;

  RAISE LOG
    '[activate_presence] user=% place=% previous_place=%',
    p_user_id,
    p_place_id,
    COALESCE(v_old_place_id::text, 'none');

  RETURN v_new_presence_id;
END;
$$;