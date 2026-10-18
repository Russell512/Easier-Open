# Apple 登入設定

Easier 的工作區與分享頁已接上 Supabase 的 Apple OAuth 流程。登入頁會讀取 Supabase Auth 的公開 `/auth/v1/settings`：只有 `external.apple` 為 `true` 才能按下 Apple 登入。未啟用時顯示「Apple 登入尚未啟用」；讀取失敗時保留 Google 與 Email 登入。啟用後重新整理網頁即可，不需要重新部署前端。

2026-10-19：原站目前開放 Google 登入與既有 Email 帳號登入；Email 註冊須待自訂 SMTP 配置完成才啟用。Apple 保持停用：站方已確認只有一般 Apple Developer 帳號，尚未加入 Apple Developer Program，沒有本次啟用所需的 Services ID／簽名憑證；不應把「已註冊 Developer」當成已具備會員資源。一般註冊與 Program 會員可用資源的差異見 [Apple 開發者帳號說明](https://developer.apple.com/help/account/basics/about-your-developer-account)。登入按鈕與 OAuth 程式已備妥，但尚未完成真實 Apple 登入驗證。

## 站方需要完成的設定

1. 先具備 Apple Developer Program 團隊的相應權限，再建立或選擇已開啟 Sign in with Apple 的主要 App ID。只有免費開發者註冊時，保留停用，待站方決定加入 Program 或取得合適團隊權限後再設定。
2. 在 Apple Developer 的 Certificates, Identifiers & Profiles 建立 **Services ID**，並將 Sign in with Apple 連到主要 App ID。
3. 在該 Services ID 的 Website URLs 設定 Supabase 專案網域 `<project-ref>.supabase.co`，Return URL 設為 `https://<project-ref>.supabase.co/auth/v1/callback`。若使用 Supabase 自訂網域，改用 Dashboard 顯示的 callback。
4. 建立 Sign in with Apple signing key，安全保存 `.p8`，並準備 Team ID、Key ID、Services ID，以產生 Apple client secret。
5. 在 Supabase Dashboard → Authentication → Sign In / Providers → Apple 填入 Services ID 與 client secret，再啟用 Apple。Web OAuth 使用 Client IDs 清單的第一項，因此 Services ID 應放第一項。
6. 在 Supabase Authentication → URL Configuration 檢查 Site URL 與 Redirect URLs，包含正式站點 `https://easier-eight.vercel.app/` 及實際使用的回跳網址。分享登入須允許同站帶 `?share=…` 的回跳；可採用正式站點的 `https://easier-eight.vercel.app/**` 規則，避免開放其他站點。Localhost 測試另列明確網址，不要把未受控的 preview 網域全數放行。
7. 在手機 Safari 與桌面瀏覽器實際登入。確認一般登入回到工作區、分享登入回到同一份分享、取消登入有清楚提示。

Apple OAuth client secret 最長六個月到期。請在到期前重新產生並更新 Supabase，保留簽名 key，並將到期日記在團隊的憑證管理流程中。`.p8`、client secret、Supabase service-role key 都不能放進 GitHub 或任何 `VITE_*` 前端變數。

## 帳號與既有資料

每位完成驗證且非匿名的使用者都有自己的獨立工作區。首次登入由 `easier_ensure_workspace_access` 以目前使用者 UUID 初始化權限；`easier_can_edit_workspace`、資料庫與私人檔案規則仍限制為本人。新帳號從零學程開始，不需要手動加入名單或複製原擁有者 seed；已有帳號的工作區、歷史、文件與分享保持原樣。

Apple 的隱藏 Email 可能產生不同帳號。工作區依驗證後的 UUID 決定歸屬，不依姓名或未驗證的 Email 合併。若未來 Apple 登入建立了另一個帳號，它會得到自己的空白工作區，不會接收原帳號的私人資料；需要搬移時應先確認帳號，再明確匯入本人備份。

同一瀏覽器切換帳號時，各帳號的本機工作區會分別封存與恢復；無法確認擁有者的舊資料隔離保留，不會自動交給下一個登入者。Email 註冊預設關閉；自訂 SMTP 與確認流程驗證完成後，才可設定 `VITE_EMAIL_SIGNUP_ENABLED=true` 並重新建置。啟用後若尚未取得 session，只顯示查收確認信提示，不建立可編輯工作區。

## 驗證

執行 `node scripts/check-oauth-auth.mjs`，涵蓋 Apple／Google OAuth 選項、同來源回跳、分享 token、錯誤回跳提示，以及 provider 狀態讀取與重試。設定端點回傳 Apple 啟用只表示開關已開；憑證是否有效仍需要真實 Apple 帳號完成登入驗證。

## 官方參考

- [Supabase：Sign in with Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Apple：Configure Sign in with Apple for the web](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web)
- [Apple：Register a Services ID](https://developer.apple.com/help/account/identifiers/register-a-services-id/)
- [Supabase：Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase Auth：公開 settings 回應](https://github.com/supabase/auth/blob/master/internal/api/settings.go)
- [Google：登入按鈕品牌指引與 SVG 產生器](https://developers.google.com/identity/branding-guidelines)
