// Runs the prototype board's layout logic in Node and prints what each setup would draw.
// usage: node run-layout.js [path to board.dc.html]   (defaults to the copy beside this file)
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || require('path').join(__dirname, 'board.dc.html'), 'utf8');
const body = src.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
const Component = new Function(
  'class DCLogic { constructor(p) { this.props = p; } setState(o) { Object.assign(this.state, o); } }\n' + body + '\nreturn Component;',
)();
const LAND = /Forest|Island|Swamp|Mountain|Plains|Tower|Grave|Orchard|Foundry|Pool|Tomb/;
const setups = [
  { layout: 'roomy' }, { layout: 'roomy', seats: '2' }, { layout: 'roomy', device: 'phone', seats: '4' },
  { layout: 'roomy', device: 'phone', seats: '2' }, { layout: 'roomy', seats: '4', view: 'table' }, {}, { seats: '2' },
];
for (const props of setups) {
  const v = new Component(props).renderVals();
  for (const b of v.oppBoards.slice(0, 1)) {
    const card = b.rows.flatMap((r) => r.items).find((i) => i.isCard && !LAND.test(i.name));
    console.log(
      JSON.stringify(props).padEnd(50),
      'rows', b.rows.map((r) => r.items.length + (r.items.some((i) => i.isMore) ? '+more' : '')).join('/'),
      '| zones', b.zones.map((z) => z.name + ' ' + z.n).join(', '),
      '| card', card && card.style.match(/width:\d+px;height:\d+px/)[0],
    );
  }
}
const c = new Component({ layout: 'roomy' });
c.renderVals().oppBoards[0].zones[1].open();
let v = c.renderVals();
console.log('modal:', v.hasZone, '|', v.zm.title, '|', v.zm.sub, '| tabs', v.zm.tabs.map((t) => t.name + (t.on === 'true' ? '*' : '')).join(','), '| cards', v.zm.cards.slice(0, 3).map((x) => x.name + ' [' + x.type + ']').join('; '));
v.zm.tabs[0].pick(); v = c.renderVals(); console.log('library tab:', v.zm.title, '|', v.zm.empty);
c.renderVals().closeZone(); console.log('closed:', c.renderVals().hasZone);
c.renderVals().zones[2].open(); console.log('my exile:', c.renderVals().zm.title, c.renderVals().zm.cards.length);
const before = c.renderVals().meRows[0].items.length; c.renderVals().toggleStack(); v = c.renderVals();
console.log('stack closed:', v.stackClosed, v.deskStackOpen, '| my creatures row items', before, '->', v.meRows[0].items.length, '| grid', v.rootStyle.match(/grid-template-columns:[^;]+/)[0]);
