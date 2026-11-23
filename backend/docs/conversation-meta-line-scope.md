# SQLSTATE 23514 al adquirir el lock del FSM

## Causa

`ConversationLeaseLock.acquire()` inserta únicamente el ID de conversación,
el token y las fechas en `conversation_meta`. PostgreSQL ejecuta el trigger
`conversation_meta_line_scope` (`BEFORE INSERT`) **antes** de resolver
`ON CONFLICT`, aunque exista la fila y el `DO UPDATE` no cambie la línea.

En una conversación vinculada a la línea interna UUID A:

- `conversations.communication_line_id` vale A.
- La fila candidata del INSERT tiene `NEW.communication_line_id = NULL`.
- La función anterior compara A con NULL mediante `IS DISTINCT FROM` y lanza
  `23514: Conversation line cannot be reassigned` antes de evaluar el lease.

Incluso un lock ocupado falla, en lugar de devolver `null`. No hay un intercambio
entre un identificador externo de WhatsApp y un UUID en este query: la columna
de línea está ausente. Prisma envuelve el SQLSTATE como `P2010 / meta.code=23514`.
La política de reintentos lo considera terminal y el procesador mueve el evento
o lote a `dead_lettered`.

## Corrección

La migración nueva `20261105000000_conversation_meta_insert_scope` reemplaza la
función sin modificar migraciones anteriores. Si la operación es INSERT y la
línea candidata es NULL, hereda la línea de `conversations` bajo el mismo bloqueo
`FOR UPDATE`. Esto permite tanto resolver el conflicto como crear metadatos
faltantes con la línea correcta. Una conversación sin línea sigue sin línea.

Se conservan el rechazo de otra línea explícita, el rechazo de UPDATE a NULL,
la sincronización de la primera vinculación y la exclusión mutua del lease.
El UPSERT del servicio no necesita cambiar.

## Validación

En PostgreSQL 16, con las migraciones anteriores, seis pruebas de regresión
reprodujeron el mismo `23514` del incidente. Tras aplicar la migración correctiva,
pasaron las 13 pruebas del lock y las suites de aislamiento de líneas, ciclo de
conversación y batching: 32 pruebas en total. También pasaron 59 pruebas unitarias
de repositorio, acciones y clasificación de errores del InboxProcessor.

## Aplicación y recuperación

Aplicar mediante el proceso habitual de despliegue, con `DATABASE_URL` apuntando
al entorno previsto:

```sh
pnpm --dir backend run migrate:deploy
```

La migración no recupera automáticamente los eventos en DLQ. Después de validar
el procesamiento de un mensaje nuevo en una conversación con línea, seleccionar
los eventos cuyo error corresponda a este UPSERT. Comprobar la línea interna,
los mensajes persistidos por `wamid` y cualquier respuesta o outbox ya existente
antes de reprocesar un caso controlado.

El mecanismo existente es `POST /api/v1/system/inbox-events/:id/reprocess`
(SUPER_ADMIN); conserva el evento y su identidad. En modo batching, verificar
también la ventana y generación que se despachan: el servicio actual despacha la
generación `1`, por lo que no debe asumirse que recupera cualquier lote histórico.
Confirmar el resultado del caso controlado antes de ampliar la recuperación.
No recrear mensajes ni cambiar las líneas para evitar el error.

La comprobación de esta corrección se realizó en una base local separada;
no se desplegó ni se reprocesaron eventos de producción.
