import { createBrowserRouter, RouterProvider } from 'react-router';
import { CaptureAnsicht } from './features/capture/index.ts';
import { BearbeitenAnsicht } from './features/edit/index.ts';
import { LibraryAnsicht, ThemaAnsicht } from './features/library/index.ts';

const router = createBrowserRouter([
  { path: '/', element: <CaptureAnsicht /> },
  { path: '/library', element: <LibraryAnsicht /> },
  { path: '/library/topic', element: <ThemaAnsicht /> },
  { path: '/library/note', element: <BearbeitenAnsicht /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
