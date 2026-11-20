import { createBrowserRouter, RouterProvider } from 'react-router';
import { CaptureAnsicht } from './features/capture/index.ts';
import { NotizSeite } from './features/edit/index.ts';
import { LibraryAnsicht, ThemaAnsicht } from './features/library/index.ts';
import { RechtSeite } from './features/recht/index.ts';
import { NeuSeite } from './features/version/index.ts';
import { Rahmen, SitzungProvider } from './features/zugang/index.ts';

const router = createBrowserRouter([
  { path: '/impressum', element: <RechtSeite schluessel="impressum" /> },
  { path: '/datenschutz', element: <RechtSeite schluessel="datenschutz" /> },
  {
    element: <Rahmen />,
    children: [
      { path: '/', element: <CaptureAnsicht /> },
      { path: '/library', element: <LibraryAnsicht /> },
      { path: '/library/topic', element: <ThemaAnsicht /> },
      { path: '/library/note', element: <NotizSeite /> },
      { path: '/library/whats-new', element: <NeuSeite /> },
    ],
  },
]);

export function App() {
  return (
    <SitzungProvider>
      <RouterProvider router={router} />
    </SitzungProvider>
  );
}
