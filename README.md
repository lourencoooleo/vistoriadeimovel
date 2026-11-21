# Sistema de Vistorias

Você cria a vistoria no painel, escolhe o imóvel e manda o link pelo WhatsApp. O vistoriador abre no celular, marca o estado de cada item, fotografa e confirma o e-mail dele e do(a) locatário(a). No envio, o termo em PDF e as fotos vão para o seu Google Drive, e a Assinafy manda na hora o convite de assinatura eletrônica para você, o(a) locatário(a) e o vistoriador. Quando todos assinam, o PDF assinado volta para a mesma pasta.

- `https://SEU-SITE.netlify.app/admin.html` é o seu painel
- `https://SEU-SITE.netlify.app/?v=...` é o link do vistoriador, um por vistoria, e mostra só aquele imóvel

## 1. Publicar na Netlify (10 min)

1. Suba esta pasta inteira para um repositório no GitHub. **Pode ser privado.** A Netlify publica repositório privado de graça.
2. Na Netlify: **Add new site › Import an existing project › GitHub** e escolha o repositório. Não mexa em nada da configuração de build, ela já vem do `netlify.toml`.
3. Em **Site configuration › Environment variables**, crie:
   - `ADMIN_PASSWORD`: a senha do seu painel
4. **Deploys › Trigger deploy**. Abra `/admin.html` e entre com a senha.

## 2. Conectar o Google Drive (15 min, uma vez só)

O painel mostra este passo a passo em **Configurações**, com a URI pronta para copiar.

1. Em `console.cloud.google.com`, crie um projeto.
2. **APIs e serviços › Biblioteca**: ative a **Google Drive API**.
3. **Google Auth Platform**: escolha **Externo** e preencha o nome do app e seu e-mail.
4. **Público-alvo**: clique em **Publicar app** para ficar em produção. Sem isso a conexão cai a cada 7 dias.
5. **Clientes**: crie um **ID do cliente OAuth** do tipo **Aplicativo da Web**. Em **URIs de redirecionamento autorizados**, cole `https://SEU-SITE.netlify.app/api/google/callback`.
6. Na Netlify, crie `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` e faça um novo deploy.
7. No painel, em **Configurações**, clique em **Conectar Google Drive**.

O app usa a permissão `drive.file`: ele só enxerga os arquivos que ele mesmo cria, nunca o resto do seu Drive. As vistorias ficam em **Vistorias de Imóveis › (imóvel) › (data · tipo · código)**.

## 3. Assinatura eletrônica com a Assinafy (opcional)

1. Na Assinafy, gere uma **chave de API** e copie o **ID da conta (workspace)**.
2. Na Netlify, crie `ASSINAFY_API_KEY` e `ASSINAFY_ACCOUNT_ID`.
3. Para o PDF assinado ir sozinho para o Drive, crie `ASSINAFY_WEBHOOK_SECRET` com uma senha longa qualquer. O painel mostra a URL do webhook pronta para colar na Assinafy, em **Integrações › Webhooks**. Ligue os eventos `document_ready`, `signer_signed_document`, `signer_rejected_document`, `user_rejected_document` e `document_processing_failed`. Deixe **Assinar webhooks** desligado.
4. Para testar sem gastar créditos, crie `ASSINAFY_BASE_URL` com o endereço do sandbox da Assinafy. Apague essa variável quando for usar de verdade.
5. Faça um novo deploy.

Sem o webhook, tudo funciona do mesmo jeito: use o botão **Verificar assinaturas** no histórico.

## Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `ADMIN_PASSWORD` | sim | senha do painel |
| `GOOGLE_CLIENT_ID` | sim | conexão com o Drive |
| `GOOGLE_CLIENT_SECRET` | sim | conexão com o Drive |
| `ASSINAFY_API_KEY` | não | assinatura eletrônica |
| `ASSINAFY_ACCOUNT_ID` | não | assinatura eletrônica |
| `ASSINAFY_WEBHOOK_SECRET` | não | PDF assinado volta sozinho para o Drive |
| `ASSINAFY_BASE_URL` | não | só para usar o sandbox da Assinafy |

## Como funciona por dentro

- `public/admin.html` e `public/admin.js`: painel do proprietário
- `public/index.html` e `public/app.js`: app do vistoriador. Rascunho e fotos ficam no celular (IndexedDB) até o envio, então dá para fechar e voltar pelo mesmo link.
- `public/pdf.js`: monta o termo em PDF no próprio celular
- `netlify/functions/api.mjs`: backend. Guarda imóveis e vistorias no Netlify Blobs e conversa com o Google Drive e a Assinafy.
- As fotos são reduzidas para 1600 px antes do envio e sobem uma a uma. O PDF sobe em partes de 2 MB, então não há limite prático de tamanho.
- Cada link de vistoria guarda uma cópia dos cômodos do imóvel no momento em que foi criado. Editar o imóvel depois não bagunça um link já enviado.
