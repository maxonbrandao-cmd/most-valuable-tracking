# MVT v8 — CEP e cadastro seguro de empresas

Esta atualização não altera o aplicativo Android que está na fila do EAS.
Ela modifica apenas o painel web e o banco Supabase.

## O que foi adicionado

- CEP opcional no endereço de coleta.
- CEP opcional no endereço de entrega.
- Botão **Buscar CEP**, com preenchimento de rua, bairro e cidade/UF.
- Endereço permanece editável para número, complemento ou digitação manual.
- CEP validado no banco com exatamente 8 números.
- Função `admin_create_company` restrita ao SQL Editor e ao `service_role`.
- Bloqueio reforçado das antigas funções de criação para usuários do aplicativo.

## Instalação

1. Faça uma cópia de segurança da pasta do projeto.
2. Extraia este ZIP dentro de:
   `C:\Users\Suporte\most-valuable-tracking`
3. Confirme a substituição dos arquivos existentes.
4. No Supabase, abra **SQL Editor**.
5. Abra o arquivo:
   `supabase\migrations\202609020002_cep_and_server_company_onboarding.sql`
6. Copie todo o conteúdo, cole no SQL Editor e clique em **Run** uma única vez.
7. No terminal do Cursor, na raiz do projeto, execute:

```bat
npm.cmd run build
```

8. Se o servidor Vite já estiver aberto, pressione `Ctrl+C` e inicie novamente:

```bat
npm.cmd run dev
```

## Cadastrar outra empresa

Depois de instalar a migração, siga `docs\NOVA_EMPRESA_SERVIDOR.md`.

Não coloque uma chave `service_role`, uma chave `sb_secret_...` ou a senha do
banco no Vite, no React ou no aplicativo Expo.
