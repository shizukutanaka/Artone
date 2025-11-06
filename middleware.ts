import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './src/i18n';

export default createMiddleware({
  // A list of all locales that are supported
  locales: locales,

  // Used when no locale matches
  defaultLocale: defaultLocale,

  // Automatic locale detection
  localeDetection: true
});

export const config = {
  // Match only internationalized pathnames
  matcher: ['/', '/(ja|es|fr|de|ar|zh|ko|ru|pt|hi|bn|ta|te|it|nl|sv|no|da|fi|pl|cs|hu|ro|bg|hr|sr|af|ms|tl|sw|th|vi|he|fa|ur|en-GB|en-AU|en-CA|zh-TW|ja|es|fr|de|zh|ko|ru|pt|hi|ar|pt-BR|es-MX|fr-CA)/:path*']
};
