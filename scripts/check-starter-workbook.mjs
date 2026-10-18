import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { build } from 'esbuild'

await fs.mkdir('.local', { recursive: true })
let downloadResult = { data: null, error: { status: 400, statusCode: '404', message: 'Object not found' } }
let authResult = { data: { user: { id: 'isolated-new-user' } }, error: null }
let sessionResult = { data: { session: { user: { id: 'isolated-new-user' }, access_token: 'new-user-token' } }, error: null }
let waitForDownload, downloadStarted
const downloads = []
const downloadTokens = [], verifiedTokens = []
globalThis.__starterTestCloud = {
  auth: {
    getSession: async () => sessionResult,
    getUser: async token => { verifiedTokens.push(token); return authResult },
  },
  storage: { from: bucket => ({ download: async path => { downloads.push({ bucket, path }); downloadStarted?.(); if (waitForDownload) await waitForDownload; return downloadResult } }) },
}
globalThis.__starterTestCreateClient = (_url, _key, options) => options?.accessToken ? {
  storage: { from: bucket => ({ download: async path => {
    downloadTokens.push(await options.accessToken())
    return globalThis.__starterTestCloud.storage.from(bucket).download(path)
  } }) },
} : globalThis.__starterTestCloud
let publicFetches = 0
globalThis.fetch = async () => { publicFetches++; throw new Error('Cloud initialization must never fetch a public workbook') }
const mockClient = {
  name: 'mock-starter-cloud', setup(builder) {
    builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'cloud', namespace: 'starter-test' }))
    builder.onLoad({ filter: /.*/, namespace: 'starter-test' }, () => ({ contents: 'export const createClient = (...args) => globalThis.__starterTestCreateClient(...args)' }))
  },
}
async function bundle(name, localMode, configured = true, development = false) {
  await build({
    stdin: { contents: "export * from './src/lib/starterWorkbook'; export * from './src/lib/workbook'; export * from './src/lib/programImport'; export * from './src/lib/selection'; export * from './src/lib/cloudClient'; export * from './src/lib/accountSession';", resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: `.local/${name}.mjs`, plugins: [mockClient],
    define: {
      'import.meta.env.VITE_LOCAL_MODE': JSON.stringify(String(localMode)),
      'import.meta.env.DEV': JSON.stringify(development),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(configured ? 'https://example.supabase.co' : ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(configured ? 'test-public-key' : ''),
    },
  })
  return import(`../.local/${name}.mjs`)
}
const api = await bundle('starter-workbook-test', false)
const buffer = api.createStarterWorkbook()
const starter = api.parseWorkbook(buffer)
assert.equal(api.isStarterWorkbook(starter), true)
for (const key of ['programs', 'checklist', 'faculty', 'programTimeline', 'masterTimeline']) assert.equal(starter[key].length, 0, `${key} starts without another user's data or examples`)
assert.equal(starter.warnings.length, 0, 'header-only sheets are valid in an explicit empty template')
assert.deepEqual(api.createInitialSchoolSelection(starter).rankingOrder, [])
assert.deepEqual(api.createInitialSchoolSelection(starter).results, {})
assert.equal(api.isStarterWorkbook({ ...starter, sheetSummaries: [] }), false, 'marker alone does not validate broken schemas')
const unmarked = structuredClone(starter)
delete unmarked.workbook.Sheets['Easier Template']
assert.equal(api.isStarterWorkbook(unmarked), false, 'arbitrary empty workbooks are not accepted as a starter')

const preview = api.previewManualProgram({ University: 'My New University', 'Program Name': 'My Chosen Program', Degree: 'MS', 'Application Deadline': '2027-01-15', 'Official Program URL': 'https://example.edu/program' }, starter)
assert.equal(preview.readyCount, 1)
const added = api.appendPrograms(starter, preview)
assert.equal(starter.programs.length, 0, 'add does not mutate the empty source')
assert.equal(added.model.programs.length, 1)
assert.equal(added.model.checklist.length, 1)
assert.ok(api.buildProgramViews(added.model)[0].checklistRow)
assert.equal(api.isStarterWorkbook(added.model), true, 'adding programs preserves the personal-workspace marker')
for (const field of api.PROGRAM_IMPORT_FIELDS.filter(field => !field.required)) assert.ok(api.makeEdit(added.model.workbook, added.model.programs[0], field.key, null), `${field.key} is editable after creation`)
const reloaded = api.parseWorkbook(added.buffer)
assert.equal(reloaded.programs.length, 1)
assert.equal(api.previewProgramsCsv(api.createProgramsImportCsv(reloaded), reloaded).duplicateCount, 1)

const cloudStarter = api.parseWorkbook(await api.fetchDefaultWorkbook())
assert.equal(api.isStarterWorkbook(cloudStarter), true)
assert.equal(cloudStarter.programs.length, 0)
assert.deepEqual(downloads.at(-1), { bucket: 'easier-private', path: 'isolated-new-user/seed/update_info.xlsx' })
assert.equal(downloadTokens.at(-1), 'new-user-token', 'private seed request is pinned to the initiating session token')
assert.equal(verifiedTokens.at(-1), 'new-user-token', 'server user validation uses the same explicit token')
assert.equal(publicFetches, 0, 'missing cloud seed never requests public data')
const ownerBytes = new Uint8Array([10, 20, 30, 40]).buffer
downloadResult = { data: { arrayBuffer: async () => ownerBytes }, error: null }
assert.equal(await api.fetchDefaultWorkbook(), ownerBytes, 'existing private seed is returned exactly as supplied')
const activeGuard = api.createAccountGuard('isolated-new-user')
api.bindAccountGuard(activeGuard)
let releaseDownload
waitForDownload = new Promise(resolve => { releaseDownload = resolve })
const started = new Promise(resolve => { downloadStarted = resolve })
const pendingSeed = api.fetchDefaultWorkbook()
await started
activeGuard.invalidate()
api.bindAccountGuard(api.createAccountGuard('next-user'))
releaseDownload()
await assert.rejects(pendingSeed, /帳號已切換/, 'an in-flight seed cannot be returned after switching accounts')
waitForDownload = undefined; downloadStarted = undefined
await assert.rejects(api.fetchDefaultWorkbook(), /資料所屬帳號不符/, 'active workspace and session must have the same user')
api.bindAccountGuard(api.createAccountGuard('isolated-new-user'))
for (const error of [
  { status: 403, statusCode: '403', code: 'AccessDenied', message: 'Access denied' },
  { status: 500, statusCode: '500', message: 'Server error' },
  { status: 404, statusCode: '404', code: 'NoSuchBucket', message: 'Bucket not found' },
  { message: 'Network request failed' },
]) {
  downloadResult = { data: null, error }
  await assert.rejects(api.fetchDefaultWorkbook(), /無法讀取雲端原始 Excel/, 'network, authorization, and missing-bucket failures must surface')
}
authResult = { data: { user: null }, error: null }
await assert.rejects(api.fetchDefaultWorkbook(), /請先登入/)
authResult = { data: { user: null }, error: { message: 'auth network error' } }
await assert.rejects(api.fetchDefaultWorkbook(), /無法確認登入狀態/)
sessionResult = { data: { session: null }, error: null }
await assert.rejects(api.fetchDefaultWorkbook(), /請先登入/)
assert.equal(publicFetches, 0)
const unconfigured = await bundle('starter-unconfigured-test', false, false)
await assert.rejects(unconfigured.fetchDefaultWorkbook(), /雲端連線尚未設定/)
assert.equal(publicFetches, 0)
const local = await bundle('starter-local-test', true)
const demo = await fs.readFile('public/data/update_info.xlsx')
globalThis.fetch = async url => {
  assert.equal(url, './data/update_info.xlsx')
  return { ok: true, arrayBuffer: async () => demo.buffer.slice(demo.byteOffset, demo.byteOffset + demo.byteLength) }
}
assert.deepEqual(new Uint8Array(await local.fetchDefaultWorkbook()), new Uint8Array(demo), 'explicit local mode keeps its existing bundled workbook unchanged')
const development = await bundle('starter-development-test', false, false, true)
assert.deepEqual(new Uint8Array(await development.fetchDefaultWorkbook()), new Uint8Array(demo), 'npm run dev without cloud configuration keeps its existing local starter')
const configuredDevelopment = await bundle('starter-development-cloud-test', false, true, true)
await assert.rejects(configuredDevelopment.fetchDefaultWorkbook(), /請先登入/, 'configured development uses cloud authentication instead of the public seed')
delete globalThis.__starterTestCloud
delete globalThis.__starterTestCreateClient
console.log('PASS: empty independent starter, first-add round trip, exact owner seed, 404-only fallback, pinned session and stale-operation rejection, production no-config denial, no-env local development, and configured-development authentication.')
