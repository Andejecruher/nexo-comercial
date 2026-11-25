# Documentación de Paginación en Catálogos

## Resumen de Cambios

Se implementó paginación basada en cursores para los tres catálogos maestros:

- **Barrios** (Neighborhoods)
- **Etiquetas** (Tags)
- **Departamentos** (Departments)

### Límite Máximo Implementado

✅ **100 items por página** (máximo enforced en todos los hooks)

## Arquitectura de la Solución

### Backend

- **Tipo de paginación**: Cursor-based pagination
- **Parámetros de request**:
  - `cursor?: string` - Cursor para la siguiente página
  - `limit: number` - Cantidad de items (máximo 100)
  - `search?: string` - Búsqueda por texto
  - Filtros específicos por catálogo (zone, color, isActive)

- **Formato de respuesta**:

```typescript
{
  items: T[],
  meta: {
    nextCursor?: string,
    hasNextPage: boolean,
    count: number
  }
}
```

### Frontend

#### Hooks (useNeighborhoods, useTags, useDepartments)

- **Estado de paginación**:
  - `cursor: string | null` - Cursor actual
  - `hasNextPage: boolean` - Indica si hay más páginas
  - `totalCount: number` - Total de registros
  - `cursorHistory: string[]` - Historial para navegación hacia atrás
  - `pageSize: number` - Tamaño de página (default: 50, max: 100)
  - `currentPage: number` - Número de página actual (calculado)

- **Funciones de navegación**:
  - `nextPage()` - Navega a la siguiente página
  - `previousPage()` - Navega a la página anterior (usando historial)
  - `firstPage()` - Regresa a la primera página

- **Comportamiento de filtros**:
  - Los filtros (search, zone, color, isActive) resetean la paginación a la primera página

- **Comportamiento post-mutación**:
  - `createNeighborhood/Tag/Department` → Redirige a primera página después de 500ms
  - `deleteNeighborhood/Tag` → Refresca página actual después de 500ms
  - `toggleDepartment` → Refresca página actual después de 500ms

#### Componente PaginationControls

- **Layout**: 3 columnas (total | página | controles)
- **Botones**:
  - "Primera" - Solo visible cuando `currentPage > 1`
  - "Anterior" - Habilitado cuando `hasPreviousPage`
  - "Siguiente" - Habilitado cuando `hasNextPage`
- Todos los botones se deshabilitan durante `loading`

#### Vistas (neighborhoods-view, tags-view, departments-view)

- **Layout actualizado**:

```tsx
<div className="flex h-full flex-col overflow-hidden">
  <div className="flex-1 overflow-y-auto p-6 space-y-5">
    {/* Contenido scrollable */}
  </div>
  <PaginationControls ... />
</div>
```

- **Contador de resultados**:
  - Formato: "Mostrando X de Y registros"
  - X = items en página actual
  - Y = total count

- **Tablas**:
  - Se removió funcionalidad de sorting client-side
  - Los headers son texto plano (sin botones de ordenamiento)

## Archivos Modificados

### Hooks

- `frontend/hooks/shared/useNeighborhoods.ts` - Paginación backend + navegación con historial
- `frontend/hooks/shared/useTags.ts` - Mismo patrón que neighborhoods
- `frontend/hooks/shared/useDepartments.ts` - Mismo patrón + mapeo de activeFilter a isActive

### Componentes Compartidos

- `frontend/components/shared/catalogs/PaginationControls.tsx` - **NUEVO** - Controles reutilizables

### Tablas

- `frontend/components/barrios/NeighborhoodTable.tsx` - Removido sorting
- `frontend/components/etiquetas/TagTable.tsx` - Removido sorting
- `frontend/components/departamentos/DepartmentTable.tsx` - Removido sorting

### Vistas

- `frontend/components/barrios/neighborhoods-view.tsx` - Layout + PaginationControls
- `frontend/components/etiquetas/tags-view.tsx` - Layout + PaginationControls
- `frontend/components/departamentos/departments-view.tsx` - Layout + PaginationControls

### API Client

- `frontend/lib/shared/catalog-api.ts` - Fix: Corregido endpoint `/admin/neighborhoods` → `/neighborhoods`

## Plan de Pruebas Manuales

### Preparación

```bash
# Terminal 1: Backend
cd backend
pnpm dev

# Terminal 2: Frontend
cd frontend
pnpm dev
```

### Test 1: Navegación Básica

1. Abrir http://localhost:3000/admin/barrios
2. Verificar que se muestran hasta 50 items por página
3. Click en "Siguiente"
   - ✅ Debe cargar la siguiente página
   - ✅ El contador debe actualizarse: "Mostrando 50 de [total]"
   - ✅ Debe aparecer el botón "Primera"
   - ✅ Debe aparecer el botón "Anterior"
4. Click en "Anterior"
   - ✅ Debe regresar a la página anterior
   - ✅ Los mismos items deben aparecer
5. Click en "Primera"
   - ✅ Debe regresar a la primera página
   - ✅ El botón "Primera" debe desaparecer

### Test 2: Límite Máximo Enforced

1. Abrir DevTools → Network tab
2. Navegar por las páginas
3. Inspeccionar requests a `/neighborhoods`, `/tags`, `/departments`
   - ✅ El parámetro `limit` NUNCA debe exceder 100
   - ✅ Debe ser exactamente 50 (o el pageSize configurado, máx 100)

### Test 3: Filtros Reset Paginación

1. Navegar a la página 2 o 3
2. Aplicar un filtro (por ejemplo, buscar "norte")
   - ✅ Debe resetear a la página 1
   - ✅ Los resultados deben reflejar la búsqueda
3. Cambiar el filtro de zona/color/estado
   - ✅ Debe resetear a la página 1
   - ✅ Los resultados deben reflejar el nuevo filtro

### Test 4: Estados de Carga

1. Navegar entre páginas observando el spinner
   - ✅ Los botones de navegación deben deshabilitarse durante la carga
   - ✅ Debe mostrarse "Cargando..." o spinner
   - ✅ Al completar, los botones deben habilitarse

### Test 5: Crear Nuevo Item

1. Navegar a cualquier página que no sea la primera
2. Crear un nuevo barrio/tag/departamento
   - ✅ Después de 500ms debe redirigir a la primera página
   - ✅ El nuevo item debe aparecer en la lista

### Test 6: Eliminar/Toggle Item

1. En cualquier página, eliminar un item o cambiar su estado
   - ✅ Después de 500ms debe refrescar la página actual
   - ✅ El contador de items debe actualizarse correctamente

### Test 7: Responsive (Mobile)

1. Abrir DevTools → Device Toolbar (Cmd+Shift+M / Ctrl+Shift+M)
2. Simular un dispositivo móvil
3. Verificar que:
   - ✅ Los controles de paginación son visibles y funcionales
   - ✅ Las tablas se convierten en cards
   - ✅ El contador de resultados se muestra correctamente

### Test 8: Repetir en los 3 Catálogos

Ejecutar todos los tests anteriores en:

- ✅ Barrios (http://localhost:3000/admin/barrios)
- ✅ Etiquetas (http://localhost:3000/admin/etiquetas)
- ✅ Departamentos (http://localhost:3000/admin/departamentos)

## Verificación TypeScript

```bash
cd frontend
pnpm tsc --noEmit
```

✅ **Estado**: Sin errores de compilación

## Notas Técnicas

### Navegación Hacia Atrás

- La API backend solo proporciona `nextCursor`
- Para navegar hacia atrás, se mantiene un historial client-side (`cursorHistory`)
- Cada `nextPage()` agrega el cursor actual al historial
- Cada `previousPage()` elimina el último cursor del historial

### Protección contra Sobrecarga

```typescript
const limit = Math.min(pageSize, 100); // Garantiza máximo 100
```

### Optimistic Updates Preservados

- Se mantienen optimistic updates para crear/editar
- NO se usan para eliminar (para evitar desincronización con el backend)

### Rutas Admin

- Las rutas frontend usan el grupo `(admin)` → `/admin/*`
- Las rutas backend son directas → `/neighborhoods`, `/tags`, `/departments`
- La autenticación se maneja vía middleware en el backend
