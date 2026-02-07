

## Swipe para revelar ações nos cards de pessoa

### Resumo

Adicionar interacao de swipe horizontal nos cards da Home, revelando botoes "Silenciar" e "Bloquear" por tras do card -- puramente visual, sem logica de negocio.

### Arquitetura do swipe

**1. Onde fica o estado de "card aberto"**

O estado `openCardId` ficara na pagina `Home.tsx` como um `useState<string | null>`. Sera passado como prop para cada `PersonCard`, junto com um callback `onSwipeOpen(id)`. Isso garante controle centralizado.

O callback onSwipeOpen(id: string | null) deve aceitar também null, permitindo que o próprio card solicite fechamento (swipe para a direita), limpando o estado global.

**2. Como garantir apenas um card aberto**

Quando um card chama `onSwipeOpen(id)`, o Home atualiza `openCardId` para esse id. Todos os outros cards recebem a nova prop e fecham automaticamente (sua `translateX` volta a 0).

Ao iniciar um swipe horizontal em um novo card, este deve chamar onSwipeOpen(person.id) ainda durante o onTouchMove, no momento em que ultrapassar o threshold de abertura, o que fecha automaticamente qualquer card previamente aberto, o que fecha automaticamente qualquer card previamente aberto.

**3. Como o swipe horizontal nao quebrara o scroll vertical**

Deteccao de direcao no `onTouchMove`: calcula `deltaX` e `deltaY` a partir do ponto inicial. Se |deltaY| > |deltaX| nos primeiros pixels de movimento, o gesto é classificado como scroll vertical e o swipe é cancelado definitivamente para aquele gesto. Uma vez classificado como horizontal, o card captura o gesto.

Arraste para a direita (translateX próximo de 0) deve sempre resultar em fechamento do card no onTouchEnd do próprio PersonCard, com chamada onSwipeOpen(null).

---

### Detalhes tecnicos

#### Arquivos modificados

**`src/pages/Home.tsx`**
- Adicionar `useState<string | null>(null)` para `openCardId`
- Passar `openCardId` e `onSwipeOpen` como props para cada `PersonCard`

**`src/components/home/PersonCard.tsx`**
- Novas props: `openCardId`, `onSwipeOpen`
- Estado local: `translateX` (numero em px para o deslocamento do card)
- Touch handlers: `onTouchStart`, `onTouchMove`, `onTouchEnd`
- Logica de direcao: flag `directionLocked` (null | 'horizontal' | 'vertical')
- Threshold de ~15-20px para decidir a direcao
- `translateX` limitado entre `-BUTTON_WIDTH` e `0`
- No `onTouchEnd`: snap para aberto (`-BUTTON_WIDTH`) ou fechado (`0`) baseado em threshold de 40%
- `useEffect` que observa `openCardId`: se diferente do proprio `person.id`, reseta `translateX` para 0
- O deslocamento horizontal não possui overscroll elástico; valores fora do range são clampados imediatamente.

**Estrutura do JSX no PersonCard:**

```text
<div className="relative overflow-hidden rounded-lg">
  <!-- Camada de botoes (posicao absoluta, direita) -->
  <div className="absolute right-0 top-0 bottom-0 flex flex-col w-[140px]">
    <button "Silenciar" (metade superior, bg amarelo/muted)>
    <button "Bloquear" (metade inferior, bg destructive)>
  </div>

  <!-- Card deslizante (transform: translateX) -->
  <div style={{ transform: `translateX(${translateX}px)` }}>
    <Card> ... conteudo atual ... </Card>
  </div>
</div>
```

- Botoes com largura fixa de 140px
- "Silenciar": `bg-amber-500 text-white` com icone `VolumeX`
- "Bloquear": `bg-destructive text-destructive-foreground` com icone `Ban`
- Ambos com `onClick={() => console.log('silenciar/bloquear', person.id)}`
- Transição CSS transition-transform duration-200 aplicada somente após onTouchEnd.
Durante onTouchMove, nenhuma transição ativa, para manter resposta 1:1 ao dedo. (removida durante arraste para feedback imediato)

#### Icones

Usar `VolumeX` e `Ban` do Lucide (ja instalado).

#### Nenhum arquivo adicional criado

Toda a logica fica contida em `PersonCard.tsx` e a coordenacao em `Home.tsx`.
