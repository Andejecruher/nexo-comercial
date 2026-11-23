import { render } from '@react-email/render';
import { type FunctionComponent, createElement } from 'react';
import {
  type EmailTemplateName,
  type EmailTemplateProps,
  emailTemplates,
} from './templates/registry';

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
  category: string;
};

/**
 * Renderiza una plantilla a las tres representaciones que necesita el proveedor.
 * React Email escapa el contenido interpolado, por lo que las plantillas no
 * requieren saneamiento manual.
 */
export async function renderEmailTemplate<TName extends EmailTemplateName>(
  template: TName,
  props: EmailTemplateProps<TName>,
): Promise<RenderedEmail> {
  const definition = emailTemplates[template];
  // El índice genérico pierde la relación componente/props; el registro la garantiza,
  // así que se borra el genérico para poder construir el elemento.
  const component = definition.component as FunctionComponent<Record<string, unknown>>;
  const subject = definition.subject as (props: EmailTemplateProps<TName>) => string;

  const element = createElement(component, props as Record<string, unknown>);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

  return { subject: subject(props), html, text, category: definition.category };
}
