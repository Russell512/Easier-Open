import fs from 'node:fs'
// Vite reads .env.local during its build; deployments must supply public client config.
const local = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : ''
for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
  if (!process.env[key] && !new RegExp(`^${key}=.+`, 'm').test(local)) throw new Error(`${key} is required for a cloud build`)
}
