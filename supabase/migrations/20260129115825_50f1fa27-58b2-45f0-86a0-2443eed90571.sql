-- R2 CORRIGIDO: Função de limpeza em cascata ao encerrar presença
-- Corrige: location_id removido, presença encerrada, todas as conversas do usuário encerradas

CREATE OR REPLACE FUNCTION public.end_presence_cascade(
  p_user_id uuid,
  p_place_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  conv_record RECORD;
BEGIN
  -- Step 1: Encerrar a presença do usuário (OBRIGATÓRIO)
  UPDATE public.presence
  SET ativo = false
  WHERE user_id = p_user_id
    AND place_id = p_place_id
    AND ativo = true;
  
  RAISE LOG '[end_presence_cascade] Presence ended for user % at place %', p_user_id, p_place_id;

  -- Step 2: Deletar waves pendentes usando APENAS place_id (location_id é deprecated)
  DELETE FROM public.waves
  WHERE status = 'pending'
    AND (de_user_id = p_user_id OR para_user_id = p_user_id)
    AND place_id = p_place_id;
  
  RAISE LOG '[end_presence_cascade] Deleted pending waves for user % at place %', p_user_id, p_place_id;

  -- Step 3: Encerrar TODAS as conversas ativas do usuário (não apenas do place_id)
  -- Regra: Se o usuário saiu do local, ele não pode ter nenhuma conversa ativa
  FOR conv_record IN
    SELECT id FROM public.conversations
    WHERE ativo = true
      AND (user1_id = p_user_id OR user2_id = p_user_id)
  LOOP
    -- Deletar mensagens primeiro (efêmeras)
    DELETE FROM public.messages
    WHERE conversation_id = conv_record.id;
    
    -- Marcar conversa como encerrada
    -- encerrado_por = quem saiu do local
    -- encerrado_motivo = 'presence_end' (permite R3 diferenciar no frontend)
    UPDATE public.conversations
    SET 
      ativo = false,
      encerrado_por = p_user_id,
      encerrado_em = now(),
      encerrado_motivo = 'presence_end'
    WHERE id = conv_record.id;
    
    RAISE LOG '[end_presence_cascade] Ended conversation % and deleted messages', conv_record.id;
  END LOOP;

  -- Step 4: Verificar se é um local temporário sem usuários restantes
  IF EXISTS (
    SELECT 1 FROM public.places
    WHERE id = p_place_id
      AND is_temporary = true
      AND ativo = true
  ) THEN
    -- Contar presenças ativas restantes (excluindo usuário atual)
    IF NOT EXISTS (
      SELECT 1 FROM public.presence
      WHERE place_id = p_place_id
        AND ativo = true
        AND user_id != p_user_id
    ) THEN
      -- Desativar o local temporário
      UPDATE public.places
      SET ativo = false
      WHERE id = p_place_id AND is_temporary = true;
      
      RAISE LOG '[end_presence_cascade] Deactivated temporary place %', p_place_id;
    END IF;
  END IF;
  
  RAISE LOG '[end_presence_cascade] Cascade cleanup completed for user % at place %', p_user_id, p_place_id;
END;
$$;