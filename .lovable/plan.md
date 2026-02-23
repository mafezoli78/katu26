# Integrar cameraService ao fluxo de check-in

## Resumo

Mover a chamada `getUserMedia()` para o handler de clique do botao "Continuar" (na tela de expressao), usando `cameraService.requestCamera()`. O componente `CheckinSelfie` passa a consumir o stream ja obtido via `cameraService.getStream()` em vez de solicitar a camera por conta propria.

## Alteracoes

### 1. Location.tsx -- Botao "Continuar" (expression -> selfie)

**Linha 572**: O `onClick={() => setStep('selfie')}` sera substituido por um handler async:

```text
onClick handler:
  1. await cameraService.requestCamera()    // PRIMEIRA instrucao, sincrona ao gesto
  2. setStep('selfie')                      // so navega apos sucesso

Em caso de erro:
  - toast com mensagem de erro
  - nao navegar (permanecer na tela de expressao)
```

- Adicionar import de `cameraService` e estado `cameraRequesting` para feedback visual (loader no botao).
  &nbsp;
  **IMPORTANTE:**
  A chamada a cameraService.requestCamera() deve ocorrer diretamente no onClick original do botão, sem wrappers intermediários (ex: funções externas, setTimeout, debounce, etc), para preservar a cadeia síncrona do gesto do usuário exigida pelo iOS Safari e PWA.

### 2. CheckinSelfie.tsx -- Remover getUserMedia interno

**Remover:**

- A funcao `startCamera()` que chama `navigator.mediaDevices.getUserMedia()`
- O `streamRef` interno (substituido pelo cameraService)
- O `stopCamera()` interno (substituido por `cameraService.stopCamera()`)

**Alterar:**

- O step inicial muda de `'explain'` para `'capture'` (a explicacao ja nao faz sentido porque a camera ja foi concedida)
- Ao montar no step `capture`, usar `cameraService.getStream()` para alimentar o `<video>`
- Se `getStream()` retornar `null`, exibir mensagem de fallback com botao "Voltar"
- `handleRetake`: chamar `cameraService.requestCamera()` para obter novo stream (retry manual pelo usuario)
- `handleCancel` e `handleCapture` (apos captura): chamar `cameraService.stopCamera()`
- `onConfirm` (apos upload): o Location.tsx ja chama `stopCamera()` no fim do fluxo

### 3. CheckinSelfie.tsx -- Vincular stream ao video

Adicionar um `useEffect` que observa o step `capture`:

```text
useEffect:
  if step === 'capture':
    const stream = cameraService.getStream()
    if stream && videoRef.current:
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => {})
    else:
      setCameraError('camera_unavailable')
```

Este useEffect NAO chama getUserMedia -- apenas conecta o stream ja existente ao elemento video.

Garantir que o elemento <video> possua:

- autoPlay

- playsInline

- muted

Para evitar bloqueio de autoplay em iOS Safari e Android WebView.

## Arquivos alterados


| Arquivo                                     | Alteracao                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/pages/Location.tsx`                    | Chamar `cameraService.requestCamera()` no onClick antes de `setStep('selfie')`                |
| `src/components/location/CheckinSelfie.tsx` | Remover getUserMedia interno, usar `cameraService.getStream()` e `cameraService.stopCamera()` |


## O que NAO muda

- Layout e design visual
- Logica de upload de selfie
- Logica de presenca
- Fluxo de geolocalizacao
- Nenhum outro componente