
-- 1. Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Create cleanup function
CREATE OR REPLACE FUNCTION public.close_conversations_without_presence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  conv_record RECORD;
BEGIN
  FOR conv_record IN
    SELECT c.id, c.user1_id, c.user2_id, c.place_id
    FROM public.conversations c
    WHERE c.ativo = true
      AND NOT (
        EXISTS (
          SELECT 1 FROM public.presence p
          WHERE p.user_id = c.user1_id
            AND p.place_id = c.place_id
            AND p.ativo = true
            AND p.ultima_atividade > now() - interval '10 minutes'
        )
        AND
        EXISTS (
          SELECT 1 FROM public.presence p
          WHERE p.user_id = c.user2_id
            AND p.place_id = c.place_id
            AND p.ativo = true
            AND p.ultima_atividade > now() - interval '10 minutes'
        )
      )
  LOOP
    UPDATE public.conversations
    SET
      ativo = false,
      encerrado_em = now(),
      encerrado_motivo = 'presence_end',
      reinteracao_permitida_em = now() + interval '24 hours'
    WHERE id = conv_record.id;

    RAISE LOG '[close_conversations_without_presence] Closed conversation % (user1=%, user2=%, place=%)',
      conv_record.id, conv_record.user1_id, conv_record.user2_id, conv_record.place_id;
  END LOOP;
END;
$$;

-- 3. Schedule cron job every 5 minutes
SELECT cron.schedule(
  'close-conversations-without-presence',
  '*/5 * * * *',
  'SELECT public.close_conversations_without_presence()'
);
