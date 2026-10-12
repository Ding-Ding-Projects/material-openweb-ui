// Dependency-free renderer event regression. Execute the actual page module,
// substituting only its UI/DOM/state boundaries, not its conversion flow.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as actualConvert from '../app/js/core/convert.js';

class Element {
	constructor(tag, props, children) {
		this.tag = tag;
		this.props = props;
		this.children = [];
		this.handlers = {};
		this.append(...children);
	}
	append(...nodes) {
		for (const node of nodes.flat().filter((x) => x !== null && x !== undefined)) {
			this.children.push(node);
			if (node instanceof Element) node.parent = this;
		}
	}
	addEventListener(event, handler) {
		this.handlers[event] = handler;
	}
}
const h = (tag, props = {}, ...children) => new Element(tag, props, children);
function all(node) {
	return [node, ...node.children.filter((n) => n instanceof Element).flatMap(all)];
}
const values = new Map([['convResults', []]]),
	logs = [],
	notifications = [],
	dialogs = [],
	calls = [];
let complete;
const bindings = {
	dom: {
		h,
		icon: () => h('icon'),
		clear: (n) => {
			n.children = [];
		},
		bytes: (n) => String(n),
		add: (n, ...c) => n.append(...c)
	},
	regex: {
		searchField: () => ({
			el: h('search'),
			matcher: () => ({ test: () => true }),
			onChange: () => {}
		})
	},
	ui: {
		dialog: (dialog) => dialogs.push(dialog),
		notify: (text, options) => notifications.push({ text, options })
	},
	state: {
		get: (key) => values.get(key),
		set: (key, value) => values.set(key, value),
		log: (...args) => logs.push(args)
	},
	convert: {
		...actualConvert,
		run: (adapter, file) => {
			calls.push({ adapter, file });
			return new Promise((resolve) => {
				complete = resolve;
			});
		}
	}
};
globalThis.__converterTestBindings = bindings;
const originalSource = readFileSync(
	process.env.CONVERTER_SOURCE_PATH || 'app/js/pages/converter.js',
	'utf8'
);
let source = originalSource;
const imports = [
	[
		/import \{ h, icon, clear, bytes as fmtBytes, add \} from '[^']+';/,
		'const {h,icon,clear,bytes:fmtBytes,add}=globalThis.__converterTestBindings.dom;'
	],
	[
		/import \{ searchField \} from '[^']+';/,
		'const {searchField}=globalThis.__converterTestBindings.regex;'
	],
	[/import \* as ui from '[^']+';/, 'const ui=globalThis.__converterTestBindings.ui;'],
	[
		/import \* as convert from '[^']+';/,
		'const convert=globalThis.__converterTestBindings.convert;'
	],
	[/import \* as state from '[^']+';/, 'const state=globalThis.__converterTestBindings.state;']
];
for (const [pattern, replacement] of imports) {
	assert.match(source, pattern);
	source = source.replace(pattern, replacement);
}
const { render } = await import(
	'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);
const root = h('root');
render(root);
const input = all(root).find((node) => node.tag === 'input' && node.props.type === 'file');
const load = (file) => input.props.onchange({ target: { files: [file] } });
const choosePretty = () => {
	const title = all(root).find(
		(node) => node.tag === 'strong' && node.children.includes('Pretty-printed JSON')
	);
	const row = title.parent.parent.parent;
	const button = all(row).find(
		(node) => node.tag === 'button' && node.children.includes('Convert')
	);
	assert.ok(button && !button.props.disabled);
	button.handlers.click();
};
const first = new File(['{"first":1}'], 'approved.json');
const second = new File(['{"second":2}'], 'replacement.json');
await load(first);
choosePretty();
assert.equal(dialogs.length, 1);
assert.equal(calls.length, 0);
await load(second);
dialogs[0].actions.find((action) => action.label === 'Convert').run();
assert.equal(calls.length, 1);
assert.equal(calls[0].file, first);
// Clear while conversion is suspended. Completion must still name the approved
// file, rather than reading current.file after it has changed or become null.
all(root)
	.find((node) => node.tag === 'button' && node.children.includes('Clear'))
	.props.onclick();
complete(new Blob(['{"first": 1}'], { type: 'application/json' }));
await new Promise((resolve) => setImmediate(resolve));
const results = values.get('convResults');
assert.equal(results.length, 1);
assert.equal(results[0].name, 'approved.json');
assert.deepEqual(
	logs.find(([kind]) => kind === 'File converted'),
	['File converted', 'approved.json → approved.json']
);
assert.equal(notifications.length, 1);
assert.equal(notifications[0].options.kind, 'ok');
assert.match(notifications[0].text, /approved\.json/);
URL.revokeObjectURL(results[0].url);
// Opening and dismissing a second confirmation never starts another conversion.
await load(second);
choosePretty();
const cancel = dialogs[1].actions.find((action) => action.label === 'Cancel');
assert.equal(cancel.run, undefined);
assert.equal(calls.length, 1);
delete globalThis.__converterTestBindings;
console.log(
	'Converter source snapshot survives confirmation, replacement, clear and async completion.'
);

if (!process.env.CONVERTER_SOURCE_PATH) {
	const root = mkdtempSync(join(tmpdir(), 'converter-source-regression-'));
	try {
		const path = join(root, 'converter.js');
		const regressed = originalSource
			.replace(/const source = current.file;/, '')
			.replace(/\bsource\b/g, 'current.file');
		assert.notEqual(regressed, originalSource);
		writeFileSync(path, regressed);
		const child = spawnSync(process.execPath, ['scripts/test-converter-source.mjs'], {
			env: { ...process.env, CONVERTER_SOURCE_PATH: path },
			encoding: 'utf8'
		});
		assert.notEqual(
			child.status,
			0,
			'Removing the source snapshot must make the event regression fail'
		);
		assert.match(child.stderr, /AssertionError/);
	} finally {
		rmSync(root, { recursive: true });
	}
	console.log('Negative regression: removing the source snapshot fails the actual event sequence.');
}
