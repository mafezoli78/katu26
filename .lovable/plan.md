

# Plano: Neutralizar Hover para Mobile

## Diagnostico

### Onde existem hovers hoje

**1. Componente base Button (`src/components/ui/button.tsx`)** -- 6 variantes, todas com `hover:`:
- default: `hover:bg-primary/90`
- destructive: `hover:bg-destructive/90`
- outline: `hover:bg-accent hover:text-accent-foreground`
- secondary: `hover:bg-secondary/80`
- ghost: `hover:bg-accent hover:text-accent-foreground`
- link: `hover:underline`

**2. Outros componentes UI Shadcn** (13 arquivos):
- accordion, alert-dialog, breadcrumb, calendar, command, context-menu, dialog, dropdown-menu, navigation-menu, select, sheet, sidebar, toast, toggle

**3. Paginas e componentes do app** (8 arquivos):
- Auth.tsx, Home.tsx, Profile.tsx, Waves.tsx, NotFound.tsx
- ConversationsList.tsx, PlaceSelector.tsx, PasswordChangeDialog.tsx

**4. CSS global** (`src/index.css`):
- `.place-card:hover { @apply shadow-md; }`

**5. Tailwind config** (`tailwind.config.ts`):
- `card-hover` boxShadow definido (usado indiretamente)

Total: ~26 arquivos com `hover:` classes.

---

## Estrategia Recomendada: Media Query Global no CSS

Alterar arquivo por arquivo seria arriscado e trabalhoso. A solucao mais segura e uma unica regra CSS global que neutraliza hover em dispositivos touch.

Adicionar no `src/index.css`, dentro de `@layer base`:

```css
@media (hover: none) {
  *, *::before, *::after {
    --tw-hover-opacity: initial;
  }
  
  .hover\:bg-primary\/90:hover,
  .hover\:bg-destructive\/90:hover,
  .hover\:bg-accent:hover,
  .hover\:bg-secondary\/80:hover,
  .hover\:bg-accent\/90:hover,
  .hover\:bg-accent\/10:hover,
  .hover\:bg-muted:hover,
  .hover\:bg-white\/10:hover,
  .hover\:bg-destructive\/10:hover,
  .hover\:bg-katu-green\/90:hover,
  .hover\:text-accent-foreground:hover,
  .hover\:text-foreground:hover,
  .hover\:text-destructive:hover,
  .hover\:text-primary\/90:hover,
  .hover\:underline:hover,
  .hover\:opacity-100:hover,
  .hover\:scale-105:hover,
  .hover\:border-katu-green\/50:hover,
  .group-hover\:opacity-100:hover,
  .place-card:hover {
    all: unset;  /* Problema: isso remove TUDO */
  }
}
```

**Problema**: `all: unset` e seletores individuais sao frageis e dificeis de manter.

---

## Estrategia Final (mais robusta): Desabilitar hover via Tailwind

A melhor abordagem: configurar o Tailwind para que `hover:` so aplique em dispositivos com hover real.

### Alteracao no `tailwind.config.ts`

Na raiz da config, adicionar `future` flag **OU** usar plugin customizado que envolve todos os estilos `hover:` dentro de `@media (hover: hover)`.

**Metodo concreto**: adicionar no `src/index.css` uma unica regra global simples:

```css
@media (hover: none) {
  * {
    -webkit-tap-highlight-color: transparent;
  }
  
  /* Neutraliza todos os hovers de Tailwind em dispositivos touch */
  [class*="hover\:"]:hover {
    /* Reseta propriedades visuais comuns */
    background-color: inherit;
    color: inherit;
    text-decoration: inherit;
    opacity: inherit;
    border-color: inherit;
    transform: inherit;
    box-shadow: inherit;
  }
  
  .place-card:hover {
    box-shadow: none;
  }
}
```

**Problema**: `inherit` pode causar efeitos colaterais inesperados em componentes aninhados.

---

## Estrategia FINAL DEFINITIVA (recomendada)

A forma mais limpa no ecossistema Tailwind: redefinir a variante `hover` para exigir `@media (hover: hover)`.

### Unico arquivo alterado: `tailwind.config.ts`

Adicionar plugin inline:

```ts
plugins: [
  require("tailwindcss-animate"),
  function({ addVariant }) {
    addVariant('hover', '@media (hover: hover) { &:hover }');
  },
],
```

Isso redefine a variante `hover:` do Tailwind globalmente. Todo `hover:bg-*`, `hover:text-*`, etc. so sera aplicado em dispositivos que suportam hover real (mouse). Em dispositivos touch, nenhum hover sera ativado.

### Arquivo complementar: `src/index.css`

Neutralizar o unico hover vanilla CSS:

```css
@media (hover: none) {
  .place-card:hover {
    box-shadow: inherit;
    transform: none;
  }
}
```

---

## Arquivos alterados

| Arquivo | Mudanca |
|---|---|
| `tailwind.config.ts` | Adicionar plugin que redefine variante `hover` |
| `src/index.css` | Neutralizar `.place-card:hover` para touch |

**Total: 2 arquivos.**

Zero alteracoes em componentes, paginas ou logica.

---

## Analise de Risco

| Aspecto | Impacto |
|---|---|
| `active:` | Nenhum. Variante separada, nao afetada |
| `disabled:` | Nenhum. Variante separada |
| `focus-visible:` | Nenhum. Variante separada |
| Acessibilidade | Preservada. Focus-visible intacto |
| Logica de negocio | Zero impacto |
| Componentes Shadcn | Hover some em mobile, permanece em desktop (caso futuro) |
| Regressao visual | Minima. Botoes ficam com cor solida sem mudanca ao toque prolongado |

---

## Ordem de execucao

```text
1. tailwind.config.ts (plugin hover)
2. src/index.css (place-card)
3. Teste visual em viewport mobile
```

---

## Resultado esperado

- Nenhum efeito de hover visivel em dispositivos touch
- Toque em botao: cor permanece estavel, sem "sticky hover"
- Estados `active`, `disabled`, `focus-visible` intactos
- Se no futuro houver versao desktop, hovers voltam automaticamente

