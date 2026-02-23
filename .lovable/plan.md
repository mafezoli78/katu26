# Camera Lifecycle Hardening

## Resumo

Garantir que o MediaStream seja encerrado em todos os cenarios de saida do fluxo de selfie, evitando vazamento de camera ativa, LED persistente e bloqueio em reaberturas.

## Analise do Estado Atual


| Cenario                                          | Encerra camera?                            | Status   |
| ------------------------------------------------ | ------------------------------------------ | -------- |
| Usuario clica "Cancelar" (CheckinSelfie)         | Sim (`handleCancel` ja chama `stopCamera`) | OK       |
| Usuario clica "Pular selfie" (dev skip)          | Sim (ja chama `stopCamera`)                | OK       |
| Usuario captura foto (handleCapture)             | NAO - stream fica ativo durante preview    | CORRIGIR |
| Componente desmontado (navegacao, refresh)       | NAO - sem cleanup useEffect                | CORRIGIR |
| Usuario cancela na Location (handleSelfieCancel) | NAO - apenas muda step                     | CORRIGIR |


## Alteracoes

### 1. CheckinSelfie.tsx -- stopCamera ao capturar

Em `handleCapture`, mover a chamada `cameraService.stopCamera()` para dentro do callback de canvas.toBlob, imediatamente antes de qualquer setState (setCapturedBlob, setCapturedImage, setStep).

### 2. CheckinSelfie.tsx -- cleanup ao desmontar

Adicionar um `useEffect` de cleanup:

```text
useEffect(() => {
  return () => {
    cameraService.stopCamera();
  };
}, []);
```

Cobre: navegacao manual, refresh, desmontagem do componente por qualquer motivo.

### 3. Location.tsx -- stopCamera no handleSelfieCancel

O handler `handleSelfieCancel` atualmente apenas faz `setStep('expression')`. Adicionar `cameraService.stopCamera()` antes da mudanca de step.

### 4. NAO adicionar useEffect de step-exit

O plano original sugere um useEffect que chama stopCamera quando `step !== 'capture'`. Porem isso e redundante e potencialmente problematico:

- O handleCapture ja vai chamar stopCamera (alteracao 1)
- O handleCancel ja chama stopCamera
- O handleRetake precisa do stream ativo ate chamar requestCamera novamente
- O unmount cleanup (alteracao 2) cobre os demais casos

Adicionar esse useEffect causaria chamadas duplicadas desnecessarias.

### 5. CheckinSelfie.tsx -- stopCamera ao confirmar uso da foto

Em handleUsePhoto, adicionar antes de onConfirm:

```text
cameraService.stopCamera();
```

## Arquivos alterados


| Arquivo                                     | Alteracao                                                  |
| ------------------------------------------- | ---------------------------------------------------------- |
| `src/components/location/CheckinSelfie.tsx` | stopCamera no handleCapture + useEffect de unmount cleanup |
| `src/pages/Location.tsx`                    | stopCamera no handleSelfieCancel                           |


## O que NAO muda

- Layout e design visual
- Logica de upload
- Logica de presenca
- cameraService.ts
- Nenhum outro componente