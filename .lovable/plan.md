

# Correcao da tela branca no mapa Leaflet

## Problemas identificados

1. **overflow-hidden no container pai**: O `<main>` em `MobileLayout.tsx` (linha 16) aplica `overflow-hidden`, cortando o mapa que tem altura baseada em `100vh`.

2. **Altura do mapa nao considera layout real**: O container usa `calc(100vh - 200px)` como valor fixo, mas a altura disponivel depende do header (~56px), bottom nav (~80px com padding), e padding do conteudo (~32px). O valor correto seria diferente e mais seguro se calculado dinamicamente.

3. **Z-index do mapa conflita com header/nav**: O Leaflet usa z-indexes internos (tiles em z-index 200+, controles em 1000+), que podem cobrir ou ser cobertos pelo header e bottom nav fixos.

4. **Sem feedback visual durante carregamento de tiles**: O usuario ve uma area cinza/branca ate as tiles carregarem, sem indicacao de que o mapa esta funcionando.

## Solucao

### Arquivo: `src/components/location/PlaceMap.tsx`

- Trocar a altura fixa `calc(100vh - 200px)` por uma altura que se adapte ao container disponivel, usando `h-full` com o container pai controlando a altura
- Adicionar `z-index: 0` no container do mapa para isola-lo do header/nav
- Adicionar estado de loading para tiles: ouvir o evento `tileload`/`load` do TileLayer para mostrar um spinner sobre o mapa enquanto as tiles carregam
- Adicionar guard para coordenadas invalidas (NaN, 0,0) antes de renderizar o MapContainer

Mudancas especificas:
- Container externo: trocar `style={{ height: 'calc(100vh - 200px)' }}` por `style={{ height: 'calc(100dvh - 220px)' }}` usando `dvh` (dynamic viewport height) que lida melhor com barras de navegacao mobile, e 220px para cobrir header (56px) + nav (80px) + padding (32px) + margem
- Adicionar `position: relative; z-index: 0` ao container externo para criar stacking context isolado
- Adicionar componente interno `TileLoadingOverlay` que usa `useMap()` para escutar eventos de loading do mapa e mostrar spinner

### Arquivo: `src/index.css`

- Adicionar regra para garantir que `.leaflet-container` tenha `z-index: 0` explicito
- Adicionar estilo para o overlay de loading das tiles

### Arquivo: `src/components/location/PlaceSelector.tsx`

- Envolver o `PlaceMap` em um container com altura explicita para garantir que `h-full` funcione
- Adicionar validacao: so renderizar o mapa se `userCoords.lat` e `userCoords.lng` forem numeros validos e diferentes de zero

## Resumo de arquivos

| Arquivo | Acao |
|---|---|
| `src/components/location/PlaceMap.tsx` | Modificar (altura, z-index, loading tiles, guard coords) |
| `src/index.css` | Modificar (z-index leaflet-container, loading overlay) |
| `src/components/location/PlaceSelector.tsx` | Modificar (container com altura, validacao de coords) |

