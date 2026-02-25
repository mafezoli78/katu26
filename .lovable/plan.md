# Correção: Tornar parâmetros de handleActivatePresence obrigatórios

## Problema

`handleActivatePresence` aceita `selfieUrl` e `selfieSource` como opcionais (`?`), permitindo teoricamente ativar presença sem selfie validada.

## Análise

Verifiquei todos os call sites de `handleActivatePresence` no código atual:

1. **Linha 343** — chamado por `handleSelfieConfirm(blob, source)` com ambos os parâmetros preenchidos. Este é o único ponto de chamada.

Não há nenhuma outra invocação direta. O risco é futuro: a assinatura opcional convida a chamadas sem parâmetros.

## Alteração

### `src/pages/Location.tsx` — Linha 273

Alterar a assinatura de:

```text
const handleActivatePresence = async (selfieUrl?: string, selfieSource?: 'camera' | 'upload') => {
```

Para:

```text
const handleActivatePresence = async (selfieUrl: string, selfieSource: 'camera' | 'upload') => {
```

### Consequência na linha 300

Mesmo com parâmetros obrigatórios, manter validação defensiva explícita dentro da função. Caso exista o guard if (selfieUrl && user), substituí-lo por:

```text
if (!selfieUrl) {
  throw new Error('Presence activation requires selfieUrl');
}
```

e manter a verificação de user separadamente.

Se houver fallback selfieSource || 'camera', removê-lo e utilizar selfieSource diretamente, pois agora é obrigatório.

## Arquivo alterado


| Arquivo                  | Alteração                                                             |
| ------------------------ | --------------------------------------------------------------------- |
| `src/pages/Location.tsx` | Tornar parâmetros obrigatórios e manter validação defensiva explícita |


## O que NÃO muda

- CheckinSelfie.tsx
- cameraService.ts
- Layout ou UX
- Lógica de upload/fallback