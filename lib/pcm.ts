/** Decode streaming 16-bit PCM, retaining split samples between chunks. */
export class PcmDecoder {
  private remainder: number | null = null;
  decode(chunk: Uint8Array): Float32Array {
    const offset = this.remainder === null ? 0 : 1;
    const bytes = new Uint8Array(offset + chunk.length);
    if (this.remainder !== null) bytes[0] = this.remainder;
    bytes.set(chunk, offset);
    const even = bytes.length - (bytes.length % 2);
    this.remainder = even < bytes.length ? bytes[even] : null;
    const view = new DataView(bytes.buffer, 0, even);
    const samples = new Float32Array(even / 2);
    for (let i = 0; i < samples.length; i++)
      samples[i] = view.getInt16(i * 2, true) / 32768;
    return samples;
  }
}
