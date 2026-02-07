Swipe Actions: Silenciar e Bloquear (UI + Backend)

Resumo

Conectar os botoes "Silenciar" e "Bloquear" (ja existentes no swipe dos cards) as tabelas user_mutes e user_blocks do banco de dados, com feedback visual de estado ON/OFF e reversibilidade.


---

Arquitetura da solucao

O banco ja possui as tabelas user_mutes e user_blocks com as colunas e RLS policies necessarias. A funcao is_user_blocked (bilateral) e get_active_mute_for_pair ja existem. A maquina de estados em interactionRules.ts ja trata MUTED e BLOCKED com a precedencia correta.

O trabalho se resume a:
1. Executar ações de mute e block reutilizando a mesma lógica já usada no Chat
2. Garantir que as mutações reflitam nos fatos de interação já consumidos pela máquina de estados
3. Atualizar apenas o feedback visual dos botões de swipe com base no estado derivado existente

---

Detalhes tecnicos

1. Integração de ações via Home (PersonCard permanece passivo)

O PersonCard apenas dispara eventos de intenção. Toda a lógica de decisão e mutação permanece fora do componente.

onMute: (userId: string) => Promise<void> -- silenciar/des-silenciar

onBlock: (userId: string) => Promise<void> -- bloquear/desbloquear


2. Reutilização da lógica de mute/block existente

As ações de mute e block devem reutilizar exatamente a mesma lógica já utilizada no fluxo de Chat, garantindo consistência de comportamento.

Nenhum novo hook de regra será criado neste ciclo.

A extração para um hook compartilhado poderá ser avaliada posteriormente, caso necessário.

3. Alteracoes no PersonCard (visual dos botoes)

Os botoes de swipe deixam de ter fundo colorido e passam a ter apenas icone + texto, usando cores sobrias da paleta:

Estado OFF (acao disponivel):

Icone outline (VolumeX, Ban)

Texto: "Silenciar" / "Bloquear"

Cor: text-foreground/70


Estado ON (acao aplicada):

Icone preenchido (fill via className)

Texto: "Silenciado" / "Bloqueado"

Cor: text-foreground com opacidade diferente ou peso visual maior


Regra de convivencia: Se o estado de interacao for BLOCKED, o botao "Silenciar" fica visualmente inerte (opacidade reduzida, sem acao). Isso e verificado pelo state ja disponivel no componente.

Para determinar se o botao esta ON/OFF, o PersonCard verifica:

Silenciado: existe um mute ativo em activeMutes onde user_id === currentUserId e muted_user_id === person.id

Bloqueado: existe um block em blocks onde user_id === currentUserId e blocked_user_id === person.id


Esses dados ja sao passados como props (activeMutes, blocks).

4. Alteracoes no Home.tsx

Reutilizar diretamente as mesmas funções de mute e block já utilizadas no fluxo de Chat, sem criação de novos hooks neste ciclo.

Passar onMute e onBlock ao PersonCard

O refetch de interactionData ja existe e deve ser reutilizado apos cada acao, seguindo o mesmo padrao usado no Chat.


5. Visibilidade do card (regra existente)

A regra de visibilidade ja esta implementada:

BLOCKED -> isVisible: false (card some para quem foi bloqueado, via efeito bilateral de is_user_blocked)

MUTED -> isVisible: true (card permanece visivel para quem silenciou)


Para quem executou a acao (A), o card de B continua visivel porque:

Mute: isMutedByA ativa estado MUTED (isVisible: true)

Block: isBlocked ativa estado BLOCKED (isVisible: false) -- porem, o bloqueio via deriveFacts usa a verificacao bilateral. Isso significa que o card de B tambem some para A.

6. Sem alterações na máquina de estados

A lógica atual de visibilidade e bloqueio bilateral será mantida sem alterações neste ciclo.

O comportamento existente é considerado aceitável para o MVP e para a apresentação.

Qualquer ajuste de semântica (ex: diferenciar “bloqueado por mim” vs “bloqueado pelo outro”) fica explicitamente fora do escopo deste plano.

7. Fechamento do card apos acao

Apos o usuario tocar em "Silenciar" ou "Bloquear", o card de swipe deve fechar automaticamente (translateX volta a 0), dando feedback de que a acao foi executada. Isso e feito chamando onSwipeOpen(null) apos a mutacao.


---

Arquivos modificados

Arquivo | Mudanca

src/components/home/PersonCard.tsx | Disparo de ações e feedback visual ON/OFF
src/pages/Home.tsx | Orquestração das ações de mute/block
(Reutilizado) lógica de Chat | Execução real das regras de mute/block

---

Nao alterar

Mecanica de swipe (touch handlers, thresholds, snap)

Tabelas do banco (schema ja existe)

RLS policies (ja configuradas corretamente)

useInteractionData (ja busca mutes e blocks)

Pagina de Chat (mute no chat permanece independente)

interactionRules.ts e useInteractionState.ts não devem ser modificados neste ciclo.