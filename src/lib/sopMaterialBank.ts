export const SOP_MATERIAL_STORAGE_KEY = 'easier-sop-material-bank-v1'

export type SopSectionId =
  | 'research-projects'
  | 'turning-points'
  | 'why-graduate-school'
  | 'skills-preparation'
  | 'research-interests'
  | 'accomplishments'
  | 'personal-qualities'
  | 'future-goals'
  | 'school-fit'
  | 'possible-openings'

export type AnswerStatus = 'active' | 'later' | 'unsure'

export interface MaterialAnswer {
  text: string
  status: AnswerStatus
}

export interface MaterialEntry {
  id: string
  answers: Record<string, MaterialAnswer>
}

export interface SopMaterialBankState {
  version: 1
  sections: Record<SopSectionId, MaterialEntry[]>
  updatedAt: string
}

export interface MaterialFieldDefinition {
  id: string
  label: string
  guide: string
  example: string
  type?: 'text' | 'textarea' | 'select'
  options?: string[]
  rows?: number
  placeholder?: string
}

export interface MaterialSectionDefinition {
  id: SopSectionId
  number: number
  title: string
  eyebrow: string
  description: string
  itemLabel: string
  repeatable: boolean
  maxItems?: number
  fields: MaterialFieldDefinition[]
}

const openingTypes = ['研究問題', '具體事件', '轉折', '直接陳述']

export const SOP_SECTION_DEFINITIONS: MaterialSectionDefinition[] = [
  {
    id: 'research-projects',
    number: 1,
    title: 'Research Projects',
    eyebrow: '研究經驗',
    description: '把每段研究拆成問題、行動、結果與影響，先保存細節，不急著寫成故事。',
    itemLabel: 'Project',
    repeatable: true,
    fields: [
      { id: 'title', label: 'Project title', guide: '使用之後能快速辨識的專案名稱。', example: '示例格式：主題／系統名稱＋你的研究焦點。', type: 'text', placeholder: '輸入 project title' },
      { id: 'question', label: '研究問題是什麼？', guide: '具體描述想理解、預測、改善或驗證的問題。', example: '示例結構：現有方法在＿＿情境下會遇到＿＿，因此我想釐清＿＿。' },
      { id: 'importance', label: '為什麼這個問題重要？', guide: '說明它對研究、使用者或真實場景的影響。', example: '示例結構：若無法處理這個問題，會造成＿＿；解決後可能改善＿＿。' },
      { id: 'role', label: '我的具體角色與貢獻', guide: '區分團隊成果與你親自負責的部分。', example: '示例結構：我負責設計＿＿、實作＿＿，並與＿＿協作完成＿＿。' },
      { id: 'methods', label: '使用的方法、模型或工具', guide: '記錄方法名稱，也說明你如何使用或選擇它。', example: '示例結構：使用＿＿處理＿＿；選擇它是因為＿＿。' },
      { id: 'result', label: '最重要的結果', guide: '優先記錄可驗證、可比較或有明確意義的結果。', example: '示例結構：相較於＿＿，結果在＿＿指標改善＿＿；或得到＿＿發現。' },
      { id: 'difficulty', label: '遇到的困難與如何處理', guide: '聚焦診斷過程、取捨與你採取的具體行動。', example: '示例結構：最初出現＿＿；我透過＿＿定位原因，最後改用＿＿。' },
      { id: 'learning', label: '我從中學到了什麼', guide: '寫出方法、研究判斷或合作方式上的改變。', example: '示例結構：這讓我學會＿＿，也重新理解＿＿的重要性。' },
      { id: 'direction', label: '這項經驗如何影響我的研究方向', guide: '說明它開啟、縮小或修正了哪些研究興趣。', example: '示例結構：完成後，我開始更關注＿＿，並想進一步探索＿＿。' },
    ],
  },
  {
    id: 'turning-points',
    number: 2,
    title: 'Turning Points',
    eyebrow: '方向轉折',
    description: '記錄真正改變你想法或行動的事件，而不是事後拼湊的戲劇化故事。',
    itemLabel: 'Turning point',
    repeatable: false,
    fields: [
      { id: 'before', label: '當時我原本在做什麼？', guide: '交代轉折前的目標、假設或方向。', example: '示例結構：當時我主要投入＿＿，原本認為＿＿。' },
      { id: 'event', label: '發生了什麼具體事件或發現？', guide: '選擇可描述時間、場景與細節的事件。', example: '示例結構：在＿＿過程中，我觀察到／發現＿＿。' },
      { id: 'change', label: '我的想法因此如何改變？', guide: '寫出改變前後的差異，不只說「更有興趣」。', example: '示例結構：我從原本重視＿＿，轉而開始思考＿＿。' },
      { id: 'actions', label: '這個轉折後，我做了哪些實際行動？', guide: '列出課程、研究、實作、閱讀或合作等後續行動。', example: '示例結構：之後我主動＿＿、加入＿＿，並開始＿＿。' },
      { id: 'current-direction', label: '它如何帶我走向現在的方向？', guide: '建立事件與目前研究目標之間的可追蹤連結。', example: '示例結構：這些行動逐步讓我聚焦於＿＿，形成目前的＿＿方向。' },
    ],
  },
  {
    id: 'why-graduate-school',
    number: 3,
    title: 'Why Graduate School',
    eyebrow: '申請動機',
    description: '回答為什麼需要研究所、為什麼是現在，以及它與未來目標的關係。',
    itemLabel: 'Graduate school rationale',
    repeatable: false,
    fields: [
      { id: 'capabilities', label: '我希望研究所幫我補足什麼能力？', guide: '指出目前能力缺口，以及需要什麼訓練環境。', example: '示例結構：我已有＿＿基礎，但仍需要在＿＿與＿＿上接受系統訓練。' },
      { id: 'timing', label: '為什麼現在是適合申請的時間？', guide: '連結目前的準備程度、問題意識與下一步需求。', example: '示例結構：經過＿＿後，我已能＿＿，也更清楚下一步需要＿＿。' },
      { id: 'work-limit', label: '為什麼直接工作不足以達成目前目標？', guide: '客觀說明工作與研究訓練的差異，避免貶低業界。', example: '示例結構：工作能提供＿＿，但我的目標還需要＿＿與＿＿。' },
      { id: 'degree-value', label: '我想從 research-oriented Master’s 或 PhD 得到什麼？', guide: '分辨課程、研究指導、方法訓練與社群等需求。', example: '示例結構：我希望透過＿＿建立＿＿，並在＿＿指導下練習＿＿。' },
      { id: 'bridge', label: '研究所如何連接我現在與未來的目標？', guide: '描述可行的能力與經驗橋梁，不必保證唯一職涯。', example: '示例結構：目前的＿＿將支持我在研究所完成＿＿，再走向＿＿。' },
    ],
  },
  {
    id: 'skills-preparation',
    number: 4,
    title: 'Skills and Preparation',
    eyebrow: '能力證據',
    description: '每項能力都搭配可驗證的情境或產出，避免只列形容詞與工具名稱。',
    itemLabel: 'Preparation evidence',
    repeatable: false,
    fields: [
      { id: 'technical', label: 'Technical skills＋具體證據', guide: '逐項寫出 skill，以及在哪個 project 或成果中實際使用。', example: '示例格式：能力＿＿｜在＿＿中用來＿＿｜產出／結果＿＿。' },
      { id: 'research', label: 'Research skills＋具體證據', guide: '可包含文獻整理、實驗設計、評估、分析或研究判斷。', example: '示例格式：能力＿＿｜面對＿＿問題時，我透過＿＿證明。' },
      { id: 'collaboration', label: 'Communication／collaboration＋具體證據', guide: '描述對象、溝通難點、你的行動與合作結果。', example: '示例格式：與＿＿合作時，我負責＿＿，使團隊能＿＿。' },
      { id: 'independent-learning', label: 'Independent learning＋具體證據', guide: '寫出學習目標、方法、時間與最後能完成的事情。', example: '示例格式：為了解決＿＿，我自行學習＿＿，最後完成＿＿。' },
    ],
  },
  {
    id: 'research-interests',
    number: 5,
    title: 'Research Interests',
    eyebrow: '最多三條方向',
    description: '每條方向獨立整理，不強迫把不同興趣合併成同一個故事。',
    itemLabel: 'Research direction',
    repeatable: true,
    maxItems: 3,
    fields: [
      { id: 'area', label: 'Research area', guide: '使用具體但不過度狹窄的方向名稱。', example: '示例格式：領域＋關心的場景或方法。', type: 'text', placeholder: '例如：研究領域與子方向' },
      { id: 'questions', label: '我真正感興趣的問題', guide: '用問題表達興趣，而不只是一組熱門關鍵字。', example: '示例結構：我想理解／改善＿＿在＿＿條件下的＿＿。' },
      { id: 'support', label: '過去哪些經驗支持這個興趣', guide: '連結一至數段真實經驗，說明興趣如何形成。', example: '示例結構：在＿＿經驗中接觸到＿＿，因此開始關注＿＿。' },
      { id: 'known-unknown', label: '我目前知道與不知道的部分', guide: '誠實區分已有理解與尚待學習的問題。', example: '示例結構：我已理解／實作過＿＿；目前仍不清楚＿＿。' },
      { id: 'explore', label: '未來想進一步探索什麼', guide: '列出希望研究或驗證的下一步，不需假裝已有答案。', example: '示例結構：未來想比較＿＿、研究＿＿，或確認＿＿。' },
    ],
  },
  {
    id: 'accomplishments',
    number: 6,
    title: 'Accomplishments',
    eyebrow: '成果與影響',
    description: '整理最能說明成長與能力的成果，而不只是獎項清單。',
    itemLabel: 'Accomplishment',
    repeatable: false,
    fields: [
      { id: 'name', label: '成果名稱', guide: '使用清楚、之後容易引用的名稱。', example: '示例格式：成果／競賽／發表／系統名稱。', type: 'text' },
      { id: 'context', label: '背景與難度', guide: '交代限制、競爭程度、技術門檻或問題複雜度。', example: '示例結構：在＿＿限制下，需要完成＿＿，困難在於＿＿。' },
      { id: 'contribution', label: '我的實際貢獻', guide: '把個人行動與團隊成果分開。', example: '示例結構：我親自負責＿＿，並解決＿＿。' },
      { id: 'evidence', label: '可量化結果或外部認可', guide: '可使用數字、排名、採用情況、評語或正式認可。', example: '示例格式：指標＿＿、規模＿＿、評選／採用結果＿＿。' },
      { id: 'meaning', label: '為什麼這項成果對我重要', guide: '說明它對選擇、信心或研究理解的影響。', example: '示例結構：它重要不是只因為＿＿，而是讓我確認／學到＿＿。' },
      { id: 'ability', label: '它證明了我具備什麼能力', guide: '以行動證據對應一至兩項能力。', example: '示例結構：這段經驗顯示我能在＿＿情況下＿＿。' },
    ],
  },
  {
    id: 'personal-qualities',
    number: 7,
    title: 'Personal Qualities',
    eyebrow: '特質證據',
    description: '用情境、行動與結果證明特質，而不是直接宣稱自己的優點。',
    itemLabel: 'Quality evidence',
    repeatable: false,
    fields: [
      { id: 'quality', label: '我想呈現的特質', guide: '先選一個與後續案例真正相符的特質。', example: '示例方向：好奇心、韌性、主動性、責任感；不要只停在標籤。', type: 'text' },
      { id: 'situation', label: '一個能證明它的具體情境', guide: '描述時間、限制、利害關係與當時的挑戰。', example: '示例結構：在＿＿情況下，團隊／我面臨＿＿。' },
      { id: 'action', label: '我當時採取的行動', guide: '使用你真正做過、他人可觀察的行動。', example: '示例結構：我主動＿＿、調整＿＿，並持續＿＿。' },
      { id: 'outcome', label: '最後結果', guide: '包含成果，也可寫未完全成功但帶來的改變。', example: '示例結構：結果＿＿；即使＿＿，仍讓＿＿得到改善。' },
      { id: 'relevance', label: '這個例子與研究所申請有何關係', guide: '連結研究訓練需要的工作方式或心態。', example: '示例結構：這種＿＿能力將幫助我面對研究中的＿＿。' },
    ],
  },
  {
    id: 'future-goals',
    number: 8,
    title: 'Future Goals',
    eyebrow: '方向與不確定性',
    description: '建立有方向但不虛假確定的目標，可以明確保存目前仍未知的部分。',
    itemLabel: 'Future direction',
    repeatable: false,
    fields: [
      { id: 'during-degree', label: '研究所期間希望完成什麼', guide: '聚焦能力、研究經驗、合作與成果。', example: '示例結構：希望建立＿＿能力，參與＿＿，並完成＿＿。' },
      { id: 'two-five-years', label: '畢業後 2–5 年的方向', guide: '可描述角色、問題類型與工作環境，不必限定職稱。', example: '示例結構：希望在＿＿環境中，以＿＿角色處理＿＿問題。' },
      { id: 'long-term', label: '更長期可能的方向', guide: '使用「可能」與條件，保留職涯探索空間。', example: '示例結構：長期可能走向＿＿；若＿＿，也會考慮＿＿。' },
      { id: 'impact', label: '希望處理的問題或產生的影響', guide: '指出你在意的對象、系統或研究缺口。', example: '示例結構：希望讓＿＿能夠＿＿，或改善＿＿。' },
      { id: 'uncertainty', label: '目前仍不確定的地方', guide: '誠實記錄尚未決定或需要更多經驗才能判斷的部分。', example: '示例結構：目前尚未完全確定＿＿；我希望透過＿＿進一步判斷。' },
    ],
  },
  {
    id: 'school-fit',
    number: 9,
    title: 'School Fit',
    eyebrow: '逐校素材',
    description: '每間學校獨立建立 fit 證據，避免只替換校名或引用排名。',
    itemLabel: 'School',
    repeatable: true,
    fields: [
      { id: 'program', label: 'University／Program', guide: '選擇或輸入 workbook 中的正式名稱。', example: '示例格式：University — Program — Degree。', type: 'text', placeholder: '搜尋或輸入 University／Program' },
      { id: 'fit', label: '為什麼適合我', guide: '連結你的研究問題、準備與 program 的具體特點。', example: '示例結構：我的＿＿經驗與此 program 的＿＿取向相連。' },
      { id: 'faculty', label: '2–3 位相關 faculty', guide: '列出姓名與最相關的研究主題，避免只堆疊名字。', example: '示例格式：Faculty A｜主題；Faculty B｜主題。' },
      { id: 'faculty-overlap', label: '每位 faculty 的具體研究交集', guide: '逐位說明你的問題、方法或經驗與其工作的交集。', example: '示例格式：Faculty A：其＿＿研究與我的＿＿經驗在＿＿上交集。' },
      { id: 'resources', label: '相關 lab、course、center 或 research resource', guide: '記錄真正會使用的資源及其用途。', example: '示例格式：Resource＿＿｜能支持我進行＿＿。' },
      { id: 'contribution', label: '我能帶入什麼背景', guide: '說明可帶入 lab 或 cohort 的方法、領域與合作經驗。', example: '示例結構：我能帶入＿＿經驗，並在＿＿方面貢獻。' },
      { id: 'not-ranking', label: '為什麼不是只因為排名而申請', guide: '用兩至三個不可由排名取代的具體理由回答。', example: '示例結構：即使不看排名，我仍會申請，因為＿＿、＿＿。' },
    ],
  },
  {
    id: 'possible-openings',
    number: 10,
    title: 'Possible Openings',
    eyebrow: '候選開頭',
    description: '保存多個真實、具體的開頭素材；這裡只比較候選，不自動生成 SOP。',
    itemLabel: 'Opening',
    repeatable: true,
    fields: [
      { id: 'text', label: 'Opening text', guide: '先保存原始版本，不需立刻追求華麗或完美。', example: '示例原則：從具體問題、事件或清楚動機開始，避免空泛名言。', rows: 5 },
      { id: 'type', label: '類型', guide: '選擇最接近這個開頭的敘事方式。', example: '研究問題聚焦問題意識；具體事件聚焦可觀察情境。', type: 'select', options: openingTypes },
      { id: 'experience', label: '對應到哪段經歷', guide: '連結 material bank 中的 project、事件或轉折。', example: '示例格式：Research Project 2／Turning Point／某段工作經驗。', type: 'text' },
      { id: 'relevance', label: '是否真實、具體且與申請方向相關', guide: '分別檢查真實性、細節與研究方向連結。', example: '若仍需確認細節，選擇「需要再確認」，不要補造內容。', type: 'select', options: ['是', '需要再確認', '否'] },
      { id: 'rating', label: '使用者評分', guide: '依真實性、辨識度與後續延伸空間評分。', example: '1 代表不適合，5 代表值得優先發展。', type: 'select', options: ['1', '2', '3', '4', '5'] },
      { id: 'notes', label: '備註', guide: '記錄優點、風險、需查證細節或可改寫方向。', example: '示例結構：保留＿＿；避免＿＿；需要補充＿＿。' },
    ],
  },
]

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `material-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createMaterialEntry(definition: MaterialSectionDefinition): MaterialEntry {
  return {
    id: createId(),
    answers: Object.fromEntries(definition.fields.map((field) => [
      field.id,
      { text: '', status: 'active' satisfies AnswerStatus },
    ])),
  }
}

export function createInitialSopMaterialBank(): SopMaterialBankState {
  return {
    version: 1,
    sections: Object.fromEntries(SOP_SECTION_DEFINITIONS.map((definition) => [
      definition.id,
      [createMaterialEntry(definition)],
    ])) as Record<SopSectionId, MaterialEntry[]>,
    updatedAt: new Date().toISOString(),
  }
}

export function reconcileSopMaterialBank(value: unknown): SopMaterialBankState {
  const initial = createInitialSopMaterialBank()
  if (!value || typeof value !== 'object') return initial
  const candidate = value as Partial<SopMaterialBankState>
  if (candidate.version !== 1 || !candidate.sections) return initial

  const sections = { ...initial.sections }
  SOP_SECTION_DEFINITIONS.forEach((definition) => {
    const rawEntries = candidate.sections?.[definition.id]
    if (!Array.isArray(rawEntries) || rawEntries.length === 0) return
    const limit = definition.maxItems ?? Number.POSITIVE_INFINITY
    sections[definition.id] = rawEntries.slice(0, limit).map((rawEntry) => {
      const entry = rawEntry as Partial<MaterialEntry>
      const rawAnswers = entry.answers ?? {}
      return {
        id: typeof entry.id === 'string' && entry.id ? entry.id : createId(),
        answers: Object.fromEntries(definition.fields.map((field) => {
          const rawAnswer = rawAnswers[field.id] as MaterialAnswer | undefined
          const status: AnswerStatus = rawAnswer?.status === 'later' || rawAnswer?.status === 'unsure'
            ? rawAnswer.status
            : 'active'
          return [field.id, {
            text: typeof rawAnswer?.text === 'string' ? rawAnswer.text : '',
            status,
          }]
        })),
      }
    })
  })

  return {
    version: 1,
    sections,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
  }
}

function answerOutput(answer: MaterialAnswer | undefined) {
  const text = answer?.text.trim() ?? ''
  if (text) return text
  if (answer?.status === 'later') return '稍後再填'
  if (answer?.status === 'unsure') return '目前不確定'
  return ''
}

export function materialEntryTitle(definition: MaterialSectionDefinition, entry: MaterialEntry, index: number) {
  const preferredField = definition.fields.find(field => ['title', 'area', 'program', 'text', 'name', 'quality'].includes(field.id))
  return (preferredField ? entry.answers[preferredField.id]?.text.trim() : '') || `${definition.itemLabel} ${index + 1}`
}

export function getSopProgress(state: SopMaterialBankState) {
  let total = 0
  let answered = 0
  let deferred = 0
  const sections = {} as Record<SopSectionId, { total: number; answered: number; deferred: number; percent: number }>

  SOP_SECTION_DEFINITIONS.forEach((definition) => {
    const result = { total: 0, answered: 0, deferred: 0, percent: 0 }
    state.sections[definition.id].forEach((entry) => {
      definition.fields.forEach((field) => {
        result.total += 1
        const answer = entry.answers[field.id]
        if (answer?.text.trim()) result.answered += 1
        else if (answer?.status === 'later' || answer?.status === 'unsure') result.deferred += 1
      })
    })
    result.percent = result.total ? Math.round((result.answered / result.total) * 100) : 0
    sections[definition.id] = result
    total += result.total
    answered += result.answered
    deferred += result.deferred
  })

  return {
    total,
    answered,
    deferred,
    percent: total ? Math.round((answered / total) * 100) : 0,
    sections,
  }
}

export function localDateStamp(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface ExportEntry {
  heading: string
  fields: Array<{ label: string; value: string }>
}

export interface ExportSection {
  heading: string
  entries: ExportEntry[]
}

export function exportableSections(state: SopMaterialBankState): ExportSection[] {
  return SOP_SECTION_DEFINITIONS.map((definition) => {
    const entries = state.sections[definition.id].map((entry, index) => ({
      heading: definition.repeatable
        ? `${definition.itemLabel} ${index + 1}`
        : definition.itemLabel,
      fields: definition.fields.map((field) => ({
        label: field.label,
        value: answerOutput(entry.answers[field.id]),
      })).filter((field) => field.value),
    })).filter((entry) => entry.fields.length > 0)
    return {
      heading: `${definition.number}. ${definition.title}`,
      entries,
    }
  }).filter((section) => section.entries.length > 0)
}

export function exportSopMaterialBankTxt(state: SopMaterialBankState) {
  const date = localDateStamp()
  const lines = [
    'SOP Material Bank',
    `匯出日期：${date}`,
    '',
  ]

  exportableSections(state).forEach((section) => {
    lines.push(section.heading, '='.repeat(section.heading.length), '')
    section.entries.forEach((entry) => {
      lines.push(entry.heading, '-'.repeat(entry.heading.length))
      entry.fields.forEach((field) => {
        lines.push(`${field.label}：`, field.value, '')
      })
    })
    lines.push('')
  })

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  downloadBlob(blob, `SOP_Material_Bank_${date}.txt`)
}

export function createSopMaterialEntryTxt(definition: MaterialSectionDefinition, entry: MaterialEntry, index: number, date = new Date()) {
  const title = materialEntryTitle(definition, entry, index)
  const stamp = localDateStamp(date)
  const lines = [
    `SOP 素材｜${title}`,
    `分類：${definition.title}（${definition.eyebrow}）`,
    `匯出日期：${stamp}`,
    '',
  ]
  definition.fields.forEach((field, fieldIndex) => {
    const answer = entry.answers[field.id]
    lines.push(`${fieldIndex + 1}. ${field.label}`)
    if (answer?.status === 'later') lines.push('狀態：稍後再填')
    if (answer?.status === 'unsure') lines.push('狀態：目前不確定')
    lines.push('回答：', answer?.text.trim() ? answer.text : '（尚未填寫）', '')
  })
  const safeTitle = [...title.normalize('NFC').replace(/[^\p{L}\p{N}\p{M}\s._-]/gu, '_').replace(/\s+/g, ' ').replace(/^[ .]+|[ .]+$/g, '')].slice(0, 60).join('').trim() || definition.itemLabel
  return { text: lines.join('\n'), fileName: `SOP_${definition.id}_${safeTitle}_${stamp}.txt` }
}

export function exportSopMaterialEntryTxt(definition: MaterialSectionDefinition, entry: MaterialEntry, index: number) {
  const { text, fileName } = createSopMaterialEntryTxt(definition, entry, index)
  downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), fileName)
}
