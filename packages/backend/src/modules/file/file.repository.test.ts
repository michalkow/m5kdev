import { FileS3Repository } from "./file.repository";

const AWS_KEYS = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_S3_BUCKET",
] as const;

function withoutAws<T>(fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const key of AWS_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  try {
    return fn();
  } finally {
    for (const key of AWS_KEYS) {
      const value = saved[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe("FileS3Repository", () => {
  it("constructs without AWS credentials so FileModule can boot without S3", () => {
    withoutAws(() => {
      expect(() => new FileS3Repository()).not.toThrow();
    });
  });
});
