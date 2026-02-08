# Correcao: Mute nao atualiza em tempo real para o alvo

## Diagnostico

O block funciona em tempo real para ambos os lados porque:
- A RLS de `user_blocks` permite SELECT para ambas as partes (`auth.uid() = user_id OR auth.uid() = blocked_user_id`)
- Ambos recebem eventos Realtime
- A visibilidade e controlada por `useInteractionState` (alimentado por `useInteractionData`, que tem subscription Realtime)

O mute falha em tempo real para o alvo (B) porque:
- A RLS de `user_mutes` permite SELECT apenas para o autor (`auth.uid() = user_id`)
- B **nunca recebe o evento Realtime** de mute
- A visibilidade de B e controlada por `usePeopleNearby` (via chamada RPC `is_user_muted`), nao por `useInteractionState`
- `usePeopleNearby` so atualiza a cada 30 segundos ou por refetch manual

Em resumo: o dado de mute para o alvo vive em `usePeopleNearby`, que nao tem nenhum mecanismo de atualizacao instantanea para mutes. O Realtime em `useInteractionData` nao ajuda porque B nao recebe eventos de `user_mutes` devido a RLS.

## Solucao

Alterar a RLS de SELECT da tabela `user_mutes` para incluir o alvo do mute, exatamente como `user_blocks` ja faz. Isso permite que B receba eventos Realtime quando A o silencia/desilencia.

```sql
-- Atual (apenas autor ve):
USING (auth.uid() = user_id)

-- Proposta (autor E alvo veem):
USING (auth.uid() = user_id OR auth.uid() = muted_user_id)
```

Depois, adicionar uma subscription Realtime em `usePeopleNearby` que escuta `user_mutes` e dispara `fetchPeopleNearby()` quando um evento e recebido.

Como resultado dessa mudança, quando A silenciar ou desilenciar B:
- B deve desaparecer/aparecer imediatamente da home de A (comportamento atual)
- A deve desaparecer/aparecer imediatamente da home de B, sem aguardar refetch periódico
- O comportamento deve ser simétrico ao block, exceto pela expiração automática de 24h no mute

### Impacto na seguranca

- B passa a poder ver que foi silenciado por A (apenas o registro de mute, nao dados sensiveis)
- Isso e aceitavel porque B ja experimenta o efeito (nao ve A) -- saber explicitamente nao muda nada
- Segue o mesmo padrao de `user_blocks` que ja permite SELECT bilateral
- Nenhum terceiro (C) consegue ler ou inferir mutes entre A e B, pois a RLS continua restrita às duas partes

### Arquivos alterados

1. **Migration SQL** -- Atualizar RLS de `user_mutes` para SELECT bilateral
2. **`src/hooks/usePeopleNearby.ts`** -- Adicionar subscription Realtime para `user_mutes` que dispara refetch

### O que NAO sera alterado

- Nenhuma regra de `interactionRules.ts`
- Nenhuma logica de `useInteractionState`
- Nenhuma logica de `useInteractionData`
- Nenhuma logica de swipe, block, wave ou chat
- Nenhuma outra RLS

### Detalhe tecnico

Em `usePeopleNearby.ts`, sera adicionado um `useEffect` com subscription Realtime na tabela `user_mutes`, similar ao padrao ja usado em `useInteractionData`:

```typescript
useEffect(() => {
  if (!user?.id || !placeId) return;

  const channel = supabase
    .channel(`people-mutes-${user.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'user_mutes',
    }, () => {
      fetchPeopleNearby();
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [user?.id, placeId]);
```

A subscription deve reagir apenas a eventos de user_mutes em que o usuário autenticado seja user_id ou muted_user_id, o que é garantido pela RLS bilateral.