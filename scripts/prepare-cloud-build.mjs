import { rm, access } from 'node:fs/promises'
// The workbook belongs in authenticated Supabase Storage, never in public static hosting.
await rm(new URL('../dist/data', import.meta.url), { recursive: true, force: true })
try { await access(new URL('../dist/data', import.meta.url)); throw new Error('Private workbook remained in dist') }
catch (error) { if (error.code !== 'ENOENT') throw error }
console.log('Cloud build checked: public workbook copies excluded.')
