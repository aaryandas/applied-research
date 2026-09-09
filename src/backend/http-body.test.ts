import { describe, expect, it } from 'vitest';
import { writeJson } from './http-body.js';
import type { ServerResponse } from 'node:http';

describe('bounded JSON responses', () => {
  it('fails closed with no-store when a serialized body exceeds the response cap', () => {
    const chunks: Buffer[] = [];
    let status = 0;
    let headers: Record<string, string | number | readonly string[]> = {};
    const response = {
      writableEnded: false,
      destroyed: false,
      writeHead(code: number, next: Record<string, string | number>) {
        status = code;
        headers = next;
      },
      end(this: { writableEnded: boolean }, body?: string | Buffer) {
        if (body) chunks.push(Buffer.isBuffer(body) ? body : Buffer.from(body));
        this.writableEnded = true;
      },
    } as unknown as ServerResponse;
    writeJson(response, 200, { pad: 'x'.repeat(4 * 1024 * 1024) });
    expect(status).toBe(503);
    expect(headers['Cache-Control']).toBe('no-store');
    expect(Buffer.concat(chunks).toString()).toContain('unavailable');
  });
});
