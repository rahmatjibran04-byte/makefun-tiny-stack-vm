// Tiny stack VM, make.fun ISA v1. Runs every /input/<id>/program.bin on its
// input.bin and writes /output/<id>/stdout.bin + exit.txt. Node 22, erasable syntax.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OPS: Record<number, number[]> = {
  0x00: [0, 0, 0], 0x01: [1, 0, 1], 0x02: [4, 0, 1], 0x03: [0, 1, 0], 0x04: [0, 1, 2],
  0x05: [0, 2, 2], 0x06: [0, 2, 3], 0x07: [0, 3, 3], 0x10: [0, 2, 1], 0x11: [0, 2, 1],
  0x12: [0, 2, 1], 0x13: [0, 2, 1], 0x14: [0, 2, 1], 0x15: [0, 2, 1], 0x16: [0, 2, 1],
  0x17: [0, 1, 1], 0x18: [0, 2, 1], 0x19: [0, 2, 1], 0x1a: [0, 2, 1], 0x1b: [0, 1, 1],
  0x1c: [0, 2, 1], 0x1d: [0, 2, 1], 0x1e: [0, 2, 1], 0x20: [0, 2, 1], 0x21: [0, 2, 1],
  0x22: [0, 2, 1], 0x30: [2, 0, 0], 0x31: [2, 1, 0], 0x32: [2, 1, 0], 0x33: [2, 0, 0],
  0x34: [0, 0, 0], 0x40: [0, 1, 1], 0x41: [0, 2, 0], 0x50: [0, 1, 0], 0x51: [0, 1, 0],
  0x52: [0, 0, 1], 0x53: [0, 1, 0],
};

function run(p: Uint8Array, inp: Uint8Array): [Uint8Array, number] {
  const n = p.length;
  const D = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let sp = 0, csp = 0, pc = 0, steps = 0, olen = 0, ipos = 0;
  const end = (e: number): [Uint8Array, number] => [out.slice(0, olen), e];
  for (;;) {
    if (steps === 1000000) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = p[pc], t = OPS[op];
    if (!t) return end(5);
    const imm = t[0], pops = t[1], pushes = t[2];
    if (pc + imm >= n) return end(9);
    steps++;
    const next = pc + 1 + imm;
    if (sp < pops) return end(2);
    if (sp - pops + pushes > 256) return end(3);
    pc = next;
    switch (op) {
      case 0x00: return end(0);
      case 0x01: D[sp++] = (p[next - 1] << 24) >> 24; break;
      case 0x02:
        D[sp++] = p[next - 4] | (p[next - 3] << 8) | (p[next - 2] << 16) | (p[next - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: D[sp] = D[sp - 1]; sp++; break;
      case 0x05: { const x = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = x; break; }
      case 0x06: D[sp] = D[sp - 2]; sp++; break;
      case 0x07: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 0x17: D[sp - 1] = -D[sp - 1] | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x30: case 0x31: case 0x32: {
        const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 0x30) { const v = D[--sp]; take = op === 0x31 ? v === 0 : v !== 0; }
        if (take) pc = next + rel;
        break;
      }
      case 0x33:
        if (csp === 64) return end(7);
        C[csp++] = next; pc = p[next - 2] | (p[next - 1] << 8); break;
      case 0x34:
        if (csp === 0) return end(8);
        pc = C[--csp]; break;
      case 0x40: {
        const addr = D[sp - 1];
        if (addr < 0 || addr > 255) return end(6);
        D[sp - 1] = M[addr]; break;
      }
      case 0x41: {
        const addr = D[sp - 1], v = D[sp - 2];
        if (addr < 0 || addr > 255) return end(6);
        sp -= 2; M[addr] = v; break;
      }
      case 0x50: {
        const s = String(D[sp - 1]);
        if (olen + s.length > 65536) return end(11);
        sp--;
        for (let i = 0; i < s.length; i++) out[olen++] = s.charCodeAt(i);
        break;
      }
      case 0x51:
        if (olen + 1 > 65536) return end(11);
        out[olen++] = D[--sp] & 255; break;
      case 0x52: D[sp++] = ipos < inp.length ? inp[ipos++] : -1; break;
      case 0x53: return end(D[--sp] & 255);
      default: {
        const b = D[sp - 1], a = D[sp - 2];
        let r = 0;
        switch (op) {
          case 0x10: r = (a + b) | 0; break;
          case 0x11: r = (a - b) | 0; break;
          case 0x12: r = Math.imul(a, b); break;
          case 0x13: if (b === 0) return end(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; break;
          case 0x14: if (b === 0) return end(4); r = b === -1 ? 0 : (a % b) | 0; break;
          case 0x15: if (b === 0) return end(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
          case 0x16: if (b === 0) return end(4); r = ((a >>> 0) % (b >>> 0)) | 0; break;
          case 0x18: r = a & b; break;
          case 0x19: r = a | b; break;
          case 0x1a: r = a ^ b; break;
          case 0x1c: r = a << (b & 31); break;
          case 0x1d: r = a >> (b & 31); break;
          case 0x1e: r = (a >>> (b & 31)) | 0; break;
          case 0x20: r = a === b ? 1 : 0; break;
          case 0x21: r = a < b ? 1 : 0; break;
          case 0x22: r = (a >>> 0) < (b >>> 0) ? 1 : 0; break;
        }
        sp -= 2; D[sp++] = r; break;
      }
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const e of readdirSync(I, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
  if (!e.isDirectory()) continue;
  const id = e.name;
  let prog: Buffer = Buffer.alloc(0), inp: Buffer = Buffer.alloc(0);
  try { prog = readFileSync(join(I, id, 'program.bin')); } catch { /* missing -> empty */ }
  try { inp = readFileSync(join(I, id, 'input.bin')); } catch { /* missing -> empty */ }
  const [stdout, exit] = run(prog, inp);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), stdout);
  writeFileSync(join(O, id, 'exit.txt'), String(exit) + '\n');
}
