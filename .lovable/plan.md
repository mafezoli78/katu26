# Plan: Cooldown de 2 horas ao ignorar aceno

## Estrategia

Adicionar duas colunas na tabela `waves`, atualizar a funcao `ignoreWave` para gravar o cooldown, expandir a query de dados para incluir waves ignoradas com cooldown ativo, adicionar um novo fato booleano e estado na maquina canonica, e disparar toast Realtime para o remetente.

---

## 1. Migracao de banco de dados

Adicionar duas colunas na tabela `waves`:

```sql
ALTER TABLE waves
  ADD COLUMN ignored_at timestamptz,
  ADD COLUMN ignore_cooldown_until timestamptz;
```

Sem alterar constraints, status values, ou RLS.

---

## 2. useWaves.ts -- Gravar cooldown ao ignorar

Na funcao `ignoreWave`, adicionar os dois campos no update:

```text
update({
  status: 'expired',
  visualizado: true,
  ignored_at: new Date().toISOString(),
  ignore_cooldown_until: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
})
```

---

## 3. useInteractionData.ts -- Buscar waves ignoradas com cooldown ativo

Problema: a query atual so busca waves com `status === 'pending'`. Waves ignoradas (status `expired`) com cooldown ativo nao chegam ao frontend.

Na query atual que já busca waves, você deve:

🔁 TROCAR

Se hoje está assim: .eq('status', 'pending')

Troque por: .in('status', ['pending', 'expired'])

Só isso.

Não criar nova query.

Não criar novo campo retornado.

Não duplicar fonte de dados

---

## 4. interactionRules.ts -- Novo estado UNAVAILABLE_TEMP

### 4a. Enum

Adicionar entre WAVE_SENT e WAVE_RECEIVED (ou apos WAVE_SENT):

```text
UNAVAILABLE_TEMP = 8
```

&nbsp;

### 4b. InteractionFacts

Adicionar:

```text
hasIgnoreCooldownFromB: boolean  // B ignorou meu aceno e cooldown esta ativo
```

### 4c. getInteractionState

Inserir o check de hasIgnoreCooldownFromB imediatamente após os checks de block, mute e conversation, e antes de qualquer lógica de WAVE_SENT, WAVE_RECEIVED ou NONE.

```text
if (facts.hasIgnoreCooldownFromB) {
  return {
    state: InteractionState.UNAVAILABLE_TEMP,
    stateName: 'UNAVAILABLE_TEMP',
    button: { label: 'Indisponivel no momento', disabled: true, action: 'none' },
    isVisible: true,
    blockReason: 'Aguarde para enviar novo aceno',
  };
}
```

### 4d. deriveFacts

Adicionar novo parametro ou expandir `WaveRecord` para incluir `ignore_cooldown_until`. Calcular:

```text
const hasIgnoreCooldownFromB = data.waves.some(
  w => w.place_id === placeId
    && w.status === 'expired'
    && w.de_user_id === userA        // EU enviei
    && w.para_user_id === userB      // para B
    && w.ignore_cooldown_until
    && new Date(w.ignore_cooldown_until) > now
);
```

### 4e. canWave

Adicionar validacao:

```text
if (facts.hasIgnoreCooldownFromB) {
  return { allowed: false, reason: 'Aguarde para enviar novo aceno' };
}
```

### 4f. Helpers

Atualizar `getStateName` e `isActionable` para o novo estado.

---

## 5. useInteractionState.ts -- Passar dados expandidos

Incluir as waves ignoradas com cooldown nos dados passados para `deriveFacts`, combinando-as com as demais waves.

---

## 6. Toast Realtime para o remetente (User A)

No handler Realtime de waves em `useInteractionData.ts` (linha 282), quando receber UPDATE:

```text
if (
  payload.eventType === 'UPDATE'
  && record?.status === 'expired'
  && record?.de_user_id === user.id           // EU sou o remetente
  && record?.ignore_cooldown_until             // tem cooldown
  && new Date(record.ignore_cooldown_until) > new Date()
) {
  toast({
    title: 'A pessoa esta indisponivel no momento',
    description: 'Tente novamente mais tarde.'
  });
}
```

Isso garante que A receba o toast via Realtime quando B ignora.

Garantir que o toast só dispare quando houver transição real para status 'expired'.

Não deve disparar novamente se o registro já estiver expirado anteriormente.

---

## Arquivos impactados


| Arquivo                            | Mudanca                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------- |
| Migracao SQL                       | ADD COLUMN ignored_at, ignore_cooldown_until                                |
| `src/hooks/useWaves.ts`            | Gravar cooldown no ignoreWave                                               |
| `src/hooks/useInteractionData.ts`  | Nova query + toast Realtime + novo campo retornado                          |
| `src/lib/interactionRules.ts`      | Novo estado, novo fato, novo check em getInteractionState, canWave, helpers |
| `src/hooks/useInteractionState.ts` | Passar waves expandidas para deriveFacts                                    |


---

## Ordem de execucao

```text
1. Migracao (add columns)
2. useWaves.ts (gravar cooldown)
3. interactionRules.ts (novo estado + fato + validacao)
4. useInteractionData.ts (query expandida + toast Realtime)
5. useInteractionState.ts (passar dados expandidos)
```

---

## Risco de regressao: Baixo

- Nao altera presence, blocks, mutes, conversations
- Nao altera status constraint (usa 'expired' existente)
- Novas colunas sao nullable, sem impacto em registros existentes
- Novo estado UNAVAILABLE_TEMP so e atingido por condicao especifica nova
- RLS existente ja permite UPDATE por para_user_id
- A query de waves ignoradas deve obrigatoriamente filtrar por de_user_id = currentUserId, evitando bloquear interações de terceiros.