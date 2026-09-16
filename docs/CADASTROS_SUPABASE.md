# Cadastros reais de clientes e pilotos

A tela **Cadastros** utiliza as tabelas `public.clients` e `public.drivers` do Supabase.

## Permissões

- Somente usuários com papel `dono` veem a tela.
- Todas as consultas incluem a `company_id` do perfil autenticado.
- As políticas RLS da migração também impedem acesso entre empresas.

## Operações disponíveis

- cadastrar e editar clientes;
- cadastrar e editar pilotos e veículos;
- inativar e reativar sem excluir o histórico;
- impedir duplicidade de documento e placa dentro da empresa.

## Importante

O cadastro operacional não cria automaticamente um usuário no Supabase Auth. O acesso do cliente ao portal e o acesso do piloto ao aplicativo serão vinculados em uma etapa própria de convites e perfis.

