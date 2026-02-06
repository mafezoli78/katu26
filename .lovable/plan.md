
# Corrigir scroll do chat: substituir ScrollArea por div nativo

## Problema confirmado

O `ScrollArea` do Radix UI introduz camadas intermediarias (Root com `overflow: hidden` + Viewport interno) que quebram a cadeia de flexbox. Isso faz o scroll "vazar" para o container pai, movendo header e input junto com as mensagens. O `ref` tambem aponta para o elemento errado (Root em vez de Viewport), quebrando o auto-scroll.

## Solucao

Uma unica mudanca em um unico arquivo.

## Arquivo: `src/components/chat/ChatWindow.tsx`

### Mudanca 1: Remover import do ScrollArea

Remover a linha:
```
import { ScrollArea } from '@/components/ui/scroll-area';
```

### Mudanca 2: Substituir ScrollArea por div nativo

Trocar:
```tsx
<ScrollArea className="flex-1 min-h-0 p-4" ref={scrollRef}>
  {/* ...conteudo das mensagens... */}
</ScrollArea>
```

Por:
```tsx
<div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4">
  {/* ...conteudo das mensagens (sem alteracao)... */}
</div>
```

### Nenhum outro arquivo sera alterado

- `MobileLayout.tsx` — ja correto (`h-screen overflow-hidden` quando `fixedHeight`)
- `Chat.tsx` — ja correto (`fixedHeight`, `showNav={!isKeyboardVisible}`)
- `BottomNav.tsx` — ja correto (`fixed bottom-0 z-50`)
- `index.css` — sem mudancas necessarias

## Cadeia de overflow final (corrigida)

```text
MobileLayout (h-screen overflow-hidden)
  main (flex-1 overflow-hidden, pb-20 quando nav visivel)
    ChatWindow (flex flex-col h-full overflow-hidden)
      Header (flex-shrink-0)                         -- FIXO
      div (flex-1 min-h-0 overflow-y-auto)           -- UNICO SCROLL
      Input (flex-shrink-0)                          -- FIXO
```

Cadeia inquebravel: cada nivel confina o overflow do filho. O scroll so existe no div de mensagens.

## Por que isso resolve

1. Elimina as camadas intermediarias do Radix que quebravam o flexbox
2. O `ref` agora aponta diretamente para o elemento que faz scroll (auto-scroll funciona)
3. `flex-1 min-h-0 overflow-y-auto` funciona nativamente sem interferencia de JS externo
4. Em mobile, scroll por toque funciona naturalmente sem barra estilizada

## Risco

Nenhum. A unica diferenca visual seria a ausencia da barra de scroll estilizada do Radix, que em mobile (touch) nao e visivel de qualquer forma.
