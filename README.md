# Nutri Helper

Web app (PWA) para acompanhar no dia a dia o plano alimentar e a ingestão de água. Ver o
briefing completo em [`refs/BRIEFING_app_plano_alimentar.md`](refs/BRIEFING_app_plano_alimentar.md).

Stack: React + Vite + TypeScript, hospedado no GitHub Pages, com Supabase (Auth + Postgres)
no plano gratuito. Sem backend próprio, sem custo.

Paleta de cores, logo e convenções visuais: ver [`ds.md`](ds.md).

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local   # preencha com os dados do SEU projeto Supabase
npm run dev
```

## Passo a passo para colocar no ar (Thiago)

### 1. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com), crie uma conta gratuita e um novo projeto
   (plano **Free**, sem cartão de crédito).
2. Em **Project Settings → API**, copie a **Project URL** e a **anon public key**. Você vai
   usar essas duas informações nos passos 3 e 4.

### 2. Rodar as migrations (criar as tabelas)

1. No painel do Supabase, abra **SQL Editor → New query**.
2. Abra o arquivo [`supabase/migrations/20261003000000_auth_and_profiles.sql`](supabase/migrations/20261003000000_auth_and_profiles.sql)
   deste repositório, copie todo o conteúdo, cole no SQL Editor e clique em **Run**.

### 3. Liberar seu e-mail (e o de uma conta de teste) para criar conta

O cadastro é só para convidados: sem isso, ninguém consegue entrar, nem você.

1. Copie [`supabase/seed/allowed_emails.example.sql`](supabase/seed/allowed_emails.example.sql)
   para um novo arquivo `supabase/seed/allowed_emails.local.sql` (esse nome fica **fora do
   Git**, não vaza nenhum e-mail no repositório público).
2. Edite o arquivo novo trocando os e-mails de exemplo pelo seu e pelo da conta de teste.
3. Cole o conteúdo no **SQL Editor** do Supabase e clique em **Run**.
4. Pode rodar de novo sempre que quiser liberar mais um e-mail.

### 4. Ativar o login com Google

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto (ou use um
   existente) e vá em **APIs & Services → Credentials → Create Credentials → OAuth client
   ID → Web application**.
2. No Supabase, vá em **Authentication → Sign In / Providers → Google** para ver a **Callback
   URL (for OAuth)** exigida — cole essa URL em **Authorized redirect URIs** no Google Cloud.
3. Volte ao Google Cloud, copie o **Client ID** e o **Client Secret** gerados.
4. No Supabase, cole o Client ID e o Client Secret na mesma tela do provedor Google e salve.

### 5. Configurar e-mail/senha (sem exigir confirmação por e-mail)

O Supabase Free só envia 2 e-mails por hora pelo provedor embutido. Como o cadastro já é
controlado pela lista de convidados (passo 3), vamos pular a confirmação por e-mail para
evitar esbarrar nesse limite:

1. Em **Authentication → Sign In / Providers → Email**, desligue a opção **Confirm email**.

### 6. Configurar as URLs do app no Supabase

1. Em **Authentication → URL Configuration**:
   - **Site URL**: `https://SEU-USUARIO.github.io/nutri-web-app/`
   - **Redirect URLs**: adicione a mesma URL acima.

   (Troque `SEU-USUARIO` pelo seu usuário do GitHub.)

### 7. Publicar o repositório no GitHub

Isso é feito junto comigo, pedindo sua confirmação antes de criar algo público na sua conta.

### 8. Ativar o GitHub Pages e configurar o build

No repositório, no GitHub:

1. **Settings → Pages → Source**: escolha **GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables tab → New repository variable**,
   crie duas (são públicas por natureza, protegidas pelo Row Level Security, por isso vão
   como "Variables" e não "Secrets"):
   - `VITE_SUPABASE_URL` = a Project URL do passo 1.
   - `VITE_SUPABASE_ANON_KEY` = a anon public key do passo 1.
3. Dê um push na branch `main` (ou rode o workflow manualmente em **Actions**). Depois que a
   Action terminar (ícone verde), o app estará em `https://SEU-USUARIO.github.io/nutri-web-app/`.

## O que já funciona nesta fatia

- Login com Google e com e-mail/senha, restrito a e-mails convidados.
- Mensagem amigável quando o e-mail não está autorizado, quando o Supabase está fora do ar,
  ou quando e-mail/senha estão errados.
- Deploy automático para o GitHub Pages a cada push na `main`.
- PWA instalável (ainda com ícone provisório — pode ser trocado depois).

## O que ainda não existe (fica para as próximas fatias)

Conteúdo real da tela "Hoje" (refeições, trocas), marcar refeição como feita, registro de
água, lembretes por notificação, histórico, edição manual do plano, envio de PDF, pessoas da
casa e lista de compras — tudo listado em ordem no briefing, seção 11.

## Observações importantes

- O repositório é **público**: nenhum dado pessoal (e-mail, plano alimentar) pode ser
  commitado. Os arquivos `*.local.sql` e `.env.local` ficam fora do Git por isso.
- Se o projeto do Supabase ficar uma semana sem uso, ele é pausado automaticamente (plano
  Free). Com uso diário isso não deve acontecer; se acontecer, o app mostra uma mensagem
  clara em vez de travar.
