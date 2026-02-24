# Corrigir handleRetake -- getUserMedia direto no gesto

## Problema

O `handleRetake` atual (linha 76-87) executa `setCapturedImage`, `setCapturedBlob` e `setCameraError` **antes** de `cameraService.requestCamera()`. No iOS Safari, qualquer instrucao assincrona ou setState antes do `getUserMedia()` quebra a cadeia sincrona do gesto, podendo causar bloqueio silencioso da permissao.

## Alteracao

### CheckinSelfie.tsx -- Reordenar handleRetake

Mover `cameraService.requestCamera()` para ser a **primeira instrucao** do handler. Limpar estado e mudar step somente apos sucesso:

```text
handleRetake = async () => {
  try {
    await cameraService.requestCamera()   // PRIMEIRA instrucao, sincrona ao gesto
    setCapturedImage(null)
    setCapturedBlob(null)
    setCameraError(null)
    setStep('capture')
  } catch (err) {
  console.error('[Selfie] Camera retry failed:', err)
  setCameraError('Nao foi possivel acessar a camera. Verifique as permissoes.')
  }

  // nao forcar retorno ao capture aqui
  // permitir que o fluxo de fallback (Plan 5) assuma o controle
}
```

O `cameraService.requestCamera()` internamente ja para o stream anterior antes de solicitar novo, entao nao e necessario chamar `stopCamera()` antes.

## Arquivo alterado


| Arquivo                                     | Alteracao                                                       |
| ------------------------------------------- | --------------------------------------------------------------- |
| `src/components/location/CheckinSelfie.tsx` | Reordenar handleRetake: requestCamera() como primeira instrucao |


## O que NAO muda

- Layout e design visual
- handleCapture, handleCancel, handleUsePhoto
- cameraService.ts
- Location.tsx
- Nenhum outro componente