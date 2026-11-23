# Nexo Comercial — Design System & Guidelines (`design.md`)

> **Fuente de verdad del Design System visual y comportamental de Nexo Comercial.**
> Todo componente nuevo (tablas, botones, modales, formularios, badges de estado, toasts) debe construirse con los tokens y patrones de este documento.
>
> Derivado de la implementación real: `frontend/app/globals.css`, `frontend/components/ui/*`, `frontend/components/admin/*`, `frontend/components/tickets/*`, `frontend/components/public/*`.
>
> Complementa —y no reemplaza— [`ux-writing-es-mx.md`](./ux-writing-es-mx.md), que gobierna el texto de la interfaz.

## 0. Contexto técnico

| Aspecto | Implementación real | Ubicación |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) + React 19 | `frontend/app` |
| Estilos | **Tailwind CSS v4** (CSS-first, `@theme inline`, **sin** `tailwind.config.js`) | `frontend/app/globals.css`, `frontend/postcss.config.mjs` |
| Librería de base | **shadcn/ui** — estilo `new-york`, baseColor `neutral`, RSC `true`, CSS variables `true` | `frontend/components.json` |
| Primitivos | Radix UI (`@radix-ui/react-*`) | `frontend/components/ui/*` |
| Variantes | `class-variance-authority` (CVA) + `VariantProps` | `frontend/components/ui/button.tsx`, etc. |
| Utilidad de clases | `cn(...)` = `twMerge(clsx(inputs))` | `frontend/lib/utils.ts` |
| Iconografía | **lucide-react** (única librería de iconos) | global |
| Notificaciones | **Sonner** vía `CustomToaster` (el `toast.tsx` Radix legado está sin usar) | `frontend/components/ui/toaster-custom.tsx` |
| Breakpoint móvil (JS) | `768px` (`MOBILE_BREAKPOINT`) | `frontend/components/ui/use-mobile.tsx` |

**Regla de oro:** un componente nuevo se arma con primitivos de `frontend/components/ui/*` + tokens semánticos (`bg-card`, `text-muted-foreground`, `border-input`). **Nunca** se hardcodean colores hex ni escalas de gris ad-hoc (`bg-gray-500`, `text-zinc-400`).

> **Única excepción autorizada:** las **tablas** usan la escala `slate` de forma normativa (§2.2). Es una decisión explícita, no una licencia general — su convivencia con los tokens y su alternativa por tokens están analizadas en §5.11. Fuera de tablas, la regla de oro no admite excepciones.

---

## 1. Identidad Visual y Fundamentos

### 1.1 Paleta de Colores

Los tokens viven en `:root` de `frontend/app/globals.css` y se exponen a Tailwind mediante `@theme inline`. Paleta base declarada: **Guinda Morena + Gris Sobrio + Blanco**, con un dorado cálido de acento y un teal para CTAs juveniles.

#### Superficies y texto

| Token CSS | Clase Tailwind | HEX | Uso |
| --- | --- | --- | --- |
| `--background` | `bg-background` | `#ffffff` | Fondo de página / modales |
| `--foreground` | `text-foreground` | `#111827` | Texto principal |
| `--card` | `bg-card` | `#ffffff` | Superficie de tarjetas y tablas |
| `--card-foreground` | `text-card-foreground` | `#111827` | Texto sobre tarjeta |
| `--popover` | `bg-popover` | `#ffffff` | Superficie de popovers/selects |
| `--popover-foreground` | `text-popover-foreground` | `#111827` | Texto sobre popover |
| `--muted` | `bg-muted` | `#f3f4f6` | Fondos sutiles, cebra, hover neutro |
| `--muted-foreground` | `text-muted-foreground` | `#6b7280` | Texto secundario, placeholders, metadatos |
| `--border` | `border-border` | `#e5e7eb` | Bordes de superficies |
| `--input` | `border-input` | `#e5e7eb` | Bordes de campos de entrada |
| `--ring` | `ring-ring` | `#711b2c` | Anillo de foco (guinda) |

#### Marca

| Token CSS | Clase Tailwind | HEX | Uso |
| --- | --- | --- | --- |
| `--primary` | `bg-primary` / `text-primary` | `#711b2c` | **Guinda Morena** — acción principal, marca |
| `--primary-hover` | `bg-primary-hover` | `#5a1522` | Hover de superficies guinda (sitio público) |
| `--primary-light` | `bg-primary-light` / `text-primary-light` | `#9b3244` | Guinda claro, énfasis secundario |
| `--primary-foreground` | `text-primary-foreground` | `#ffffff` | Texto sobre guinda |
| `--secondary` | `bg-secondary` / `text-secondary` | `#374151` | **Gris Sobrio** — acciones secundarias, títulos de lectura |
| `--secondary-foreground` | `text-secondary-foreground` | `#ffffff` | Texto sobre gris sobrio |
| `--accent` ⚠️ | `bg-accent` | `#b8973a` | **Dorado cálido.** Ver advertencia §1.5 |
| `--accent-foreground` | `text-accent-foreground` | `#ffffff` | Texto sobre dorado |
| `--accent-teal` | `bg-accent-teal` | `#2dd4bf` | CTA juvenil (sitio público) |
| `--accent-teal-hover` | `bg-accent-teal-hover` | `#14b8a6` | Hover del CTA teal |
| `--accent-teal-foreground` | `text-accent-teal-foreground` | `#06251f` | Texto sobre teal |
| `--accent-teal-dark` | `bg-accent-teal-dark` | `#0f766e` | Teal oscuro de apoyo |

#### Semánticos

| Token CSS | Clase Tailwind | HEX | Uso |
| --- | --- | --- | --- |
| `--destructive` | `bg-destructive` / `text-destructive` | `#b91c1c` | Error, acciones destructivas |
| `--destructive-foreground` | `text-destructive-foreground` | `#ffffff` | Texto sobre destructivo |

> **Semánticos derivados (éxito / advertencia / información).**
> **No existen tokens** para éxito, advertencia ni información. Se resuelven con la escala nativa de Tailwind. Desde la estandarización de §2.2.3 / §5.3, el patrón canónico es la tríada `border-<color>-200 bg-<color>-50 text-<color>-700` (la serie antigua `bg-<color>-500/15 text-<color>-700` queda **deprecada**).

#### Sidebar (navegación administrativa, guinda oscuro)

| Token CSS | Clase Tailwind | HEX |
| --- | --- | --- |
| `--sidebar` | `bg-sidebar` | `#3d0d16` |
| `--sidebar-foreground` | `text-sidebar-foreground` | `#f9fafb` |
| `--sidebar-primary` | `bg-sidebar-primary` | `#9b3244` |
| `--sidebar-primary-foreground` | `text-sidebar-primary-foreground` | `#ffffff` |
| `--sidebar-accent` | `bg-sidebar-accent` | `#521320` |
| `--sidebar-accent-foreground` | `text-sidebar-accent-foreground` | `#f9fafb` |
| `--sidebar-border` | `border-sidebar-border` | `#5a1522` |
| `--sidebar-ring` | `ring-sidebar-ring` | `#711b2c` |

#### Significado operativo de los colores (contrato de uso)

| Color | Significado | No usar para |
| --- | --- | --- |
| Guinda (`primary`) | Marca, acción principal, éxito en toasts | Estados "en proceso" |
| Gris sobrio (`secondary`) | Neutro institucional, información base | Énfasis de marca |
| Dorado (`accent`) | Advertencia **y** superficie neutra de hover (conflicto, §1.5) | Éxito, error |
| Teal (`accent-teal`) | CTA juvenil sobre fondo guinda | Admin/CRM |
| Rojo (`destructive`) | Error, destructivo, urgente | Estados pendientes |

### 1.2 Tipografía

- **Fuente primaria y única: `Montserrat`** (`next/font/google`), cargada en `frontend/app/layout.tsx` con `variable: '--font-montserrat'` y pesos `400, 500, 600, 700, 800, 900`.
- `@theme inline` mapea `--font-sans` **y** `--font-serif` a Montserrat (no hay serif distinta) → `font-sans` es la clase canónica a usar.
- `--font-mono: 'Geist Mono', 'Geist Mono Fallback'`. ⚠️ **Geist Mono no se carga en `layout.tsx`**; `font-mono` cae al mono del sistema. Ver §5.
- Aplicación global: `<body className="... font-sans antialiased">`.

#### Escala tipográfica (Tailwind v4 por defecto — no hay overrides de `--text-*`)

| Rol | Clases | Tamaño / Interlineado | Peso | Dónde se usa |
| --- | --- | --- | --- | --- |
| H1 / Hero | `text-4xl sm:text-5xl font-black` | 2.25rem+ | 900 | `public/hero-section.tsx` |
| H2 | `text-3xl font-black` | 1.875rem | 900 | Secciones públicas |
| H3 / Título de modal | `text-lg font-semibold` | 1.125rem / 1.75rem | 600 | `DialogTitle`, `AlertDialogTitle` |
| H4 / Título de tarjeta | `font-semibold leading-none` | 1rem | 600 | `CardTitle` |
| Body | `text-sm` | 0.875rem / 1.25rem | 400 | Base de tablas y UI densa |
| Body lectura | `text-base` | 1rem / 1.5rem | 400 | Formularios públicos |
| Caption / Metadato | `text-xs text-muted-foreground` | 0.75rem / 1rem | 400 | Fechas, folios, teléfonos |
| Badge | `text-xs font-medium` | 0.75rem | 500 | `Badge` |
| Label de formulario | `text-sm font-medium leading-none` | 0.875rem | 500 | `Label` |
| Código / Slug | `text-xs font-mono text-muted-foreground` | 0.75rem | 400 | Folios, slugs |
| Prosa legal | `1.375rem/900` (h2), `1.05rem/800` (h3) | — | 800–900 | `.legal-prose` en `globals.css` |

**Regla:** densidad administrativa = `text-sm` como base; lectura pública/editorial = `text-base`; metadatos siempre `text-xs text-muted-foreground`.

### 1.3 Espaciado y Bordes

#### Espaciado

Base de Tailwind v4: `--spacing: 0.25rem` (4px). Los utilitarios numéricos son dinámicos (`p-0.75`, `w-27.5`, `min-h-75` = 4 × n px).

| Contexto | Patrón canónico |
| --- | --- |
| Gaps de layout | `gap-2` (8px) · `gap-4` (16px) · `gap-6` (24px) |
| Padding de card | `px-6` + `py-6` (raíz `py-6`) |
| Padding de modal | `p-6` |
| Padding de celda de tabla | **`px-4 py-3.5`** (normativo, §2.2.2) · nativo pendiente de migrar: `p-2` |
| Padding de header de tabla | **`h-11 px-4`** (normativo, §2.2.1) · nativo pendiente de migrar: `h-10 px-2` |
| Padding de campo | `px-3 py-1` (Input h-9) · `px-3 py-2` (Select/Textarea) |
| Padding de botón | `px-4` (md) · `px-3` (sm) · `px-6` (lg) |
| Separación de secciones | `space-y-3` / `space-y-4` / `space-y-6` |

#### Radios de borde (`--radius: 0.625rem` = 10px)

| Token | Clase | Cálculo | Valor | Uso canónico |
| --- | --- | --- | --- | --- |
| `--radius-sm` | `rounded-sm` | `calc(var(--radius) - 4px)` | **6px** | Items de menú (`rounded-sm`) |
| `--radius-md` | `rounded-md` | `calc(var(--radius) - 2px)` | **8px** | Botones, inputs, badges, select |
| `--radius-lg` | `rounded-lg` | `var(--radius)` | **10px** | Modales, alerts, tabs-list, skeletons |
| `--radius-xl` | `rounded-xl` | `calc(var(--radius) + 4px)` | **14px** | Tarjetas, contenedores de tabla |
| *(default)* | `rounded-2xl` | Tailwind default `1rem` | **16px** | Solo dashboards (ver §5) |
| — | `rounded-full` | — | 50% | Pills de estado, avatares, CTAs públicos |

#### Sombras

| Clase | Uso |
| --- | --- |
| `shadow-xs` | Inputs, Select, Textarea, botón `outline` |
| `shadow-sm` | `Card`, contenedores de tabla (`overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm`) |
| `shadow-md` | Contenido de `Select` |
| `shadow-lg` | `DialogContent`, `AlertDialogContent` |
| `shadow-[0_8px_28px_-10px_color-mix(in_srgb,var(--secondary)_26%,transparent)]` | Toasts (definido en `toaster-custom.tsx`) |

### 1.4 Foco y cursor (contrato global)

#### Foco

El anillo de foco canónico de la app es:

```text
focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

Es decir: borde `#711b2c`, anillo guinda al 50 % de opacidad, **3px**. Todo elemento interactivo nuevo debe heredar el anillo de su primitivo. Los overrides con `ring-1` o `ring-2` existentes están listados en §5.

#### Cursor

**Todo elemento interactivo (`<button>`, `<a>` de acción, fila clicable, toggle) DEBE llevar `cursor-pointer` explícito.**

Tailwind CSS v4 **eliminó** la regla `[role="button"] { cursor: pointer }` que existía en v3. Verificado: el `preflight.css` de `tailwindcss@4.2.4` **no contiene ninguna declaración `cursor`**, y el primitivo `Button` tampoco la incluye. Sin `cursor-pointer`, un `<button>` cae en `cursor: default` (flecha). El detalle y el fix estructural están en §2.2.4.

### 1.5 ⚠️ Advertencia de arquitectura de tokens: `--accent` está sobrecargado

`--accent` **no es un token de acento neutro**: vale `#b8973a` (dorado de marca). Pero shadcn/ui lo consume internamente como *superficie neutra de hover/selected*. Consecuencias reales:

| Componente | Clase | Efecto actual |
| --- | --- | --- |
| `Button variant="ghost"` | `hover:bg-accent hover:text-accent-foreground` | Hover **dorado sólido** con texto blanco |
| `Button variant="outline"` | `hover:bg-accent hover:text-accent-foreground` | Hover **dorado** |
| `Badge variant="outline"` | `[a&]:hover:bg-accent` | Hover **dorado** |
| `SelectItem` / `DropdownMenuItem` / `CommandItem` | `focus:bg-accent` | Ítem resaltado **dorado** |
| `Skeleton` | `bg-accent` | Esqueleto de carga **dorado** |
| `Calendar` (rango) | `bg-accent` | Rango seleccionado **dorado** |
| `TicketTable` (fila) | `hover:bg-accent/50` | Fila hover **dorada** (la norma de §2.2.2 es `hover:bg-slate-50/50`) |

**Recomendación (§5.1):** desacoplar el dorado de marca del rol "superficie neutra". Mantener `--color-accent` dorado para *uso explícito* (`bg-accent` en toasts de advertencia, chips editoriales) y mover el hover neutro de los primitivos a `--muted` / un token dedicado `--hover`. Mientras no se decida, **el hover de ghost/outline es dorado por diseño heredado**: no lo "arregles" en un componente suelto, resuélvelo en los tokens.

---

## 2. Componentes Básicos (UI Kit)

### 2.1 Botones (`Buttons`)

Primitivo: `frontend/components/ui/button.tsx` (`buttonVariants`, CVA). Soporta `asChild` (Slot) para renderizar como `<a>` o `<Link>`.

**Clases base (obligatorias):**

```text
inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium
transition-all disabled:pointer-events-none disabled:opacity-50
[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0
outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
aria-invalid:ring-destructive/20 aria-invalid:border-destructive
```

#### Variantes

| Nombre pedido | `variant` real | Clases de variante |
| --- | --- | --- |
| **Primary** | `default` | `bg-primary text-primary-foreground hover:bg-primary/90` |
| **Secondary** | `secondary` | `bg-secondary text-secondary-foreground hover:bg-secondary/80` |
| **Danger** | `destructive` | `bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20` |
| **Outline** | `outline` | `border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground` |
| **Ghost** | `ghost` | `hover:bg-accent hover:text-accent-foreground` |
| **Link** | `link` | `text-primary underline-offset-4 hover:underline` |
| *(Icon-only)* | `size="icon"` | Ver tamaños + uso abajo |

#### Tamaños

| `size` | Clases | Alto |
| --- | --- | --- |
| `sm` | `h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5` | 32px |
| `default` | `h-9 px-4 py-2 has-[>svg]:px-3` | 36px |
| `lg` | `h-10 rounded-md px-6 has-[>svg]:px-4` | 40px |
| `icon` | `size-9` | 36×36px |
| `icon-sm` | `size-8` | 32×32px |
| `icon-lg` | `size-10` | 40×40px |

#### Estados

| Estado | Implementación real |
| --- | --- |
| Normal | Clases de la variante |
| Hover | `hover:bg-primary/90` (default) · `hover:bg-secondary/80` · `hover:bg-accent` (ghost/outline) |
| Active / pressed | Sin token propio; se apoya en `transition-all` |
| Disabled | `disabled:pointer-events-none disabled:opacity-50` |
| Focus-visible | `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]` |
| Cursor | ⚠️ **`cursor-pointer` obligatorio y NO presente en las clases base.** Tailwind v4 lo eliminó del preflight; ver §2.2.4 |
| **Loading** | **No hay variante.** Patrón: `disabled={busy}` + `<Loader2 className="size-4 animate-spin" />` inline |

**Patrón de botón con carga (canónico):**

```tsx
<Button type="submit" disabled={busy}>
  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
  Guardar cambios
</Button>
```

Referencias reales: `admin/create-event-modal.tsx:381`, `admin/conversation-filter.tsx` (`disabled:opacity-60`), `tickets/MessageInput.tsx:75` (`{sending ? 'Enviando…' : 'Enviar'}`).

**Icon-only con acción destructiva (patrón de tabla):**

```tsx
<Button
  variant="ghost"
  size="icon"
  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
  aria-label="Eliminar agente"
>
  <Trash2 className="w-3.5 h-3.5" />
</Button>
```

> **Regla de accesibilidad:** todo `size="icon"` DEBE llevar `aria-label` (español, tuteo).

#### Familia "Public / Editorial" (sitio público)

`components/public/*` **no** usa `<Button>`: usa CTAs propios. Son un sistema paralelo **intencional** para la landing.

| Variante pública | Clases canónicas |
| --- | --- |
| CTA primario (pill, sobre guinda) | `inline-flex items-center justify-center bg-primary hover:bg-primary-hover text-white font-bold text-sm px-5 py-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2` |
| CTA teal (juvenil) | `inline-flex items-center justify-center bg-accent-teal hover:bg-accent-teal-hover text-accent-teal-foreground font-black text-sm px-5 py-2.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal focus-visible:ring-offset-2` |
| CTA primario (bloque, formularios) | `w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 rounded-xl transition-colors` |
| CTA deshabilitado | Agregar `disabled:opacity-60` |

Referencias: `public/public-nav.tsx:84-87`, `public/public-footer.tsx:122,168`, `public/eventos-section.tsx:308,365,424`.

> ⚠️ **No mezclar**: un `<Button variant="default">` (8px, `text-sm font-medium`) en un bloque público rompe la coherencia editorial (pills de `rounded-full`, `font-bold`/`font-black`). Ver §5.9.

---

### 2.2 Tablas (`Data Tables`)

Primitivo: `frontend/components/ui/table.tsx`.

> **Sección normativa.** Las clases de §2.2.1–§2.2.4 son el **contrato estándar obligatorio** para toda tabla nueva. El primitivo actual (`table.tsx`) todavía emite las clases antiguas de shadcn; hasta que se migre, cada tabla las sobrescribe vía `className`. El detalle de la deuda vive en §5.11.

**Paleta literal de tabla.** Esta sección usa la escala **`slate`** de Tailwind (`#F8FAFC`, `#E2E8F0`, `#64748B`…) en lugar de los tokens semánticos. Es una **excepción deliberada y acotada a tablas** (§5.11): slate da un neutro más frío y consistente para datos densos. Fuera de tablas sigue vigente la regla de §1: tokens semánticos, nunca escalas de color directas.

**Equivalencias de referencia (slate ↔ token del tema):**

| Necesidad | Clase normativa (tabla) | HEX | Token equivalente | Diferencia |
| --- | --- | --- | --- | --- |
| Fondo de header / hover de fila | `bg-slate-50` | `#F8FAFC` | `bg-muted` (`#F3F4F6`) | slate es más frío |
| Borde de contenedor / header | `border-slate-200` | `#E2E8F0` | `border-border` (`#E5E7EB`) | casi idénticos |
| Borde entre filas | `border-slate-100` | `#F1F5F9` | — | sin token equivalente |
| Texto de header / iconos de acción | `text-slate-500` | `#64748B` | `text-muted-foreground` (`#6B7280`) | slate es más frío |
| Texto de acción en hover | `text-slate-700` | `#334155` | `text-secondary` (`#374151`) | casi idénticos |
| Badge inactivo | `bg-slate-100 text-slate-600` | `#F1F5F9` / `#475569` | `bg-muted text-muted-foreground` | slate es más frío |

#### 2.2.1 Encabezados (`<thead>`)

| Regla | Clases exactas |
| --- | --- |
| Fondo neutro sutil | `bg-slate-50` (`#F8FAFC`) |
| Tipografía | `uppercase text-xs font-bold tracking-wider text-slate-500` |
| Borde inferior delimitador | `border-b border-slate-200` (`#E2E8F0`) |
| Alto / aire | `h-11 px-4` |
| Alineación | Izquierda por defecto; `text-center` para números/toggles y `text-right` para acciones numéricas |
| Sin hover | La fila de header debe neutralizar el hover del primitivo: `hover:bg-slate-50` |

```tsx
<TableHeader>
  <TableRow className="hover:bg-slate-50">
    <TableHead className="h-11 bg-slate-50 px-4 text-xs font-bold tracking-wider text-slate-500 uppercase border-b border-slate-200">
      Folio
    </TableHead>
    <TableHead className="h-11 bg-slate-50 px-4 text-center text-xs font-bold tracking-wider text-slate-500 uppercase border-b border-slate-200">
      Activo
    </TableHead>
    <TableHead className="h-11 w-28 bg-slate-50 px-4 border-b border-slate-200" aria-label="Acciones" />
  </TableRow>
</TableHeader>
```

> ⚠️ El primitivo `TableHeader` aplica `[&_tr]:border-b` con el color `--border`; hay que sobreescribir con `border-slate-200` para cumplir la especificación. La columna de acciones va **sin texto** pero con `aria-label="Acciones"` — nunca vacía y sin nombre accesible.

#### 2.2.2 Contenedor y filas (`<tbody>`)

| Regla | Clases exactas |
| --- | --- |
| Contenedor | `overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm` (`rounded-lg` permitido en layouts densos o embebidos) |
| Padding de celda | `px-4 py-3.5` (14px vertical) |
| Borde entre filas | `border-b border-slate-100` en la fila |
| Última fila | Sin borde: el primitivo ya aporta `[&_tr:last-child]:border-0` en `TableBody` |
| Hover | `hover:bg-slate-50/50 transition-colors` |
| Fila clicable | Agregar `cursor-pointer` a la fila (además del `cursor-pointer` obligatorio en sus controles) |

```tsx
<div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
  <Table>
    <TableHeader>{/* §2.2.1 */}</TableHeader>
    <TableBody>
      <TableRow className="border-b border-slate-100 transition-colors hover:bg-slate-50/50">
        <TableCell className="px-4 py-3.5 font-medium">VC-1042</TableCell>
        <TableCell className="px-4 py-3.5 text-sm text-slate-600">Ana Martínez</TableCell>
        <TableCell className="px-4 py-3.5">{/* §2.2.3 Badge */}</TableCell>
        <TableCell className="px-4 py-3.5">{/* §2.2.4 Acciones */}</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</div>
```

> **Cebra opcional:** si se adopta, usar `even:bg-slate-50/60` sobre la fila, aplicado en el primitivo — nunca tabla por tabla. El primitivo no define `odd:`/`even:` hoy.

#### 2.2.3 Badges de Estado en tabla

Receta normativa (complementa §2.3):

| Estado | Clases exactas |
| --- | --- |
| **Activo** | `bg-emerald-50 text-emerald-700 border border-emerald-200` |
| **Inactivo / sin activar** | `bg-slate-100 text-slate-600 border border-slate-200` |

**Con punto indicador** (recomendado cuando el estado es binario):

```tsx
<span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
  Activo
</span>

<span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-slate-400" />
  Inactivo
</span>
```

Puede entregarse también como `<Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">`.

#### 2.2.4 Botones de acción e interacción

> **🔴 Regla obligatoria de cursor.** TODO botón de acción e icono interactivo dentro de una tabla DEBE llevar explícitamente `cursor-pointer`.
>
> **Por qué es necesario (verificado, no es opinión):** Tailwind CSS v4 **eliminó** la regla `[role="button"] { cursor: pointer }` que existía en v3. El `preflight.css` de `tailwindcss@4.2.4` **no contiene ninguna declaración `cursor`** (grep sobre `node_modules/tailwindcss/preflight.css` → 0 coincidencias). Sin `cursor-pointer`, un `<button>` usa el default del navegador (`cursor: default`), es decir **flecha, no mano**. El primitivo `Button` tampoco lo incluye, así que **hoy toda la app se ve sin mano en los botones**.
>
> **Fix estructural recomendado (una sola vez):** agregar `cursor-pointer` a las clases base de `buttonVariants` en `frontend/components/ui/button.tsx` (y a `button` en el `@layer base` de `globals.css`). Así ningún componente necesita repetirlo. La regla por tabla se mantiene para botones que no usan el primitivo.

**Estructura:** agrupados en un contenedor `flex items-center gap-1`.

**Estilos y estados hover (normativos):**

| Acción | Clases exactas |
| --- | --- |
| **Mensaje / Ver** | `p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 cursor-pointer transition-colors` |
| **Editar** | `p-1.5 rounded-md text-slate-500 hover:bg-blue-50 hover:text-blue-600 cursor-pointer transition-colors` |
| **Eliminar** | `p-1.5 rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 cursor-pointer transition-colors` |

**Forma recomendada (conserva foco y accesibilidad del primitivo):**

Las clases literales de arriba **no incluyen anillo de foco** → por sí solas rompen §1.4 y §3.2. Como `cn()` usa `twMerge`, se pueden inyectar vía `className` en el `Button` y las clases normativas ganan sobre las de la variante sin perder `focus-visible:ring-*` ni `disabled:*`:

```tsx
<div className="flex items-center gap-1">
  <Button
    variant="ghost"
    size="icon"
    aria-label="Ver conversación"
    title="Ver conversación"
    className="h-8 w-8 cursor-pointer rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
  >
    <MessageSquare className="h-4 w-4" />
  </Button>

  <Button
    variant="ghost"
    size="icon"
    aria-label="Editar registro"
    title="Editar registro"
    className="h-8 w-8 cursor-pointer rounded-md p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
  >
    <Pencil className="h-4 w-4" />
  </Button>

  <Button
    variant="ghost"
    size="icon"
    aria-label="Eliminar registro"
    title="Eliminar registro"
    className="h-8 w-8 cursor-pointer rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
  >
    <Trash2 className="h-4 w-4" />
  </Button>
</div>
```

Si el botón **no** puede ser un `<Button>` (contexto HTML plano, o un control que debe renderizar como `<a>`/`<summary>`), usar `<button type="button">` / `<a>` con las clases literales **+** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50` y `aria-label` obligatorio.

> **Por qué `className` y no clases sueltas:** `twMerge` resuelve los conflictos a favor de lo que va al final. `hover:bg-slate-100` gana sobre el `hover:bg-accent` de `ghost` (evitando el dorado de §1.5) y `hover:text-slate-700` gana sobre `hover:text-accent-foreground`, **sin** perder el anillo de foco ni `disabled:*` del primitivo. Ese es el motivo de componer en vez de reescribir el botón.

**Accesibilidad (obligatoria):** cada botón de acción requiere `aria-label` **o** `title` descriptivo en español y tuteo. Si el icono es decorativo, el propio icono ya va sin texto; el nombre accesible va en el control. Para acciones destructivas, además `variant="ghost"` nunca debe ser el único indicador: usar el color `red` **y** el `aria-label` explícito.

#### Estados (carga, vacío, error)

**Carga (skeleton) — patrón A, filas de tabla (`tickets/TicketTable.tsx:83-108`):**

```tsx
if (loading && rows.length === 0) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      <Table>
        <TableHeader>{/* headers reales, §2.2.1 */}</TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, i) => (
            <TableRow key={i} className="border-b border-slate-100">
              {headers.map((h) => (
                <TableCell key={h} className="px-4 py-3.5">
                  <Skeleton className="h-4 w-full max-w-30" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

**Carga — patrón B, blobs por fila (mayoría de tablas admin):**

```tsx
<div className="space-y-3">
  {[...Array(6)].map((_, i) => (
    <Skeleton key={i} className="h-16 w-full" />
  ))}
</div>
```

Alturas observadas: `h-16` (`UsersTable`, `RolesTable`), `h-14` (`PermissionsTable`) y `h-20` (`RolePermissionsManager`).

> **Elige un patrón por tabla, no ambos.** El patrón A es superior (preserva columnas y evita salto de layout).

**Vacío — primitivo `Empty` (canónico, tablas modernas):**

```tsx
<Empty className="min-h-75">
  <EmptyHeader>
    <EmptyMedia variant="icon">
      <Users />
    </EmptyMedia>
    <EmptyTitle>No hay integrantes para mostrar</EmptyTitle>
    <EmptyDescription>
      Todavía no hay integrantes registrados o los filtros no tienen resultados.
    </EmptyDescription>
  </EmptyHeader>
</Empty>
```

Referencia: `admin/team/UsersTable.tsx:62-76`. El primitivo `Empty` (`components/ui/empty.tsx`) ya trae `flex flex-1 flex-col items-center justify-center gap-6 rounded-lg border-dashed p-6 text-center md:p-12`. Envolverlo en el contenedor de §2.2.2 para que respete el borde y el radio de la tarjeta.

Variantes de vacío heredadas que **deberían migrar a `Empty`**:

```tsx
// Existente en tickets/TicketTable.tsx:121-127 → migrar a <Empty>
<div className="rounded-xl border border-slate-200 bg-card p-12 text-center">
  <p className="text-sm text-slate-500">{emptyMessage}</p>
</div>

// Existente en ai/AgentTable.tsx:40-48 (icono + dos líneas) → migrar a <Empty>
<div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
  <Bot className="h-10 w-10 opacity-30" />
  <p className="text-sm font-medium">No hay agentes configurados</p>
  <p className="text-xs opacity-60">Crea el primer agente para comenzar</p>
</div>
```

**Error — patrón canónico (`tickets/TicketTable.tsx:110-119`):**

```tsx
<div className="space-y-3 rounded-xl border border-slate-200 bg-card p-8 text-center">
  <p className="text-sm text-destructive">{error}</p>
  <Button variant="outline" size="sm" onClick={onRetry}>Reintentar</Button>
</div>
```

#### Acciones, filtros y paginación

| Necesidad | Patrón normativo |
| --- | --- |
| Acciones por fila | Columna final `<TableHead className="h-11 w-28 bg-slate-50 px-4 border-b border-slate-200" aria-label="Acciones" />` + contenedor `flex items-center gap-1` con los botones de §2.2.4 |
| Fila clicable | `TableRow className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50/50 group"` + `<Link className="block">` en cada celda + `<ChevronRight className="h-4 w-4 text-slate-400 transition-colors group-hover:text-slate-600" />` |
| Filtros superiores | `<SelectTrigger size="sm" className="w-40" aria-label="Filtrar por estado">` (`tickets/TicketFilters.tsx:77`) |
| Búsqueda | `InputGroup` / `Input` con icono `Search` + `focus:ring-2 focus:ring-primary/30` en público |
| Paginación incremental (canónica) | Botón ghost "Cargar más" en el footer del contenedor |
| Paginación numerada | Primitivo `components/ui/pagination.tsx`, basado en `buttonVariants` (`outline` si activo, `ghost` si no) |

```tsx
{hasNextPage && (
  <div className="flex justify-center border-t border-slate-100 p-3">
    <Button
      variant="ghost"
      size="sm"
      onClick={onLoadMore}
      disabled={loadingMore}
      className="cursor-pointer text-slate-500 hover:bg-slate-100 hover:text-slate-700"
    >
      {loadingMore ? 'Cargando más…' : 'Cargar más tickets'}
    </Button>
  </div>
)}
```

> ⚠️ El primitivo `Pagination` usa etiquetas en inglés (`"Previous"`, `"Next"`, `aria-label="Go to next page"`). Ver §5.8.

---

### 2.3 Badges & Etiquetas de Estado

Primitivo: `frontend/components/ui/badge.tsx`.

**Clases base:**

```text
inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium
w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none
focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
aria-invalid:ring-destructive/20 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden
```

**Variantes:** `default` (`border-transparent bg-primary text-primary-foreground`) · `secondary` · `destructive` · `outline` (`text-foreground [a&]:hover:bg-accent`).

> **Convención de estado:** los badges de dominio usan `variant="outline"` + un `className` con la tríada de color. Los componentes exponen un `*_CONFIG: Record<Status, { label, className }>`.

#### Recetas normativas de estado (binario)

Para cualquier tabla, la dupla **Activo / Inactivo** usa exactamente estas recetas (§2.2.3):

```tsx
<Badge variant="outline" className="border border-emerald-200 bg-emerald-50 text-emerald-700">
  Activo
</Badge>

<Badge variant="outline" className="border border-slate-200 bg-slate-100 text-slate-600">
  Inactivo
</Badge>
```

Con punto indicador (`aria-hidden`), ver el patrón completo en §2.2.3.

> ⚠️ Esto **reemplaza** el badge sólido `bg-emerald-600 text-white` y el `variant="secondary"` que hoy usa `admin/team/StatusBadges.tsx:17-29` (`UserStatusBadge`). Debe migrarse.

#### Tabla de estados canónica (heredada — migrar a §2.2.3 / §5.3)

| Estado (dominio) | Etiqueta ES | Clases actuales | Origen |
| --- | --- | --- | --- |
| **Activo** | `Activo` | ⚠️ `bg-emerald-600 text-white hover:bg-emerald-600` + `<CheckCircle2 className="mr-1 h-3 w-3" />` → migrar a la receta normativa | `admin/team/StatusBadges.tsx:19` |
| **Inactivo** | `Inactivo` | ⚠️ `variant="secondary"` + `<PauseCircle />` → migrar a la receta normativa | `admin/team/StatusBadges.tsx:24` |
| **Pendiente** | `Pendiente` | `border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300` | `admin/team/StatusBadges.tsx:38` |
| **Enviada** | `Enviada` | `border-sky-300 bg-sky-50 text-sky-800 dark:bg-sky-950/30 dark:text-sky-300` | idem |
| **Aceptada** | `Aceptada` | `border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300` | idem |
| **Fallida** | `Fallida` | `border-destructive/40 bg-destructive/10 text-destructive dark:bg-destructive/20` | idem |
| **Expirada** | `Expirada` | `border-amber-300 bg-amber-50 text-amber-800` | idem |
| **Sin invitación** | `Sin invitación` | `variant="outline" className="text-muted-foreground"` + `<MailX />` | idem |

> Los patrones `-50 / -300 / -800` de esta familia (tinte claro, borde medio, texto oscuro) **son** la referencia correcta y coinciden con la receta normativa de §2.2.3. Los patrones `-500/15` de las secciones siguientes son la variante antigua.

#### Estados de ticket (`tickets/TicketStatusBadge.tsx`)

Exporta `TICKET_STATUS_CONFIG` (reutilizado por `admin/citizen-profile-page-view.tsx`).

| Enum | Etiqueta | Clases actuales (`-500/15`, migrar a `-50/-200/-700`) |
| --- | --- | --- |
| `OPEN` | Nuevo Reporte | `bg-blue-500/15 text-blue-700 border-blue-200 dark:text-blue-400` |
| `IN_PROGRESS` | En Gestión | `bg-amber-500/15 text-amber-700 border-amber-200 dark:text-amber-400` |
| `RESOLVED` | Canalizado | `bg-green-500/15 text-green-700 border-green-200 dark:text-green-400` |
| `CLOSED` | Caso Resuelto | `bg-muted text-muted-foreground border-border` |

#### Prioridades de ticket (`tickets/TicketPriorityBadge.tsx`)

Exporta `PRIORITY_CONFIG`.

| Enum | Etiqueta | Clases |
| --- | --- | --- |
| `LOW` | Baja | `bg-slate-500/10 text-slate-600 border-slate-200 dark:text-slate-400` |
| `MEDIUM` | Media | `bg-sky-500/15 text-sky-700 border-sky-200 dark:text-sky-400` |
| `HIGH` | Alta | `bg-orange-500/15 text-orange-700 border-orange-200 dark:text-orange-400` |
| `URGENT` | Urgente | `bg-red-500/15 text-red-700 border-red-200 dark:text-red-400 font-semibold` |

#### Pill con punto (estado binario en tabla)

Receta **normativa** (reemplaza el `rounded-full` con `bg-emerald-50` sin borde):

```tsx
<span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
  Activo
</span>
```

Forma heredada en `tickets/TicketTable.tsx:198-212` (pill sin borde, `rounded-full`, `bg-emerald-600` en el punto) → migrar.

#### Chips de departamento

```tsx
<span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{slug}</span>
```

> ⚠️ Conflación actual: `green` vs `emerald`, `blue` vs `sky`, `red` vs `destructive`, y un badge **sólido** (`bg-emerald-600`) conviviendo con badges **tintados**. Además hay colisiones de etiquetas (`En Gestión` vs `En progreso` vs `EN_PROGRESS`; `Resuelto` vs `Canalizado` vs `Caso Resuelto`). Ver §5.3 y §5.11.

---

### 2.4 Formularios y Controles de Entrada

#### Inputs de texto

Primitivo: `frontend/components/ui/input.tsx`.

```text
file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground
dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1
text-base shadow-xs transition-[color,box-shadow] outline-none
file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium
disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm
focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
aria-invalid:ring-destructive/20 aria-invalid:border-destructive
```

Claves: `h-9` · `rounded-md` · `text-base md:text-sm` (evita el zoom en iOS) · `shadow-xs`.

#### Textarea

```text
border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50
aria-invalid:ring-destructive/20 aria-invalid:border-destructive dark:bg-input/30
flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2
text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]
disabled:cursor-not-allowed disabled:opacity-50 md:text-sm
```

Claves: `min-h-16` · `field-sizing-content` (auto-grow) · mismos estados de foco/invalid.

#### Select

Primitivo: `frontend/components/ui/select.tsx` (Radix). `SelectTrigger` acepta `size="sm" | "default"`.

| Parte | Clases clave |
| --- | --- |
| `SelectTrigger` | `border-input ... flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs` + `focus-visible:ring-[3px]` + `data-[size=default]:h-9 data-[size=sm]:h-8` |
| `SelectContent` | `bg-popover text-popover-foreground ... rounded-md border shadow-md` |
| `SelectItem` | `focus:bg-accent focus:text-accent-foreground ... rounded-sm py-1.5 pr-8 pl-2 text-sm` |
| `SelectLabel` | `text-muted-foreground px-2 py-1.5 text-xs` |

> ⚠️ Varios formularios **evitan `Select`** y usan `<select>` nativo con una constante local:
> `selectClass = 'w-full rounded-md border bg-background px-3 py-2 text-sm'` (`campaigns/CsvAudienceMapping.tsx:7`) y
> `selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60'` (`templates/TemplateForm.tsx:26`). Ver §5.5.

#### Checkbox, Radio y Switch

| Control | Clases base | Marca |
| --- | --- | --- |
| `Checkbox` | `peer border-input size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50` + `data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary` | `<CheckIcon className="size-3.5" />` |
| `RadioGroup` | `grid gap-3` | — |
| `RadioGroupItem` | `border-input text-primary aspect-square size-4 shrink-0 rounded-full border shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]` | `<CircleIcon className="fill-primary ... size-2" />` |
| `Switch` | `peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px]` | thumb `bg-background size-4 rounded-full` |

#### Composición de campos (`Field` — canónico)

`frontend/components/ui/field.tsx` es la capa de composición recomendada (reemplaza el patrón "label + input + error" a mano).

```tsx
<Field data-invalid={!!error}>
  <FieldLabel htmlFor="correo">Correo electrónico</FieldLabel>
  <Input id="correo" aria-invalid={!!error} />
  <FieldDescription>Usaremos este correo para confirmar tu registro.</FieldDescription>
  <FieldError errors={[{ message: 'Ingresa un correo válido.' }]} />
</Field>
```

Orientaciones: `vertical` (default) · `horizontal` · `responsive` (`@md/field-group:flex-row`, container query).

#### Estados de validación

| Estado | Implementación |
| --- | --- |
| **Error** | `aria-invalid` en el control → `aria-invalid:border-destructive aria-invalid:ring-destructive/20`; el mensaje va en `FieldError` (`text-destructive text-sm font-normal`, `role="alert"`). El contenedor `Field` propaga `data-[invalid=true]:text-destructive` |
| **Focus** | Anillo guinda de 3px (`focus-visible:ring-[3px]`), borde `border-ring` |
| **Disabled** | `disabled:cursor-not-allowed disabled:opacity-50` (Input/Textarea) · `disabled:opacity-60` (CTAs públicos) |
| **Placeholder** | `placeholder:text-muted-foreground` |

**Patrón de error en banners (campos no individuales):**

```tsx
<p role="alert" className="text-destructive text-sm">Ingresa un correo válido.</p>
<div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800
                dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
  …
</div>
```

#### Componente `Alert`

`frontend/components/ui/alert.tsx` — `rounded-lg border px-4 py-3 text-sm grid` con `[&>svg]:size-4 [&>svg]:text-current`.
Variantes: `default` (`bg-card text-card-foreground`) · `destructive` (`text-destructive bg-card [&>svg]:text-current`). Estructura: `Alert` (role="alert") → `AlertTitle` (`col-start-2 font-medium tracking-tight`) → `AlertDescription` (`col-start-2 text-muted-foreground text-sm`).

---

### 2.5 Modales y Notificaciones (`Dialogs & Toasts`)

#### Modal (`Dialog`)

`frontend/components/ui/dialog.tsx`. Estructura: `Dialog` → `DialogTrigger` → `DialogContent` (`DialogHeader` · `DialogBody` · `DialogFooter`) → `DialogTitle` / `DialogDescription`.

| Parte | Clases clave |
| --- | --- |
| `DialogOverlay` | `data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 fixed inset-0 z-50 bg-black/50` |
| `DialogContent` | `bg-background ... fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg` |
| Close (por defecto) | `absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2` |
| `DialogHeader` | `flex flex-col gap-2 text-center sm:text-left` |
| `DialogTitle` | `text-lg leading-none font-semibold` |
| `DialogDescription` | `text-muted-foreground text-sm` |
| `DialogFooter` | `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end` |

**Contrato del modal:** centrado · overlay 50 % negro · `rounded-lg` · `p-6` · `gap-4` · `sm:max-w-lg` · animación entrada/salida + zoom 95→100 en 200 ms · footer en columna invertida en móvil, fila alineada a la derecha desde `sm`.

#### Modal de confirmación (`AlertDialog` + `ConfirmDialog`)

`frontend/components/ui/alert-dialog.tsx` comparte el chrome con `Dialog` y añade `AlertDialogAction` (usa `buttonVariants()`) y `AlertDialogCancel` (`buttonVariants({ variant: 'outline' })`).

**Usa siempre el wrapper `ConfirmDialog`** (`frontend/components/ui/confirm-dialog.tsx`) en vez de armar el AlertDialog a mano:

```tsx
<ConfirmDialog
  open={open}
  title="¿Eliminar este integrante?"
  description="Esta acción no se puede deshacer."
  confirmText="Eliminar"
  cancelText="Cancelar"
  variant="destructive"     // default | destructive
  confirming={deleting}
  confirmingText="Eliminando…"
  onConfirm={handleDelete}
  onOpenChange={setOpen}
/>
```

Contrato: mantiene el diálogo abierto y bloqueado mientras `confirming`, previene el cierre por overlay/escape durante la acción, y reemplaza el label por `confirmingText`.

#### Notificaciones / Toasts (`Sonner`)

Montado una sola vez como `<CustomToaster />` en `components/providers/app-providers.tsx:16`. Definido en `frontend/components/ui/toaster-custom.tsx` con la clase `toaster-brand`.

**Configuración:** `position="top-right"` · `closeButton` · `gap={10}` · `visibleToasts={3}` · `duration={4500}` · `offset={16}` · `mobileOffset={16}` · `--width: 22.5rem` · `--border-radius: var(--radius)`.

**Estructura visual (riel izquierdo por tipo):**

```text
relative flex w-[min(100%,22.5rem)] items-start gap-3 rounded-[var(--radius)] border border-border
border-l-[3px] bg-card px-3.5 py-3 pr-10 text-card-foreground
shadow-[0_8px_28px_-10px_color-mix(in_srgb,var(--secondary)_26%,transparent)]
```

| Tipo | Riel `border-l` e icono | Icono lucide |
| --- | --- | --- |
| `default` | `--secondary` (#374151) | — |
| `success` | `--primary` (#711b2c guinda) | `CheckCircle2` |
| `error` | `--destructive` (#b91c1c) | `CircleAlert` |
| `warning` | `--accent` (#b8973a dorado) | `TriangleAlert` |
| `info` | `--primary-light` (#9b3244) | `Info` |
| `loading` | `--muted-foreground/40` | `Loader2 animate-spin` |

**Subelementos:** título `text-sm font-semibold leading-snug tracking-tight text-foreground` · descripción `mt-0.5 text-xs leading-relaxed text-muted-foreground` · actionButton `mt-2 inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover` · cancelButton `… bg-muted … text-secondary hover:bg-muted/80` · closeButton `text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-2`.

**Uso:**

```ts
import { toast } from 'sonner';
toast.success('Registro confirmado');
toast.error('No pudimos enviar el mensaje. Intenta de nuevo.');
toast('Nuevo mensaje recibido', { description: 'Línea de Atención · 14:02' });
```

> **Decisión de marca documentada:** el toast de `success` es **guinda**, no verde. Es intencional (`globals.css:270-276`) y convive con badges de éxito en `emerald`. No lo "corrijas" a verde sin actualizar §1.1.
> El primitivo Radix legado (`components/ui/toast.tsx` + `toaster.tsx`) **está sin montar**: no lo uses. Ver §5.7.

---

## 3. Reglas de Accesibilidad y Responsividad

### 3.1 Contraste y color

- Texto principal `#111827` sobre `#ffffff` → **~16.1:1** (AAA).
- Texto secundario `#6b7280` sobre `#ffffff` → **~4.8:1** (AA para texto normal). **Nunca** usar `text-muted-foreground` por debajo de `text-xs` en superficies `bg-muted`.
- `primary-foreground` (`#ffffff`) sobre `primary` (`#711b2c`) → **~9.4:1** (AAA).
- `accent-teal-foreground` (`#06251f`) sobre `accent-teal` (`#2dd4bf`) → **~9.8:1** (AAA) — seguro para el CTA juvenil.
- **Regla de estado:** el color **nunca** es el único portador de significado. Los estados con color llevan siempre texto o icono (p. ej. el pill con punto añade `aria-hidden` en el punto y el texto "Abierto"/"Cerrado").
- Los badges de estado usan tinte (`bg-<color>-500/15`) + texto oscuro (`text-<color>-700`), no color sólido saturado, para mantener contraste en claro y oscuro.

### 3.2 Navegación por teclado y foco

- Anillo de foco obligatorio: `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]` (§1.4). **Nunca** eliminar el outline sin un `focus-visible:ring-*` de reemplazo.
- Cursor obligatorio: `cursor-pointer` en todo control interactivo (§1.4, §2.2.4). Tailwind v4 no lo aporta por defecto.
- Todos los Radix primitives ya gestionan `Tab`/`Escape`/flechas y `aria-*`; **no** reconstruyas modales, selects o menús con `div`s.
- Los modales atrapan el foco y lo devuelven al disparador (Radix `Dialog`/`AlertDialog`).
- Icon-only → `aria-label` obligatorio en español. En tablas, `aria-label` **o** `title` descriptivo (§2.2.4).
- El close por defecto del `Dialog` trae `<span className="sr-only">Close</span>` → **override a "Cerrar"** al usarlo.
- El `Spinner` trae `aria-label="Loading"` → pasa `aria-label` en español, o envuélvelo con `role="status"` describiendo la operación.
- Usa `role="status"` para progreso ("Hoy no hay jornadas publicadas.") y `role="alert"` para errores; ya se hace en `campaigns/*`.

### 3.3 Breakpoints responsivos

Tailwind v4 por defecto (mobile-first):

| Prefijo | Min-width | Equipo objetivo | Notas de la app |
| --- | --- | --- | --- |
| *(base)* | 0 | Móvil | Un solo nivel; footer en `flex-col-reverse`; tablas con `overflow-x-auto` |
| `sm` | **640px** | Móvil grande / tablet vertical | `sm:flex-row sm:justify-end` (footers de modal), `sm:max-w-lg` |
| `md` | **768px** | Tablet | Igual que `MOBILE_BREAKPOINT = 768` en `use-mobile.tsx`; `md:text-sm`, `md:p-12` |
| `lg` | **1024px** | Desktop | Sidebar admin persistente |
| `xl` | **1280px** | Desktop amplio | — |
| `2xl` | **1536px** | Desktop XL | — |

Container queries (Tailwind v4):

- `field.tsx`: `@container/field-group` con `@md/field-group:flex-row` → layout de formulario responsive por contenedor, no por viewport.
- `card.tsx`: `@container/card-header` para reordenar `card-action`.

**Reglas responsive obligatorias:**

1. Tablas: siempre dentro de `Table` (que ya aporta `overflow-x-auto`) o un `overflow-x-auto` externo; nunca permitir scroll horizontal del `body`.
2. Modales: `w-full max-w-[calc(100%-2rem)]` + `sm:max-w-lg`; el footer debe apilarse en móvil.
3. Grillas: `grid gap-4 sm:grid-cols-2 lg:grid-cols-4` como patrón de KPI cards.
4. Leer `useIsMobile()` (768px) **solo** cuando se deba cambiar comportamiento en JS; el layout se resuelve con clases.

### 3.4 Texto de la interfaz

Todo string visible (labels, botones, placeholders, errores, vacíos, `aria-label`, `sr-only`) sigue [`ux-writing-es-mx.md`](./ux-writing-es-mx.md): **tuteo** (`ingresa`, `selecciona`, `confirma`), español MX/LatAm neutral, sin voseo, sin anglicismos.
> ⚠️ Hay voseo y strings en inglés embebidos en el código (`"Creá el primer agente"`, `"Previous"`, `"Loading"`, `"Close"`). Ver §5.8.

---

## 4. Guía de decisión rápida

### 4.1 ¿Qué componente uso?

| Necesito… | Usa | No uses |
| --- | --- | --- |
| Acción principal | `<Button>` (default) | CTA pill público en admin |
| Acción secundaria | `<Button variant="secondary">` o `outline` | — |
| Acción destructiva | `<Button variant="destructive">` · `ConfirmDialog variant="destructive"` | `bg-red-500` a mano |
| Acción terciaria / icono en tabla | `variant="ghost" size="icon"` + clases de §2.2.4 (**siempre `cursor-pointer`**) | `Button` sin `cursor-pointer` |
| Confirmar algo | `ConfirmDialog` | `window.confirm` |
| Formulario largo | Modal (`Dialog`) o página según flujo | `Sheet` para formularios |
| Estado de dominio | `Badge variant="outline"` + `*_CONFIG` con el mapa de §5.3 | Badge sólido nuevo |
| Listado tabular | `Table` en `overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm` (§2.2.2) | `<div>` grid |
| Listado vacío | `Empty` | `<p>Sin datos</p>` |
| Cargando listado | `Skeleton` (patrón A de §2.2) | `Spinner` centrado suelto |
| Feedback efímero | `toast.*` de Sonner | Alert inline para confirmaciones |

### 4.2 Cómo construir un componente de estado de dominio

```tsx
// components/<dominio>/<X>StatusBadge.tsx
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const X_STATUS_CONFIG: Record<XStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pendiente', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  ACTIVE:  { label: 'Activo',    className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  DONE:    { label: 'Resuelto',  className: 'border-slate-200 bg-slate-100 text-slate-600' },
};

export function XStatusBadge({ status, className }: { status: XStatus; className?: string }) {
  const config = X_STATUS_CONFIG[status];
  return <Badge variant="outline" className={cn(config.className, className)}>{config.label}</Badge>;
}
```

Exporta el `*_CONFIG` para que tablas, perfiles y filtros usen la **misma** etiqueta y color. Usa la tríada canónica **`-50` (fondo) / `-200` (borde) / `-700` (texto)**, conforme a §2.2.3 y §5.3.

---

## 5. Inconsistencias detectadas y recomendaciones de unificación

> Cada punto indica el estado actual y la estandarización propuesta. **Ninguna** debe resolverse parcheando un componente suelto: casi todas se arreglan en tokens o en el primitivo.

### 5.1 🔴 Crítico — `--accent` sobrecargado (dorado como hover neutro)

- **Actual:** `--accent: #b8973a` y shadcn lo consume como superficie neutra → ghost/outline hover, ítems de menú/select al 100 % de dorado, `Skeleton` dorado, `Calendar` en rango dorado, fila de `TicketTable` en `hover:bg-accent/50`.
- **Impacto:** hovers de bajo contraste percibido, skeletons amarillos, menús que "gritan" al pasar el mouse.
- **Propuesta:** separar roles. Mantener `--color-accent` (dorado) para uso explícito y añadir `--hover`/`--highlight` (p. ej. `#f3f4f6` = `--muted`) y migrar en los primitivos `hover:bg-accent` → `hover:bg-muted`, `focus:bg-accent` → `focus:bg-muted`, `Skeleton` → `bg-muted`, y `TicketTable` → `hover:bg-muted/50`.
- **Hasta que se decida:** no mezclar `hover:bg-accent` y `hover:bg-muted` en el mismo contexto. Preferir `hover:bg-muted/50` en código nuevo.

### 5.2 🔴 `Skeleton` usa `bg-accent`

- **Actual:** `components/ui/skeleton.tsx:7` → `bg-accent animate-pulse rounded-md` (dorado).
- **Propuesta:** `bg-muted animate-pulse rounded-md` — o `bg-slate-100` si se adopta la paleta literal de tabla (§2.2.2). Es un cambio de una línea que afecta a toda la app positivamente.
- **Nota:** con la tabla estandarizada a `slate`, el skeleton debe quedar en el **mismo neutro** que el header (`bg-slate-50`/`bg-slate-100`) para que el estado de carga no se lea como un componente distinto.

### 5.3 🟠 Tres familias de color para el mismo estado + colisión de etiquetas

- **Actual:** `green` vs `emerald` (para "éxito/activo"), `blue` vs `sky` (para "nuevo/enviada"), `red` vs `destructive` (para "urgente/fallida"); y `Badge` sólido `bg-emerald-600 text-white` conviviendo con badges tintados.
- **Colisión de etiquetas:** `IN_PROGRESS` → "En Gestión" (`TicketStatusBadge`) / "En progreso" (`ticket-history-panel`) ; `RESOLVED` → "Canalizado" / "Resuelto"; `OPEN` → "Nuevo Reporte" / "Abierto" / "Nuevo".
- **Resuelto por la especificación de §2.2.3 / §4.2:** la tríada canónica es **`-50` fondo / `-200` borde / `-700` texto**. Mapa semántico único que **todos** los `*_CONFIG` deben consumir:

| Semántica | Color canónico | Clases |
| --- | --- | --- |
| Nuevo / informativo | `sky` | `border-sky-200 bg-sky-50 text-sky-700` |
| En proceso / pendiente | `amber` | `border-amber-200 bg-amber-50 text-amber-700` |
| Resuelto / activo / éxito | `emerald` | `border-emerald-200 bg-emerald-50 text-emerald-700` |
| Cerrado / inactivo | `slate` | `border-slate-200 bg-slate-100 text-slate-600` |
| Urgente / error / fallida | `red` | `border-red-200 bg-red-50 text-red-700` |
| Prioridad alta | `orange` | `border-orange-200 bg-orange-50 text-orange-700` |

> **Cambio respecto a la versión anterior de este documento:** la serie `-500/15` (tinte translúcido) queda **deprecada** en favor de la serie `-50/-200/-700`. La razón es de accesibilidad: `text-<color>-700` sobre `bg-<color>-50` es sólido y predecible, mientras que `bg-<color>-500/15` depende del fondo que hay debajo y da contraste variable.
>
> ⚠️ La tabla de §5.3 y los `dark:` de la familia `-950/30` conviven mal: la paleta normativa de tabla es **light-only** (§5.11).

Y un diccionario único de etiquetas (p. ej. `IN_PROGRESS = "En proceso"` para todo el producto).

### 5.4 🟠 Deriva de altura y radio en campos de formulario

- **Actual:** `Input` = `h-9 rounded-md`; pero `LeaderForm`, `StructureForm`, `CoordinatorForm`, `CatalogEditDialog` usan `h-11 w-full rounded-lg bg-background shadow-xs focus-visible:border-primary focus-visible:ring-primary/20`; `LineCreateForm`/`TopicForm` usan `h-9 rounded-md ... focus-visible:ring-1`; varios formularios usan `rounded-xl` en inputs públicos.
- **Propuesta:** un solo contrato de campo: **`h-9 rounded-md`** para UI densa (admin/CRM) y **`h-11 rounded-xl`** declarado explícitamente como variante "público/lectura" (formularios de ciudadano). Implementar como `inputVariants` (CVA) o `size` en `Input`, en lugar de strings sueltos.

### 5.5 🟠 `<select>` nativo junto a `Select` Radix

- **Actual:** `selectClass` en `campaigns/CsvAudienceMapping.tsx:7` y `templates/TemplateForm.tsx:26`.
- **Propuesta:** migrar a `<Select>` (coherente con `TicketFilters`) o envolver el nativo en un `NativeSelect` oficial con las clases del `SelectTrigger`. No mantener constantes de clase por archivo.

### 5.6 🟠 Anillos de foco con tres anchos distintos

- **Actual:** 3px canónico (`focus-visible:ring-[3px]`), 2px (`focus-visible:ring-2`), 3px con `ring-ring/30` (`notification-settings-modal`), y `focus:ring-2 focus:ring-primary/30` en el sitio público.
- **Propuesta:** 3px en admin/CRM; en el sitio público, 2px con `ring-offset-2` es válido (fondo guinda), pero debe venir de una constante compartida, no repetirse a mano.

### 5.7 🟠 Primitivo de toasts legado sin montar

- **Actual:** `components/ui/toast.tsx` + `components/ui/toaster.tsx` + `hooks/use-toast` (Radix) coexisten con Sonner (`CustomToaster`, el único montado en `app-providers.tsx`).
- **Propuesta:** eliminar el trío legado y usar exclusivamente `toast` de Sonner.

### 5.8 🟠 Strings en inglés y voseo en la UI

- **Actual:** `<span className="sr-only">Close</span>` (`dialog.tsx:67`), `aria-label="Loading"` (`spinner.tsx:9`), `"Previous"`/`"Next"`/`"Go to next page"` (`pagination.tsx`), `"Creá el primer agente para comenzar"` (`AgentTable.tsx:45`), `pagination.tsx` en general sin traducir.
- **Propuesta:** español MX con **tuteo** (`Cerrar`, `Cargando`, `Anterior`, `Siguiente`, `Crea el primer agente para comenzar`), conforme a `ux-writing-es-mx.md`. Añadir `aria-label` en español al `Spinner`.

### 5.9 🟠 Radio y familia tipográfica inconsistentes por superficie

- **Actual:** `Card` = `rounded-xl`, `Dialog` = `rounded-lg`, algunos dashboards usan `rounded-2xl` ad-hoc, y el sitio público usa `rounded-xl`/`rounded-full` con `font-bold`/`font-black`.
- **Propuesta:** documentar la regla: **admin/CRM** → `rounded-lg` (modales) / `rounded-xl` (tarjetas y contenedores de tabla); **público/editorial** → `rounded-xl` y `rounded-full` con `font-bold`+. Eliminar `rounded-2xl` ad-hoc salvo en dashboards de KPI, donde debe ser una constante.

### 5.10 🟡 Tokens y archivos muertos o divergentes

| Hallazgo | Evidencia | Acción |
| --- | --- | --- |
| Duplicado de tema con valores shadcn por defecto (oklch) | `frontend/styles/globals.css` — **nadie lo importa** | Eliminar el archivo |
| Dark mode declarado pero sin implementar | `@custom-variant dark` en `globals.css:4`, muchos `dark:` en componentes, `colorScheme: 'light'` en `layout.tsx:78`, **sin bloque `.dark`** | Decidir: implementar el bloque `.dark` o retirar `dark:` de los primitivos |
| `--font-mono` apunta a Geist Mono no cargado | `globals.css:67` vs solo Montserrat en `layout.tsx:4-12` | Cargar Geist Mono con `next/font` o cambiar a `ui-monospace` |
| `--font-serif` duplica Montserrat | `globals.css:65-66` | No usar `font-serif`; documentar que no existe serif |
| `Pagination` sin uso y en inglés | `components/ui/pagination.tsx` | Traducir o eliminar; el patrón real es "Cargar más" |
| Primer solo de `slate-700` es casi `--secondary` (`#334155` vs `#374151`) | §2.2.1 y `globals.css:24` | No mezclar ambos en la misma tabla |

### 5.11 🟠 Paleta literal de tabla (`slate`) y deuda del primitivo `Table`

Tres decisiones abiertas que deja la estandarización de §2.2:

**(a) `slate` convive con tokens, no los reemplaza.**
La especificación de tablas usa la escala `slate` (`#F8FAFC`, `#E2E8F0`, `#64748B`) mientras el resto de la app usa tokens semánticos (`bg-muted` `#F3F4F6`, `border-border` `#E5E7EB`, `text-muted-foreground` `#6B7280`). Son grises **distintos**: slate es más frío y azulado. Riesgo real de que una tabla nueva se vea "de otro sistema".

- **Opción A (literal, la especificada):** tablas en `slate`, resto en tokens. Máxima fidelidad visual a la especificación. Coste: dos neutros en pantalla y `dark:` no funciona (slate no está mapeado a `.dark`).
- **Opción B (recomendada):** cambiar los **tokens** a valores slate — `--muted: #F8FAFC`, `--muted-foreground: #64748B`, `--border: #E2E8F0` — y usar clases semánticas en las tablas. Se ve igual, un solo neutro, y sigue funcionando con `.dark`.
- **Opción C:** añadir tokens de tabla (`--table-head-bg`, `--table-row-border`, `--table-row-hover`) y que §2.2 use `bg-table-head`, etc.

**Decisión pendiente del equipo.** Mientras se resuelve: una tabla **no debe mezclar** `bg-slate-50` con `bg-muted` en el mismo componente.

**(b) El primitivo `table.tsx` no cumple §2.2.**
Hoy emite `TableHead` = `h-10 px-2 font-medium whitespace-nowrap` y `TableCell` = `p-2`, sin `bg-slate-50`, sin `uppercase`, sin `tracking-wider`, sin `border-slate-*`. Recomedación: migrar el primitivo para que §2.2 sea el comportamiento por defecto y las tablas dejen de repetir las clases.

**(c) `cursor-pointer` debe subir al primitivo `Button`.**
Ver la evidencia en §2.2.4: Tailwind v4 no aplica `cursor: pointer` a botones. Repetir `cursor-pointer` en cada tabla es un parche; el fix estructural es agregarlo a `buttonVariants` (`frontend/components/ui/button.tsx`) y a `button` en el `@layer base` de `frontend/app/globals.css`. Afecta a **toda** la app, no solo a tablas.

---

## 6. Checklist para nuevos componentes

- [ ] Usa primitivos de `frontend/components/ui/*` y tokens semánticos; cero hex. **Excepción acotada:** tablas usan la escala `slate` de §2.2 (§5.11).
- [ ] Botones = variantes de `Button`; **todo control interactivo lleva `cursor-pointer`** (§2.2.4); icon-only con `aria-label` en español.
- [ ] Tablas: header `bg-slate-50` + `text-xs font-bold tracking-wider text-slate-500 uppercase` + `border-b border-slate-200` (§2.2.1).
- [ ] Tablas: contenedor `overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm`; filas `px-4 py-3.5` + `border-b border-slate-100` + `hover:bg-slate-50/50 transition-colors` (§2.2.2).
- [ ] Tablas: acciones en `flex items-center gap-1` con los estilos de §2.2.4, y `aria-label` **o** `title` en cada botón.
- [ ] Tablas: estados de carga (patrón A) y vacío (`Empty`) cubiertos.
- [ ] Badges de estado: `variant="outline"` + `*_CONFIG` exportado, con la tríada `-50/-200/-700` de §2.2.3 y §5.3.
- [ ] Formularios: `Field` + `Label` + `Input/Textarea/Select/Checkbox/Switch`; validación con `aria-invalid` + `FieldError`.
- [ ] Modales: `Dialog`/`ConfirmDialog` con Header/Body/Footer; destructive vía `ConfirmDialog variant="destructive"`.
- [ ] Feedback con `toast` de Sonner (`success` guinda documentado).
- [ ] Foco visible con `focus-visible:ring-[3px]` (nunca eliminar el ring — ni siquiera al usar las clases literales de acción de §2.2.4).
- [ ] Responsive: footer de modal apilado en móvil, tablas con scroll propio, grillas `sm:grid-cols-2 lg:grid-cols-4`.
- [ ] Todo texto visible sigue `ux-writing-es-mx.md` (tuteo, sin anglicismos).
- [ ] Si introduces un color, radio o tamaño nuevo: **primero** evalúa si debe ser un token en `globals.css`.

## 7. Archivos de referencia

| Archivo | Rol |
| --- | --- |
| `frontend/app/globals.css` | **Tokens de diseño, `@theme inline`, scrollbar, toasts de marca** |
| `frontend/app/layout.tsx` | Carga de Montserrat, metadata, `colorScheme` |
| `frontend/components/ui/button.tsx` | `buttonVariants` (CVA) — **falta `cursor-pointer` en las clases base, §2.2.4** |
| `frontend/components/ui/badge.tsx` | `badgeVariants` (CVA) |
| `frontend/components/ui/table.tsx` | Primitivos de tabla — **no cumple §2.2 todavía, §5.11(b)** |
| `frontend/components/ui/dialog.tsx` · `alert-dialog.tsx` · `confirm-dialog.tsx` | Modales |
| `frontend/components/ui/input.tsx` · `textarea.tsx` · `select.tsx` · `checkbox.tsx` · `radio-group.tsx` · `switch.tsx` | Controles |
| `frontend/components/ui/field.tsx` · `label.tsx` · `alert.tsx` | Composición y validación |
| `frontend/components/ui/skeleton.tsx` · `spinner.tsx` · `empty.tsx` · `progress.tsx` | Estados |
| `frontend/components/ui/toaster-custom.tsx` · `sonner.tsx` | Notificaciones |
| `frontend/components/tickets/TicketStatusBadge.tsx` · `TicketPriorityBadge.tsx` · `TicketTable.tsx` | Referencia de dominio (estados + tabla) |
| `frontend/components/admin/team/StatusBadges.tsx` · `UsersTable.tsx` | Referencia de badges y vacío con `Empty` |
| `frontend/components/public/public-nav.tsx` · `public-footer.tsx` · `eventos-section.tsx` | Familia de CTAs públicas |
| `frontend/lib/utils.ts` | `cn()` |
| `frontend/components.json` | Config shadcn/ui |
| `docs/ux-writing-es-mx.md` | Reglas de texto de la interfaz |
