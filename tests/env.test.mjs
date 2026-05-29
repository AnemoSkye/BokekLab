import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLocalEnv } from "../server/env.ts";

const previousVertexKey = process.env.VERTEX_API_KEY;
const previousExisting = process.env.BOKEKLAB_EXISTING_ENV_TEST;

afterEach(() => {
  if (previousVertexKey === undefined) {
    delete process.env.VERTEX_API_KEY;
  } else {
    process.env.VERTEX_API_KEY = previousVertexKey;
  }

  if (previousExisting === undefined) {
    delete process.env.BOKEKLAB_EXISTING_ENV_TEST;
  } else {
    process.env.BOKEKLAB_EXISTING_ENV_TEST = previousExisting;
  }
});

describe("local env loader", () => {
  it("replaces empty template values from .env without clobbering non-empty shell values", () => {
    const dir = mkdtempSync(join(tmpdir(), "bokeklab-env-"));

    try {
      process.env.VERTEX_API_KEY = "";
      process.env.BOKEKLAB_EXISTING_ENV_TEST = "from-shell";
      writeFileSync(
        join(dir, ".env"),
        "\uFEFFVERTEX_API_KEY=from-local-file\nBOKEKLAB_EXISTING_ENV_TEST=from-local-file\n",
      );

      loadLocalEnv(dir);

      expect(process.env.VERTEX_API_KEY).toBe("from-local-file");
      expect(process.env.BOKEKLAB_EXISTING_ENV_TEST).toBe("from-shell");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
