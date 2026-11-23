/**
 * Anthropic SDK es opcional (import dinámico en providers). No está en `dependencies`
 * del backend; esta declaración evita TS2307 en el chequeo de readiness.
 */
declare module '@anthropic-ai/sdk' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Anthropic: any;
  export default Anthropic;
}
