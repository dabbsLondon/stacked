import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH is set by the GitHub Pages workflow to '/<repo-name>/' so asset
// URLs resolve correctly when the site is served from a project page. Falls
// back to '/' for local dev and root-deploys (Netlify, Cloudflare Pages).
declare const process: { env: Record<string, string | undefined> };
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173, open: false },
});
