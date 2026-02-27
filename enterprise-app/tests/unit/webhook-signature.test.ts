import { verifyWebhookSignature } from '../../src/api/webhooks/signature';
import crypto from 'crypto';

describe('verifyWebhookSignature', () => {
  const secret = 'test-webhook-secret';

  function sign(payload: Buffer, key: string): string {
    return `sha256=${crypto.createHmac('sha256', key).update(payload).digest('hex')}`;
  }

  it('accepts a valid signature', () => {
    const payload = Buffer.from('{"action":"created"}');
    const sig = sign(payload, secret);
    expect(verifyWebhookSignature(payload, sig, secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const payload = Buffer.from('{"action":"created"}');
    expect(verifyWebhookSignature(payload, 'sha256=invalid', secret)).toBe(false);
  });

  it('rejects tampered payload', () => {
    const payload = Buffer.from('{"action":"created"}');
    const sig = sign(payload, secret);
    const tampered = Buffer.from('{"action":"deleted"}');
    expect(verifyWebhookSignature(tampered, sig, secret)).toBe(false);
  });

  it('rejects wrong secret', () => {
    const payload = Buffer.from('{"action":"created"}');
    const sig = sign(payload, 'wrong-secret');
    expect(verifyWebhookSignature(payload, sig, secret)).toBe(false);
  });

  it('rejects empty signature', () => {
    const payload = Buffer.from('test');
    expect(verifyWebhookSignature(payload, '', secret)).toBe(false);
  });

  it('rejects empty secret', () => {
    const payload = Buffer.from('test');
    expect(verifyWebhookSignature(payload, 'sha256=abc', '')).toBe(false);
  });
});
