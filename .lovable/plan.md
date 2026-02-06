

# Correcao do Header do Chat — Remover padding do Vite + Conter overflow global

## Causa raiz

Dois problemas impedem a cadeia de overflow de funcionar:

1. `App.css` contem o template padrao do Vite com `#root { padding: 2rem }`, que adiciona 64px extras (32 top + 32 bottom) ao redor de TODO o app. Isso faz o `h-screen` (100vh) do MobileLayout estourar a viewport real.

2. `index.css` define `.mobile-container { @apply min-h-screen }` que conflita com `h-screen` quando `fixedHeight` esta ativo.

3. Nenhum ancestor (`html`, `body`, `#root`) tem `height: 100%` ou `overflow: hidden`, permitindo que o scroll vaze para o body.

## Correcoes (2 arquivos)

### Arquivo 1: `src/App.css`

Substituir TODO o conteudo por:

```css
#root {
  height: 100%;
  margin: 0;
  padding: 0;
}
```

Remove o padding do Vite e estabelece `#root` como container de altura total.

### Arquivo 2: `src/index.css`

Duas mudancas:

**Mudanca A** — Adicionar contencao global em `html` e `body` (dentro do bloco `@layer base` existente):

```css
html, body {
  height: 100%;
  overflow: hidden;
}
```

**Mudanca B** — Remover `min-h-screen` da classe `.mobile-container`:

Trocar:
```css
.mobile-container {
  @apply max-w-md mx-auto min-h-screen;
}
```

Por:
```css
.mobile-container {
  @apply max-w-md mx-auto;
}
```

O `min-h-screen` sera controlado pelo MobileLayout via classes condicionais (`min-h-screen` normal ou `h-screen` com fixedHeight).

### Nenhum outro arquivo alterado

- `ChatWindow.tsx` — ja correto (header flex-shrink-0, messages flex-1 min-h-0 overflow-y-auto, input flex-shrink-0)
- `MobileLayout.tsx` — ja correto (aplica h-screen quando fixedHeight, min-h-screen caso contrario)
- `Chat.tsx` — ja correto (fixedHeight + showNav condicional)
- `BottomNav.tsx` — ja correto (position fixed)

## Cadeia final corrigida

```text
html (height: 100%, overflow: hidden)
  body (height: 100%, overflow: hidden)
    #root (height: 100%, padding: 0)
      MobileLayout (h-screen overflow-hidden)  [quando fixedHeight]
        main (flex-1 overflow-hidden)
          ChatWindow (flex flex-col h-full overflow-hidden)
            Header (flex-shrink-0)              -- FIXO
            Messages (flex-1 min-h-0 overflow-y-auto)  -- UNICO SCROLL
            Input (flex-shrink-0)               -- FIXO
```

Cada nivel confina o overflow do filho. Nenhum scroll existe fora da area de mensagens.

## Impacto em outras telas

- Telas sem `fixedHeight` (Home, Profile, Waves, Location) usam `min-h-screen` diretamente via MobileLayout, que ja aplica essa classe condicionalmente. O `overflow: hidden` no `html/body` nao afeta porque o conteudo dessas telas nao ultrapassa a viewport (e se ultrapassar, o scroll e tratado dentro do proprio conteudo via overflow-y-auto nos componentes internos).
- A remocao de `min-h-screen` do `.mobile-container` e compensada pela classe `min-h-screen` que MobileLayout ja aplica quando `fixedHeight` e falso.

## Risco

Baixo. As unicas mudancas sao remocao de padding residual do Vite e adicao de contencao de overflow global, que e padrao em apps mobile-first.

