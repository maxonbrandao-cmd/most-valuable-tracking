# Entregas reais no Supabase

A tela **Entregas** utiliza `public.deliveries` e `public.delivery_status_history`.

## Recursos

- criação e edição pelo proprietário;
- seleção de clientes e pilotos reais;
- piloto opcional no momento da criação;
- valor cobrado e repasse ao piloto;
- alteração de status pela função segura `set_delivery_status`;
- histórico automático de cada mudança;
- atualização da lista por Supabase Realtime;
- acesso filtrado pelas políticas RLS para dono, cliente e piloto.

## Fluxo de status

`pendente → aceito → coletado → em_rota → chegou → entregue`

Também existem `nao_entregue` e `cancelado`. O proprietário pode corrigir estados; o piloto fica limitado às transições operacionais autorizadas pela função do banco.

## Próximas integrações

- geocodificação dos endereços;
- coordenadas de coleta e entrega;
- posição real do piloto;
- comprovante digital e geração automática da receita.

