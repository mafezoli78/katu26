# Ajuste Visual do PersonCard: Foto com Margem, Bordas Completas e Modal Consistente

## Resumo

Ajustar o PersonCard para que a foto tenha margem interna visivel, bordas arredondadas nos quatro cantos, e o modal de ampliacao use o mesmo corte visual. O resultado deve replicar a imagem de referencia fornecida.

## Alteracoes em `src/components/home/PersonCard.tsx`

### 1. Coluna da foto -- margem interna e bordas completas

**Estado atual:** A foto ainda encosta visualmente nas extremidades do card e utiliza arredondamento parcial (rounded-l-lg), não replicando o espaçamento e o acabamento da imagem de referência.

**Proposta:** Adicionar padding ao container da foto e aplicar `rounded-lg` na imagem (quatro cantos). A imagem deixa de usar `absolute inset-0` e passa a ter dimensoes controladas pelo container com padding.

```tsx
{/* FOTO */}
<div
  className="w-[33%] flex items-center p-3 cursor-pointer"
  onClick={(e) => {
    e.stopPropagation();
    setPhotoOpen(true);
  }}
>
  <img
    src={person.profile.foto_url}
    alt={person.profile.nome}
    className="w-full aspect-square object-cover rounded-lg"
  />
</div>
```

Mudancas chave:
- Container: `p-3` para margem interna, `flex items-center` para centralizar verticalmente, remove `min-h-[120px]`, `relative`, `overflow-hidden`, `rounded-l-lg`
- Imagem: `aspect-square` para proporcao quadrada consistente, `rounded-lg` nos quatro cantos, remove `absolute inset-0 h-full`


### 2. Modal de ampliacao -- corte visual consistente

O uso de aspect-square combinado com object-cover é uma decisão intencional de produto. Imagens fora da proporção quadrada serão cortadas propositalmente para garantir consistência visual entre o card e o modal de ampliação.

**Atual (linhas 288-292):** Usa `object-contain` que mostra a imagem inteira sem corte.

**Proposta:** Usar `object-cover` com `aspect-square` e `rounded-lg` para manter o mesmo enquadramento do card.

```tsx
<img
  src={person.profile.foto_url}
  alt={person.profile.nome || ''}
  className="w-full max-w-md mx-auto aspect-square object-cover rounded-lg"
/>
```

### 3. Sem alteracoes na coluna direita

A coluna direita (nome, idade, bio, CTA) ja usa `flex-col justify-between p-4` e esta corretamente estruturada. O `mt-3` no CTA permanece.

## Arquivo alterado

- `src/components/home/PersonCard.tsx`

## O que NAO sera alterado

- Logica de swipe, mute, block, wave, chat
- `interactionRules.ts`, `useInteractionState`, `useInteractionData`
- Backend, RLS ou qualquer outro arquivo

