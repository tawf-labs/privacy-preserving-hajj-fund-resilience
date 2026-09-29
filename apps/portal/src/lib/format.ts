export const short = (h: string, a = 8, b = 6) => (h.length > a + b + 3 ? `${h.slice(0, a)}…${h.slice(-b)}` : h);
export const bps = (x: number) => `${(x / 100).toFixed(x % 100 === 0 ? 0 : 2)}%`;
export const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
export const hexToBytes = (h: string): Uint8Array => {
  const s = h.startsWith('0x') ? h.slice(2) : h;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
};
