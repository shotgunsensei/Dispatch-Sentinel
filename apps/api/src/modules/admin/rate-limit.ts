export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  check(input: { bucket: string; key: string; limit: number; windowMs?: number }): { allowed: boolean; retryAfterSeconds: number } {
    const windowMs = input.windowMs ?? 60_000;
    const bucketKey = `${input.bucket}:${input.key}`;
    const current = this.now();
    const bucket = this.buckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= current) {
      this.buckets.set(bucketKey, { count: 1, resetAt: current + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (bucket.count >= input.limit) {
      return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - current) / 1000) };
    }

    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  reset(): void {
    this.buckets.clear();
  }
}
