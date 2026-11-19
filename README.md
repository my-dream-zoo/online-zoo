# 壽山動物園線上動物園

開發中的壽山動物園線上動物園。最終預計放在 `https://shoushanzoo-memorial.github.io/` 根網址，緬懷地圖搬到 `/memorial/`。

- `index.html`：適合手機瀏覽的施工頁，讀取已核准展區。
- `src/`：預留網站程式。
- `assets/`：預留網站素材。
- `data/`：匯出的 JSON；目前全部是明顯假資料，正式上線前須重新匯出。
- `tools/`：匯出程式、設定、欄位結構與單元測試。
- `tools/test_fixtures/`：九個內容分頁的假 CSV。

## 匯出內容

使用 Python 3.12 標準函式庫，不需要安裝套件。先在 `tools/content_config.json` 填入 `sheet_id`，並將 Google 試算表設為「知道連結的人可檢視」，再雙擊 `tools/匯出內容.bat`。

離線匯出（PowerShell，可在任何工作目錄執行）：

```powershell
& 'C:\Users\User\tools\python\cpython-3.12.16-windows-x86_64-none\python.exe' '.\tools\export_content.py' --from-dir '.\tools\test_fixtures'
```

將上面的程式路徑改成 `tools\test_export.py` 並移除 `--from-dir` 及其參數，即可執行單元測試。

只匯出審核狀態為「已核准」的內容，移除審核狀態、來源、備註。ID 檢查涵蓋所有非空白列。任何資料驗證錯誤會讓整次匯出不寫檔；單頁讀取失敗則仍匯出其餘成功分頁，保留失敗頁既有 JSON，結束碼為 1。請確認中文摘要與 `data/_export_info.json` 沒有錯誤後才發布，避免使用舊資料。成功結束碼為 0。

欄位規格依內容資料庫的 `欄位規格.md`，對應結構放在 `tools/schema.json`；「說明」分頁不匯出。JSON 依排序或順序穩定排序，測驗正解轉為略過空白選項後的索引。

透過 HTTP 靜態伺服器預覽網站；直接雙擊 HTML 時，瀏覽器可能無法讀取 JSON，會僅顯示施工中。
