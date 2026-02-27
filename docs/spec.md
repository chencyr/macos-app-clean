## macos-app-clean SPEC

macos-app-clean 是一個 macOS 專用的 Node.js CLI 工具，用來**掃描、檢視與強制清理應用程式及其相關殘留檔案**。  
本文件描述其對外行為、CLI 介面、內部模組切分與安全保證，作為實作與維護時的參考規格。

---

## 1. CLI 介面規格

### 1.1 指令名稱與執行方式

- **指令名稱**：`macos-app-clean`
- **執行方式**
  - 全域安裝後：
    - `macos-app-clean [options]`
  - 在專案根目錄（未全域安裝）：
    - `npx macos-app-clean [options]`

### 1.2 支援的選項

- **`--filter=<keyword>`**
  - 類型：字串
  - 作用：在掃描結果中，以 `key` 與 `rawName`（實際檔名）做子字串比對，只保留包含該關鍵字的 group。

- **`--system`**
  - 類型：布林 flag
  - 作用：將系統層級目錄（`/Library/...` 等）也納入掃描。

- **`--delete=<keyword>`**
  - 類型：字串
  - 作用：啟用「刪除模式」，以 `keyword` 匹配 group（對 group 的 `key` 與 `name` 做子字串比對），列出所有將被刪除的路徑。
  - 預設為 **dry-run**，除非同時加上 `--force`。

- **`--force`**
  - 類型：布林 flag
  - 作用：在 `--delete` 模式下，實際執行刪除動作。
  - 若 **未加** `--rm`，則刪除行為為**移動至 `~/.Trash`**。

- **`--rm`**
  - 類型：布林 flag
  - 前提：需搭配 `--force` 才會生效。
  - 作用：在 `--force` 基礎上，將刪除行為改為**實體刪除（permanent delete）**。

- **`--json`**
  - 類型：布林 flag
  - 作用：輸出 JSON 結果至 stdout，而非人類可讀的文字表格。僅做掃描輸出，不搭配刪除流程。

- **`--minHits=<n>`**
  - 類型：整數
  - 預設值：`1`
  - 作用：只保留命中路徑數（`hitCount`）大於等於 `n` 的 group，用於降低雜訊。

- **`--undo-list`**
  - 類型：布林 flag
  - 作用：列出最近幾次可 rollback 的刪除操作紀錄（僅包含「移到 Trash」的刪除），包含：
    - 操作建立時間（`time`）
    - 最後一次被 undo 的時間（`lastUndo`，若尚未 undo 則為 `-`）
    - 被 undo 的累計次數（`undos`）

- **`--undo-last`**
  - 類型：布林 flag
  - 作用：針對最後一次「移到 Trash」的刪除操作建立還原計畫。
  - 預設為 **dry-run**，只列出將被還原的路徑；需搭配 `--force` 才會實際還原。

- **`--undo-id=<operationId>`**
  - 類型：字串
  - 作用：指定某一筆刪除操作紀錄做還原，行為同 `--undo-last`。
  - 預設為 dry-run，需搭配 `--force` 才實際還原。

### 1.3 行為模式

- **預設模式（無 `--delete`）**
  - 執行掃描，依照命中數排序列出所有 group。
  - 不會做任何檔案刪除（dry-run 列表）。

- **刪除模式（`--delete=<keyword>`）**
  - 先列出所有匹配的 group 與將要刪除的路徑（dry-run）。
  - **未加 `--force`**：只列出路徑與說明，**不會刪除任何檔案**。
  - **加上 `--force` 但無 `--rm`**：實際刪除時，將所有路徑搬移到 `~/.Trash`。
  - **同時加上 `--force --rm`**：實際刪除時，對目標路徑做遞迴硬刪除（`fs.rmSync(..., { recursive: true, force: true })`）。

---

## 2. 掃描與分組規格

### 2.1 掃描根目錄（scan roots）

- **使用者層級（永遠掃描）**
  - `/Applications`
  - `~/Applications`
  - `~/Library/Application Support`
  - `~/Library/Preferences`
  - `~/Library/Caches`
  - `~/Library/Logs`
  - `~/Library/Saved Application State`
  - `~/Library/Containers`
  - `~/Library/Group Containers`

- **系統層級（僅在 `--system` 時加入）**
  - `/Library/Application Support`
  - `/Library/Preferences`
  - `/Library/Caches`
  - `/Library/Logs`
  - `/Library/LaunchAgents`
  - `/Library/LaunchDaemons`

### 2.2 掃描深度限制

- 使用遞迴走訪 `walk(dir, depth)`。
- 常數：`MAX_DEPTH = 2`。
- 行為：`depth > MAX_DEPTH` 時即停止深入該分支。

### 2.3 雜訊排除與 key 正規化

- **忽略名稱（noise / 不納入 group）**
  - `NOISE_NAMES` 集合：
    - `"com.apple"`, `"Apple"`, `".DS_Store"`, `"CrashReporter"`, `"DiagnosticReports"`
  - 額外忽略名稱：
    - `"Caches"`, `"Preferences"`, `"Logs"`

- **key 正規化規則（`normalizeKey(name)`）**
  - 先去除副檔名：
    - 移除尾端的 `.app`（不分大小寫）。
    - 移除尾端的 `.plist`（不分大小寫）。
  - 再處理 bundle identifier 類型字串：
    - 若符合 `^[a-z0-9-]+\.[a-z0-9-]+\.` 形式（類似 `com.vendor.Product`）：
      - 以 `.` 分割為陣列。
      - 針對第一段，如果屬於 `["com", "net", "org", "io", "app"]` 則捨棄。
      - 取保留結果的前 3 段並以 `/` 串接，如：`com.google.Chrome` → `google/chrome`。
  - 結果字串最後一律轉為小寫（`toLowerCase()`）。

- **顯示名稱（`displayNameFromKey(key)`）**
  - 以 `/` 分段，對每一段：
    - 將 `-` 與 `_` 轉為空白。
    - 將每段的首字母轉為大寫。
  - 以 `" / "` 連接所有段落，例如：
    - `"google/chrome"` → `"Google / Chrome"`
    - `"firefox"` → `"Firefox"`

### 2.4 group 結構

掃描完成後，每個 group 的結構為：

```js
{
  key: string,        // 正規化 key（小寫）
  name: string,       // 用 displayNameFromKey 轉換的可讀名稱
  hitCount: number,   // 去重後路徑數量
  roots: string[],    // 出現過的 root 目錄集合
  samplePaths: string[], // 部分樣本路徑（最多 6 筆）
  allPaths: string[]  // 完整路徑清單（去重後）
}
```

掃描流程：

1. 對每個 `scanRoot` 執行 `scanDir(root)` 取得 hits。
2. 將所有 hits 依照 `key` 收斂為 group。
3. 依 `minHits` 過濾：只保留 `hitCount >= minHits` 的 group。
4. 最終依照：
   - `hitCount` 由大到小排序；
   - 若相同，則以 `name` 字母順序排序。

---

## 3. 刪除流程與安全規範

### 3.1 group 匹配規則

- 函式：`matchGroups(groups, query)`
- 規則：
  - 將 `query` 轉為小寫。
  - 回傳所有符合以下任一條件的 group：
    - `group.key` 包含 `query`（子字串）
    - `group.name.toLowerCase()` 包含 `query`（子字串）

### 3.2 刪除執行步驟（`runDelete`）

1. 以 `matchGroups` 找到所有目標 group。
2. 將所有目標 group 的 `allPaths` 收斂成一個去重後的集合。
3. 以排序後的路徑陣列做輸出與處理。
4. 先輸出：
   - 匹配到的 group 數量與各 group 摘要。
   - 總共將處理的唯一路徑數量。
   - 目前模式（DRY-RUN / MOVE TO TRASH / PERMANENT DELETE）。
   - 詳列所有路徑。
5. 若**未加 `--force`**：
   - 僅作 dry-run，提示「需加 `--force` 才會執行」。
   - 不對任何檔案做實際變動。
6. 若**加上 `--force`**：
   - 對每一條路徑：
     - 先做危險路徑檢查（見下節）。
     - 若路徑不存在，記錄為 `skipped: "not found"`。
     - 若存在且 `permanentRm = true`：呼叫 `rmRecursive(path)` 做遞迴刪除。
     - 若存在且 `permanentRm = false`：呼叫 `moveToTrash(path, trashDir)` 將路徑搬移到垃圾桶中。
7. 最後輸出成功/失敗統計與錯誤摘要（最多顯示 50 筆失敗）。
8. 在非永久刪除模式下，額外列出實際使用的垃圾桶路徑（`trashDir`）。

### 3.3 危險路徑防護

- 函式：`isDangerousPath(p, homeDir)`
- 工具會**拒絕直接刪除以下路徑本身**：
  - `homeDir`（`$HOME`）
  - `path.join(homeDir, "Library")`（`$HOME/Library`）
  - `"/Library"`
  - `"/Applications"`
- 若檢測到目標路徑等於上述任一項：
  - 不執行刪除/搬移。
  - 在結果中記錄為錯誤：`"Refused: dangerous root path"`。

### 3.4 垃圾桶搬移語意

- 垃圾桶路徑：
  - 預設：`trashDir = path.join(homeDir, ".Trash")`
- 行為：
  - 在每次刪除執行前確保 `trashDir` 存在（如無則嘗試建立）。
  - 產生唯一目標路徑格式：
    - `<basename>__deleted__<ISO_TIMESTAMP>`，若已存在則加上 `__<n>` 遞增。
  - 優先使用 `fs.renameSync` 搬移（同磁碟時高效）。
  - 若 rename 失敗：退回為 `copyDir + rmRecursive` 策略。
    - `copyDir` 在遞迴複製時：
      - 目錄：呼叫自身繼續遞迴。
      - symlink：略過，不複製，避免意外跨檔案系統。
      - 特殊檔案 `.com.apple.containermanagerd.metadata.plist`（以及以 `.com.apple.containermanagerd.metadata` 開頭的檔案）：略過不複製，以避免 macOS Container metadata 權限問題導致整個 Trash 搬移失敗。
  - 不會複製 symlink 本身（會略過），避免不預期的跨檔案系統行為。
  - 若在 fallback 的 `copyDir + rmRecursive` 過程中出現 macOS 權限/鎖定相關錯誤（例如 `EPERM`, `ENOTEMPTY`, `EBUSY` 或錯誤訊息包含 `operation not permitted` / `directory not empty` / `resource busy`）：
    - 會在錯誤訊息後附加一段英文說明，提示這可能是 macOS 權限或鎖定限制，建議：
      - 關閉相關 App 或背景 agent。
      - 卸載掛載中的磁碟映像。
      - 在系統設定中為 `macos-app-clean` 啟用 Full Disk Access。
    - 工具**不會**自動使用 `sudo` 或嘗試繞過系統保護。

---

## 4. 內部模組切分

### 4.1 `bin/macos-app-clean`

- 負責：
  - Shebang (`#!/usr/bin/env node`)。
  - 呼叫 `require("../index").main(process.argv.slice(2))`。
- 不實作任何業務邏輯。

### 4.2 `index.js`

- 匯出：
  - `main(argv)`：CLI 入口，通常由 `bin/macos-app-clean` 呼叫。
  - `scan(options)`：程式庫 API，執行掃描並回傳 groups。
  - `deleteResidues(query, options)`：程式庫 API，執行刪除流程（dry-run 或實際刪除，依 options）。
- 主要職責：
  - 對外提供 stable API（CLI + programmatic）。

### 4.3 `src/cli.js`

- 函式：
  - `parseArgs(argv)`：解析 CLI 參數（`--filter`, `--system`, `--delete`, `--force`, `--rm`, `--json`, `--minHits`）。
  - `printGroups(groups, scanRoots, filter)`：以人類可讀形式列出掃描結果。
  - `runCLI(argv, options)`：整合掃描與刪除流程的高階函式，作為 `main` 實作。
- 職責：
  - 專注於 CLI 參數處理與輸出格式。

### 4.4 `src/scanner.js`

- 導出：
  - `MAX_DEPTH`
  - `existsDir`
  - `safeReaddir`
  - `safeStat`
  - `scanDir(root)`
  - `buildScanRoots(homeDir, includeSystem)`
  - `buildGroups({ homeDir, includeSystem, filter, minHits })`
- 職責：
  - 實作實際的檔案系統掃描與 group 建構邏輯。

### 4.5 `src/normalizer.js`

- 導出：
  - `NOISE_NAMES`
  - `shouldIgnore(name)`
  - `normalizeKey(name)`
  - `displayNameFromKey(key)`
- 職責：
  - 專門處理名稱過濾與 key 正規化、可讀名稱生成。

### 4.6 `src/matcher.js`

- 導出：
  - `matchGroups(groups, query)`
- 職責：
  - 將 groups 與使用者輸入的關鍵字做比對，抽象出匹配策略。

### 4.7 `src/deleter.js`

- 導出：
  - `rmRecursive(p)`
  - `copyDir(src, dest)`
  - `ensureTrashDir(trashDir)`
  - `uniqueTrashPath(originalPath, trashDir)`
  - `moveToTrash(p, trashDir)`
  - `isDangerousPath(p, homeDir)`
  - `runDelete(groups, query, { homeDir, trashDir, force, permanentRm })`
- 職責：
  - 實際檔案/目錄刪除與垃圾桶搬移的實作。
  - 集中處理所有安全 guardrails。

---

## 5. 測試與未來擴充

### 5.1 測試策略（現況）

- 使用 Jest 作為測試框架。
- 目前測試重點：
  - `normalizer`：
    - `normalizeKey` 是否正確處理 `.app` / `.plist` 與 bundle id。
    - `displayNameFromKey` 是否產生合理的顯示名稱。
  - `deleter`：
    - `isDangerousPath` 是否正確拒絕 `$HOME`、`$HOME/Library`、`/Library`、`/Applications`。
- 測試**不會對真實系統目錄做任何修改**，未來若要測試刪除流程應使用 mock FS。

### 5.2 未來擴充方向（對齊 AGENTS.md）

- 解析 `.app/Contents/Info.plist`，取得：
  - `CFBundleIdentifier`
  - `CFBundleName`
- 以 bundle identifier 更精準地對應：
  - `~/Library/Application Support`
  - `~/Library/Preferences`
  - `~/Library/Caches`
  - 等相關路徑。
- 增加清理策略選項（例如：只清 cache / 完整移除 / 保留使用者資料）。
- 新增互動式模式（interactive mode）：
  - 先顯示候選 group，讓使用者逐一勾選或確認。
- 匯出刪除計畫：
  - `--export-plan`：僅輸出將刪除的路徑列表，以便人工審核或外部工具使用。

