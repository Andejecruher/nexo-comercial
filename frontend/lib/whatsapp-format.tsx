import type { ReactNode } from 'react';

type Mark = { token: string; render: (children: ReactNode, key: number) => ReactNode };

// Longest delimiter wins; code is opaque, while other marks may contain nested marks.
const marks: Mark[] = [
  {
    token: '```',
    render: (children, key) => (
      <code key={key} className="rounded bg-slate-100 px-0.5 font-mono break-all">
        {children}
      </code>
    ),
  },
  { token: '*', render: (children, key) => <strong key={key}>{children}</strong> },
  { token: '_', render: (children, key) => <em key={key}>{children}</em> },
  { token: '~', render: (children, key) => <s key={key}>{children}</s> },
];

function escaped(text: string, index: number) {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) slashes++;
  return slashes % 2 === 1;
}

/** Parse WhatsApp marks into safe React nodes. Unknown text remains ordinary text. */
export function renderWhatsAppInline(text: string): ReactNode[] {
  const result: ReactNode[] = [];
  let plain = '';
  const flush = () => {
    if (plain) result.push(plain);
    plain = '';
  };
  for (let i = 0; i < text.length; ) {
    const mark = marks.find(({ token }) => text.startsWith(token, i));
    if (!mark || escaped(text, i) || (i > 0 && !/[\s([{"'*_~]/.test(text[i - 1]))) {
      plain += text[i++];
      continue;
    }
    const start = i + mark.token.length;
    let end = text.indexOf(mark.token, start);
    while (
      end !== -1 &&
      (escaped(text, end) ||
        !text.slice(start, end).trim() ||
        /\s/.test(text[start]) ||
        /\s/.test(text[end - 1]) ||
        (text[end + mark.token.length] &&
          !/[\s.,!?;:)}\]"'*_~]/.test(text[end + mark.token.length])))
    ) {
      end = text.indexOf(mark.token, end + mark.token.length);
    }
    if (end === -1) {
      plain += text[i++];
      continue;
    }
    flush();
    const content = text.slice(start, end);
    result.push(
      mark.render(mark.token === '```' ? content : renderWhatsAppInline(content), result.length),
    );
    i = end + mark.token.length;
  }
  flush();
  return result;
}

/** Line prefixes are recognized only at the beginning of complete lines. */
export function renderWhatsAppText(text: string): ReactNode {
  // Multiline monospace takes precedence over line prefixes and inline marks.
  // A single-line code span remains with the inline parser below.
  let opening = text.indexOf('```');
  while (opening !== -1) {
    const validStart =
      !escaped(text, opening) && (opening === 0 || /[\s([{"']/.test(text[opening - 1]));
    let closing = validStart ? text.indexOf('```', opening + 3) : -1;
    while (closing !== -1 && escaped(text, closing)) closing = text.indexOf('```', closing + 3);
    if (
      closing !== -1 &&
      !escaped(text, closing) &&
      text.slice(opening + 3, closing).includes('\n') &&
      text.slice(opening + 3, closing).trim()
    ) {
      const before = text.slice(0, opening);
      const content = text.slice(opening + 3, closing);
      const after = text.slice(closing + 3);
      return (
        <>
          {before && renderWhatsAppText(before)}
          <pre className="max-w-full whitespace-pre-wrap break-all rounded bg-slate-100 p-1 font-mono">
            <code>{content}</code>
          </pre>
          {after && renderWhatsAppText(after)}
        </>
      );
    }
    opening = text.indexOf('```', opening + 3);
  }
  const lines = text.split('\n');
  const result: ReactNode[] = [];
  for (let i = 0; i < lines.length; ) {
    const numbered = /^(\d+)\. (.+)$/.exec(lines[i]);
    const bulleted = /^- (.+)$/.exec(lines[i]);
    if (numbered || bulleted) {
      const ordered = !!numbered;
      const items: ReactNode[] = [];
      const start = i;
      while (i < lines.length) {
        const match = ordered ? /^(\d+)\. (.+)$/.exec(lines[i]) : /^- (.+)$/.exec(lines[i]);
        if (!match) break;
        items.push(
          <li key={i} className="pl-0.5">
            {renderWhatsAppInline(ordered ? match[2] : match[1])}
          </li>,
        );
        i++;
      }
      result.push(
        ordered ? (
          <ol key={start} start={Number(numbered![1])} className="list-decimal space-y-0 pl-5">
            {items}
          </ol>
        ) : (
          <ul key={start} className="list-disc space-y-0 pl-5">
            {items}
          </ul>
        ),
      );
      continue;
    }
    const quote = /^> (.+)$/.exec(lines[i]);
    if (quote) {
      result.push(
        <blockquote key={i} className="border-l-2 border-slate-400 pl-2 text-slate-700">
          {renderWhatsAppInline(quote[1])}
        </blockquote>,
      );
    } else {
      result.push(
        <div key={i} className="min-h-[1.4em]">
          {renderWhatsAppInline(lines[i])}
        </div>,
      );
    }
    i++;
  }
  return result;
}
