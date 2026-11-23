# GCS IAM-signed URLs
Objective: generate V4 GCS URLs through IAM Credentials without downloaded private keys.
Branch: `fix/gcs-iam-signed-urls`; delivery: `ask-on-risk`; estimated authored change: ~350 lines; runner: backend Jest, TypeScript, ESLint.

## Specs
S1. “Implementar una solución robusta, reutilizable y segura para generar URLs firmadas V4 de Google Cloud Storage sin claves privadas descargadas.”

S2. “Priorizar, por este orden: Investigar si el SDK instalado ofrece un mecanismo oficial y soportado para inyectar un firmante IAM o configurar correctamente la identidad firmante. Si existe, utilizarlo y demostrar su funcionamiento con una prueba real. Si no existe una integración adecuada, implementar un servicio de firma V4 mediante IAM Credentials API, respetando completamente la especificación oficial de Google Cloud Storage.”

S3. “No incorporar código de canonicalización criptográfica artesanal sin pruebas exhaustivas y sin haber descartado una alternativa oficial mantenida.”

S4. “No cambiar la configuración compartida de Storage únicamente para solucionar la firma si con ello afectas otras operaciones.”

S5. “Introducir, si es necesario, una variable explícita: GCS_SIGNER_SERVICE_ACCOUNT=voz-ciudadana-ocr@voz-ciudadana-505319.iam.gserviceaccount.com”; “No utilizar un correo fijo en el código de producción.”

S6. “Adaptarlo para utilizar el mecanismo de firma centralizado, sin modificar: La interfaz pública del proveedor. Los TTL existentes. La validación de rutas. La restricción de rutas exports/.... Los métodos de carga y descarga. Las reglas de seguridad existentes.”

S7. “Preservar: TTL de 15 minutos. Manejo de mimeType. responseType. responseDisposition. Diferencias entre visualización inline y descarga. Sanitización mediante safeFilename(). La forma de retorno { url, expiresAt }. La validación de rutas y claves de almacenamiento.”

S8. “No introducir claves privadas JSON.”; “No ejecutar cambios IAM automáticamente.”; “No añadir fallbacks silenciosos a URLs públicas.”

S9. “Cubrir al menos: Generación correcta de firma V4. Canonicalización de rutas. Objetos con espacios, Unicode y caracteres especiales. URLs con parámetros de respuesta. Descargas con nombres de archivo UTF-8. TTL válido, vencido, negativo y superior al máximo permitido. Firma RSA-SHA256 con vectores verificables o pruebas criptográficas equivalentes. Errores IAM 403. Identidad firmante ausente o inválida. Ausencia de credenciales ADC. Conservación de las interfaces actuales. Compatibilidad con los mocks existentes. Ausencia de regresiones en carga, lectura y procesamiento de medios.”

S10. “No declarar producción lista hasta validar el permiso efectivo mediante una prueba real y, si es necesario, IAM Policy Troubleshooter.”

## Tasks
- T1 — S1-S5 — inline — done: diagnosis completed; official Storage `authClient` seam requires an identity plus signing capability and does not support the current authorized-user setup by itself.
- T2 — S1-S5,S8-S9 — inline — done (e0a20ce): central IAM Credentials V4 signer and cryptographic vector tests implemented. Risk: item 2 (remote signing and temporary access URLs).
- T3 — S6-S7,S9 — inline — done (e0a20ce): exports and media now share the injected signer while preserving their public return values, TTLs, paths, and response headers. Risk: item 2 (signed URL access contract).
- T4 — S9-S10 — inline — partial: focused tests and lint pass; both TypeScript checks retain pre-existing `ExportJob.filePath` failures. Local Docker IAM signing probe succeeds, but HTTP retrieval was not run because no non-sensitive authorized diagnostic object was identified. Risk: item 2 (credential and URL issuance behavior).
- T5 — S5,S10 — inline — done (c9e46ce): inject the signer identity into all Cloud Run backend service deployments through a GitHub Actions repository variable. Risk: item 5 (production delivery environment).

## Log
L1 — User request (verbatim):

> Tarea: Corregir la generación de URLs firmadas de Google Cloud Storage mediante IAM Credentials sin claves privadas JSON
>
> 1. Contexto del proyecto
>
> Estás trabajando en el repositorio Voz Ciudadana, una aplicación con backend Node.js/TypeScript, Docker, Google Cloud Storage, Document AI y despliegue en Google Cloud Run.
>
> Proyecto de Google Cloud:
>
> voz-ciudadana-505319
>
> Cuentas de servicio:
>
> Cuenta firmante: voz-ciudadana-ocr@voz-ciudadana-505319.iam.gserviceaccount.com
>
> Cuenta de ejecución del backend: voz-ciudadana-run-sa@voz-ciudadana-505319.iam.gserviceaccount.com
>
> Entorno local:
>
> Docker Compose con servicio api.
>
> Contenedor: voz-ciudadana-dev-api-1.
>
> Directorio de trabajo del backend dentro de Docker: /workspace/backend.
>
> GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp/application_default_credentials.json.
>
> Las ADC locales son de tipo authorized_user.
>
> Proyecto de cuota de ADC: voz-ciudadana-505319.
>
> GOOGLE_CLOUD_PROJECT=voz-ciudadana-dev, posiblemente por configuración de emuladores. No modificar esta variable sin comprender su propósito.
>
> Bibliotecas observadas:
>
> @google-cloud/storage@8.4.0
>
> google-auth-library@11.0.2
>
> Confirma las versiones instaladas y los contratos reales de las APIs antes de implementar cambios.
>
> 2. Problema identificado
>
> El backend genera URLs firmadas mediante:
>
> file.getSignedUrl({
>   version: 'v4',
>   action: 'read',
>   expires: ...
> });
>
> Sin embargo, se produce:
>
> SigningError
> Permission 'iam.serviceAccounts.signBlob' denied
>
> Las pruebas de diagnóstico demostraron que:
>
> Las ADC del host y del contenedor son idénticas, verificadas mediante SHA-256.
>
> Las ADC actuales son authorized_user.
>
> El usuario de desarrollo tiene permisos efectivos para ejecutar signBlob sobre la cuenta voz-ciudadana-ocr.
>
> Las solicitudes directas a IAM Credentials API utilizando las ADC de usuario funcionan.
>
> Impersonated.sign('prueba'), construido con UserRefreshClient como sourceClient, funciona correctamente dentro de Docker.
>
> Las pruebas que pasan directamente Impersonated o un GoogleAuth envolvente como authClient a new Storage() fallan con Unable to find credentials in current environment.
>
> Las llamadas signBlob efectuadas con tokens de las cuentas de servicio impersonadas devolvieron 403, incluso cuando los bindings del rol roles/iam.serviceAccountTokenCreator aparecían asignados.
>
> No asumir que la existencia de bindings IAM implica que el permiso es efectivo en todos los contextos. No intentar solucionar el problema otorgando roles más amplios.
>
> 3. Objetivo
>
> Implementar una solución robusta, reutilizable y segura para generar URLs firmadas V4 de Google Cloud Storage sin claves privadas descargadas.
>
> Priorizar, por este orden:
>
> Investigar si el SDK instalado ofrece un mecanismo oficial y soportado para inyectar un firmante IAM o configurar correctamente la identidad firmante.
>
> Si existe, utilizarlo y demostrar su funcionamiento con una prueba real.
>
> Si no existe una integración adecuada, implementar un servicio de firma V4 mediante IAM Credentials API, respetando completamente la especificación oficial de Google Cloud Storage.
>
> No incorporar código de canonicalización criptográfica artesanal sin pruebas exhaustivas y sin haber descartado una alternativa oficial mantenida.
>
> 4. Archivos que debes revisar
>
> Inspecciona inicialmente:
>
> backend/src/config/gcs.client.ts
> backend/src/services/ine/gcs-file-storage.provider.ts
> backend/src/services/media/gcs-media-storage.ts
> backend/src/services/storage/object-path.ts
> backend/src/services/ine/google-auth.ts
> backend/src/controllers/export.controller.ts
> backend/src/routes/conversations.routes.ts
>
> Revisa también las interfaces, configuración de entorno, documentación y pruebas relacionadas.
>
> Actualmente gcs.client.ts contiene:
>
> import { Storage } from '@google-cloud/storage';
>
> const storage = new Storage({
>   keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
> });
>
> export { storage as gcsStorage };
>
> Mantén el comportamiento existente de carga, lectura, borrado, metadatos y validación de objetos.
>
> No cambies la configuración compartida de Storage únicamente para solucionar la firma si con ello afectas otras operaciones.
>
> 5. Implementación propuesta
>
> Si la investigación confirma que es necesario implementar un firmante separado, crea:
>
> backend/src/services/storage/gcs-url-signer.ts
>
> El módulo deberá:
>
> Utilizar ADC mediante GoogleAuth.
>
> Identificar explícitamente la cuenta de servicio firmante.
>
> Solicitar firmas remotas mediante iamcredentials.googleapis.com o un cliente oficial compatible.
>
> Utilizar criptografía de firma RSA-SHA256 administrada por IAM.
>
> Generar URLs firmadas V4 conforme a la especificación oficial.
>
> Admitir métodos HTTP configurables cuando sea necesario, comenzando por GET.
>
> Admitir vencimientos en milisegundos o fechas sin ambigüedad.
>
> Rechazar vencimientos inválidos y respetar el máximo V4 de siete días.
>
> Codificar correctamente nombres de objetos con espacios, Unicode, caracteres especiales y rutas anidadas.
>
> Construir correctamente la solicitud canónica, los parámetros de consulta, los encabezados firmados, el alcance de credenciales, la cadena por firmar y la representación hexadecimal de la firma.
>
> Mantener consistencia exacta entre los parámetros usados durante la firma y los de la URL resultante.
>
> Respetar responseType y responseDisposition, incluyendo los valores usados para imágenes, audio, video, PDF y descargas.
>
> Manejar correctamente parámetros repetidos y evitar dobles codificaciones.
>
> Evitar exponer access tokens, refresh tokens o datos sensibles en logs.
>
> Propagar errores tipados que permitan distinguir errores IAM, errores de configuración y errores de validación.
>
> Permitir pruebas unitarias con un firmante inyectable, sin depender de llamadas reales a Google Cloud.
>
> Evitar dependencias nuevas si las ya instaladas cubren el caso de forma segura.
>
> No utilizar claves privadas de cuentas de servicio ni generar archivos JSON de tipo service_account.
>
> 6. Configuración
>
> Introducir, si es necesario, una variable explícita:
>
> GCS_SIGNER_SERVICE_ACCOUNT=voz-ciudadana-ocr@voz-ciudadana-505319.iam.gserviceaccount.com
>
> No utilizar un correo fijo en el código de producción.
>
> Separar la configuración de la identidad firmante de la configuración del proyecto, el bucket y las credenciales de acceso.
>
> No cambiar automáticamente:
>
> GOOGLE_CLOUD_PROJECT=voz-ciudadana-dev
>
> Examinar primero las dependencias con emuladores.
>
> En ausencia de una configuración de firma válida, devolver un error claro. Evitar que el servicio elija silenciosamente una identidad incorrecta.
>
> 7. Integración con los servicios existentes
>
> A. Exportaciones
>
> Archivo:
>
> backend/src/services/ine/gcs-file-storage.provider.ts
>
> Actualmente el método getSignedUrl() genera URLs V4 de lectura con un TTL predeterminado de dos horas.
>
> Adaptarlo para utilizar el mecanismo de firma centralizado, sin modificar:
>
> La interfaz pública del proveedor.
>
> Los TTL existentes.
>
> La validación de rutas.
>
> La restricción de rutas exports/....
>
> Los métodos de carga y descarga.
>
> Las reglas de seguridad existentes.
>
> B. Archivos multimedia
>
> Archivo:
>
> backend/src/services/media/gcs-media-storage.ts
>
> Adaptar el método getSignedUrl() para utilizar el mismo firmante.
>
> Preservar:
>
> TTL de 15 minutos.
>
> Manejo de mimeType.
>
> responseType.
>
> responseDisposition.
>
> Diferencias entre visualización inline y descarga.
>
> Sanitización mediante safeFilename().
>
> La forma de retorno { url, expiresAt }.
>
> La validación de rutas y claves de almacenamiento.
>
> No modificar el flujo de carga y validación de archivos multimedia.
>
> 8. Pruebas obligatorias
>
> Revisar y actualizar las pruebas existentes:
>
> backend/src/__tests__/unit/exports/export-signing.test.ts
> backend/src/__tests__/unit/gcs-media-storage.test.ts
> backend/src/__tests__/unit/message-media-urls.service.test.ts
> backend/src/__tests__/integration/message-media-access.test.ts
>
> Agregar pruebas específicas para el mecanismo centralizado de firma.
>
> Cubrir al menos:
>
> Generación correcta de firma V4.
>
> Canonicalización de rutas.
>
> Objetos con espacios, Unicode y caracteres especiales.
>
> URLs con parámetros de respuesta.
>
> Descargas con nombres de archivo UTF-8.
>
> TTL válido, vencido, negativo y superior al máximo permitido.
>
> Firma RSA-SHA256 con vectores verificables o pruebas criptográficas equivalentes.
>
> Errores IAM 403.
>
> Identidad firmante ausente o inválida.
>
> Ausencia de credenciales ADC.
>
> Conservación de las interfaces actuales.
>
> Compatibilidad con los mocks existentes.
>
> Ausencia de regresiones en carga, lectura y procesamiento de medios.
>
> No debilitar las aserciones ni eliminar pruebas para conseguir que la suite pase.
>
> 9. Verificación real
>
> Si el entorno dispone de credenciales válidas y los permisos necesarios, realizar una prueba de integración contra Google Cloud Storage.
>
> Utilizar preferentemente un objeto existente de diagnóstico o uno temporal autorizado.
>
> Verificar que:
>
> Se genera una URL V4.
>
> X-Goog-Algorithm sea GOOG4-RSA-SHA256.
>
> X-Goog-Credential contenga la cuenta firmante correcta.
>
> X-Goog-Signature esté presente.
>
> El acceso HTTP al objeto mediante la URL firmada funcione.
>
> La respuesta mantenga correctamente Content-Type y Content-Disposition cuando corresponda.
>
> No considerar exitosa una implementación únicamente porque devuelve una cadena con aspecto de URL firmada.
>
> Si no puede probarse contra GCS, dejar explícita esa limitación y los comandos de verificación necesarios.
>
> No imprimir URLs firmadas completas en logs o reportes, ya que conceden acceso temporal al objeto.
>
> 10. Seguridad y compatibilidad con Cloud Run
>
> La solución debe funcionar sin claves privadas exportadas.
>
> En desarrollo local, utilizar las ADC de usuario existentes.
>
> En Cloud Run, respetar la identidad real de ejecución.
>
> Importante: el hecho de que signBlob funcione con ADC de usuario no demuestra que funcione con voz-ciudadana-run-sa. Las pruebas previas con tokens impersonados devolvieron 403. No declarar producción lista hasta validar el permiso efectivo mediante una prueba real y, si es necesario, IAM Policy Troubleshooter.
>
> No modificar IAM, políticas de organización, cuentas de servicio, buckets ni infraestructura remota sin autorización expresa.
>
> Revisar también que la cuenta firmante tenga los permisos de Storage correspondientes para las operaciones representadas por las URLs.
>
> 11. Restricciones de implementación
>
> No introducir claves privadas JSON.
>
> No ejecutar cambios IAM automáticamente.
>
> No romper el funcionamiento de Document AI.
>
> No modificar las integraciones de Pub/Sub, Cloud Tasks ni los emuladores.
>
> No sustituir globalmente las ADC ni el proyecto configurado.
>
> No cambiar las interfaces públicas sin justificación.
>
> No duplicar lógica de firma entre servicios.
>
> No eliminar validaciones de seguridad.
>
> No añadir fallbacks silenciosos a URLs públicas.
>
> No realizar modificaciones innecesarias en Docker Compose.
>
> No introducir dependencias nuevas sin justificar su necesidad.
>
> Mantener TypeScript, lint y pruebas compatibles con los estándares actuales del repositorio.
>
> 12. Flujo de trabajo solicitado
>
> Trabaja de manera autónoma siguiendo estas etapas:
>
> Fase 1 — Diagnóstico
>
> Inspecciona la implementación, dependencias y configuración actuales. Determina la causa exacta del error de integración con Storage.
>
> Fase 2 — Diseño
>
> Selecciona la alternativa más sencilla, segura y mantenible. Justifica brevemente por qué se prefiere sobre las otras.
>
> Fase 3 — Implementación
>
> Aplica los cambios necesarios directamente en los archivos del repositorio, manteniendo el alcance mínimo.
>
> Fase 4 — Validación
>
> Ejecuta las pruebas pertinentes, el chequeo de tipos, lint y las verificaciones disponibles.
>
> Fase 5 — Informe
>
> Entrega un resumen que incluya:
>
> Causa raíz identificada.
>
> Estrategia de solución.
>
> Archivos creados o modificados.
>
> Variables de entorno nuevas.
>
> Pruebas ejecutadas y sus resultados.
>
> Limitaciones pendientes.
>
> Pasos necesarios para verificar Docker y Cloud Run.
>
> Riesgos de seguridad o permisos aún no resueltos.
>
> Criterios de aceptación
>
> La tarea estará completa cuando:
>
> Las exportaciones y archivos multimedia puedan generar URLs firmadas V4 sin claves privadas JSON.
>
> Ambos servicios compartan una implementación mantenible.
>
> Se conserven los TTL, metadatos y validaciones actuales.
>
> Las pruebas relevantes pasen.
>
> No existan regresiones detectadas en operaciones de Storage.
>
> Se haya verificado una URL real contra GCS, o se documente claramente por qué no fue posible.
>
> La implementación no dependa de credenciales personales en producción.
>
> Prioridad: solucionar el problema con cambios mínimos, máxima seguridad, compatibilidad con la arquitectura existente y sin modificar innecesariamente la infraestructura de Google Cloud.
>
> No te limites a explicar la solución: inspecciona el repositorio, implementa la corrección y ejecuta las pruebas disponibles. No afirmes que algo está verificado si no lo has comprobado.

L2 — 2026-10-23 diagnosis: installed `@google-cloud/storage` is 8.4.0 and `google-auth-library` is 10.9.1 (not 11.0.2). Storage v8 passes V4 signing through `auth.getCredentials()` for `client_email` and `auth.sign()` for RSA signing. Its documented `authClient` seam does not provide a supported way to supply the explicit signer identity with authorized-user ADC; the existing direct and wrapped auth-client experiments fail as described in the request. The central IAM Credentials-backed signer is therefore the narrow fallback, after tests prove canonicalization.

L3 — 2026-10-23 blocker: the working tree already contains uncommitted GCS-target changes and an untracked, empty `gcp-key.json`. No secret contents were inspected and no existing change was altered. Ownership/provenance must be resolved before source edits or commits.

L4 — 2026-10-23 implementation: created `gcs-url-signer.ts`, which uses ADC only to invoke IAM Credentials `signBlob` for the explicitly configured signer account. Export and media adapters inject the same signer. The shared Storage client was returned to ordinary ADC construction, so uploads/downloads/metatada operations retain their own client behavior. The focused 35-test suite and ESLint passed. `typecheck` and `typecheck:test` still fail only on pre-existing `ExportJob.filePath` errors. A real in-container IAM probe returned the expected V4 algorithm, configured signer credential, and signature presence without outputting the URL; HTTP retrieval remains unverified for lack of an authorized non-sensitive object.

L5 — 2026-10-23 verification blocker: the required independent verifier could not launch because its configured model was unavailable. No retry was attempted. Receipt-driven development is clone-local off; its assessment reported the committed security candidate as high but unassessable while unrelated untracked files remain.

L6 — 2026-10-23 deployment wiring: `deploy-gcp.yml` now supplies `GCS_SIGNER_SERVICE_ACCOUNT=${{ vars.GCS_SIGNER_SERVICE_ACCOUNT }}` to `voz-api`, `voz-worker`, and `voz-realtime-relay`. YAML syntax and all three injection sites were verified locally. The remote GitHub Actions variable was not inspected or changed.
