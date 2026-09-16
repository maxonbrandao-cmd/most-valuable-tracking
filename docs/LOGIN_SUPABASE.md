# Login real com Supabase

## Pré-requisitos

- A migração inicial foi executada no Supabase.
- O usuário existe no Supabase Auth.
- O usuário possui um registro ativo em `public.profiles`.
- `.env.local` contém `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `@supabase/supabase-js` foi instalado.

## Como testar

1. Pare o servidor com `Ctrl+C`.
2. Inicie novamente com `npm.cmd run dev`.
3. Abra `http://localhost:5173/`.
4. Entre com o e-mail e a senha criados em **Authentication > Users**.

Após o login, o aplicativo carrega da tabela `profiles`:

- nome do usuário;
- empresa;
- papel (`dono`, `cliente` ou `piloto`);
- vínculo opcional com cliente ou piloto.

## Escopo desta fase

Autenticação, sessão, empresa e perfil já usam o Supabase. Os módulos de entregas, pilotos, canhotos e financeiro continuam usando os dados demonstrativos do navegador até as próximas etapas.

## Mensagens comuns

- **E-mail ou senha inválidos:** confira as credenciais criadas no Supabase Auth.
- **Usuário autenticado, mas sem perfil:** confira se o UUID de `auth.users` está cadastrado em `public.profiles`.
- **Supabase não configurado:** confira `.env.local` e reinicie o Vite.

