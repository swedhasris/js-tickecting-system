import '../css/app.css';
import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';

// ─── Inertia App Bootstrap ────────────────────────────────────────────────────
// Pages are resolved from resources/js/Pages/*.tsx
// Each page receives its props directly from the Laravel controller
// The existing React components, contexts, and UI are 100% preserved.

createInertiaApp({
    title: (title) => `${title} | TechnoSprint Ticketing`,
    resolve: (name) =>
        resolvePageComponent(
            `./Pages/${name}.tsx`,
            import.meta.glob('./Pages/**/*.tsx'),
        ),
    setup({ el, App, props }) {
        createRoot(el).render(<App {...props} />);
    },
    progress: {
        color: '#3b82f6',
        showSpinner: true,
    },
});
