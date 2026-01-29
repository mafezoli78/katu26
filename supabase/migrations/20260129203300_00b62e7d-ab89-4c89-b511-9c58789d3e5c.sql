-- ============================================================
-- MIGRAÇÃO: Modelo de Interação com Cooldown (AJUSTADO)
-- ============================================================

-- 1. Adicionar coluna de cooldown em conversations
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS reinteracao_permitida_em timestamp with time zone;

-- 2. Remover constraint legada de waves (location_id deprecated)
DROP INDEX IF EXISTS waves_unique_pending_wave;
ALTER TABLE public.waves DROP CONSTRAINT IF EXISTS waves_de_user_id_para_user_id_location_id_key;

-- 3. Criar índice único filtrado para waves (place_id + pending)
-- Permite múltiplos waves históricos, mas apenas 1 pending por par+local
CREATE UNIQUE INDEX IF NOT EXISTS waves_unique_pending_wave 
ON public.waves (de_user_id, para_user_id, place_id) 
WHERE status = 'pending';

-- 4. Remover UNIQUE de presence.user_id (permite histórico)
ALTER TABLE public.presence DROP CONSTRAINT IF EXISTS presence_user_id_key;

-- 5. Limpar waves órfãs (place_id NULL) - defensivo
DELETE FROM public.waves 
WHERE place_id IS NULL 
  AND status = 'pending';

-- 6. Função de cascade AJUSTADA
-- - Cooldown limitado ao place_id da conversa
-- - Recebe motivo como parâmetro (preserva distinção)
CREATE OR REPLACE FUNCTION public.end_presence_cascade(
  p_user_id uuid,
  p_place_id uuid,
  p_motivo text DEFAULT 'presence_end'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  conv_record RECORD;
BEGIN
  -- Step 1: Encerrar a presença do usuário
  UPDATE public.presence
  SET ativo = false
  WHERE user_id = p_user_id
    AND place_id = p_place_id
    AND ativo = true;
  
  RAISE LOG '[end_presence_cascade] Presence ended for user % at place % (reason: %)', p_user_id, p_place_id, p_motivo;

  -- Step 2: Deletar waves pendentes APENAS deste place_id
  DELETE FROM public.waves
  WHERE status = 'pending'
    AND (de_user_id = p_user_id OR para_user_id = p_user_id)
    AND place_id = p_place_id;
  
  RAISE LOG '[end_presence_cascade] Deleted pending waves for user % at place %', p_user_id, p_place_id;

  -- Step 3: Encerrar conversas ativas APENAS deste place_id (não todas)
  -- Aplica cooldown de 24h para impedir reinteração imediata
  FOR conv_record IN
    SELECT id FROM public.conversations
    WHERE ativo = true
      AND place_id = p_place_id
      AND (user1_id = p_user_id OR user2_id = p_user_id)
  LOOP
    -- Deletar mensagens primeiro (efêmeras)
    DELETE FROM public.messages
    WHERE conversation_id = conv_record.id;
    
    -- Marcar conversa como encerrada COM cooldown
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

  -- Step 4: Verificar se é um local temporário sem usuários restantes
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