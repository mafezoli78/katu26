# Correção: Listener gap no useToast

## Problema

O hook `useToast` re-registra o listener a cada mudança de estado do toast, criando janelas onde nenhum listener está ativo. Com `TOAST_REMOVE_DELAY = 5000`, essas janelas ocorrem com frequência suficiente para coincidir com toasts disparados via Realtime.

## Correção

Alterar **uma única linha** em `src/hooks/use-toast.ts`:

- Linha 177: mudar `}, [state]);` para `}, []);`

Isso faz o listener ser registrado uma vez no mount e removido no unmount, sem gaps intermediários.

## Arquivo alterado


| Arquivo                  | Mudanca                                       |
| ------------------------ | --------------------------------------------- |
| `src/hooks/use-toast.ts` | Dependencia do useEffect: `[state]` para `[]` |


## Impacto

- Zero mudanca em logica de negocio
- Zero mudanca em duracao, delay ou limite de toasts
- Corrige todos os toasts Realtime (ignore cooldown, aceno recebido, chat encerrado)
- Nao afeta toasts disparados por acao direta do usuario (esses ja funcionam porque o dispatch acontece fora do gap)

## Validações técnicas obrigatórias

1. Confirmar que o listener registrado dentro do useEffect NÃO depende de variáveis mutáveis do escopo (ex: state, toasts, count, etc).

   - O callback deve utilizar apenas referências estáveis, como `setState`.

2. Confirmar que o cleanup do useEffect remove corretamente o listener da lista global.

3. Testar em ambiente com React StrictMode ativo para garantir que não há registro duplicado de listener durante mounts/desmounts duplos.

## Risco de regressao

Baixo, desde que:

- O listener nao utilize variaveis mutaveis do escopo.

- O cleanup do useEffect remova corretamente o listener.

- Nao haja multiplos registros em StrictMode.

A alteracao corrige um problema estrutural de re-registro desnecessario, mas exige validacao funcional apos implementacao.

&nbsp;

## Validacao funcional apos implementação

Confirmar manualmente:

- Toast manual continua funcionando.

- Toast disparado via Realtime volta a aparecer.

- Nenhum toast duplica.

- Nenhum toast desaparece instantaneamente.

- Nenhum erro aparece no console.