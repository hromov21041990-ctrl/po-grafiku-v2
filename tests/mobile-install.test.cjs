// Offline publication checks: public download, byte integrity and pre-login entry points.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const vm = require('node:vm');
const apk = 'downloads/po-grafiku-0.1-beta-debug.apk';
const digest = crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
assert.equal(digest, 'e436213c96a821b683c88966d5cf51367a7161c9a38dce820ba2a85f070717d2');
assert.ok(fs.readFileSync(apk + '.sha256', 'utf8').startsWith(digest));
for (const path of ['index.html', 'login.html']) {
 const html = fs.readFileSync(path, 'utf8');
 const auth = html.slice(html.indexOf('id="auth"'), html.indexOf('<main id="app"'));
 assert.ok(auth.includes('href="'+apk+'" download='), path + ': public download before login');
 assert.ok(auth.includes('href="install.html#iphone"'), path + ': iPhone instructions before login');
 assert.ok(auth.includes('без реальных данных'), path + ': beta limitation visible before download');
 assert.ok(auth.includes('30.10.2026') && auth.includes('одном Android-устройстве'), path + ': user manual QA attribution must remain scoped to one device');
 for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (!/src=|type="application\/ld\+json"/.test(match[1])) new vm.Script(match[2], {filename:path});
 }
}
const instructions = fs.readFileSync('install.html', 'utf8');
assert.ok(instructions.includes(digest));
assert.ok(instructions.includes('По отчёту пользователя от 30.10.2026') && instructions.includes('других устройствах'), 'Install guide must not imply broad Android approval');
assert.ok(!instructions.includes('<script'), 'Instructions need neither JavaScript nor login');
for (const text of ['id="iphone"', 'Safari', 'Поделиться', 'На экран Домой', 'Открыть как веб-приложение', 'Добавить', 'id="android"', apk]) assert.ok(instructions.includes(text), text);
assert.ok(fs.readFileSync('install.css','utf8').includes('@media(max-width:480px)'));
console.log('PASS: pre-login links, offline iPhone guide, APK integrity, responsive rules, inline JS syntax');
