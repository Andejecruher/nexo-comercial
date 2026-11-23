import * as React from 'react';
import { BrandLayout } from './BrandLayout';
import { CallToAction, LinkFallback, Paragraph, Title } from './components';

export type NotificationProps = {
  recipientName?: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  footnote?: string;
};

export const notificationSubject = (props: NotificationProps): string => props.title;

export function NotificationEmail(props: NotificationProps): React.ReactElement {
  const hasAction = Boolean(props.actionUrl && props.actionLabel);

  return (
    <BrandLayout preview={props.title} eyebrow="Notificación">
      <Title>{props.title}</Title>
      {props.recipientName ? <Paragraph>Hola {props.recipientName},</Paragraph> : null}
      <Paragraph>{props.message}</Paragraph>
      {hasAction && props.actionUrl && props.actionLabel ? (
        <>
          <CallToAction href={props.actionUrl} label={props.actionLabel} />
          <LinkFallback href={props.actionUrl} />
        </>
      ) : null}
      {props.footnote ? <Paragraph muted>{props.footnote}</Paragraph> : null}
    </BrandLayout>
  );
}
