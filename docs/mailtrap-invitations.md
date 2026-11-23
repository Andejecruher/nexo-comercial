# Integración Mailtrap para invitaciones del módulo Equipo

## Mecanismo elegido

Se usa **Mailtrap Email API** desde el backend. La decisión evita exponer credenciales al frontend y aprovecha `fetch` nativo de Node.js sin añadir transportes paralelos SMTP ni dependencias adicionales. El adapter `MailtrapEmailProvider` normaliza respuestas, timeouts, rate limits y errores de configuración.

## Arquitectura

- `EmailProvider` define el contrato de envío.
- `MailtrapEmailProvider` encapsula Mailtrap.
- `EmailService` renderiza plantillas y envía mensajes transaccionales.
- `UserService` crea usuarios pendientes, genera tokens de activación, registra invitaciones y actualiza el resultado del envío.
- El frontend solo consume endpoints propios del backend.

## Variables de entorno backend

Configurar sin versionar secretos reales:

```env
MAIL_PROVIDER=mailtrap
MAILTRAP_API_URL=
MAILTRAP_API_TOKEN=
MAIL_FROM_ADDRESS=
MAIL_FROM_NAME=Voz Ciudadana
MAIL_REPLY_TO_ADDRESS=
MAIL_SUPPORT_EMAIL=
MAIL_PLATFORM_NAME=Voz Ciudadana
MAIL_TIME_ZONE=America/Mexico_City
MAIL_SEND_TIMEOUT_MS=10000
FRONTEND_URL=https://app.ejemplo.com
INVITATION_EXPIRATION_MINUTES=1440
INVITATION_RESEND_COOLDOWN_SECONDS=300
```

No usar prefijos públicos como `VITE_`, `NEXT_PUBLIC_` o `PUBLIC_` para credenciales.

## Ambientes

- **Desarrollo local:** usar Mailtrap Email Sandbox con credenciales de sandbox y destinatarios controlados.
- **Pruebas automatizadas:** usar `MAIL_PROVIDER=fake` o mocks del contrato `EmailProvider`; no dependen de Mailtrap.
- **Staging/QA:** usar sandbox independiente con credenciales separadas.
- **Producción:** usar Mailtrap Sending API con dominio verificado. No usar credenciales sandbox.

## Dominio de envío productivo

Antes de habilitar producción:

1. Alta del dominio en Mailtrap.
2. Verificación del dominio remitente.
3. Configuración de registros DNS indicados por Mailtrap.
4. Validación SPF, DKIM y DMARC.
5. Configuración de remitente autorizado.
6. Pruebas con destinatarios controlados.
7. Monitoreo de límites, rechazos y entregabilidad.

No se incluyen valores DNS ni credenciales en el repositorio.

## Flujo de invitación

1. Crear usuario inactivo/pending.
2. Asignar roles.
3. Generar token criptográficamente seguro.
4. Guardar solo el hash SHA-256 del token.
5. Persistir `user_invitations` con expiración.
6. Construir URL con `FRONTEND_URL` confiable.
7. Renderizar HTML y texto plano.
8. Enviar mediante Mailtrap.
9. Registrar estado `sent` o `failed`, proveedor, message id y error sanitizado.

Si Mailtrap falla, el usuario no se elimina; la invitación queda `failed` y puede reenviarse.

## Reenvío vs reintento

- **Reintento técnico:** mismo correo/token, controlado por infraestructura de colas si se agrega en el futuro.
- **Reenvío administrativo:** genera un token nuevo, revoca invitaciones anteriores y crea una nueva expiración.

El endpoint de reenvío aplica cooldown con `INVITATION_RESEND_COOLDOWN_SECONDS`.

## Prueba manual en Sandbox

1. Configurar `MAIL_PROVIDER=mailtrap`, `MAILTRAP_API_URL` y `MAILTRAP_API_TOKEN` de Sandbox.
2. Configurar remitente sandbox permitido y `FRONTEND_URL` local/staging.
3. Crear usuario desde Equipo o `POST /api/v1/admin/users`.
4. Verificar asunto, HTML, texto plano, destinatario y enlace en Mailtrap.
5. Confirmar que los logs no incluyen token ni URL completa de activación.
6. Probar `POST /api/v1/admin/users/:id/invitations/resend`.

## Rotación de credenciales

1. Crear token nuevo en Mailtrap.
2. Actualizar secreto en el gestor de variables del ambiente.
3. Reiniciar procesos backend.
4. Probar envío controlado.
5. Revocar token anterior.

## Diagnóstico de fallos

Revisar estado de `user_invitations` y códigos sanitizados:

- `EMAIL_CONFIGURATION_ERROR`
- `EMAIL_AUTHENTICATION_ERROR`
- `EMAIL_RATE_LIMITED`
- `EMAIL_RECIPIENT_REJECTED`
- `EMAIL_DELIVERY_FAILED`
- `EMAIL_TIMEOUT`

No registrar tokens de activación, contraseñas temporales, cuerpos completos de correo ni headers de autorización.
