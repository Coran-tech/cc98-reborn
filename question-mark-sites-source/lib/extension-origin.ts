const CHROME_EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

export function allowedExtensionOrigin(origin: string | null): string | null {
  return origin && CHROME_EXTENSION_ORIGIN.test(origin) ? origin : null;
}
