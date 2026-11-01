import { createBrowserRouter, RouterProvider } from 'react-router';
import { CaptureAnsicht } from './features/capture/index.ts';
import { LibraryAnsicht, ThemaAnsicht } from './features/library/index.ts';

const router = createBrowserRouter([
  { path: '/', element: <CaptureAnsicht /> },
  { path: '/library', element: <LibraryAnsicht /> },
  { path: '/library/topic', element: <ThemaAnsicht /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
