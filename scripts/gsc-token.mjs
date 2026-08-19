// scripts/gsc-token.mjs — gera o GOOGLE_REFRESH_TOKEN pro autoblog puxar
// keywords do Search Console (gsc.ts). Rodar UMA vez, localmente, com a conta
// Google que TEM acesso à propriedade do Search Console do site.
//
// Pré-requisitos (console.cloud.google.com):
//   1. Projeto com a Search Console API habilitada.
//   2. OAuth consent screen tipo External, com seu e-mail como test user.
//   3. Credentials → Create OAuth Client ID → Application type: Desktop app.
//
// Uso:
//   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/gsc-token.mjs
// O navegador abre, você autoriza, e o refresh_token é impresso no terminal.
// Depois: vercel env add GOOGLE_REFRESH_TOKEN production (colar SEM aspas).
import { google } from 'googleapis';

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3000/oauth2callback');
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/webmasters.readonly'],
});

console.log('Abra este link no navegador e autorize:\n\n' + authUrl + '\n');
console.log('Após autorizar, cole aqui a URL completa para onde o navegador foi redirecionado (inclui ?code=...):');

for await (const line of console) {
  const url = new URL(line.trim());
  const code = url.searchParams.get('code');
  if (!code) {
    console.error('URL sem parâmetro code — tente de novo.');
    continue;
  }
  const { tokens } = await oauth2Client.getToken(code);
  console.log('\nREFRESH_TOKEN:\n\n' + tokens.refresh_token + '\n');
  console.log('Cole este valor em `vercel env add GOOGLE_REFRESH_TOKEN production`.');
  break;
}
