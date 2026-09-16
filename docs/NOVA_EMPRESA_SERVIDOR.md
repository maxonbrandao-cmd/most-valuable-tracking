# Cadastrar uma nova empresa pelo servidor

O cadastro foi desenhado para não aparecer no painel normal. Usuários `anon` e
`authenticated` não podem criar empresas. A operação fica disponível apenas no
SQL Editor do Supabase ou em um backend que use a chave `service_role`.

## Antes da primeira empresa nova

No Supabase, abra **SQL Editor**, cole todo o conteúdo de
`supabase/migrations/202609020002_cep_and_server_company_onboarding.sql` e clique
em **Run**. Faça isso somente uma vez.

## Para cada empresa nova

1. Abra **Authentication > Users > Add user > Create new user**.
2. Informe o e-mail e uma senha provisória segura. Marque o e-mail como confirmado
   somente se você já verificou que o endereço pertence ao proprietário.
3. Copie o UUID do usuário criado.
4. Abra o **SQL Editor** e execute o modelo abaixo, trocando os valores:

```sql
select public.admin_create_company(
  p_owner_user_id   => 'COLE-AQUI-O-UUID-DO-USUARIO'::uuid,
  p_company_name    => 'NOME DA EMPRESA',
  p_owner_full_name => 'NOME DO PROPRIETARIO',
  p_document        => 'CNPJ OU CPF',
  p_phone           => '(00) 00000-0000'
) as company_id;
```

O resultado será o UUID da empresa. O proprietário já ficará vinculado com o
papel `dono` e poderá entrar no painel usando o e-mail e a senha criados no Auth.

## Conferência

Execute esta consulta usando o mesmo UUID do usuário:

```sql
select
  p.user_id,
  c.id as company_id,
  c.name as empresa,
  p.full_name as proprietario,
  p.role,
  p.active
from public.profiles p
join public.companies c on c.id = p.company_id
where p.user_id = 'COLE-AQUI-O-UUID-DO-USUARIO'::uuid;
```

Deve aparecer uma linha com `role = dono`.

## Regra de segurança

Nunca coloque a chave `service_role`, uma chave `sb_secret_...` ou a senha do
banco em arquivos `.env` do Vite/React ou do aplicativo Expo. Se automatizarmos
esse cadastro futuramente, a chave ficará somente em uma Supabase Edge Function
ou outro backend privado.
