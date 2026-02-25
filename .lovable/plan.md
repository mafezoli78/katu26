# Tornar UPDATE de Selfie Determinístico via presence_id

## Análise do código atual

O RPC `activate_presence` já retorna o `presence_id` (UUID) na linha 613 de `usePresence.ts`:

```text
const { data: newPresenceId, error } = await supabase.rpc('activate_presence', {...});
```

Porém esse valor é descartado — `activatePresenceAtPlace` retorna apenas `{ error }` (linha 632). O mesmo ocorre com `createTemporaryPlace`, que chama `activatePresenceAtPlace` internamente e também não propaga o ID.

Em `Location.tsx`, o UPDATE da selfie usa `eq('user_id', user.id).eq('ativo', true)` — um filtro não-determinístico que pode falhar silenciosamente se o INSERT ainda não propagou.

## Alterações

### 1. `src/hooks/usePresence.ts` — activatePresenceAtPlace (linhas 559-638)

Alterar retorno de `{ error: null }` para `{ error: null, presenceId: newPresenceId }`.

Alterar os retornos de erro para incluir `presenceId: null`.

Tipo de retorno passa a ser `{ error: Error | null; presenceId: string | null }`.

### 2. `src/hooks/usePresence.ts` — createTemporaryPlace (linhas 642-687)

Na linha 680, capturar `presenceId` do retorno de `activatePresenceAtPlace`:

```text
const { error: presenceError, presenceId } = await activatePresenceAtPlace(...)
```

Alterar retorno para incluir `presenceId`:

```text
return { error: null, placeId: placeData.id, presenceId };
```

Tipo de retorno passa a ser `{ error: Error | null; placeId: string | null; presenceId: string | null }`.

### 3. `src/pages/Location.tsx` — handleActivatePresence (linhas 273-321)

Capturar `presenceId` de ambos os caminhos:

```text
let presenceId: string | null = null;

if (selectedPlaceId) {
  const result = await activatePresenceAtPlace(...);
  error = result.error;
  presenceId = result.presenceId;
} else if (newPlaceName.trim() && userCoords) {
  const result = await createTemporaryPlace(...);
  error = result.error;
  presenceId = result.presenceId;
}
```

Substituir o UPDATE (linhas 303-312):

```text
if (!presenceId) {
  throw new Error('Presence ID not returned after activation');
}

await supabase
  .from('presence')
  .update({
    checkin_selfie_url: selfieUrl,
    checkin_selfie_created_at: new Date().toISOString(),
    selfie_provided: selfieSource === 'camera',
    selfie_source: selfieSource,
  })
  .eq('id', presenceId);

const { data: updatedPresence, error: updateError } = await supabase
  .from('presence')
  .select('id')
  .eq('id', presenceId)
  .single();

if (updateError || !updatedPresence) {
  throw new Error('Selfie update failed — presence not yet visible after activation');
}
```

## Arquivos alterados


| Arquivo                    | Alteração                                                    |
| -------------------------- | ------------------------------------------------------------ |
| `src/hooks/usePresence.ts` | activatePresenceAtPlace retorna presenceId                   |
| `src/hooks/usePresence.ts` | createTemporaryPlace propaga presenceId                      |
| `src/pages/Location.tsx`   | Captura presenceId e usa no UPDATE via .eq('id', presenceId) |


## O que NÃO muda

- CheckinSelfie.tsx
- cameraService.ts
- RPC activate_presence (já retorna o ID)
- UI ou UX
- Fluxo de fallback upload
- Conversas e waves