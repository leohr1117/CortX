import { useLayoutEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { rollenMaxPx } from './liste.ts';

function rahmenPx(stil: CSSStyleDeclaration): number {
  return (
    (parseFloat(stil.paddingTop) || 0) +
    (parseFloat(stil.paddingBottom) || 0) +
    (parseFloat(stil.borderTopWidth) || 0) +
    (parseFloat(stil.borderBottomWidth) || 0)
  );
}

function begrenze(aussen: HTMLElement, liste: HTMLElement): void {
  const stil = getComputedStyle(aussen);
  const fuss = aussen.querySelector(':scope > .neu-fest');
  const fussPx = fuss instanceof HTMLElement ? fuss.offsetHeight : 0;
  const ziel = rollenMaxPx(parseFloat(stil.maxHeight), fussPx, rahmenPx(stil));
  const text = ziel === null ? '' : `${ziel}px`;
  if (liste.style.maxHeight !== text) liste.style.maxHeight = text;
}

function zeige(liste: HTMLElement, ziel: HTMLElement): void {
  const kante = liste.getBoundingClientRect();
  const rect = ziel.getBoundingClientRect();
  if (rect.top < kante.top) liste.scrollTop -= kante.top - rect.top;
  else if (rect.bottom > kante.bottom) liste.scrollTop += rect.bottom - kante.bottom;
}

export function ListeMitNeu({
  id,
  className,
  style,
  label,
  aktivId,
  neu,
  onPointerDown,
  children,
}: {
  id?: string;
  className?: string;
  style?: CSSProperties;
  label?: string;
  aktivId?: string;
  neu?: ReactNode;
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
  children: ReactNode;
}) {
  const rolleRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const liste = rolleRef.current;
    const aussen = liste?.parentElement;
    if (!liste || !aussen) return;
    const passe = () => begrenze(aussen, liste);
    passe();
    const beobachter = new ResizeObserver(passe);
    beobachter.observe(aussen);
    const fuss = aussen.querySelector(':scope > .neu-fest');
    if (fuss instanceof HTMLElement) beobachter.observe(fuss);
    return () => beobachter.disconnect();
  });
  useLayoutEffect(() => {
    const liste = rolleRef.current;
    if (!liste || !aktivId) return;
    const ziel = document.getElementById(aktivId);
    if (!ziel || !liste.contains(ziel)) return;
    zeige(liste, ziel);
  }, [aktivId]);
  useLayoutEffect(() => {
    const liste = rolleRef.current;
    const fuss = liste?.parentElement?.querySelector(':scope > .neu-fest');
    if (!liste || !(fuss instanceof HTMLElement)) return;
    const rad = (event: WheelEvent) => {
      if (liste.scrollHeight <= liste.clientHeight + 1) return;
      const schritt =
        event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * liste.clientHeight : event.deltaY;
      liste.scrollTop += schritt;
      event.preventDefault();
    };
    fuss.addEventListener('wheel', rad, { passive: false });
    return () => fuss.removeEventListener('wheel', rad);
  });
  const klasse = ['mit-neu', className].filter((teil) => teil && teil.length > 0).join(' ');
  return (
    <div id={id} className={klasse} style={style} role="listbox" aria-label={label} onPointerDown={onPointerDown}>
      <div className="rolle" ref={rolleRef}>
        {children}
      </div>
      {neu ? <div className="neu-fest">{neu}</div> : null}
    </div>
  );
}
