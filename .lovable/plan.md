# Mapa interativo na tela de selecao de locais com Leaflet + OpenStreetMap

## Visao geral

Adicionar um modo de visualizacao em mapa na tela de selecao de locais (`step === 'select'`), alternavel com a lista atual via toggle no topo. O mapa usa Leaflet (gratuito) com tiles do OpenStreetMap.

## Arquitetura

O toggle Lista/Mapa fica dentro do `PlaceSelector`. Quando o usuario alterna para Mapa, um novo componente `PlaceMap` e renderizado no lugar da lista.

```text
PlaceSelector
  |-- Toggle [Lista | Mapa]
  |-- (modo lista) -> layout atual
  |-- (modo mapa)  -> <PlaceMap />
```

## Mudancas tecnicas

### 1. Instalar dependencia

- `leaflet` + `@types/leaflet` (tipos TypeScript)
- `react-leaflet` (bindings React para Leaflet)

### 2. Novo arquivo: `src/components/location/PlaceMap.tsx`

Componente dedicado ao mapa. Recebe as mesmas props que o PlaceSelector precisa:

- `places: Place[]` - locais do Foursquare com `latitude`, `longitude`, `active_users`
- `temporaryPlaces: NearbyTemporaryPlace[]` - locais temporarios
- `userCoords: { lat: number; lng: number }` - posicao do usuario
- `onSelectPlace: (placeId: string) => void` - callback ao clicar "Aqui"

Funcionalidades:

- **Ponto azul pulsante** para a posicao do usuario (CircleMarker com animacao CSS)
- **Pins customizados** para cada local: marcador arredondado (DivIcon do Leaflet) com numero de usuarios ativos. Cores Katuu: fundo `--katu-blue` (#1E8FD3) para locais com usuarios, fundo `--muted` para locais vazios
- **Popup ao clicar no pin**: card pequeno com nome do local + botao "Aqui"
- Centro do mapa: coordenadas do usuario
- Zoom inicial: ~16 (bairro)
- Tiles: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`

### 3. Modificar: `src/components/location/PlaceSelector.tsx`

- Adicionar prop `userCoords: { lat: number; lng: number } | null`
- Adicionar estado `viewMode: 'list' | 'map'` (default: `'list'`)
- No topo do componente (acima da lista), renderizar toggle com dois botoes: "Lista" e "Mapa"
- Quando `viewMode === 'map'` e `userCoords` existir, renderizar `<PlaceMap>` no lugar da lista
- O toggle usa os componentes ToggleGroup/ToggleGroupItem ja existentes no projeto

### 4. Modificar: `src/pages/Location.tsx`

- Passar `userCoords` como prop para `PlaceSelector`

### 5. Novo arquivo ou adicao em `src/index.css`

- Importar CSS do Leaflet: `@import 'leaflet/dist/leaflet.css';`
- Adicionar animacao CSS para o ponto azul pulsante do usuario
- Estilos para os pins customizados (DivIcon)

### Design dos pins

```text
Formato: circulo com 32x32px
- Fundo azul Katuu (#1E8FD3) se active_users > 0
- Fundo cinza (muted) se active_users === 0
- Texto branco centralizado com o numero
- Borda branca de 2px
- Sombra sutil
- Locais temporarios: fundo verde Katuu (#40C2A8)
```

### Popup ao clicar no pin

```text
Card compacto (Leaflet Popup customizado):
- Nome do local (truncado se longo)
- Badge com numero de usuarios ativos
- Botao "Aqui" (mesmo estilo accent da lista)
```

### Performance mobile

- Tiles com `detectRetina: true` para telas de alta resolucao
- `zoomControl: false` (mobile usa pinch-to-zoom)
- `attributionControl` posicionado discretamente
- Lazy load do componente PlaceMap com `React.lazy` + `Suspense`
- Altura fixa do container do mapa: `calc(100vh - 200px)` para evitar reflows

## Dados utilizados

- `places` ja contem `latitude`, `longitude`, `active_users` (vem do edge function `search-places`)
- `temporaryPlaces` ja contem `latitude`/`longitude` implicitamente via `distance_meters` (precisaremos das coords reais - verificar se o RPC `find_nearby_temporary_places` retorna lat/lng)

**Nota sobre locais temporarios**: O RPC `find_nearby_temporary_places` retorna apenas `id`, `nome`, `distance_meters`, `active_users` - nao retorna coordenadas. Para exibir no mapa, sera necessario alterar o RPC para incluir `latitude` e `longitude` no retorno, ou buscar diretamente da tabela `places`.

### Alternativa para coords de locais temporarios

Em vez de alterar o RPC, buscar os dados completos da tabela `places` para os IDs dos locais temporarios retornados. Isso evita migracoes no banco.

**Detalhes técnicos:**

1. No componente de Mapa, utilize os ícones do Lucide (como o 'Users') dentro dos marcadores do Leaflet para manter a consistência visual com o restante do app.

2. Certifique-se de que o contador de usuários em cada Pin utilize a mesma lógica de cache do TanStack Query já presente no projeto, para evitar chamadas excessivas ao Supabase enquanto o usuário move o mapa.

3. Para o marcador de localização do usuário, use um círculo simples com sombra (estilo GPS nativo) para não confundir com os Pins de estabelecimentos.

4. Adicione um botão de 'Centralizar em mim' flutuante sobre o mapa.

## Resumo de arquivos


| Arquivo                                     | Acao                                             |
| ------------------------------------------- | ------------------------------------------------ |
| `package.json`                              | Adicionar leaflet, @types/leaflet, react-leaflet |
| `src/components/location/PlaceMap.tsx`      | Criar (componente do mapa)                       |
| `src/components/location/PlaceSelector.tsx` | Modificar (adicionar toggle + prop userCoords)   |
| `src/pages/Location.tsx`                    | Modificar (passar userCoords ao PlaceSelector)   |
| `src/index.css`                             | Modificar (importar CSS Leaflet + animacoes)     |
