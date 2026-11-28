// Reads the data tables of the game's Lua config files (`pg.base.name[id] = { ... }`) without
// running any Lua. Only literals: strings, numbers, booleans, nil and nested tables. A table with
// only positional entries becomes an array (an empty one too), any keyed entry makes an object.

type LuaValue = string | number | boolean | null | LuaValue[] | { [key: string]: LuaValue };

export function parseLuaRecords(source: string, table: string) {
  const records = new Map<number, LuaValue>();
  const start = new RegExp(String.raw`pg\.base\.${table}\[(\d+)\]\s*=\s*`, 'g');
  for (let match = start.exec(source); match; match = start.exec(source)) {
    const reader = new Reader(source, start.lastIndex);
    records.set(Number(match[1]), reader.value());
    start.lastIndex = reader.at;
  }
  return records;
}

class Reader {
  source: string;
  at: number;
  constructor(source: string, at: number) {
    this.source = source;
    this.at = at;
  }
  fail(message: string): never {
    throw new Error(message + ' at ' + this.at + ': ' + JSON.stringify(this.source.slice(this.at, this.at + 40)));
  }
  space() {
    for (;;) {
      const rest = /^(?:\s+|--[^\n]*)/.exec(this.source.slice(this.at, this.at + 4096));
      if (!rest) return;
      this.at += rest[0].length;
    }
  }
  value(): LuaValue {
    this.space();
    const c = this.source[this.at];
    if (c === '{') return this.table();
    if (c === '"' || c === "'") return this.string();
    const word = /^(?:true|false|nil)\b|^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(this.source.slice(this.at, this.at + 64));
    if (!word) this.fail('Unexpected value');
    this.at += word[0].length;
    return word[0] === 'true' ? true : word[0] === 'false' ? false : word[0] === 'nil' ? null : Number(word[0]);
  }
  string() {
    const quote = this.source[this.at++];
    let text = '';
    for (;;) {
      const c = this.source[this.at++];
      if (c === undefined) this.fail('Unterminated string');
      if (c === quote) return text;
      if (c !== '\\') { text += c; continue; }
      const e = this.source[this.at++];
      const digits = /^\d{1,3}/.exec(this.source.slice(this.at - 1, this.at + 2));
      if (digits) {
        this.at += digits[0].length - 1;
        text += String.fromCharCode(Number(digits[0]));
      } else text += ({ n: '\n', r: '\r', t: '\t' } as Record<string, string>)[e] ?? e;
    }
  }
  table() {
    this.at++;
    const list: LuaValue[] = [];
    const keyed: Record<string, LuaValue> = {};
    let hasKeys = false;
    for (;;) {
      this.space();
      if (this.source[this.at] === '}') { this.at++; break; }
      let key: string | undefined;
      const name = /^([A-Za-z_]\w*)\s*=(?!=)/.exec(this.source.slice(this.at, this.at + 128));
      if (name) {
        key = name[1];
        this.at += name[0].length;
      } else if (this.source[this.at] === '[') {
        this.at++;
        const index = this.value();
        this.space();
        if (this.source[this.at] !== ']') this.fail('Expected ]');
        this.at++;
        this.space();
        if (this.source[this.at] !== '=') this.fail('Expected =');
        this.at++;
        key = String(index);
      }
      const value = this.value();
      if (key === undefined) list.push(value);
      else { keyed[key] = value; hasKeys = true; }
      this.space();
      const c = this.source[this.at];
      if (c === ',' || c === ';') this.at++;
      else if (c !== '}') this.fail('Expected , or }');
    }
    if (!hasKeys) return list;
    list.forEach((value, index) => { keyed[String(index + 1)] = value; });
    return keyed;
  }
}
