# Diagnóstico de correo Mailtrap desde Swagger

Estos endpoints técnicos validan la integración de correo transaccional con Mailtrap Email API sin exponer credenciales y sin crear usuarios o invitaciones persistentes.

## Seguridad operativa

- Permanecen deshabilitados por defecto con `ENABLE_EMAIL_TEST_ENDPOINTS=false`.
- Solo responden en `development` y `test`; en producción deben permanecer deshabilitados.
- Requieren autenticación Bearer JWT y el permiso técnico `email.test`.
- El destinatario debe estar en `EMAIL_TEST_ALLOWED_RECIPIENTS` o pertenecer a un dominio de `EMAIL_TEST_ALLOWED_DOMAINS`.
- El rate limit se controla con `EMAIL_TEST_RATE_LIMIT_MAX` y `EMAIL_TEST_RATE_LIMIT_WINDOW_SECONDS`.
- No aceptan `cc`, `bcc`, remitente personalizado, adjuntos, HTML arbitrario, headers ni credenciales en el body.

## Variables

```env
MAIL_PROVIDER=mailtrap
MAIL_FROM_ADDRESS=
MAIL_FROM_NAME=Voz Ciudadana
MAILTRAP_API_TOKEN=
MAILTRAP_API_URL=
MAIL_SEND_TIMEOUT_MS=10000
ENABLE_EMAIL_TEST_ENDPOINTS=false
EMAIL_TEST_ALLOWED_RECIPIENTS=
EMAIL_TEST_ALLOWED_DOMAINS=
EMAIL_TEST_RATE_LIMIT_MAX=5
EMAIL_TEST_RATE_LIMIT_WINDOW_SECONDS=600
```

## Endpoints

Base URL: `/api/v1/admin/email-test`.

- `GET /configuration`: muestra banderas booleanas de configuración sin valores reales.
- `POST /connection`: valida habilitación, permisos, configuración y rate limit. Mailtrap Email API no expone una operación ping sin envío; los endpoints de envío controlado son la prueba efectiva.
- `POST /send-text`: envía un texto plano controlado.
- `POST /send-html`: renderiza HTML desde una plantilla segura con texto alternativo.
- `POST /send-invitation-preview`: reutiliza la plantilla de invitación con `/activation-preview` y sin token válido.

## Docker local

Las variables se leen desde `backend/.env` por los servicios `api`, `worker` y `migrator` del compose local. No agregues secretos a `docker-compose.dev.yml`, `Dockerfile` ni scripts versionados.

Comandos útiles:

```bash
docker compose -f docker-compose.dev.yml up -d --build api
# Confirmar presencia sin imprimir secretos:
docker compose -f docker-compose.dev.yml exec api sh -lc 'node -e "for (const k of [\"ENABLE_EMAIL_TEST_ENDPOINTS\",\"MAILTRAP_API_TOKEN\",\"MAILTRAP_API_URL\",\"MAIL_FROM_ADDRESS\"]) console.log(k, Boolean(process.env[k]))"'
```

## Verificación manual desde Swagger

1. Configura Mailtrap Email Sandbox y copia los valores en `backend/.env`.
2. Define `ENABLE_EMAIL_TEST_ENDPOINTS=true` temporalmente.
3. Define una allowlist con `EMAIL_TEST_ALLOWED_RECIPIENTS` o `EMAIL_TEST_ALLOWED_DOMAINS`.
4. Reinicia la API: `docker compose -f docker-compose.dev.yml up -d --build api`.
5. Abre Swagger en `/api-docs`.
6. Autentícate con un usuario que tenga `email.test`.
7. Ejecuta `GET /api/v1/admin/email-test/configuration`.
8. Ejecuta `POST /api/v1/admin/email-test/connection` y confirma la nota de limitación del Email API.
9. Ejecuta `POST /api/v1/admin/email-test/send-text`.
10. Verifica el mensaje en Mailtrap Sandbox.
11. Ejecuta `POST /api/v1/admin/email-test/send-html` y revisa HTML/texto.
12. Ejecuta `POST /api/v1/admin/email-test/send-invitation-preview` y confirma que el enlace apunte a `/activation-preview` y que el mensaje indique que es una prueba.
13. Vuelve a `ENABLE_EMAIL_TEST_ENDPOINTS=false` cuando termines.
