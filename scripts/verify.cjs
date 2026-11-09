const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist');
const words = JSON.parse(fs.readFileSync(path.join(root, 'vocab.json'), 'utf8'));
assert.equal(words.length, 3811, 'Vocabulary must contain all 3811 entries');
assert.equal(new Set(words.map(w => w.id)).size, words.length, 'Word IDs must be unique');
assert.deepEqual([...new Set(words.map(w => w.list))].sort((a,b)=>a-b), Array.from({length:30},(_,i)=>i+1));
for (const word of words) {
  for (const key of ['id', 'word', 'speech', 'meaning', 'ipa_us']) assert.ok(typeof word[key] === 'string' && word[key].trim(), `${word.id}: missing ${key}`);
  assert.match(word.id, /^l\d{2}-\d{3}(?:-\d+)?$/);
  const audio = path.join(root, 'audio/us', word.id + '.mp3');
  assert.ok(fs.statSync(audio).size > 100, `Missing or empty audio: ${word.id}`);
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)) assert.ok(fs.existsSync(path.join(root, match[1])), `Missing asset: ${match[1]}`);
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
for (const match of js.matchAll(/\$\('([^']+)'\)/g)) assert.ok(html.includes(`id="${match[1]}"`), `Missing DOM element: ${match[1]}`);
assert.ok(js.includes("fetch('./vocab.json')"), 'Vocabulary URL must be relative for project Pages');
assert.ok(js.includes('`./audio/us/'), 'Audio URLs must be relative for project Pages');
console.log('PASS: 3811 words, 30 lists, IPA, 3811 audio files, HTML assets and DOM bindings.');
