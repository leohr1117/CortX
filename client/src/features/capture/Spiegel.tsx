import { type ReactNode, type RefObject } from 'react';
import { findeTags, type TagFund } from '../../../../shared/features/tags/index.ts';

export function Spiegel({
  text,
  tag,
  spiegel,
}: {
  text: string;
  tag: TagFund | null;
  spiegel: RefObject<HTMLDivElement | null>;
}) {
  const marken = findeTags(text);
  if (tag && tag.name === '' && !marken.some((fund) => fund.start === tag.start)) {
    marken.push(tag);
    marken.sort((a, b) => a.start - b.start);
  }
  const kinder: ReactNode[] = [];
  let cursor = 0;
  for (const fund of marken) {
    if (fund.start > cursor) {
      kinder.push(<span key={`t-${cursor}`}>{text.slice(cursor, fund.start)}</span>);
    }
    const hier = tag !== null && tag.start === fund.start;
    kinder.push(
      <span className={hier ? 'tag hier' : 'tag'} key={`g-${fund.start}`}>
        {text.slice(fund.start, fund.end)}
      </span>,
    );
    cursor = fund.end;
  }
  if (cursor < text.length) kinder.push(<span key={`t-${cursor}`}>{text.slice(cursor)}</span>);
  if (text.endsWith('\n')) kinder.push('\u200b');
  return (
    <div className="spiegel" ref={spiegel} aria-hidden="true">
      {kinder}
    </div>
  );
}
