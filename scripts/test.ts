import { readFileSync } from 'node:fs';
import { parseGedcom } from '../src/gedcom.ts';
import { layout } from '../src/layout.ts';
import { toSvg } from '../src/svg.ts';
import { THEMES, NO_AGE, OLD_AGE } from '../src/themes.ts';
const X = { theme: THEMES.spring, border: 'double' as const, age: NO_AGE, curve: 1, leaves: 100, twigs: 100, leafSize: 100, wood: 100, wind: 100, nodeScale: 100, treeScale: 100, genGap: 100, organic: 0 };

const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
// small hand-made GEDCOM: names, CONC, FAM links, living detection
const t = parseGedcom(`0 HEAD
0 @I1@ INDI
1 NAME Ann /Lee/
1 SEX F
1 BIRT
2 DATE 1 JAN 2001
0 @I2@ INDI
1 NAME Bob /Lee/ Jr
1 BIRT
2 DATE 1900
2 PLAC Leeds, England
1 DEAT
2 DATE 1970
0 @I3@ INDI
1 NAME Cy /Lee/
1 NOTE x
2 CONC y
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
0 TRLR`);
assert(Object.keys(t.people).length === 3, 'three people');
assert(t.people.I2.suffix === 'Jr' && t.people.I2.death?.date === '1970', 'name suffix + death');
assert(t.people.I1.living && !t.people.I2.living, 'living flag');
assert(t.parents.I1[0] === 'I2' && t.people.I2.spouses[0] === 'I3' && t.people.I3.children[0] === 'I1', 'family links');

const big = parseGedcom(readFileSync('sample/whitfield-family.ged', 'utf8'));
const root = 'I1';
assert(!!big.people[root], 'root present');
for (const [relatives, card] of [[false, 'full'], [true, 'full'], [true, 'compact'], [true, 'mini']] as const) {
  const o = { root, gens: 40, siblings: true, relatives, title: 'Test', hideLiving: true, card, design: 'classic' as const, ...X };
  const L = layout(big, o);
  const { svg } = toSvg(L, big, o);
  console.log(`relatives=${relatives} ${card}: ${L.cards.length} cards, ${L.W}x${L.H}, clashes=${L.clashes}, cardClashes=${L.cardClashes}, svg=${(svg.length / 1e3) | 0}kB`);
  assert(L.clashes === 0 && L.cardClashes === 0, 'no overlaps');
  assert(new Set(L.cards.map((c) => c.id)).size === L.cards.length, 'no duplicate cards');
}
for (const design of ['classic-up', 'tree'] as const) for (const relatives of [false, true]) {
  const o = { root, gens: 40, siblings: !relatives, relatives, title: 'T', hideLiving: true, card: design === 'tree' ? 'leaf' as const : 'compact' as const, design, ...X };
  const L = layout(big, o); const { svg } = toSvg(L, big, o);
  console.log(`${design} relatives=${relatives}: ${L.cards.length} cards, ${L.W}x${L.H}, clashes=${L.clashes}, cardClashes=${L.cardClashes}`);
  assert(L.cardClashes === 0, design + ' cards do not overlap');
  if (design === 'classic-up') assert(L.clashes === 0, design + ' lines do not overlap');
  assert(new Set(L.cards.map((c) => c.id)).size === L.cards.length, design + ' no duplicate cards');
  assert(design !== 'tree' || (svg.includes('id="branches"') && svg.includes('<clipPath')), 'tree svg has branches and medallions');
}
{ // organic scatter, node size, tree scale
  const base = { root, gens: 40, siblings: true, relatives: false, title: '', hideLiving: true, card: 'leaf' as const, design: 'tree' as const, ...X };
  const at = (over: object) => { const o = { ...base, ...over }; const L = layout(big, o); return { L, svg: toSvg(L, big, o), key: L.cards.map((c) => `${Math.round(c.x)},${Math.round(c.y)}`).join('|') }; };
  const uni = at({ organic: 0 }), a1 = at({ organic: 12345 }), a2 = at({ organic: 12345 }), b1 = at({ organic: 987654 });
  assert(a1.key === a2.key, 'organic: the same seed gives exactly the same shape');
  assert(a1.key !== b1.key && a1.key !== uni.key, 'organic: a different seed gives a new shape, and it differs from the even rings');
  for (const [name, r] of [['seed A', a1], ['seed B', b1]] as const) {
    let ov = 0; const c = r.L.cards;
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) if (Math.abs(c[i].x - c[j].x) < r.L.cw - 0.5 && Math.abs(c[i].y - c[j].y) < r.L.ch - 0.5) ov++;
    assert(ov === 0, `organic ${name}: no two people overlap (${c.length} cards)`);
  }
  // the order of generations survives: each generation stays further out than the one before, on average
  const ringR = (r: typeof a1, col: number) => { const rt = r.L.cards.find((x) => x.root)!, cs = r.L.cards.filter((x) => x.col === col); return cs.reduce((t, x) => t + Math.hypot(x.x - rt.x, x.y - rt.y), 0) / cs.length; };
  const cols = [...new Set(a1.L.cards.map((x) => x.col))].sort((p, q) => q - p).slice(1);
  assert(cols.every((c, i) => i === 0 || ringR(a1, c) > ringR(a1, cols[i - 1]) - 120) && ringR(a1, cols.at(-1)!) > ringR(a1, cols[0]) + 800, 'organic: generations still step outward from the trunk (sparse outer rings may wobble by a few tens of px)');
  console.log(`organic: ${a1.L.cards.length} people, ${a1.L.W}x${a1.L.H} vs even rings ${uni.L.W}x${uni.L.H}`);
  const big1 = at({ nodeScale: 150 }), sm = at({ nodeScale: 70 });
  assert(Math.abs(big1.L.cw / uni.L.cw - 1.5) < 0.01 && Math.abs(sm.L.ch / uni.L.ch - 0.7) < 0.01, 'node size scales the cards (width and height)');
  assert(big1.svg.minFont > uni.svg.minFont && sm.svg.minFont < uni.svg.minFont, `node size scales the text (${sm.svg.minFont.toFixed(1)} / ${uni.svg.minFont.toFixed(1)} / ${big1.svg.minFont.toFixed(1)})`);
  const gap50 = at({ genGap: 50, organic: 12345 }), gap100 = at({ genGap: 100, organic: 12345 }), gapU50 = at({ genGap: 50, organic: 0 });
  const span = (r: typeof a1) => { const rt = r.L.cards.find((x) => x.root)!; return Math.max(...r.L.cards.map((x) => Math.hypot(x.x - rt.x, x.y - rt.y))); };
  assert(span(gap50) < span(gap100) * 0.8, `generation spacing 50% pulls the tree in (${Math.round(span(gap50))} vs ${Math.round(span(gap100))} px from the trunk to the tips)`);
  for (const [name, r] of [['organic', gap50], ['even rings', gapU50]] as const) {
    let ov = 0; const c = r.L.cards;
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) if (Math.abs(c[i].x - c[j].x) < r.L.cw - 0.5 && Math.abs(c[i].y - c[j].y) < r.L.ch - 0.5) ov++;
    assert(ov === 0, `${name} at 50% spacing: no two people overlap`);
  }
  const t50 = at({ treeScale: 50 }), t100 = at({ treeScale: 100 }), t150 = at({ treeScale: 150 });
  assert(t50.svg.box.w > t100.svg.box.w && t100.svg.box.w > t150.svg.box.w && Math.abs(t50.svg.box.w / t100.svg.box.w - 2) < 0.05, 'tree scale grows or shrinks the canvas around the tree');
  assert(t50.L.W === t100.L.W, 'and leaves the layout itself alone');
  const cl = { ...base, design: 'classic' as const, card: 'compact' as const }, c1 = toSvg(layout(big, cl), big, cl), c2 = toSvg(layout(big, { ...cl, nodeScale: 150 }), big, { ...cl, nodeScale: 150 });
  assert(c2.minFont > c1.minFont, 'node size works in the classic designs too');
}
{ // texture sliders: more leaves / twigs means more drawing; zero removes them
  const base = { root, gens: 40, siblings: false, relatives: false, title: '', hideLiving: true, card: 'leaf' as const, design: 'tree' as const, ...X };
  const render = (over: object) => { const o = { ...base, ...over }; return toSvg(layout(big, o), big, o).svg; };
  const leafCount = (svg: string) => (svg.match(/stroke-opacity="\.42" stroke-width="\.6"/g) ?? []).length;
  const l0 = leafCount(render({ leaves: 0 })), l40 = leafCount(render({ leaves: 40 })), l100 = leafCount(render({ leaves: 100 })), l200 = leafCount(render({ leaves: 200 }));
  console.log('leaves at 0/40/100/200%:', l0, l40, l100, l200);
  assert(l0 === 0 && l0 < l40 && l40 < l100 && l100 < l200, 'leaf density slider: none < light < standard < lush');
  const t0 = render({ twigs: 0 }).length, t100 = render({ twigs: 100 }).length, t200 = render({ twigs: 200 }).length;
  console.log('svg size at twigs 0/100/200%:', (t0 / 1e6).toFixed(1), (t100 / 1e6).toFixed(1), (t200 / 1e6).toFixed(1), 'MB');
  assert(t0 < t100 && t100 < t200, 'twig density slider changes the amount of branching');
  const w50 = render({ wood: 50 }), w150 = render({ wood: 150 });
  assert(w50 !== w150, 'branch thickness slider changes the wood');
  assert(render({ leafSize: 60 }) !== render({ leafSize: 160 }), 'leaf size slider changes the leaves');
}
console.log('ok');

// photo matching
import { matchPhotos } from '../src/photos.ts';
const pt = parseGedcom(`0 HEAD
0 @I101@ INDI
1 NAME Ann /Lee/
1 BIRT
2 DATE 1950
1 OBJE
2 FILE C:\\\\pics\\\\annie-portrait.jpg
0 @I102@ INDI
1 NAME Bob /Lee/
1 BIRT
2 DATE 1948
0 @I103@ INDI
1 NAME Bob /Lee/
1 BIRT
2 DATE 1975
0 @I104@ INDI
1 NAME Cy /Ng/
0 TRLR`);
const m = matchPhotos(pt, ['annie-portrait.JPG', 'I102.jpg', '104.png', 'Cy Ng.jpg', 'bob-lee.jpg', 'bob-lee-1975.jpg', 'nobody.jpg', 'i102 copy.jpg']);
assert(m.matched['annie-portrait.JPG'] === 'I101', 'matches by GEDCOM file reference');
assert(m.matched['I102.jpg'] === 'I102', 'matches by id');
assert(m.matched['104.png'] === 'I104' || m.matched['Cy Ng.jpg'] === 'I104', 'matches by number or name');
assert(!m.matched['bob-lee.jpg'] && m.unmatched.includes('bob-lee.jpg'), 'ambiguous name is not guessed');
assert(m.matched['bob-lee-1975.jpg'] === 'I103', 'name + birth year disambiguates');
assert(m.unmatched.includes('nobody.jpg'), 'unknown file is reported');
assert(Object.values(m.matched).length === new Set(Object.values(m.matched)).size, 'one photo per person');
console.log('photo matching ok', JSON.stringify(m.matched));
