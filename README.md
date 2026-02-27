## macos-app-clean

macOS 專用的 Node.js CLI 工具，用來**掃描、檢視與強制清理應用程式及其殘留資料**，預設為安全的 dry-run 與移動到垃圾桶行為。

---

## 開發環境安裝與執行

- **1. 安裝相依套件**

```bash
cd macos-app-clean
npm install
```

- **2. 執行測試（Jest）**

```bash
npm test
```

- **3. 以原始碼方式執行 CLI（不全域安裝）**

在專案根目錄：

```bash
npx macos-app-clean
npx macos-app-clean --filter=chrome
npx macos-app-clean --delete=chrome        # 預設 dry-run
npx macos-app-clean --delete=chrome --force
npx macos-app-clean --delete=chrome --force --rm
npx macos-app-clean --system
```

---

## 生產環境安裝與使用

> 建議使用 **全域安裝**，以便直接在 shell 內使用 `macos-app-clean` 指令。  
> 注意：此工具只應在 macOS 上使用。

- **1. 全域安裝**

在專案根目錄執行：

```bash
npm install -g .
```

完成後，系統中會有 `macos-app-clean` 指令可用。

- **2. 基本使用方式**

- **掃描所有應用程式與相關殘留路徑（dry-run, 預設）**：

```bash
macos-app-clean
```

- **依關鍵字過濾結果**：

```bash
macos-app-clean --filter=chrome
```

- **檢視指定應用程式的刪除目標（dry-run, 不實際刪除）**：

```bash
macos-app-clean --delete=chrome
```

- **實際執行刪除（安全模式：移到 ~/.Trash）**：

```bash
macos-app-clean --delete=chrome --force
```

- **永久刪除（危險，請謹慎使用）**：

```bash
macos-app-clean --delete=chrome --force --rm
```

- **包含系統層級路徑（/Library 等）一起掃描**：

```bash
macos-app-clean --system
```

- **列出可 rollback 的刪除歷史紀錄**：

```bash
macos-app-clean --undo-list
```

`--undo-list` 會在每筆操作後顯示：

- `lastUndo`: 最後一次 undo 的時間（若尚未 undo 則為 `-`）
- `undos`: 被 undo 的累計次數

- **檢視並還原最後一次「移到 Trash」的刪除（預設 dry-run）**：

```bash
macos-app-clean --undo-last
macos-app-clean --undo-last --force
```

- **依指定操作 ID 檢視並還原（預設 dry-run）**：

```bash
macos-app-clean --undo-id=20260227-153012-abc123
macos-app-clean --undo-id=20260227-153012-abc123 --force
```

- **3. 進階：輸出 JSON 結果（方便整合其他工具）**

```bash
macos-app-clean --json > residues.json
```

---

## 安全行為摘要

- **預設執行為 dry-run，不會刪除任何檔案**。
- **預設刪除行為為搬移到 `~/.Trash`，只有 `--force --rm` 才會做永久刪除**。
- 工具會**拒絕刪除以下路徑本身**：
  - `$HOME`
  - `$HOME/Library`
  - `/Library`
  - `/Applications`
