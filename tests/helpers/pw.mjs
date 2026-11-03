// Playwright, found the way CommonJS finds it (NODE_PATH included), so a global install works as well as
// one in node_modules (the same helper as Fix the Page's).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const chromium = require('playwright').chromium;
