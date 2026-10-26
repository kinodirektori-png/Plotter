import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Strict Content Security Policy for the production build. The app makes no
// network requests at all, so everything except same-origin assets is denied.
// Inline styles are allowed because React Flow positions nodes with them.
// (Skipped in dev, where Vite's HMR preamble needs an inline script.)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const cspPlugin = (): Plugin => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
})

export default defineConfig({
  // Relative asset paths so the static build works from any sub-path (e.g. GitHub Pages).
  base: './',
  plugins: [react(), tailwindcss(), cspPlugin()],
})
