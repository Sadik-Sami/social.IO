import { performance } from 'node:perf_hooks';
import { decrypt, encrypt } from './crypto.lib';

const sample = 'Hey, are you coming to the standup today? I have some updates to share about the project. Let me know if you need any help with your tasks. Looking forward to seeing you there!';

// Warm up JIT
for (let i = 0; i < 100; i++) {
	encrypt(sample);
}

const COUNT = 10000;

const t0 = performance.now();

const encrypted = Array.from({ length: COUNT }, () => encrypt(sample));

const encTime = performance.now() - t0;

const t1 = performance.now();

encrypted.forEach((e) => decrypt(e));

const decTime = performance.now() - t1;

console.log(`
Messages:        ${COUNT}

Encrypt total:   ${encTime.toFixed(2)}ms
Encrypt each:    ${(encTime / COUNT).toFixed(4)}ms

Decrypt total:   ${decTime.toFixed(2)}ms
Decrypt each:    ${(decTime / COUNT).toFixed(4)}ms

DB round-trip:   ~10ms each
Crypto share:    ~${((decTime / COUNT / 10) * 100).toFixed(1)}%
`);
