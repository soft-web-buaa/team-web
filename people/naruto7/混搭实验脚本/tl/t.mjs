import * as tl from 'tlock-js';
console.log('exports:', Object.keys(tl).join(','));
const client = (tl.quicknetClient ? tl.quicknetClient() : tl.mainnetClient());
const info = await client.chain().info();
console.log('chain period(s):', info.period, 'genesis:', info.genesis_time);
const t0 = Date.now();
const round = tl.roundAt(t0 + 7000, info);
const secret = 'class-guess: 42 | bot-7 interval [30,55]';
const ct = await tl.timelockEncrypt(round, tl.Buffer.from(secret), client);
console.log('encrypted for round', round, 'ciphertext chars', ct.length, 'enc time ms', Date.now() - t0);
let early = 'n/a';
try { await tl.timelockDecrypt(ct, client); early = 'DECRYPTED EARLY (unexpected)'; } catch (e) { early = 'refused before round: ' + String(e.message).slice(0, 80); }
console.log('early decrypt:', early);
const wait = tl.roundTime(info, round) - Date.now() + 1500;
await new Promise(r => setTimeout(r, Math.max(0, wait)));
const t1 = Date.now();
const pt = await tl.timelockDecrypt(ct, client);
console.log('after round decrypt ok:', pt.toString() === secret, 'decrypt ms', Date.now() - t1);
