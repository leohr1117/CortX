import { createBrowserRouter, RouterProvider } from 'react-router';
import { CaptureAnsicht } from './features/capture/index.ts';
import { LibraryPlatzhalter } from './features/library/index.ts';

const router = createBrowserRouter([
  { path: '/', element: <CaptureAnsicht /> },
  { path: '/library', element: <LibraryPlatzhalter /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
