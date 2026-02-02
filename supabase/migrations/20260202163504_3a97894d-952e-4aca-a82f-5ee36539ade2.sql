-- ============================================================================
-- SILENCIAMENTO E BLOQUEIO - v2 (Corrigida)
-- ============================================================================
-- DECISÕES DE DESIGN DOCUMENTADAS:
-- 
-- 1. MUTES: Temporários, assimétricos, repetíveis
--    - SEM índice UNIQUE parcial (now() não funciona como esperado em índices)
--    - Validação de "apenas um mute ativo" feita na APLICAÇÃO
--    - place_id é informativo; expiração por local é lógica de aplicação
--    - Sem UPDATE: recriar garante histórico e evita race conditions
--
-- 2. BLOCKS: Permanentes, armazenamento DIRECIONAL, efeito BILATERAL
--    - Escrita: apenas (A → B) - quem bloqueia cria o registro
--    - Leitura: função considera (A → B) OR (B → A) - efeito simétrico
--    - Apenas quem criou pode desfazer (DELETE)
--    - Sem UPDATE: estado binário simples, delete = unblock
-- ============================================================================

-- ============================================================================
-- TABELA: user_mutes (Silenciamento temporário)
-- ============================================================================
CREATE TABLE public.user_mutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  muted_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  place_id UUID REFERENCES public.places(id) ON DELETE SET NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expira_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours'),
  
  -- Constraint: não pode silenciar a si mesmo
  CONSTRAINT user_mutes_no_self_mute CHECK (user_id != muted_user_id)
);

-- Comentário explicativo
COMMENT ON TABLE public.user_mutes IS 
'Silenciamento temporário entre usuários. Assimétrico: A silencia B, mas B ainda vê A.
Expiração: 24h por padrão OU troca de local (lógica de aplicação).
NOTA: Validação de "apenas um mute ativo por par" é feita na aplicação, não no banco.';

COMMENT ON COLUMN public.user_mutes.place_id IS 
'Local onde o mute foi criado. Usado pela aplicação para expirar mutes ao trocar de local.';

-- Índices para performance (SEM UNIQUE parcial - evita armadilha com now())
CREATE INDEX idx_user_mutes_user_id ON public.user_mutes(user_id);
CREATE INDEX idx_user_mutes_muted_user_id ON public.user_mutes(muted_user_id);
CREATE INDEX idx_user_mutes_expira_em ON public.user_mutes(expira_em);
CREATE INDEX idx_user_mutes_lookup ON public.user_mutes(user_id, muted_user_id, expira_em);

-- RLS para user_mutes
ALTER TABLE public.user_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own mutes"
  ON public.user_mutes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create mutes"
  ON public.user_mutes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- DELETE permitido para "dessilenciar"
CREATE POLICY "Users can delete their own mutes"
  ON public.user_mutes FOR DELETE
  USING (auth.uid() = user_id);

-- NOTA: UPDATE não permitido intencionalmente
-- Motivo: recriar mute garante histórico limpo e evita race conditions

-- ============================================================================
-- TABELA: user_blocks (Bloqueio permanente)
-- ============================================================================
CREATE TABLE public.user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Constraint: não pode bloquear a si mesmo
  CONSTRAINT user_blocks_no_self_block CHECK (user_id != blocked_user_id),
  
  -- UNIQUE: apenas um bloqueio por direção
  CONSTRAINT user_blocks_unique UNIQUE (user_id, blocked_user_id)
);

-- Comentário explicativo
COMMENT ON TABLE public.user_blocks IS 
'Bloqueio permanente entre usuários.
ARMAZENAMENTO: Direcional (A → B) - apenas quem bloqueia cria registro.
EFEITO: Bilateral - função is_user_blocked() considera ambas direções.
DESFAZER: Apenas quem criou o bloqueio pode deletar.';

-- Índices para performance
CREATE INDEX idx_user_blocks_user_id ON public.user_blocks(user_id);
CREATE INDEX idx_user_blocks_blocked_user_id ON public.user_blocks(blocked_user_id);
CREATE INDEX idx_user_blocks_lookup ON public.user_blocks(user_id, blocked_user_id);

-- RLS para user_blocks
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view blocks involving them"
  ON public.user_blocks FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = blocked_user_id);

CREATE POLICY "Users can create blocks"
  ON public.user_blocks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- DELETE permitido apenas para quem criou (desfazer bloqueio)
CREATE POLICY "Users can delete blocks they created"
  ON public.user_blocks FOR DELETE
  USING (auth.uid() = user_id);

-- NOTA: UPDATE não permitido intencionalmente
-- Motivo: estado binário simples, delete = unblock

-- ============================================================================
-- FUNÇÃO: is_user_blocked (SECURITY DEFINER - apenas leitura)
-- ============================================================================
-- IMPORTANTE: Bloqueio é SIMÉTRICO no efeito, não no armazenamento.
-- Se A bloqueou B, ambos ficam invisíveis um para o outro.
-- Porém, apenas A pode desfazer o bloqueio.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_user_blocked(
  p_user_id UUID,
  p_other_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE 
      -- Bloqueio criado por p_user_id
      (user_id = p_user_id AND blocked_user_id = p_other_user_id)
      OR
      -- Bloqueio criado por p_other_user_id (efeito bilateral)
      (user_id = p_other_user_id AND blocked_user_id = p_user_id)
  );
$$;

COMMENT ON FUNCTION public.is_user_blocked IS 
'Verifica se existe bloqueio ATIVO entre dois usuários.
EFEITO BILATERAL: retorna true se qualquer um dos dois bloqueou o outro.
Armazenamento é direcional, mas efeito é simétrico para invisibilidade mútua.';

-- ============================================================================
-- FUNÇÃO: is_user_muted (SECURITY DEFINER - apenas leitura)
-- ============================================================================
-- IMPORTANTE: Silenciamento é ASSIMÉTRICO.
-- Se A silenciou B: B fica invisível para A, mas A continua visível para B.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_user_muted(
  p_user_id UUID,
  p_other_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_mutes
    WHERE 
      user_id = p_user_id 
      AND muted_user_id = p_other_user_id
      AND expira_em > now()  -- Apenas mutes ativos (não expirados)
  );
$$;

COMMENT ON FUNCTION public.is_user_muted IS 
'Verifica se p_user_id tem um mute ATIVO sobre p_other_user_id.
ASSIMÉTRICO: apenas verifica uma direção.
Mute expira após 24h OU por troca de local (lógica de aplicação).';

-- ============================================================================
-- FUNÇÃO: get_active_mute_for_pair (helper para validação na aplicação)
-- ============================================================================
-- Usada pela aplicação para verificar se já existe mute ativo antes de inserir
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_active_mute_for_pair(
  p_user_id UUID,
  p_muted_user_id UUID
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.user_mutes
  WHERE 
    user_id = p_user_id 
    AND muted_user_id = p_muted_user_id
    AND expira_em > now()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_active_mute_for_pair IS 
'Retorna o ID do mute ativo entre dois usuários, se existir.
Usado pela aplicação para validar antes de criar novo mute.
Retorna NULL se não houver mute ativo.';