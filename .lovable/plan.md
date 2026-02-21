# Approve with constraint:



# The "Aqui" button inside the Leaflet popup MUST call the existing React confirmPresence(place) callback via a function reference passed to the map instance.



# Do NOT implement presence confirmation using DOM event delegation on the container.



# The map should receive a onConfirmPlace(placeId) prop from React and invoke it directly when the popup button is clicked.



# Presence INSERT logic must remain inside React/Supabase service layer.

&nbsp;

# Correção Definitiva: Substituir react-leaflet por Leaflet puro

## Problema

O erro `render2 is not a function` ocorre porque o Vite pre-bundler cria uma cadeia de contexto React quebrada ao processar o `@react-leaflet/core`. Isso acontece independentemente de como o `MapContainer` é usado -- o problema esta no bundler, nao no codigo.

## Solucao

Remover completamente o `react-leaflet` e usar o Leaflet nativo com `useRef` + `useEffect`. Isso elimina 100% dos problemas de contexto React.

## Passos

### 1. Remover dependencia react-leaflet

- Remover `react-leaflet` e `@react-leaflet/core` do `package.json`
- Manter apenas `leaflet` e `@types/leaflet`

### 2. Reescrever PlaceMap.tsx com Leaflet puro

- Usar `useRef` para o container div e `useEffect` para inicializar o mapa
- Criar marcadores e popups diretamente via API do Leaflet (`L.marker`, `L.popup`)
- Gerenciar o ciclo de vida do mapa manualmente (criar no mount, destruir no unmount)
- Manter toda a funcionalidade existente: pins customizados, popups com botao "Aqui", recentralizar, ponto azul do usuario

### 3. Manter CSS existente

- Todos os estilos CSS do Leaflet ja definidos em `index.css` continuam funcionando (.place-pin, .user-dot, etc.)
- Import do `leaflet/dist/leaflet.css` permanece em `main.tsx`

### 4. Manter lazy loading

- O `PlaceSelector.tsx` continuara usando `lazy(() => import(...))` para o `PlaceMap`

## Detalhes Tecnicos

Estrutura do novo `PlaceMap.tsx`:

```text
PlaceMap (componente funcional)
  |-- useRef<HTMLDivElement>    -> container do mapa
  |-- useRef<L.Map>            -> instancia do mapa  
  |-- useEffect (mount)        -> L.map(), L.tileLayer(), marcador usuario
  |-- useEffect (places)       -> atualiza marcadores de places
  |-- useEffect (tempPlaces)   -> atualiza marcadores temporarios
  |-- useEffect (userCoords)   -> atualiza posicao do marcador usuario
  |-- cleanup (unmount)        -> map.remove()
```

Popups com botao "Aqui" serao criados via `L.popup({ content: htmlString })` com event delegation no container para capturar cliques nos botoes.

O botao de recentralizar continua como elemento React posicionado absolutamente sobre o mapa.