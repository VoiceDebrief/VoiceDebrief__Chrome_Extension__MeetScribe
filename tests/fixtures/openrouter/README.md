# OpenRouter fixtures

These are **shaped from OpenRouter's documented examples** (the Speech-to-Text guide and API reference, read on 3 November 2026), not recorded from real calls: no key was available when they were written. Each file says so in its `source` field.

Replace them with recordings from a first real run, the estate's rule being "no mocks": `tests/helpers/replay.mjs` serves whatever `{ status, headers, body }` a file holds, so a recorded response drops in unchanged. A recording must have the key removed from anything it captured.
