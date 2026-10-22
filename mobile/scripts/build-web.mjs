import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The website is deployed from repository root. Bundle ONLY public client files
// for mobile; never copy .github/, supabase/functions/, migrations or secrets.
export const PUBLIC_ASSETS = Object.freeze([
  'index.html', 'login.html', 'admin.html',
  'mobile.css', 'support.css',
  'admin-link.js', 'admin.js', 'support-client.js',
  'app-version.json', 'manifest.webmanifest', 'icon.svg', 'icon-180.png',
]);

export const WEBSITE_RETURN_URL = 'https://po-grafiku.ru/index.html';
export const MOBILE_AUTH_REWRITES = Object.freeze([
  ["emailRedirectTo:location.origin+location.pathname", "emailRedirectTo:'" + WEBSITE_RETURN_URL + "'"],
  ["redirectTo:location.origin+location.pathname", "redirectTo:'" + WEBSITE_RETURN_URL + "'"],
]);

const root = fileURLToPath(new URL('../../', import.meta.url));
const target = fileURLToPath(new URL('../www/', import.meta.url));

export function rewriteMobileAuth(html, filename) {
  for (const [from, to] of MOBILE_AUTH_REWRITES) {
    if (!html.includes(from)) {
      throw new Error(filename + ': missing expected Supabase email redirect. Re-check auth flow before building.');
    }
    html = html.replaceAll(from, to);
  }
  return html;
}

export async function buildWeb() {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const name of PUBLIC_ASSETS) {
    const source = path.join(root, name);
    const destination = path.join(target, name);
    await cp(source, destination);
  }
  for (const name of ['index.html', 'login.html']) {
    const destination = path.join(target, name);
    const html = await readFile(destination, 'utf8');
    if (!/<head(?:\s|>)/i.test(html)) throw new Error(name + ': <head> is required by Capacitor');
    await writeFile(destination, rewriteMobileAuth(html, name), 'utf8');
  }
  console.log('Mobile web bundle ready: mobile/www (' + PUBLIC_ASSETS.length + ' public files)');
  console.log('Email confirmation/recovery deliberately returns to po-grafiku.ru until native deep links are implemented.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildWeb().catch(e => { console.error(e); process.exitCode = 1; });
}
