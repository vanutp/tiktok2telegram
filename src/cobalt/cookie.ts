// https://github.com/imputnet/cobalt/blob/afa33c404355e1a00d884a2db837233bca54f7f6/src/modules/processing/cookie/cookie.js
import { strict as assert } from 'node:assert'
import { StrObj } from '../types'

export class Cookie {
  private _values: StrObj

  constructor(input: StrObj) {
    assert(typeof input === 'object')
    this._values = {}
    this.set(input)
  }

  set(values: StrObj) {
    Object.entries(values).forEach(
      ([key, value]) => this._values[key] = value,
    )
  }

  unset(keys: string[]) {
    for (const key of keys) delete this._values[key]
  }

  static fromString(str: string) {
    const obj: StrObj = {}

    str.split('; ').forEach(cookie => {
      const key = cookie.split('=')[0]
      const value = cookie.split('=').splice(1).join('=')
      obj[key] = value
    })

    return new Cookie(obj)
  }

  toString() {
    return Object.entries(this._values).map(([name, value]) => `${name}=${value}`).join('; ')
  }

  toJSON() {
    return this.toString()
  }

  values() {
    return Object.freeze({ ...this._values })
  }
}
