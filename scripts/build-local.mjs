import { spawnSync } from 'node:child_process'
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { stdio: 'inherit', env: { ...process.env, VITE_LOCAL_MODE: 'true' }, shell: process.platform === 'win32' })
process.exit(result.status ?? 1)
