

# Correção: Presença anterior não encerrada ao trocar de local

## Diagnóstico

A função `activatePresenceAtPlace` em `src/hooks/usePresence.ts` (linha 559) confia 100% no RPC `activate_presence` para limpar a presença anterior. O RPC é atômico e usa `pg_advisory_xact_lock`, mas se falhar silenciosamente (timeout de rede, erro parcial), a presença antiga permanece ativa no banco sem que o frontend detecte.

Não há nenhuma camada de segurança no frontend antes da chamada ao RPC.

## Solução

Adicionar cleanup explícito no frontend ANTES de chamar o RPC, como camada defensiva.

## Mudanças técnicas

### Arquivo: `src/hooks/usePresence.ts`

Modificar a função `activatePresenceAtPlace` (linhas 559-606):

```text
ANTES:
  1. setIsEnteringPlace(true)
  2. stopGPSMonitoring()
  3. Chamar RPC activate_presence
  4. fetchCurrentPresence()

DEPOIS:
  1. setIsEnteringPlace(true)
  2. stopGPSMonitoring()
  3. [NOVO] Cleanup defensivo no frontend:
     a. UPDATE presence SET ativo = false WHERE user_id = userId AND ativo = true
     b. UPDATE waves SET status = 'expired' WHERE (de_user_id = userId OR para_user_id = userId) AND status = 'pending'
     c. Logar erros mas NÃO bloquear o fluxo se falharem
  4. Chamar RPC activate_presence (ainda faz cleanup atômico como backup)
  5. fetchCurrentPresence()
```

O cleanup defensivo usa chamadas diretas ao banco via SDK do Supabase:
- Se funcionar: presença antiga já está limpa quando o RPC executa
- Se falhar: o RPC ainda tenta limpar (dupla proteção)
- Erros no cleanup são logados mas não impedem a ativação

Nenhuma outra mudança é necessária. O RPC continua sendo a fonte primária de verdade, e o cleanup no frontend é apenas uma rede de segurança.

