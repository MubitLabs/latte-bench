export function completionURL(base) {
  const url = new URL(base);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('API URL must use HTTP or HTTPS.');
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!url.pathname.endsWith('/chat/completions')) url.pathname += '/chat/completions';
  return url.toString();
}
