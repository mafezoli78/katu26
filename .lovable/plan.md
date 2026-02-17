

Correção: Chat não aparece para remetente do wave

Diagnóstico

O fluxo atual depende 100% do Supabase Realtime + RLS para notificar o remetente (user1_id) sobre a nova conversa. O problema ocorre porque:

- A subscription Realtime escuta INSERTs na tabela conversations sem filtro, dependendo do RLS para rotear eventos

- O Supabase Realtime com RLS pode ter atrasos ou falhas silenciosas na entrega de eventos para o segundo participante

- Não existe fallback — se o evento não chegar, o usuário só vê o chat ao recarregar

Solução

Três camadas de proteção para garantir que ambos os usuários vejam a conversa imediatamente:

1. Polling de segurança (fallback otimizado)

Adicionar um intervalo de refetch a cada 15 segundos em useConversations.tsx (em vez de 10s para reduzir custo de API). Implementar com:

- Debounce para evitar refetches simultâneos

- Pausa automática quando tab do navegador está inativa (usando Page Visibility API)

- Cleanup adequado no unmount

2. Melhorar a subscription Realtime

Manter a subscription sem filtro (já que precisamos capturar tanto user1_id quanto user2_id), mas:

- Escutar eventos INSERT e UPDATE explicitamente (não usar '*')

- Adicionar filtro no handler para verificar se usuário atual está envolvido (user1_id OU user2_id)

- Adicionar debounce de 500ms antes de refetch para agrupar eventos múltiplos

- Adicionar logs claros para debug

- Garantir cleanup correto da subscription

3. Tratamento de duplicatas

Adicionar lógica para evitar adicionar a mesma conversa múltiplas vezes na lista.

Mudanças técnicas

Arquivo: src/hooks/useConversations.tsx

Implementação detalhada:

// 1. Polling fallback com otimizações

useEffect(() => {

  let intervalId: NodeJS.Timeout;

  let debounceTimeout: NodeJS.Timeout;

  

  // Função de refetch com debounce

  const debouncedRefetch = () => {

    clearTimeout(debounceTimeout);

    debounceTimeout = setTimeout(() => {

      fetchConversations();

    }, 500);

  };

  

  // Polling a cada 15 segundos

  intervalId = setInterval(() => {

    // Só faz polling se tab está ativa

    if (!document.hidden) {

      debouncedRefetch();

    }

  }, 15000);

  

  // Cleanup

  return () => {

    clearInterval(intervalId);

    clearTimeout(debounceTimeout);

  };

}, [userId]);

// 2. Subscription Realtime melhorada

useEffect(() => {

  if (!userId) return;

  

  let debounceTimeout: NodeJS.Timeout;

  

  const channel = supabase

    .channel('conversations-updates')

    .on('postgres_changes', {

      event: 'INSERT',

      schema: 'public',

      table: 'conversations'

    }, (payload) => {

      console.log('[Realtime] INSERT conversation:', [payload.new](http://payload.new));

      

      // Filtrar: só refetch se usuário atual está envolvido

      const conv = [payload.new](http://payload.new);

      if (conv.user1_id === userId || conv.user2_id === userId) {

        // Debounce para agrupar eventos múltiplos

        clearTimeout(debounceTimeout);

        debounceTimeout = setTimeout(() => {

          fetchConversations();

        }, 500);

      }

    })

    .on('postgres_changes', {

      event: 'UPDATE',

      schema: 'public',

      table: 'conversations'

    }, (payload) => {

      console.log('[Realtime] UPDATE conversation:', [payload.new](http://payload.new));

      

      // Filtrar: só refetch se usuário atual está envolvido

      const conv = [payload.new](http://payload.new);

      if (conv.user1_id === userId || conv.user2_id === userId) {

        clearTimeout(debounceTimeout);

        debounceTimeout = setTimeout(() => {

          fetchConversations();

        }, 500);

      }

    })

    .subscribe((status) => {

      console.log('[Realtime] Subscription status:', status);

    });

  

  // Cleanup

  return () => {

    clearTimeout(debounceTimeout);

    supabase.removeChannel(channel);

  };

}, [userId]);

// 3. Tratamento de duplicatas no fetchConversations

const fetchConversations = async () => {

  // ... código existente de fetch ...

  

  // Ao atualizar estado, remover duplicatas por conversation_id

  setConversations(prev => {

    const newConvs = [...prev, ...fetchedConversations];

    const uniqueConvs = Array.from(

      new Map([newConvs.map](http://newConvs.map)(c => [[c.id](http://c.id), c])).values()

    );

    return uniqueConvs;

  });

};

Detalhes de implementação:

1. Polling fallback:

   - Intervalo de 15 segundos (balanceio entre responsividade e custo)

   - Debounce de 500ms para evitar refetches simultâneos

   - Verifica document.hidden para pausar quando tab inativa

   - Cleanup adequado de intervalos e timeouts

2. Subscription Realtime:

   - Escuta explicitamente INSERT e UPDATE (não usar event: '*')

   - Filtro no handler: verifica se user1_id === userId || user2_id === userId

   - Debounce de 500ms para agrupar eventos múltiplos

   - Logs claros para debug

   - Cleanup adequado da subscription e timeouts

3. Tratamento de duplicatas:

   - Usar Map para remover duplicatas por conversation_id

   - Garantir que mesma conversa não apareça múltiplas vezes

Nenhuma mudança no banco

As RLS policies da tabela conversations já permitem SELECT para ambos user1_id e user2_id. O Realtime já está habilitado para a tabela. O problema é de confiabilidade na entrega, não de permissão.

Resultado esperado

Quando um wave é aceito, o chat aparece na lista de conversas de ambos os usuários em:

- 1-2 segundos via Realtime (cenário ideal)

- Até 15 segundos via polling fallback (se Realtime falhar)

- Sem necessidade de refresh manual

- Sem duplicatas na lista

- Sem refetches excessivos (otimizado com debounce)

&nbsp;