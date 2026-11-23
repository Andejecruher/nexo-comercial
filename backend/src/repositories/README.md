# Repositories (Data Access Layer)

Esta carpeta define la **capa de acceso a datos** del backend.

## Objetivo

- Centralizar el acceso a Prisma en un único lugar.
- Mantener `controllers` y `services` enfocados en HTTP y reglas de negocio.
- Mejorar testabilidad (mock de repositorios sin mockear Prisma en toda la app).

## Convenciones

1. **Un repositorio por agregado/modelo principal** (`UserRepository`, `CitizenRepository`, etc.).
2. **Sin lógica HTTP** (no `req`, `res`, `statusCode`).
3. **Sin reglas de negocio complejas**: solo lectura/escritura/persistencia.
4. **Interfaces y tipos explícitos** para inputs/outputs cuando aporte claridad.
5. **Transacciones** se encapsulan en repositorio cuando el caso sea puramente de persistencia.
6. **Nombres de métodos orientados al dominio** (`findByEmail`, `closeInactive`, `upsertStatus`).

## Estado de migración

Durante la migración gradual, algunos repositorios viven en `src/services/repositories/`.

Este directorio (`src/repositories/`) es el **punto canónico** para nuevas referencias e imports.
El archivo `index.ts` re-exporta los repositorios existentes para mantener compatibilidad.

## Regla de arquitectura (target)

> El acceso directo a `prisma.*` debe quedar restringido a `src/repositories/**` (y `prisma.service.ts`).
