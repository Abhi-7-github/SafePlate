# React + Vite

## Deployed
- Client (Netlify): https://safeplate7.netlify.app/
- Server (Render): https://safeplate-h5oz.onrender.com

## Production config
Set VITE_API_BASE_URL=https://safeplate-h5oz.onrender.com when building on Netlify.

If you prefer to avoid CORS, Netlify can proxy API calls: the repo includes `client/public/_redirects` to forward `/api/*` to the Render server.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

