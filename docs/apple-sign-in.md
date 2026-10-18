# Apple 登入設定

Easier 的工作區與分享頁已接上 Supabase 的 Apple OAuth 流程。登入頁會讀取 Supabase Auth 的公開 `/auth/v1/settings`：只有 `external.apple` 為 `true` 才能按下 Apple 登入。未啟用時顯示「Apple 登入尚未啟用」；讀取失敗時保留 Google 與 Email 登入。啟用後重新整理網頁即可，不需要重新部署前端。

2026-10-19 以公開設定端點唯讀確認：目前專案 Google、Email 已啟用，Apple 尚未啟用。這只能確認 provider 開關，不能證明 Apple 憑證是否已準備好。本次前端修改沒有變更正式環境的登入設定或資料權限。

## 站方需要完成的設定

1. 準備可使用 Sign in with Apple 的 Apple Developer 帳號，建立或選擇已開啟該能力的主要 App ID。
2. 在 Apple Developer 的 Certificates, Identifiers & Profiles 建立 **Services ID**，並將 Sign in with Apple 連到主要 App ID。
3. 在該 Services ID 的 Website URLs 設定 Supabase 專案網域 `<project-ref>.supabase.co`，Return URL 設為 `https://<project-ref>.supabase.co/auth/v1/callback`。若使用 Supabase 自訂網域，改用 Dashboard 顯示的 callback。
4. 建立 Sign in with Apple signing key，安全保存 `.p8`，並準備 Team ID、Key ID、Services ID，以產生 Apple client secret。
5. 在 Supabase Dashboard → Authentication → Sign In / Providers → Apple 填入 Services ID 與 client secret，再啟用 Apple。Web OAuth 使用 Client IDs 清單的第一項，因此 Services ID 應放第一項。
6. 在 Supabase Authentication → URL Configuration 檢查 Site URL 與 Redirect URLs，包含正式站點 `https://easier-eight.vercel.app/` 及實際使用的回跳網址。分享登入須允許同站帶 `?share=…` 的回跳；可採用正式站點的 `https://easier-eight.vercel.app/**` 規則，避免開放其他站點。Localhost 測試另列明確網址，不要把未受控的 preview 網域全數放行。
7. 在手機 Safari 與桌面瀏覽器實際登入。確認一般登入回到工作區、分享登入回到同一份分享、取消登入有清楚提示。

Apple OAuth client secret 最長六個月到期。請在到期前重新產生並更新 Supabase，保留簽名 key，並將到期日記在團隊的憑證管理流程中。`.p8`、client secret、Supabase service-role key 都不能放進 GitHub 或任何 `VITE_*` 前端變數。

## 帳號與既有資料

Apple 登入只負責驗證身分，沒有放寬工作區權限。工作區仍由 `easier_can_edit_workspace` 與資料庫規則決定是否允許編輯；其他已登入者只能透過分享連結查看擁有者開放的內容。

Apple 的隱藏 Email 可能產生不同身分。請先確認登入帳號對應，再由站方按既有流程授權；不要自動把任何 Apple 帳號當成工作區擁有者，也不要依姓名合併私人資料。

## 驗證

執行 `node scripts/check-oauth-auth.mjs`，涵蓋 Apple／Google OAuth 選項、同來源回跳、分享 token、錯誤回跳提示，以及 provider 狀態讀取與重試。設定端點回傳 Apple 啟用只表示開關已開；憑證是否有效仍需要真實 Apple 帳號完成登入驗證。

## 官方參考

- [Supabase：Sign in with Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Apple：Configure Sign in with Apple for the web](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web)
- [Apple：Register a Services ID](https://developer.apple.com/help/account/identifiers/register-a-services-id/)
- [Supabase：Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase Auth：公開 settings 回應](https://github.com/supabase/auth/blob/master/internal/api/settings.go)
- [Google：登入按鈕品牌指引與 SVG 產生器](https://developers.google.com/identity/branding-guidelines)
