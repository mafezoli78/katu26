# Camera Failure Fallback (Upload)

## Resumo

Substituir o devSkip por um fallback de upload que ativa automaticamente apos 2 falhas consecutivas de acesso a camera. Adicionar colunas `selfie_source` e `selfie_provided` na tabela `presence` para distinguir a origem da imagem.

## Migracao de banco de dados

Adicionar duas colunas na tabela `presence`:

```text
ALTER TABLE public.presence
  ADD COLUMN selfie_provided boolean,
  ADD COLUMN selfie_source text;
```

- `selfie_provided`: `true` para selfie via camera, `false` para upload
- `selfie_source`: `'camera'` ou `'upload'`

## Alteracoes em CheckinSelfie.tsx

### Novo tipo de step

Expandir o tipo `Step` de `'capture' | 'preview'` para `'capture' | 'preview' | 'fallback-upload'`.

### Props

- Remover `onSkip` da interface

### Contador de falha

Adicionar estado `cameraFailCount` (inicializa em 0).

Incrementar em dois pontos:

1. No useEffect de attach do stream (quando getStream() retorna null na montagem inicial OU quando cameraError for definido na montagem inicial do CheckinSelfie — contabilizar apenas uma falha neste momento)
2. No catch do handleRetake

### Observador de falha (useEffect)

```text
useEffect:
  if cameraFailCount >= 2:
    setStep('fallback-upload')
```

### Renderizacao do step fallback-upload

Exibir:

- Icone e titulo explicando que a camera nao esta disponivel
- `<input type="file" accept="image/*" capture="user">` para selecao de imagem
- Ao selecionar arquivo:
  - Criar blob a partir do File
  - setCapturedBlob e setCapturedImage
  - setStep('preview')

### handleUsePhoto

Condicionar chamada a `cameraService.stopCamera()`:

- Se veio de fallback-upload, NAO chamar stopCamera (nao ha stream)
- Chamar `onConfirm(blob, selfieSource)` passando 'camera' ou 'upload' conforme o estado `selfieSource`

Alternativa mais simples: adicionar estado `selfieSource: 'camera' | 'upload'` e passar junto ao blob. Vou usar esta abordagem -- um unico callback `onConfirm` que recebe `(blob, source)`.

### Ajuste final da interface

```text
interface CheckinSelfieProps {
  onConfirm: (imageBlob: Blob, source: 'camera' | 'upload') => void;
  onCancel: () => void;
  uploading?: boolean;
}
```

Remover `onSkip` completamente.

## Alteracoes em Location.tsx

### Remover devSkip

- Remover a prop `onSkip` passada ao CheckinSelfie (linha 614-615)
- Remover o handler inline que chamava `handleActivatePresence` com URL de teste

### handleSelfieConfirm

Atualizar assinatura para receber `source`:

```text
handleSelfieConfirm = async (blob: Blob, source: 'camera' | 'upload') => {
```

No update da presenca apos upload, incluir os novos campos:

```text
await supabase
  .from('presence')
  .update({
    checkin_selfie_url: selfieUrl,
    checkin_selfie_created_at: new Date().toISOString(),
    selfie_provided: source === 'camera',
    selfie_source: source,
  })
  .eq('user_id', user.id)
  .eq('ativo', true);
```

### Botao "Continuar" (expression -> selfie)

A primeira falha de camera no onClick ja e contabilizada como falha 1. Se falhar:

- Incrementar contador no Location tambem? NAO. O contador fica exclusivamente no CheckinSelfie.
- Na falha do onClick, navegar para selfie mesmo assim (`setStep('selfie')`), para que o CheckinSelfie detecte a ausencia de stream e incremente o contador.

Atualizar o onClick:

```text
onClick = async () => {
  setCameraRequesting(true);
  try {
    await cameraService.requestCamera();
  } catch (err) {
    console.error('[Location] Camera request failed:', err);
    // NAO bloquear -- deixar CheckinSelfie gerenciar o fallback
  } finally {
    setCameraRequesting(false);
    setStep('selfie');  // navega SEMPRE, com ou sem stream
  }
}
```

Remover o toast de erro de camera no Location (o CheckinSelfie assume o controle de feedback).

## Fluxo completo

```text
1. Usuario clica "Continuar"
2. Location tenta requestCamera()
   - Sucesso: navega para selfie com stream ativo (failCount=0)
   - Falha: navega para selfie sem stream (failCount incrementa para 1)
3. CheckinSelfie monta:
   - Stream disponivel: exibe camera normalmente
   - Stream null: exibe erro, failCount=1
4. Usuario clica "Refazer" (handleRetake):
   - Sucesso: camera funciona, failCount reseta? NAO -- failCount so incrementa
   - Falha: failCount=2 -> useEffect muda para 'fallback-upload'
5. Tela fallback-upload: usuario seleciona imagem
6. Preview: usuario confirma
7. Location recebe blob com source='upload', salva com selfie_provided=false
```

## Arquivos alterados


| Arquivo                                     | Alteracao                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| Migracao SQL                                | Adicionar colunas selfie_provided e selfie_source na tabela presence                  |
| `src/components/location/CheckinSelfie.tsx` | Contador de falha, step fallback-upload, remover onSkip, alterar interface onConfirm  |
| `src/pages/Location.tsx`                    | Remover devSkip, atualizar handleSelfieConfirm com source, navegar para selfie sempre |


## O que NAO muda

- cameraService.ts
- Layout geral (cards, botoes seguem mesmo padrao visual)
- Logica de presenca (activatePresenceAtPlace / createTemporaryPlace)
- Conversas e waves
- Fluxo de geolocalizacao