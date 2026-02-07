# Auditoria Completa de Regras -- Swipe, Chat, Silenciar e Bloquear

---

## 1. Mapa de Implementacao por Regra

### Tabela de Auditoria

| Regra | Onde esta implementada | Fluxos que consomem | Respeitada em todos os fluxos? | Detalhes da violacao |
|---|---|---|---|---|
| **1.1 Cooldown 24h (Chat)** | `interactionRules.ts` (linhas 141-168): `hasCooldown` + `cooldownByA`; `end_presence_cascade` (SQL): seta `reinteracao_permitida_em = now() + 24h`; `useChat.ts` (linha 234): seta cooldown no encerramento manual | Home (botao card), sendWave (validacao canonica), acceptWave (validacao canonica) | **SIM** | Nenhuma violacao encontrada. O cooldown e verificado tanto na UI (deriveFacts -> hasCooldown) quanto na validacao de acao (canWave/canAcceptWave). Apos 24h, o estado cai para NONE normalmente (linhas 171-172 de interactionRules.ts). |
| **1.2 Silenciar (Mute 24h)** | `interactionRules.ts` (linhas 114-123): `isMutedByA`; `deriveFacts` (linhas 286-291): verifica expiracao; `Home.tsx` (linhas 74-111): handleMute (insert/delete em user_mutes); `SwipeActions.tsx`: botoes visuais | Home (card + swipe), sendWave, acceptWave | **NAO** | **Violacao de visibilidade** -- ver secao 3.2 abaixo |
| **1.3 Bloquear (Permanente)** | `interactionRules.ts` (linhas 103-112): `isBlocked` bilateral; `deriveFacts` (linhas 278-283): verifica ambas direcoes; `Home.tsx` (linhas 114-151): handleBlock (insert/delete em user_blocks); `is_user_blocked` (SQL): funcao bilateral | Home (card + swipe), sendWave, acceptWave | **PARCIAL** | **Violacao de visibilidade para quem bloqueou** -- ver secao 3.3 abaixo |
| **1.4 Precedencia** | `interactionRules.ts` (linhas 102-213): BLOCKED > MUTED > CHAT_ACTIVE > COOLDOWN > WAVE_RECEIVED > WAVE_SENT > NONE | Home (useInteractionState), sendWave (canWave), acceptWave (canAcceptWave) | **SIM** | Precedencia corretamente implementada na funcao `getInteractionState`. |

---

## 2. Analise Detalhada por Ponto Critico

### 3.1 CHAT -- Existe algum fluxo que reativa canWave antes de 24h?

**NAO.** A verificacao de cooldown e robusta:

- `deriveFacts` calcula `hasCooldown` comparando `reinteracao_permitida_em` com `now` (linha 309)
- `canWave` bloqueia se `hasCooldown` e true (linha 364)
- `sendWave` em `useWaves.ts` busca dados frescos do banco antes de validar (linhas 136-198)
- O cooldown e setado tanto por `end_presence_cascade` (SQL) quanto por `endChat` manual (useChat.ts linha 234)

Nenhum fluxo ignora ou contorna o cooldown.

---

### 3.2 SILENCIAR -- O usuario silenciado ainda consegue ver quem silenciou?

**SIM -- VIOLACAO CRITICA.**

**O problema:** A visibilidade de A para B quando A silencia B depende de dois pontos:

1. **Na maquina de estados (interactionRules.ts):** A regra MUTED so e avaliada da perspectiva de A (quem silenciou). Quando B olha para A, os fatos derivados para B nao incluem `isMutedByA` (porque B nao silenciou A). Portanto, B ve o card de A normalmente com estado NONE.

2. **No hook usePeopleNearby:** Retorna TODOS os usuarios com presenca ativa. Nao filtra por mutes.

3. **No PersonCard:** Usa `useInteractionState` que chama `deriveFacts(currentUser, otherUser, ...)`. Quando `currentUser = B` e `otherUser = A`, o fato `isMutedByA` verifica se **B** silenciou **A** (nao o contrario).

**Resultado:** A regra diz que "A deixa de aparecer para B na Home". Mas o sistema so rastreia o mute da perspectiva de quem executou. B nao tem como saber que A o silenciou porque:
- A tabela `user_mutes` tem RLS `auth.uid() = user_id` para SELECT -- B nao pode ver mutes criados por A
- `deriveFacts` so verifica `isMutedByA` (mutes onde o usuario atual e o autor)
- Nao existe fato `isMutedByB` (o outro me silenciou)

Onde a regra esta sendo violada:

A violacao ocorre ANTES da maquina de estados, na camada de listagem de usuarios visiveis (ex: `usePeopleNearby`),
que atualmente nao aplica nenhuma regra de ocultacao baseada em mute.

A maquina de estados apenas reflete o estado do ponto de vista do usuario atual,
mas nao e responsavel por decidir quem aparece ou nao na Home.

**Motivo tecnico:** O mute foi implementado apenas como estado visual para quem executou, sem implementar o efeito de ocultacao para o alvo. A RLS de `user_mutes` impede que B veja os mutes de A, entao mesmo que `deriveFacts` tentasse verificar, a query nao retornaria dados.

**A mesma violacao afeta o fluxo de acenar:** B consegue acenar para A normalmente, porque `canWave` so verifica `isMutedByA` (se eu silenciei o outro), nao se o outro me silenciou.

**Comportamento correto esperado (regra canônica):**

Quando A silencia B:
- A continua vendo o card de B, com estado visual "Silenciado"
- B NÃO deve ver o card de A na Home
- B NÃO pode acenar, aceitar aceno ou iniciar chat com A enquanto o mute estiver ativo
- Após a expiração de 24h, a visibilidade e as interações voltam automaticamente ao normal

---

### 3.3 BLOQUEAR -- O bloqueio esta bilateral mas quem bloqueou tambem perde visibilidade

**PARCIAL -- INCONSISTENCIA COM REGRA DE NEGOCIO.**

Regra canônica de bloqueio para este ciclo:
Para quem foi bloqueado: o outro usuário é sempre invisível
Para quem bloqueou: o card permanece visível, exclusivamente para permitir desbloqueio
Portanto, o bloqueio não é simétrico em visibilidade, apenas em restrição de interação

**O que acontece hoje:**

1. `deriveFacts` (linhas 278-283): `isBlocked` e bilateral -- retorna true se existe bloqueio em QUALQUER direcao
2. `getInteractionState` (linhas 103-112): Se `isBlocked`, retorna `isVisible: false`
3. `PersonCard` (linha 156-158): Se `!isVisible`, retorna `null`

**Resultado:** Quando A bloqueia B:
- O card de B desaparece para A (correto pela regra bilateral, mas CONTRADIZ a regra do swipe que diz que o card de B permanece visivel para A)
- O card de A desaparece para B (correto)

**Onde a regra esta sendo violada:** `interactionRules.ts` -> `getInteractionState` (linhas 103-112). O bloqueio aplica `isVisible: false` para AMBAS as direcoes, mas a regra de negocio do swipe exige que o card permaneca visivel para quem bloqueou (para permitir desbloquear).

**Motivo tecnico:** `deriveFacts` usa um unico fato booleano `isBlocked` que nao diferencia quem criou o bloqueio. Seria necessario separar em `isBlockedByMe` e `isBlockedByOther` para aplicar visibilidades diferentes.

**NOTA:** Este problema foi identificado no plano anterior (secao 6), mas foi explicitamente marcado como "fora do escopo" e nao corrigido. Portanto, a inconsistencia existe e e conhecida.

---

### 3.4 SWIPE ACTIONS -- Alguma acao de swipe ignora cooldown, mute ou block?

**NAO diretamente, MAS ha uma inconsistencia logica:**

Os botoes de swipe (Silenciar/Bloquear) sao acoes INDEPENDENTES da maquina de estados do botao principal. Elas nao passam pela validacao de `canWave` ou `canAcceptWave`. Isso e **correto por design** -- silenciar e bloquear sao acoes de moderacao, nao de interacao.

Porem, a regra de convivencia entre mute e block tem uma lacuna:

- **SwipeActions.tsx** (linhas 14-15): `muteDisabledByBlock = isBlocked`
- Mas `isBlocked` aqui e `isBlockedByMe` (derivado localmente no PersonCard, linhas 71-73)
- Se B bloqueou A, o card de A ja e invisivel para B (nao chega no swipe)
- Se A bloqueou B, `isBlockedByMe = true`, e o botao de mute fica inerte -- **CORRETO**

Nenhuma violacao encontrada no swipe em si.

---

## 3. Lista Consolidada de Inconsistencias

| # | Inconsistencia | Arquivos envolvidos | Motivo tecnico |
|---|---|---|---|
| **I1** | Mute nao oculta o autor para o alvo | `interactionRules.ts` (deriveFacts, getInteractionState), `useInteractionData.ts` (RLS impede leitura cruzada de mutes) | Falta fato `isMutedByOther`. RLS de user_mutes impede B de ver mutes de A. deriveFacts so verifica mutes do usuario atual. |
| **I2** | Mute nao impede o alvo de acenar | `interactionRules.ts` (canWave) | canWave so verifica `isMutedByA` (se eu silenciei o outro). Nao verifica se o outro me silenciou. Mesmo problema de I1. |
| **I3** | Block oculta card para ambos (incluindo quem bloqueou) | `interactionRules.ts` (getInteractionState, linhas 103-112) | Fato `isBlocked` e unico e bilateral. Nao diferencia direcao. `isVisible: false` aplicado para ambas as perspectivas. |

---

## 4. Propostas de Correcao (Conceituais -- Sem Implementacao)

### Para I1 e I2 (Mute invisivel para o alvo)

**Opcao A -- Backend (recomendada):** Criar uma funcao SQL `SECURITY DEFINER` que retorna os IDs de usuarios que silenciaram o usuario atual (sem expor os registros de mute). Exemplo: `get_users_who_muted_me(p_user_id)`. Essa funcao pode ser chamada por `useInteractionData` para alimentar um novo fato.

**Opcao B -- Filtro na query de presenca:** Adicionar filtro no `usePeopleNearby` usando a funcao `is_user_muted(p_user_id, p_other_user_id)` (que ja existe como SECURITY DEFINER). Isso filtraria usuarios que silenciaram o usuario atual diretamente na listagem.

**Opcao C -- Fato adicional na maquina de estados:** Adicionar `isMutedByOther` ao InteractionFacts. Requer que `useInteractionData` consiga buscar mutes onde `muted_user_id = currentUser` (atualmente bloqueado pela RLS). Exigiria uma funcao SQL intermediaria ou alteracao de RLS.

Decisao para este ciclo:

A Opcao B deve ser implementada.
As opcoes A e C ficam fora do escopo e nao devem ser consideradas.

### Para I3 (Block oculta card para quem bloqueou)

Separar `isBlocked` em dois fatos:
- `isBlockedByMe`: eu criei o bloqueio
- `isBlockedByOther`: o outro criou o bloqueio

Ajustar `getInteractionState`:
- `isBlockedByOther` -> `isVisible: false` (o outro me bloqueou, sou invisivel)
- `isBlockedByMe` -> `isVisible: true`, estado BLOCKED com label "Bloqueado", botao disabled

Ajustar `canWave` e `canAcceptWave` para usar `isBlockedByMe || isBlockedByOther`.

Os dados ja estao disponiveis em `useInteractionData` (blocks inclui `user_id` e `blocked_user_id`), e a RLS de user_blocks permite SELECT para ambas as partes (`auth.uid() = user_id OR auth.uid() = blocked_user_id`). Portanto, `deriveFacts` pode calcular os dois fatos sem alteracao de RLS ou funcoes SQL.

---

## 5. Regra estrutural:
A visibilidade de usuários na Home é definida antes da máquina de estados, na camada de listagem (usePeopleNearby ou equivalente).
A máquina de estados não decide quem aparece, apenas como o card se comporta quando já está visível.

---

## 6. Regra de expiração do mute (24h):

Ao expirar o mute, nenhuma ação manual é necessária
A visibilidade e as interações devem retornar automaticamente
Não deve existir estado residual, flag manual ou cache persistente

---

## 7. Regra de isolamento entre Mute e Block

Mute nunca deve:
- Setar isBlocked
- Usar lógica de block
- Afetar visibilidade de quem executou o mute

Mute atua exclusivamente como:
- Filtro temporário de visibilidade para o alvo
- Bloqueio temporário de interações para o alvo

---

## 8. Resumo

**O que funciona corretamente:**
- Cooldown de 24h apos encerramento de chat
- Precedencia de estados
- Validacao canonica de sendWave e acceptWave
- Swipe actions (mecanica e convivencia mute/block)
- Expiracao automatica de mute (via comparacao de timestamp)

**O que esta quebrado:**
- **I1/I2:** Mute nao tem efeito sobre o alvo (visibilidade e interacao nao sao bloqueadas para quem foi silenciado)
- **I3:** Block remove o card para quem bloqueou (impedindo desbloqueio via swipe)

**Base para correcao:**
- I1/I2: Funcao SQL existente (`is_user_muted`) pode resolver sem alterar maquina de estados
- I3: Separar fato `isBlocked` em dois na maquina de estados (dados ja disponiveis)

---

## 9. Critérios de aceite deste plano:

- Durante um mute ativo, o usuário que foi silenciado NÃO deve ser retornado pela query de listagem (usePeopleNearby ou equivalente) para o usuário silenciado.
- Um usuário bloqueado nunca vê quem o bloqueou
- Quem bloqueia sempre vê o bloqueado na Home, independentemente de tempo ou presença, exclusivamente para permitir desbloqueio
- Quem bloqueia sempre vê o bloqueado com estado BLOCKED
- Nenhuma ação de wave ou chat ignora mute, block ou cooldown
- Após 24h, mute e cooldown expiram sem ação manual
- Nenhuma regra existente de chat, encerramento de conversa ou cooldown pode ser alterada neste ciclo
- Qualquer modificação em chat fora do que está descrito aqui deve ser rejeitada

Qualquer implementacao que nao respeite essas regras, mesmo que tecnicamente funcional, deve ser considerada incorreta.

