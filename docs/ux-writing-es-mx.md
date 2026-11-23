# Guia de UX writing y localizacion (espanol MX/LatAm)

Esta guia define el estilo editorial para la interfaz de Nexo Comercial en espanol latinoamericano, con prioridad en usos naturales de Mexico. Su objetivo es mantener mensajes claros, consistentes y confiables en toda la plataforma.

## Quick path

1. Escribe primero la version mas directa del mensaje (accion + resultado esperado).
2. Verifica tono y localizacion con las reglas de esta guia (tuteo consistente, neutralidad, lenguaje simple).
3. Pasa la checklist antes de publicar y corrige cualquier alerta.

## Decisiones base

| Tema                   | Decision                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Tratamiento al usuario | Usar tuteo consistente: `tu`, `ingresa`, `selecciona`, `consulta`.                                     |
| Variante de espanol    | Espanol latinoamericano neutral con preferencia de Mexico.                                             |
| Tono                   | Cercano, claro y confiable. Institucional sin burocracia.                                              |
| Inclusion              | Priorizar redaccion neutra natural (`la comunidad`, `las personas`) sin forzar barras (`informada/o`). |
| Complejidad            | Frases cortas, una idea principal por oracion.                                                         |
| Tecnicismos            | Evitar lenguaje tecnico si existe alternativa simple.                                                  |
| Anglicismos            | Evitar traducciones literales y anglicismos innecesarios.                                              |

## Reglas de redaccion

- Escribe para primera lectura: el usuario debe entender que hacer en menos de 3 segundos.
- Empieza por la accion: verbo en imperativo claro (`Registra`, `Confirma`, `Consulta`).
- Mantiene consistencia visual y editorial: mismo termino para la misma accion.
- Evita mayusculas innecesarias en titulos y botones.
- En formularios, especifica formato esperado dentro del campo o ayuda corta.
- En mensajes de error, indica el problema y la accion correctiva.

## Patrones recomendados

| Caso                    | Recomendado                                                      | Evitar                                 |
| ----------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| CTA principal           | `Enviar registro`, `Confirmar asistencia`                        | `Procesar solicitud`                   |
| CTA secundaria          | `Conoce los ejes de atencion`                                    | `Conocer eje de gestion`               |
| Placeholder telefono    | `WhatsApp (10 digitos)` o `Telefono (10 digitos, con o sin +52)` | `Telefono` (sin formato)               |
| Error de validacion     | `Ingresa un correo valido.`                                      | `Correo no valido.` (si no hay accion) |
| Error de consentimiento | `Debes aceptar el tratamiento de datos personales.`              | `Consentimiento invalido`              |
| Confirmacion            | `Registro confirmado`                                            | `Registrado` (si puede sonar ambiguo)  |
| Estado vacio            | `Esta semana no hay jornadas publicadas.`                        | `Sin datos`                            |

## Lista de palabras y giros a evitar

- Voseo en productos para Mexico: `Registrate`, `Buscá`, `Seleccioná`, `Consultá`, `Usá`, `Intentá`, `Ingresá`, `Debés`.
- Inclusivo con barra: `informada/o`, `suscrita/o` (preferir alternativa natural).
- Calcos de ingles: `Selecciona todos los que apliquen`.
- Terminos innecesariamente tecnicos: `gobernanza municipal` (si `gestion municipal` comunica mejor).

## Terminos preferidos

- `Ejes de atencion` (sobre `ejes de gestion`, cuando sea navegacion/CTA).
- `Canal` o `asistente` (sobre `bot`, segun contexto de producto).
- `Gestion municipal` (sobre `gobernanza municipal`, si el publico es general).
- `Mantente al tanto` (sobre formulas con barra).

## Checklist de publicacion

- [ ] El texto se entiende a la primera lectura.
- [ ] Todo el flujo usa tuteo consistente.
- [ ] No hay voseo ni expresiones regionales que confundan en Mexico.
- [ ] No hay anglicismos innecesarios ni tecnicismos evitables.
- [ ] El CTA principal es concreto y orientado a accion.
- [ ] Los errores explican como corregir el problema.
- [ ] Se mantiene tono cercano, confiable y claro.

## Aplicacion en el proyecto

Esta guia aplica a toda la UI publica y autenticada, con prioridad en:

- `frontend/components/public`
- `frontend/components/auth`
- `frontend/hooks/useRegistroCiudadano.ts`
- `frontend/lib/registro-errors.ts`

Si aparece un caso no cubierto, prioriza claridad para usuarios de Mexico y documenta la decision en esta misma guia.
