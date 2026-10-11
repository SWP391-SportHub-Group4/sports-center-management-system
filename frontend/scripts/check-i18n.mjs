#!/usr/bin/env node
/**
 * Kiểm tra tĩnh cho quy chuẩn localization (docs/frontend-pt-manager-ux-redesign-plan.md, mục 4).
 *
 * Không kiểm tra parity key EN/VI ở đây — `vi.ts` đã được khai báo `: Translations` (kiểu của
 * `en.ts`) nên `tsc`/`npm run typecheck` đã chặn cứng việc thiếu/thừa key giữa hai ngôn ngữ.
 *
 * Script này chỉ bắt phần TypeScript không tự bắt được: chuỗi chứa mã nghiệp vụ `BR-\d+`
 * hoặc `SSOT` lọt ra ngoài comment (vào JSX/string hiển thị cho người dùng).
 *
 * MIGRATED_SCOPE là allowlist các file/thư mục đã được rà soát sạch theo kế hoạch — CHỈ những
 * đường dẫn này bị chặn. Phần còn lại của `src/app/**` vẫn còn BR-xx lộ ra UI (ghi nhận ở audit
 * mục 2) và sẽ được dọn dần qua các PR sau (kế hoạch mục 12); thêm cả cây vào đây trước khi dọn
 * xong sẽ làm CI đỏ vì việc ngoài phạm vi PR hiện tại. Mỗi phase dọn xong một khu vực thì thêm
 * đường dẫn tương ứng vào danh sách này để giữ được phần đã sạch không hồi quy.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const MIGRATED_SCOPE = [
  "src/components/AppShell.tsx",
  "src/components/ui.tsx",
  "src/lib/apiClient.ts",
  "src/lib/language.tsx",
  "src/locales/en.ts",
  "src/locales/vi.ts",
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const FORBIDDEN_PATTERN = /\b(BR-\d+|SSOT)\b/g;

/** Bỏ nội dung comment `//...` và `/* ... *\/` theo từng dòng — đủ cho code style của repo này. */
function stripComments(source) {
  let result = source.replace(/\/\*[\s\S]*?\*\//g, "");
  result = result
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
  return result;
}

async function collectFiles(path) {
  const st = await stat(path);
  if (st.isFile()) {
    return SOURCE_EXTENSIONS.has(extname(path)) ? [path] : [];
  }

  const entries = await readdir(path, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

/** locales/*.ts là dictionary thuần — không có khái niệm "comment code", nên không strip comment. */
function isDictionaryFile(relPath) {
  return relPath.startsWith("src/locales/");
}

async function checkScope() {
  const violations = [];

  for (const relPath of MIGRATED_SCOPE) {
    const absPath = join(ROOT, relPath);
    const files = await collectFiles(absPath);

    for (const file of files) {
      const raw = await readFile(file, "utf8");
      const relFile = file.replace(ROOT, "").replace(/\\/g, "/");
      const scanned = isDictionaryFile(relFile) ? raw : stripComments(raw);
      const lines = scanned.split("\n");

      lines.forEach((line, index) => {
        const matches = line.match(FORBIDDEN_PATTERN);
        if (matches) {
          violations.push({
            file: relFile,
            line: index + 1,
            matches: [...new Set(matches)],
          });
        }
      });
    }
  }

  return violations;
}

async function main() {
  const violations = await checkScope();

  if (violations.length === 0) {
    console.log(
      `check:i18n — OK: no BR-xx/SSOT text found outside comments in the migrated scope (${MIGRATED_SCOPE.length} path(s)).`,
    );
    return;
  }

  console.error(
    `check:i18n — FAIL: found ${violations.length} occurrence(s) of BR-xx/SSOT outside code comments in the migrated scope.\n` +
      "Theo mục 4.1 của kế hoạch UX: mã BR chỉ được nằm trong docs/comment/test name, không lên UI.\n",
  );

  for (const violation of violations) {
    console.error(
      `  ${violation.file}:${violation.line} — ${violation.matches.join(", ")}`,
    );
  }

  process.exitCode = 1;
}

main().catch((error) => {
  console.error("check:i18n — script error:", error);
  process.exitCode = 1;
});
