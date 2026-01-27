-- 1. Adicionar colunas de encerramento na tabela conversations
ALTER TABLE public.conversations
ADD COLUMN encerrado_por uuid REFERENCES public.profiles(id),
ADD COLUMN encerrado_em timestamp with time zone,
ADD COLUMN encerrado_motivo text CHECK (encerrado_motivo IN ('manual', 'presence_end'));

-- 2. Criar tabela de mensagens efêmeras
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  conteudo text NOT NULL,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

-- 3. Habilitar RLS na tabela messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 4. Política: usuários podem ver mensagens de conversas das quais participam
CREATE POLICY "Users can view messages in their conversations"
ON public.messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
    AND c.ativo = true
    AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
  )
);

-- 5. Política: usuários podem enviar mensagens em conversas ativas das quais participam
CREATE POLICY "Users can send messages in their active conversations"
ON public.messages
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
    AND c.ativo = true
    AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
  )
);

-- 6. Índices para performance
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_criado_em ON public.messages(criado_em);
CREATE INDEX idx_conversations_encerrado ON public.conversations(encerrado_em) WHERE encerrado_em IS NOT NULL;

-- 7. Habilitar Realtime para mensagens e conversas
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;