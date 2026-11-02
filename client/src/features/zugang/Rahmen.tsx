import { Outlet } from 'react-router';
import { KartenHost } from '../../ui/karte.tsx';
import { UpdateHinweis } from '../version/index.ts';
import { naechsteAnsicht } from './ansicht.ts';
import { Anmeldung } from './Anmeldung.tsx';
import { useSitzung } from './Sitzung.tsx';

export function Rahmen() {
  const { modus, online } = useSitzung();
  const ansicht = naechsteAnsicht(modus, online);
  if (ansicht === 'warte') return <div className="app" />;
  if (ansicht === 'login') return <Anmeldung />;
  return (
    <>
      <Outlet />
      <KartenHost />
      <UpdateHinweis />
    </>
  );
}
