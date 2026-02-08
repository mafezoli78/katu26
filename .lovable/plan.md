
Markdown
# Redesign do PersonCard: Layout Split com Foto Ampliada

## Resumo

Redesenhar o `PersonCard` para um layout horizontal dividido (foto à esquerda, conteúdo à direita), permitir ampliação da foto ao clicar, e corrigir o cálculo de idade, que hoje não reflete com exatidão o que está no cadastro.

---

## Alterações

### 1. Correção do cálculo de idade (PersonCard.tsx)

Hoje o cálculo de idade está incorreto, pois considera apenas o ano de nascimento e ignora mês e dia.

### Código atual (INCORRETO – remover):
```ts
new Date().getFullYear() - new Date(person.profile.data_nascimento).getFullYear()
O que fazer exatamente
Criar o arquivo abaixo:


src/utils/date.ts
Colocar exatamente este código dentro dele:

export const calculateAge = (birthDate: string): number => {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
};
No PersonCard.tsx:
Remover qualquer cálculo inline de idade
Importar a função:

import { calculateAge } from "@/utils/date";
Onde hoje a idade é exibida, substituir por:

calculateAge(person.profile.data_nascimento)
2. Novo layout split horizontal (PersonCard.tsx)
O layout atual empilhado deve ser substituído por um layout horizontal dividido.
O que fazer exatamente
Localizar no PersonCard.tsx o conteúdo atual dentro de:

<CardContent>
Substituir TODO o conteúdo interno do CardContent por este bloco:

<CardContent className="p-0">
  <div className="flex h-full">

    {/* FOTO */}
    <div
      className="w-[33%] min-h-[120px] relative overflow-hidden rounded-l-lg cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        if (person.profile.photo_url) setPhotoOpen(true);
      }}
    >
      {person.profile.photo_url ? (
        <img
          src={person.profile.photo_url}
          alt={person.profile.nome}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center font-bold text-xl bg-avatar">
          {initials}
        </div>
      )}
    </div>

    {/* CONTEÚDO */}
    <div className="flex-1 flex flex-col justify-between p-4">
      <div>
        <div className="font-semibold text-base">
          {person.profile.nome}, {calculateAge(person.profile.data_nascimento)}
        </div>

        <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
          {person.profile.bio}
        </div>
      </div>

      <div>
        {ctaButton}
      </div>
    </div>

  </div>
</CardContent>
Regras obrigatórias
NÃO usar Avatar
A imagem deve usar img com object-cover
Foto ocupa 100% da altura do card
Bordas arredondadas apenas à esquerda (rounded-l-lg)
Fallback sem foto usa iniciais + fundo padrão
event.stopPropagation() é obrigatório para não quebrar swipe
3. Modal de ampliação da foto (PersonCard.tsx)
O que adicionar exatamente
No topo do arquivo, adicionar os imports:

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
Dentro do componente, adicionar o estado:

const [photoOpen, setPhotoOpen] = useState(false);
No JSX do componente (após o Card ou no final do return), adicionar:

<Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
  <DialogContent className="max-w-3xl">
    <DialogTitle className="sr-only">
      Foto ampliada
    </DialogTitle>

    {person.profile.photo_url && (
      <img
        src={person.profile.photo_url}
        alt={person.profile.nome}
        className="w-full max-h-[70vh] object-contain"
      />
    )}
  </DialogContent>
</Dialog>
Regras do modal
Usar a MESMA URL da foto do card
Nenhum fetch novo
Fecha ao clicar fora ou no X
Se não houver foto, o clique não faz nada
Arquivos alterados
src/components/home/PersonCard.tsx
src/utils/date.ts
src/hooks/useProfile.ts (passa a reutilizar calculateAge)
O que NÃO será alterado
interactionRules.ts
useInteractionState
useInteractionData
Lógica de mute, block, wave ou chat
Backend ou RLS
Swipe e SwipeActions
Observação importante
A idade exibida hoje não reflete corretamente o cadastro em parte do ano.
Com essa alteração, o valor exibido passa a ser fiel à data de nascimento registrada.

