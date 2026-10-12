// Run with the project's Electron binary. This is package-protocol evidence,
// not proof of a Windows installation. No server or weakened webSecurity.
const { app, BrowserWindow, session } = require('electron');
const { resolve } = require('node:path');
const { writeFileSync } = require('node:fs');
const root = resolve(process.env.PDF_PACKAGE_ROOT || '.');
let window;
const deadline = setTimeout(() => {
	console.error('Electron PDF smoke timed out');
	app.exit(1);
}, 45000);
app
	.whenReady()
	.then(async () => {
		let forbidden = [];
		session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
			const allowed = /^(file|data|blob):/.test(details.url);
			if (!allowed) forbidden.push(details.url.split(':')[0]);
			callback({ cancel: !allowed });
		});
		window = new BrowserWindow({
			show: false,
			webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false }
		});
		await window.loadFile(resolve(root, 'app/index.html'));
		const output = await window.webContents.executeJavaScript(`(async()=>{
		if(location.protocol!=='file:')throw Error('Not the installed loader protocol');
		const {run,ADAPTERS}=await import('./js/core/convert.js');
		const candidate={...ADAPTERS.find(a=>a.id==='pdf-make'),available:true};
		const result=await run(candidate,new Blob(['廣東話：香港嘅離線文件。Traditional Chinese + Latin: café 123']));
		return Array.from(new Uint8Array(await result.arrayBuffer()));
	})()`);
		if (forbidden.length) throw Error('Unexpected nonlocal requests: ' + forbidden.join(', '));
		if (Buffer.from(output).subarray(0, 5).toString() !== '%PDF-') throw Error('No PDF result');
		if (process.env.PDF_ELECTRON_OUTPUT)
			writeFileSync(process.env.PDF_ELECTRON_OUTPUT, Buffer.from(output));
		console.log('Electron file-origin PDF worker passed; ' + output.length + ' output bytes.');
		clearTimeout(deadline);
		app.exit(0);
	})
	.catch((error) => {
		console.error(error);
		clearTimeout(deadline);
		app.exit(1);
	});
