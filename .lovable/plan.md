

# Plano de Implementacao -- Feedback de Sistema (Top 20%)

## Estrategia Geral

Corrigir os problemas de feedback mais criticos em ordem de risco crescente: comecar pelos itens puramente aditivos (sem risco de regressao), depois os de substituicao simples, e por ultimo os que tocam logica compartilhada. Cada item e independente e pode ser implementado isoladamente.

---

## Prioridade ALTA -- Impacto direto na compreensao do usuario

### A1. Toast duplicado ao aceitar aceno

- **Problema atual**: Ao aceitar um aceno, o usuario que aceita ve o toast "Conexao criada! (emoji)" (Waves.tsx, linha 163). Simultaneamente, o Realtime em `useConversations.tsx` (linha 163) dispara "Chat iniciado! (emoji)" para ambos os usuarios -- incluindo quem acabou de aceitar. Resultado: quem aceita ve dois toasts com textos diferentes para o mesmo evento.
- **Decisao de UX**: Quem aceita ve apenas "Chat iniciado! (emoji)". O toast Realtime "Chat iniciado! (emoji)" deve ser exibido apenas para o outro usuario (quem enviou o aceno original).
- **Tipo de feedback**: Toast (manter)
- **Texto final**: Exibir apenas o toast "Chat iniciado! (emoji)" para quem aceita o aceno.
- **Onde implementar**: src/hooks/useConversations.tsx — no handler de INSERT Realtime.
Suprimir a exibição do toast se a conversa tiver sido criada como resultado direto de uma ação local recente do usuário (ex: aceite de aceno), usando critério explícito de origem da ação (flag local, contexto de navegação ou timestamp curto).
Fallback aceitável no MVP: usar user2_id === currentUserId, com comentário explicativo no código indicando que é uma suposição válida apenas enquanto a regra de aceite for unidirecional.
- **Risco**: Baixo -- condicional simples, sem alterar fluxo de dados

**Nota técnica**: adicionar comentário no código explicando por que o toast Realtime é suprimido nesse caso, para evitar remoção acidental futura.

Critério mínimo exigido: a solução não deve depender apenas de timing implícito de rede; deve haver uma condição explícita no código que identifique ações iniciadas localmente.

### A2. Unificacao semantica "Conexao criada" vs "Chat iniciado"

- **Problema atual**: O mesmo evento (conversa criada) usa dois textos distintos: "Conexao criada! (emoji)" (Waves.tsx) e "Chat iniciado! (emoji)" (useConversations.tsx). Isso confunde o usuario sobre o que realmente aconteceu.
- **Decisao de UX**: Padronizar ambos para "Chat iniciado! (emoji)" -- e o mais direto e corresponde ao que o usuario pode fazer em seguida (abrir o chat).
- **Tipo de feedback**: Toast
- **Texto final**: Titulo: "Chat iniciado! (emoji)". Descricao: "Voce agora pode conversar com {nome}"
- **Onde implementar**: `src/pages/Waves.tsx` linha 163 -- trocar "Conexao criada! (emoji)" por "Chat iniciado! (emoji)"
- **Risco**: Baixo -- troca de string literal

### A3. Feedback de expiracao de presenca (ausencia critica)

- **Problema atual**: Quando a presenca expira por timeout, o usuario e silenciosamente redirecionado para /location sem nenhum aviso. O timer chega a zero, `endPresence('expired')` e chamado, o estado muda para 'ended', e o guard da Home redireciona. O usuario nao entende por que saiu.
- **Decisao de UX**: Exibir toast informativo antes do redirecionamento.
Garantir que o toast seja perceptível antes ou durante o redirecionamento, evitando que a troca de rota oculte o feedback.
Implementação obrigatória:
O sistema de toast deve sobreviver à troca de rota.
O provider de toast não deve ser desmontado durante o navigate('/location').
Não usar setTimeout ou atrasos artificiais para garantir visibilidade do feedback.
Os nomes exatos dos tipos devem ser confirmados no enum/shape real de endReason antes da implementação.

- **Tipo de feedback**: Toast (5s padrao)
- **Texto final**: Titulo: "Presenca expirada". Descricao: "Seu tempo no local terminou"
- **Onde implementar**: `src/pages/Home.tsx` -- no useEffect que reage a `presenceState.logicalState === 'ended'` (linha 180), verificar `presenceState.endReason?.type` e exibir toast antes de `navigate('/location')`. Tratar os tipos: `presence_expired`/`expired` e `gps_exit` com textos distintos.
- **Textos por tipo**:
  - `presence_expired` / `expired`: "Presenca expirada" / "Seu tempo no local terminou"
  - `gps_exit`: "Voce saiu da area" / "Presenca encerrada automaticamente"
  - `user_left_location` / `manual`: Silencio (acao explicita do usuario, nao precisa de toast)
- **Risco**: Baixo -- aditivo, nao altera a logica de redirecionamento

### A4. Remover Sonner nao utilizado

- **Problema atual**: O componente `Sonner` esta importado e renderizado no `App.tsx` (linha 25), mas nenhum fluxo do app usa `toast` do Sonner. Todos os toasts usam o sistema Radix (`use-toast.ts`). Isso adiciona peso desnecessario e risco de conflito visual se alguem acidentalmente usar o import errado.
- **Decisao de UX**: Remover completamente.
- **Onde implementar**:
  - `src/App.tsx`: remover import e `<Sonner />` do JSX
  - `src/components/ui/sonner.tsx`: pode ser mantido ou removido (nao causa dano se mantido)
- **Risco**: Baixo -- remocao pura, nenhum fluxo depende dele

---

## Prioridade MEDIA -- Consistencia visual e semantica

### M1. Avatar circular no Onboarding

- **Problema atual**: `src/pages/Onboarding.tsx` usa `<Avatar>` circular (componente Radix, linhas 177, 308) enquanto `Profile.tsx` e `PersonCard.tsx` ja usam formato quadrado com `rounded-lg`.
- **Decisao de UX**: Substituir por container quadrado `rounded-lg`, identico ao padrao do Profile.
- **Tipo de feedback**: Estado visual persistente (nao e feedback reativo)
- **Onde implementar**: `src/pages/Onboarding.tsx` -- Steps 1 e 3:
  - Step 1 (linha 176-182): substituir `<Avatar className="h-24 w-24">` por div com `rounded-lg overflow-hidden`
  - Step 3 (linha 308-312): idem, `h-16 w-16 rounded-lg`
- **Risco**: Baixo -- alteracao puramente visual, sem logica

### M2. Avatar circular na tela Waves

- **Problema atual**: `src/pages/Waves.tsx` usa `<Avatar className="h-12 w-12">` circular (linhas 262, 348) nos cards de acenos recebidos e enviados.
- **Decisao de UX**: Substituir por container quadrado `rounded-lg`, consistente com PersonCard.
- **Onde implementar**: `src/pages/Waves.tsx` -- ambos os cards (recebidos e enviados)
- **Risco**: Baixo -- visual apenas

### M3. Feedback de renovacao de presenca (zona cinza)

- **Problema atual**: O botao "Renovar" na Home (`renewPresence`, linha 258) reseta o timer silenciosamente. O usuario clica, o timer volta a 60:00, mas nao ha confirmacao visual de que a acao funcionou.
- **Decisão de UX**: Exibir feedback somente após confirmação real de sucesso da renovação da presença. Caso renewPresence() não forneça confirmação confiável (promise resolvida ou retorno explícito), não exibir toast de sucesso. Alternativamente, usar feedback neutro de carregamento (“Renovando presença…”) enquanto a ação ocorre.
- **Tipo de feedback**: Toast (5s padrão), somente se houver confirmação real de sucesso, ou
Feedback de carregamento inline enquanto a ação ocorre.
- **Texto final**: Titulo: "Presenca renovada". Descricao: "Mais {X} minutos neste local" (somente se houver confirmação real).
- **Onde implementar**: `src/pages/Home.tsx` -- no handler do botao Renovar (adicionar callback que exibe toast apos `renewPresence()` retornar sem erro)
- **Risco**: Baixo -- aditivo

### M4. Label "Interacao encerrada" / "Interacao indisponivel" no PersonCard

- **Problema atual**: Os textos dos CTAs em estado de cooldown usam o termo tecnico "Interacao" (`interactionRules.ts`), que nao corresponde a nenhum conceito que o usuario reconheca (o usuario conhece "aceno", "conversa", "chat").
- **Decisao de UX**: Sinalizar como ponto de atencao. Textos sugeridos para avaliacao:
  - `ENDED_BY_ME`: "Conversa encerrada" (em vez de "Interacao encerrada")
  - `ENDED_BY_OTHER`: "Indisponivel" (em vez de "Interacao indisponivel")
- **Tipo de feedback**: Estado persistente de UI (label de botao)
- **Onde implementar**: `src/lib/interactionRules.ts` -- constantes de label
- **Risco**: Baixo -- troca de strings, sem logica

**Observação de produto**: esta mudança aproxima o conceito técnico de “interação” da linguagem percebida pelo usuário (“conversa”). Caso o termo “interação” venha a ser reutilizado para outros tipos de vínculo no futuro, essa decisão deve ser reavaliada.

---

## Prioridade BAIXA -- Polish e consistencia menor

### B1. Toast ao ignorar aceno -- avaliar necessidade

- **Problema atual**: Ao ignorar um aceno (Waves.tsx, linha 185), exibe toast "Aceno ignorado" com descricao "Voce pode receber outros acenos desta pessoa". A acao ja remove o card da lista visualmente. O toast e potencialmente redundante.
- **Decisao de UX**: Manter por enquanto (a remocao do card pode ser rapida demais e o usuario pode nao perceber que clicou). Sinalizar para teste de usabilidade futuro.
- **Risco**: N/A -- nenhuma alteracao proposta

### B2. Toast ao sair do local (botao "Sair")

- **Problema atual**: Ao clicar "Sair" na Home, `deactivatePresence()` e chamado, que chama `endPresence('manual')`. O usuario e redirecionado para /location sem nenhum toast. Como a acao foi explicita (usuario clicou), o silencio e aceitavel.
- **Decisao de UX**: Manter silencioso -- decisao silenciosa valida (acao explicita + mudanca clara de tela).
- **Risco**: N/A -- nenhuma alteracao

---

## Secao Tecnica -- Detalhes de Implementacao

### Ordem segura de execucao

```text
1. A4 (Remover Sonner)        -- sem dependencias, limpeza pura
2. A2 (Unificar texto toast)  -- troca de string isolada
3. A1 (Suprimir toast dup.)   -- condicional no Realtime handler
4. A3 (Toast de expiracao)    -- aditivo no Home.tsx
5. M3 (Toast de renovacao)    -- aditivo no Home.tsx
6. M4 (Labels interacao)      -- troca de strings em interactionRules
7. M1 (Avatar Onboarding)     -- visual isolado
8. M2 (Avatar Waves)          -- visual isolado
```

Cada item pode ser implementado e testado individualmente sem depender dos outros. A ordem acima minimiza conflitos de merge caso sejam feitos em sequencia.

### Arquivos impactados (resumo)

| Arquivo | Itens |
|---|---|
| `src/App.tsx` | A4 |
| `src/pages/Waves.tsx` | A2, M2 |
| `src/hooks/useConversations.tsx` | A1 |
| `src/pages/Home.tsx` | A3, M3 |
| `src/lib/interactionRules.ts` | M4 |
| `src/pages/Onboarding.tsx` | M1 |

### Nenhum arquivo de backend, banco de dados ou edge function e alterado.

