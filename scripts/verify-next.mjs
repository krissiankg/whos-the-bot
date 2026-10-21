// Dedicated, isolated verification runtime. Normal npm run dev/build is unchanged.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
if(!['build','start','dev'].includes(process.argv[2]))throw new Error('Use build, start or dev');
// Next's agent detection otherwise tries process inspection unavailable in the
// restricted automation environment. This does not disable security checks.
process.env.AI_AGENT ||= 'codex';
process.env.CI='1';
process.env.NEXT_TELEMETRY_DISABLED='1';
process.env.WTB_BUILD_DIR=process.argv[2]==='dev'?'.next-preview':'.next-validation';
process.env.NODE_ENV=process.argv[2]==='dev'?'development':'production';
process.argv=[process.execPath,require.resolve('next/dist/bin/next'),...process.argv.slice(2)];
await import('next/dist/bin/next');
