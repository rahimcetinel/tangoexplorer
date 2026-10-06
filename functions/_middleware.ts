// Cloudflare Pages edge middleware.
// Drops common exploit/scanner traffic before it reaches static assets.
// The site is fully static, so PHP/WordPress/admin probes are always bogus.

const BLOCKED_PATHS: RegExp[] = [
  /^\/wp-(admin|login|content|includes|json|sitemap|config|activate|cron)/i,
  /\/(xmlrpc|phpinfo|install|setup|shell|webshell|adminer|filemanager|backup|db)\.php/i,
  /\.(php|phtml|php[0-9]|asp|aspx|jsp|cgi|pl|env)$/i,
  /^\/\.(env|git|svn|hg|aws|ssh|htaccess|htpasswd|idea|vscode)/i,
  /\/(phpmyadmin|pma|myadmin|mysql|drupal|typo3|joomla|administrator|wordpress)(\/|$)/i,
  /^\/(cgi-bin|vendor\/phpunit|wlwmanifest\.xml|xmlrpc\.php)/i,
];

const BLOCKED_UA: RegExp =
  /(sqlmap|nikto|nmap|masscan|zgrab|xray|acunetix|nessus|wpscan|dirbuster|gobuster|feroxbuster|nuclei|w3af|commix|joomscan|hydra|libwww-perl)/i;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const onRequest: PagesFunction = async (context) => {
  const { request, next } = context;
  const { pathname } = new URL(request.url);

  // Never touch Cloudflare-internal routes (analytics beacon etc.).
  if (pathname.startsWith('/cdn-cgi/')) {
    return next();
  }

  if (!SAFE_METHODS.has(request.method.toUpperCase())) {
    return new Response('Method not allowed', { status: 405, headers: { 'x-edge-block': 'method' } });
  }

  if (BLOCKED_PATHS.some((pattern) => pattern.test(pathname))) {
    return new Response('Not found', { status: 404, headers: { 'x-edge-block': 'path' } });
  }

  const userAgent = request.headers.get('user-agent') || '';
  if (BLOCKED_UA.test(userAgent)) {
    return new Response('Forbidden', { status: 403, headers: { 'x-edge-block': 'ua' } });
  }

  return next();
};
