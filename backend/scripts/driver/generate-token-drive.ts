/**
 * generate-token-drive.ts — Local helper to obtain GOOGLE_DRIVE_REFRESH_TOKEN.
 *
 * Reads GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET from backend/.env
 * without loading the full application env schema (DATABASE_URL, WhatsApp, etc.).
 *
 * Register this exact redirect URI on the OAuth client:
 *   http://localhost:3000/oauth2callback
 *
 * Usage (from backend/):
 *   pnpm generate:drive-token
 *   npx ts-node --project scripts/tsconfig.json scripts/driver/generate-token-drive.ts
 */
import { config } from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import { exec } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { resolve } from 'node:path';
import { URL } from 'node:url';

config({ path: resolve(__dirname, '../../.env') });

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const CALLBACK_PORT = 8000;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/oauth2callback`;

const readRequired = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Falta ${name} en backend/.env.`);
    process.exit(1);
  }
  return value;
};

const CLIENT_ID = readRequired('GOOGLE_OAUTH_CLIENT_ID');
const CLIENT_SECRET = readRequired('GOOGLE_OAUTH_CLIENT_SECRET');

const oauth2Client = new OAuth2Client({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  redirectUri: REDIRECT_URI,
});

const oauthState = randomBytes(16).toString('hex');

const authorizationUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [DRIVE_FILE_SCOPE],
  state: oauthState,
});

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const openBrowser = (url: string): void => {
  const command =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;

  exec(command, (error) => {
    if (error !== null) {
      console.log('\nNo fue posible abrir el navegador automáticamente.');
      console.log('Abre manualmente esta URL:\n');
      console.log(url);
    }
  });
};

const shutdown = (oauthServer: http.Server, exitCode: number): void => {
  oauthServer.close(() => {
    process.exit(exitCode);
  });
};

const server = http.createServer((request, response) => {
  void handleOAuthCallback(request, response);
});

async function handleOAuthCallback(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  if (request.url === undefined) {
    response.writeHead(400);
    response.end('Invalid request.');
    return;
  }

  const requestUrl = new URL(request.url, REDIRECT_URI);

  if (requestUrl.pathname !== '/oauth2callback') {
    response.writeHead(404);
    response.end('Not found.');
    return;
  }

  const error = requestUrl.searchParams.get('error');
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');

  if (error !== null) {
    response.writeHead(400, {
      'Content-Type': 'text/html; charset=utf-8',
    });
    response.end(`
      <h1>Autorización cancelada</h1>
      <p>Error: ${escapeHtml(error)}</p>
      <p>Puedes cerrar esta ventana.</p>
    `);
    shutdown(server, 1);
    return;
  }

  if (code === null) {
    response.writeHead(400);
    response.end('Authorization code not found.');
    return;
  }

  if (state !== oauthState) {
    response.writeHead(400);
    response.end('Invalid OAuth state.');
    shutdown(server, 1);
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
    });
    response.end(`
      <h1>Autorización completada</h1>
      <p>El token fue generado correctamente.</p>
      <p>Puedes cerrar esta ventana y regresar a la terminal.</p>
    `);

    console.log('\n========================================');
    console.log('Google Drive OAuth completado');
    console.log('========================================\n');

    if (!tokens.refresh_token) {
      console.error('Google no devolvió un refresh token.');
      console.error(
        'Si ya habías autorizado la aplicación, revoca el acceso desde tu cuenta de Google y vuelve a ejecutar el script.',
      );
      shutdown(server, 1);
      return;
    }

    console.log('Copia este valor a backend/.env como GOOGLE_DRIVE_REFRESH_TOKEN:');
    console.log(tokens.refresh_token);

    console.log('\n========================================');
    console.log('IMPORTANTE');
    console.log('========================================');
    console.log('No compartas este token ni lo agregues al repositorio.');
    console.log('Guárdalo como secret de tu entorno de ejecución.');

    shutdown(server, 0);
  } catch (tokenError) {
    console.error('\nError obteniendo los tokens de Google:');
    console.error(tokenError);

    response.writeHead(500);
    response.end('Error obteniendo el token.');

    shutdown(server, 1);
  }
}

server.listen(CALLBACK_PORT, () => {
  console.log('\n========================================');
  console.log('Google Drive OAuth');
  console.log('========================================\n');
  console.log('Variables: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET');
  console.log(`Redirect URI (debe coincidir en Google Cloud): ${REDIRECT_URI}`);
  console.log(`Scope: ${DRIVE_FILE_SCOPE}`);
  console.log('\nAbriendo navegador para autorización...\n');

  openBrowser(authorizationUrl);

  console.log('Si el navegador no se abre automáticamente, utiliza:');
  console.log(`\n${authorizationUrl}\n`);
});
