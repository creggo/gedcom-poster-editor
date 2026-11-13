import type { Ev, Person, Tree } from './types.ts';

interface Node { tag: string; val: string; xref: string | null; kids: Node[]; }

function parseNodes(text: string): Node[] {
  const top: Node[] = [], stack: Node[] = [];
  for (const raw of text.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const m = raw.match(/^\s*(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?: (.*))?$/);
    if (!m) continue;
    const level = +m[1], tag = m[3].toUpperCase(), val = m[4] ?? '';
    const parent = stack[level - 1];
    if (parent && (tag === 'CONC' || tag === 'CONT')) { parent.val += (tag === 'CONT' ? '\n' : '') + val; continue; }
    const node: Node = { tag, val, xref: m[2] ?? null, kids: [] };
    (level === 0 ? top : parent?.kids)?.push(node);
    stack.length = level; stack[level] = node;
  }
  return top;
}
const sub = (n: Node, tag: string) => n.kids.find((k) => k.tag === tag);
const subs = (n: Node, tag: string) => n.kids.filter((k) => k.tag === tag);
const id = (x: string) => x.replace(/@/g, '');
const year = (d: string | null) => d?.match(/\b(\d{3,4})\b/)?.[1] ?? '';

function ev(n: Node, tag: string): Ev {
  const e = sub(n, tag);
  if (!e) return null;
  const date = sub(e, 'DATE')?.val.trim() || null, place = sub(e, 'PLAC')?.val.trim() || null;
  return date || place ? { date, place } : null;
}

export function parseGedcom(text: string): Tree {
  const nodes = parseNodes(text), people: Record<string, Person> = {}, parents: Tree['parents'] = {};
  const nowYear = new Date().getFullYear();
  for (const n of nodes.filter((n) => n.tag === 'INDI' && n.xref)) {
    const name = sub(n, 'NAME'), m = name?.val.match(/^([^/]*)\/([^/]*)\/\s*(.*)$/);
    const birth = ev(n, 'BIRT'), death = ev(n, 'DEAT') ?? ev(n, 'BURI');
    const by = year(birth?.date ?? null);
    people[id(n.xref!)] = {
      id: id(n.xref!),
      given: (name && sub(name, 'GIVN')?.val) || (m ? m[1].trim() : name?.val.trim() ?? ''),
      surname: (name && sub(name, 'SURN')?.val) || (m ? m[2].trim() : ''),
      suffix: (name && sub(name, 'NSFX')?.val) || (m ? m[3].trim() : ''),
      sex: sub(n, 'SEX')?.val.trim().toLowerCase() ?? null,
      // shortcut: living = known recent birth and no death record; people with no dates at all are shown, not hidden
      living: !death && !sub(n, 'DEAT') && !!by && +by > nowYear - 100,
      sort: by, birth, death, children: [], spouses: [],
      // photo files the GEDCOM itself points at (OBJE > FILE), kept as bare file names for matching uploads
      files: subs(n, 'OBJE').flatMap((o) => subs(o, 'FILE').map((f) => f.val.trim().split(/[\\/]/).pop()!)).filter(Boolean),
    };
  }
  for (const f of nodes.filter((n) => n.tag === 'FAM')) {
    const h = sub(f, 'HUSB') ? id(sub(f, 'HUSB')!.val) : null, w = sub(f, 'WIFE') ? id(sub(f, 'WIFE')!.val) : null;
    const kids = subs(f, 'CHIL').map((c) => id(c.val)).filter((k) => people[k]);
    const hp = h && people[h] ? h : null, wp = w && people[w] ? w : null;
    if (hp && wp) { people[hp].spouses.push(wp); people[wp].spouses.push(hp); }
    for (const k of kids) {
      for (const p of [hp, wp]) if (p) people[p].children.push(k);
      if (!parents[k] && (hp || wp)) parents[k] = [hp, wp];
    }
  }
  return { people, parents };
}

export const displayName = (p: Person) => [p.given, p.surname].filter(Boolean).join(' ') || '(unnamed)';
