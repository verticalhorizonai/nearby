// Client entry (task 1; spec 3.1). The fonts are bundled from @fontsource, never fetched from another host at run time
// (spec 3.11.2 Type; REQ-08-04): Inter 400-700 for text, Bricolage Grotesque 700/800 for the name, headlines,
// prices and step numbers.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@/styles/globals.css';
import { App } from '@/client/App';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
