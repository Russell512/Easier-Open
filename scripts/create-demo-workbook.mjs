// Standalone, fictional starter data. Never reads the owner's workbook or cloud.
import fs from 'node:fs/promises'
import path from 'node:path'
import XLSX from 'xlsx'
const destination = process.argv[2]
if (!destination) throw new Error('Usage: node scripts/create-demo-workbook.mjs <output.xlsx>')
const workbook = XLSX.utils.book_new()
function sheet(name, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = rows[0].map(() => ({ wch: 26 }))
  ws['!rows'] = [{ hpt: 30 }]
  ws['!autofilter'] = { ref: ws['!ref'] }
  XLSX.utils.book_append_sheet(workbook, ws, name)
}
const programs = [
  ['Example University A', 'MS Computer Science', '彩票'],
  ['Example University A', 'Master of Computer Science', '衝刺'],
  ['Example University B', 'MS Data Science', '主申'],
  ['Example University C', 'MS Software Engineering', '較為保險'],
  ['Example University D', 'MS Human-Computer Interaction', '未分類'],
  ['Example University E', 'MS Artificial Intelligence', '淘汰'],
]
const headers = ['University','Program Name','Degree','Application Deadline','Application Status','Research Fit Score','Next Action','Selection Result','Delivery Mode','Campus','GRE Requirement','TOEFL Requirement','Tuition','RA／TA／Fellowship','Official Program URL','Official Application URL','Notes','Research Fit Reason','Relevant Research Areas','Duration','Enrollment Mode','Program Type']
sheet('Programs', [headers, ...programs.map(([university, program, result]) => headers.map(field => ({University:university,'Program Name':program,Degree:'MS','Application Status':'Researching','Selection Result':result,'Delivery Mode':'實體',Campus:'示範校區','Next Action':'替換成自己的學程並核對官方資訊',Notes:'虛構示範資料，不能作為申請依據。','GRE Requirement':'待查證','TOEFL Requirement':'待查證',Tuition:'待查證','RA／TA／Fellowship':'待查證'}[field] ?? '')))])
const checklist = ['University','Program','Application Account','CV','Base SOP','School-specific SOP','Personal Statement','Transcript','TOEFL','IELTS','GRE','Recommendation 1','Recommendation 2','Recommendation 3','Writing Sample','Research Proposal','Faculty Contact','Fee Waiver','Application Fee','Application Submitted','Supporting Documents Received','Application Verified Complete','Interview','Decision','Current Blocker','Next Action','Target Date']
sheet('Application Checklist', [checklist, ...programs.map(([university,program])=>checklist.map(field=>field==='University'?university:field==='Program'?program:['Current Blocker','Next Action','Target Date'].includes(field)?'':'Not started'))])
sheet('Faculty', [['University','Program','Faculty Name','Last Verified Date']])
sheet('Per-Program Timeline', [['University','Program','Task','Official Deadline','My Target Deadline','Status','Notes'], ...programs.map(([u,p])=>[u,p,'核對官方招生資訊','','','Not started','示範任務'])])
sheet('Master Timeline', [['Phase','Task','Start Date','Target Completion Date','Status']])
sheet('Easier Template', [['Template'], ['easier-demo-v1'], ['All universities and programs are fictional examples. Replace them before planning applications.'], ['Programs and Application Checklist are joined by University + Program Name / Program.']])
await fs.mkdir(path.dirname(destination), {recursive:true})
const bytes = XLSX.write(workbook, {type:'buffer',bookType:'xlsx',compression:true})
await fs.writeFile(destination, bytes)
const readback = XLSX.read(bytes, {type:'buffer'})
if (XLSX.utils.sheet_to_json(readback.Sheets.Programs).length !== 6 || XLSX.utils.sheet_to_json(readback.Sheets['Application Checklist']).length !== 6) throw new Error('Demo workbook validation failed')
console.log('Created fictional demo workbook with 6 programs and matching checklists.')
