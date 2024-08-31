// https://github.com/imputnet/cobalt/blob/afa33c404355e1a00d884a2db837233bca54f7f6/src/modules/processing/cookie/manager.js
import { Cookie } from './cookie'
import { parse as parseSetCookie, splitCookiesString } from 'set-cookie-parser';
import { StrObj } from '../types'
import { AxiosResponseHeaders, RawAxiosResponseHeaders } from 'axios'

export function updateCookie(cookie: Cookie, headers: RawAxiosResponseHeaders | AxiosResponseHeaders) {
  if (!cookie) return;
  const setCookieHeader = headers['set-cookie']
  if (!setCookieHeader) return;

  const parsed = parseSetCookie(
    splitCookiesString(setCookieHeader),
    { decodeValues: false }
  )
  const values: StrObj = {}

  cookie.unset(parsed.filter(c => c.expires && c.expires < new Date()).map(c => c.name));
  parsed.filter(c => !c.expires || c.expires > new Date()).forEach(c => values[c.name] = c.value);
  updateCookieValues(cookie, values);
}

export function updateCookieValues(cookie: Cookie, values: StrObj) {
  cookie.set(values);
}
