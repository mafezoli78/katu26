# Camera Service - Serviço Global de Câmera

## Problema

No iOS Safari e PWA, chamadas a `getUserMedia()` que não ocorrem diretamente no stack de um evento de toque do usuario sao silenciosamente bloqueadas. Atualmente, o fluxo de check-in navega para a tela de selfie e so entao solicita a camera, quebrando a cadeia sincrona do gesto.

## Solucao

Criar um modulo singleton puro (sem React) que gerencia o ciclo de vida do MediaStream da camera.

## Arquivo

`src/services/cameraService.ts`

## API do Servico

```text
requestCamera()    -> Promise<MediaStream>   // solicita getUserMedia
getStream()        -> MediaStream | null      // retorna stream ativo
stopCamera()       -> void                    // para todas as tracks
isActive()         -> boolean                 // verifica se ha stream ativo
```

## Detalhes Tecnicos

**Estrutura interna:**

- Uma variavel de modulo `currentStream: MediaStream | null` armazena o stream ativo
- Nenhum estado React, nenhum hook, nenhum contexto
- Exportacoes nomeadas (sem classe, sem instanciacao)

**requestCamera():**

Se getUserMedia falhar:

- Garantir que currentStream permaneça null

- Não manter stream anterior

- Repassar o erro original sem modificar

- Chama `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: false })`
- Se ja existe um stream ativo, para as tracks anteriores antes de solicitar novo
- Armazena o novo stream em `currentStream`
- Retorna o stream

**getStream():**

- Retorna `currentStream` (pode ser null)

**stopCamera():**

- Itera sobre `currentStream.getTracks()` chamando `.stop()` em cada
- Define `currentStream = null`

**isActive():**

- Retorna `currentStream !== null && currentStream.getTracks().some(t => t.readyState === 'live')`

## Fluxo de Uso Futuro (fora deste escopo)

```text
A chamada a requestCamera() deve ser a PRIMEIRA instrução executada no handler de clique.
Nenhuma instrução async pode ocorrer antes dela.
Nenhuma navegação pode ocorrer antes dela.
Nenhuma chamada a setState pode ocorrer antes dela.

Usuario clica "Entrar" (onClick)
  -> cameraService.requestCamera()   // direto no handler, sincrono ao gesto
  -> navigate('/checkin-selfie')     // apos o await
  -> CheckinSelfie usa cameraService.getStream() para alimentar o <video>
  -> Apos captura ou cancelamento: cameraService.stopCamera()
```

## O que NAO sera feito

- requestCamera() deve proteger contra chamadas concorrentes.
- Se já existir uma promise em andamento, retornar a mesma promise.
- Nenhuma alteracao em componentes existentes
- Nenhuma integracao com CheckinSelfie ou fluxo de check-in
- Nenhuma UI, upload ou compressao
- Nenhum hook React wrapper (sera criado em etapa futura se necessario)

## Arquivo unico a criar


| Arquivo                         | Acao  |
| ------------------------------- | ----- |
| `src/services/cameraService.ts` | Criar |
