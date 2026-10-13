<p align="center"><img src="public/easier-icon.svg" width="64" alt="Easier logo" /></p>

# Easier

**把研究所申請整理成自己的工作區。**

Easier 是免費、開源的學程研究與申請管理工具：整理選校結果、比較不同 program、記錄想法、追蹤材料與文件。採用繁體中文介面，內建像編輯器一樣的並排工作區；導覽集中於單一側欄，拖曳時僅顯示游標所在的淡色落點預覽。

**Free, open-source graduate application workspace.** Organize programs, shortlist decisions, notes, documents and application materials. Traditional Chinese interface. Works locally without an account; optional Supabase sync uses your own project.

[下載原始碼 ZIP](https://github.com/Russell512/Easier-Open/archive/refs/heads/main.zip) · [回報問題](https://github.com/Russell512/Easier-Open/issues) · [MIT 授權](LICENSE)

![Easier 選校與筆記並排工作區](docs/workspace.png)

## 可以做什麼？

- **以學程為單位研究**：同一所學校的 MSCS、MCS 或其他學位分開管理；查看要求、時程、研究線索與官方連結。
- **清楚的選校結果**：彩票、衝刺、主申、較為保險分成四個向下排列的區域，卡片依可用寬度排列。頁面上方的「匯出選校 CSV」只包含這四類中的全部學程，不受搜尋影響；分類置前，保留目前修改的學程資料。未分類與淘汰預設收合，展開後仍可搜尋、重新分類。
- **最多四欄並排**：拖曳頂部分頁或筆記到內容的左／右側，或用「並排開啟」選單。每欄獨立捲動；三點分隔線可拖曳調寬，雙擊平分，方向鍵微調。右上角 × 關閉後，其他欄位按比例填補空間。
- **Notes 側欄**：像筆記 App 一樣集中查看、搜尋、新增筆記。點選在右側開啟；可同時編輯不同筆記，每篇包含文字與 checklist。學程專屬筆記也會出現在清單。
- **材料與文件**：追蹤 CV、SOP、成績單、考試、推薦信；保留文件版本及適用學程。加入文件不代表已提交申請。
- **Excel 與備份**：匯入／匯出 `.xlsx`、匯出學程 `.csv`，完整備份包含筆記與文件。
- **選用雲端同步**：使用自己的 Supabase，登入後同步變更，版本衝突時保留兩邊資料供選擇。

## 5 分鐘開始

需要 **Node.js 22+** 與 npm。下載 ZIP 後解壓縮，或：

```bash
git clone https://github.com/Russell512/Easier-Open.git
cd Easier-Open
npm ci
npm run dev
```

打開終端顯示的網址（通常 `http://localhost:5173`）。**不用登入，也不用設定環境變數。**

1. 從「選校結果」試著拖拉示範卡片，或使用卡片上的選單。
2. 按側欄 Notes 的 `+`，在右側記錄想法。
3. 用「並排開啟」加一個學程，拖動分隔線，試試 2–4 欄。
4. 到「資料與備份」匯出 Excel，改成自己的學程後再匯入。

本 repo 附 **6 個虛構學程**，不是經過查證的招生清單。截止日、考試要求與費用刻意不填猜測值。請填入各學程官方來源與查核日期。沒有任何人的選校評分、私人筆記、履歷或帳號金鑰。

## 自訂 Excel

起始檔位於 [`public/data/update_info.xlsx`](public/data/update_info.xlsx)。可先從應用程式匯出，保留工作表名稱與欄名，再替換資料列。

| 工作表 | 用途與關聯 |
| --- | --- |
| `Programs` | 每列一個學程；`University` + `Program Name` 作為身分 |
| `Application Checklist` | 每學程一列；`University` + `Program` 必須對上學程名称 |
| `Per-Program Timeline` | 每學程的任務、官方日期與個人目標日 |
| `Faculty` | 教授研究線索，可保持空白 |
| `Master Timeline` | 跨學程的整體計畫 |
| `Easier Template` | 範本識別，請保留 |

同校不同學程必須用不同名稱。更名可能影響與舊筆記、分類、文件的關聯，匯入前先下載「完整搬移備份」。重新產生原始示範檔可執行 `node scripts/create-demo-workbook.mjs public/data/update_info.xlsx`；這會覆寫該檔案。

## 儲存方式

| 模式 | 資料放哪裡 | 是否跨裝置同步 |
| --- | --- | --- |
| 本機／靜態網站 | 該網址及瀏覽器的 localStorage、IndexedDB | 不會；請匯出／匯入完整備份 |
| 自建 Supabase | 自己的資料庫與私人檔案 bucket，加上瀏覽器副本 | 會；修改後自動上傳 |

本機模式清除網站資料、換瀏覽器或換網址不會自動帶走資料。請定期點頁首「下載完整搬移備份」。分頁布局是各裝置自己的偏好；筆記內容則會跟著工作區同步。不是電腦資料夾背景同步，也不會把每次修改推到 GitHub。

## 建置與部署

### 免帳號的靜態版本

```bash
npm run build:local
npm run preview
```

輸出在 `dist/`，可交給一般靜態網站主機。repo 的 Vercel 設定預設使用 `build:local`，GitHub 匯入後即可部署。每位訪客的資料只存在自己的瀏覽器。

**靜態模式的 `public/` 是公開資源。只放示範／可公開的 Excel；個人資料請在網頁中匯入。** 沒有 service worker，首次載入與重新整理仍需要伺服器可連線。

### 使用自己的 Supabase（選用）

1. 建立 Supabase 專案，按檔名順序執行 `supabase/migrations/` 的 SQL，建立工作區、版本歷史、私人 storage bucket 與 RLS。
2. 在 Authentication 建立自己的 email/password 使用者。應用程式提供登入，不提供公開註冊介面。
3. 在 Storage 的私人 `easier-private` bucket，把起始 Excel 上傳到 `<使用者 UUID>/seed/update_info.xlsx`。每位使用者各自需要一份 seed。
4. 複製 `.env.example` 為 `.env.local`，填入你自己的 Supabase URL 與 **publishable / anon client key**。把 `VITE_LOCAL_MODE` 設為 `false`。**不要使用 `service_role` 金鑰**。
5. 部署環境也設定相同變數，將 Vercel 的 Build Command 改為 `npm run build:cloud`。`build:cloud` 會移除 `dist/data`，雲端 seed 改由登入後私下取得。
6. 先用測試帳號確認登入、編輯、重新登入与完整備份，再搬入自己的資料。

不要把 `.env.local`、資料庫備份或私人 Excel 提交進公開 repo。同步會檢查 revision；遇到兩台裝置同時修改，先备份再選擇版本。一次只允許同一瀏覽器一個分頁編輯雲端工作區，應用程式內的四欄不受此限制。

## 開發與檢查

```bash
npm run lint
npm run typecheck
npm run test:tabs
npm run test:shortlist
npm run test:notes
npm run test:documents
npm run test:autosync
npm run test:demo
npm run build:local
```

React 19 · TypeScript · Vite · SheetJS · dnd-kit · Supabase · Lucide

- `src/components/workbench/`：工作區、選校與學程頁
- `src/lib/workspaceTabs.ts`：分頁、分欄、比例與還原規則
- `src/lib/notes.ts`、`src/hooks/useApplicationNotes.ts`：筆記與自動儲存
- `src/lib/cloudSnapshot.ts`：雲端資料、Excel 與完整備份
- `supabase/migrations/`：可自行部署的資料庫結構

歡迎用 Issues 提出問題或提交 Pull Request。回報請附重現步驟與瀏覽器版本，使用虛構資料重現，避免貼出自己的申請文件或金鑰。

## 授權

程式碼與虛構範例採 [MIT License](LICENSE)，可免費下載、修改與分享。第三方套件依各自授權；PDF 匯出的 Noto Sans TC 字型採 [SIL Open Font License 1.1](public/assets/OFL-NotoSansTC.txt)。
