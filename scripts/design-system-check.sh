#!/usr/bin/env bash
# design-system-check.sh
#
# デザインシステム整合性チェック。CI で実行。
#
# 検出項目:
# 1. app/ 内のハードコード色 ('#xxx' 形式)
# 2. design-system.ts 以外でのテーマ定数定義 (const T / const THEME)
# 3. 新規ファイル (shell/first-run/command-palette/entry) の px 直書き
#
# 使用: npm run lint:design

set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP="$DIR/app"
ERRORS=0

echo "=== Design System Integrity Check ==="
echo ""

# 1. ハードコード色 (design-system.ts 除外)
echo "[1/10] Hardcoded colors..."
COLORS=$(grep -rn "'#[0-9a-fA-F]\{3,\}'" "$APP"/*.tsx "$APP"/*.ts 2>/dev/null | grep -v design-system || true)
if [ -n "$COLORS" ]; then
  echo "  FAIL: Hardcoded colors found:"
  echo "$COLORS" | sed 's/^/    /'
  ERRORS=$((ERRORS + 1))
else
  echo "  PASS: No hardcoded colors"
fi

# 2. テーマ定数重複
echo "[2/10] Duplicate theme constants..."
DUPES=$(grep -rn 'const T = {\|const THEME = {' "$APP" 2>/dev/null | grep -v node_modules | grep -v '//' || true)
if [ -n "$DUPES" ]; then
  echo "  FAIL: Local theme constants found:"
  echo "$DUPES" | sed 's/^/    /'
  ERRORS=$((ERRORS + 1))
else
  echo "  PASS: No duplicate themes"
fi

# 3. 新規ファイル (Apple 式) の spacing 違反
echo "[3/10] Design token compliance (new files)..."
NEW_FILES="$APP/shell.tsx $APP/first-run.tsx $APP/command-palette.tsx $APP/entry.tsx"
VIOLATIONS=""
for f in $NEW_FILES; do
  if [ -f "$f" ]; then
    # padding/margin/gap に直値 (space[] 未使用)
    V=$(grep -nP '(padding|margin|gap):\s*[^$]*\d{2,}[^%]' "$f" 2>/dev/null | grep -v 'space\[' | grep -v '//' || true)
    if [ -n "$V" ]; then
      VIOLATIONS="$VIOLATIONS\n  $f:\n$(echo "$V" | sed 's/^/    /')"
    fi
  fi
done
if [ -n "$VIOLATIONS" ]; then
  echo "  WARN: Spacing violations in new files:"
  echo -e "$VIOLATIONS"
else
  echo "  PASS: New files use design tokens"
fi

echo ""

# 4. ルート孤立ソースファイル (config と install.ts 除外)
echo "[4/10] Root-level orphan source files..."
ORPHANS=$(ls "$DIR"/*.ts "$DIR"/*.tsx 2>/dev/null | grep -v config | grep -v install.ts || true)
if [ -n "$ORPHANS" ]; then
  echo "  FAIL: Orphan source files at project root:"
  echo "$ORPHANS" | sed 's/^/    /'
  ERRORS=$((ERRORS + 1))
else
  echo "  PASS: No orphan files"
fi

# 5. テストファイルが tests/ 内にあるか
echo "[5/10] Test files in tests/ directory..."
ROOT_TESTS=$(ls "$DIR"/*.test.ts "$DIR"/*.spec.ts 2>/dev/null || true)
if [ -n "$ROOT_TESTS" ]; then
  echo "  FAIL: Test files at project root (should be in tests/):"
  echo "$ROOT_TESTS" | sed 's/^/    /'
  ERRORS=$((ERRORS + 1))
else
  echo "  PASS: All tests in tests/"
fi

# 6. Dead code 検出 (feature モジュールが main.ts から参照されているか)
echo "[6/10] Dead code detection..."
DEAD=""
# infra モジュール (CI/ツール用 — main.ts から参照されなくて正常)
INFRA="accessibility bench security interchange install i18n"
for d in "$DIR"/*/; do
  dname=$(basename "$d")
  case "$dname" in tests|docs|scripts|future|.github|.claude|node_modules|coverage|dist|app) continue;; esac
  # infra はスキップ
  echo " $INFRA " | grep -q " $dname " && continue
  refs=$(grep -c "/${dname}/" "$APP/main.ts" 2>/dev/null)
  refs=${refs:-0}
  if [ "$refs" -eq 0 ]; then
    lines=$(find "$d" -maxdepth 1 \( -name '*.ts' -o -name '*.tsx' \) -exec cat {} + 2>/dev/null | wc -l)
    DEAD="$DEAD\n    $dname/ (~${lines} lines, not wired in main.ts)"
  fi
done
if [ -n "$DEAD" ]; then
  echo "  WARN: Feature modules not integrated:$DEAD"
else
  echo "  PASS: All feature modules wired"
fi

# 7. CLAUDE.md 網羅性
echo "[7/10] CLAUDE.md coverage..."
MISSING_DOCS=""
for d in "$DIR"/*/; do
  dname=$(basename "$d")
  case "$dname" in tests|docs|scripts|.github|.claude|node_modules|coverage|dist) continue;; esac
  [ ! -f "$d/CLAUDE.md" ] && MISSING_DOCS="$MISSING_DOCS $dname"
done
if [ -n "$MISSING_DOCS" ]; then
  echo "  WARN: Directories without CLAUDE.md:$MISSING_DOCS"
else
  echo "  PASS: All modules documented"
fi

echo ""
if [ $ERRORS -gt 0 ]; then
  echo "FAILED: $ERRORS critical violation(s)"
  exit 1
else
  echo "PASSED"
fi

# 8. localStorage 直書き (app/ 内 — safeStorage 経由が必須)
echo "[8/10] Raw localStorage access..."
RAW_LS=$(grep -rn "localStorage\." "$APP" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "safeStorage\|//\|setup\|test\|utils\.ts" || true)
if [ -n "$RAW_LS" ]; then
  echo "  FAIL: Direct localStorage access (use safeStorage from utils.ts):"
  echo "$RAW_LS" | sed 's/^/    /'
  ERRORS=$((ERRORS + 1))
else
  echo "  PASS: No raw localStorage access"
fi

# 9. console.* (production コード — logger.ts/tests/bench/install 除外)
echo "[9/10] console.* in production..."
LOGS=$(grep -rn "console\.\(log\|warn\|error\)" "$DIR" --include="*.ts" --include="*.tsx" 2>/dev/null | \
  grep -v "future/\|node_modules/\|tests/\|bench/runner\|security/generate\|install\.ts\|logger\.ts\|//" || true)
if [ -n "$LOGS" ]; then
  echo "  FAIL: Direct console.* usage (use logger.ts):"
  echo "$LOGS" | sed 's/^/    /'
  ERRORS=$((ERRORS + 1))
else
  echo "  PASS: No raw console.* in production"
fi

# 10. TypeScript 構文チェック (sed/python 一括置換の破壊を検出)
echo "[10/10] TypeScript syntax check..."
if command -v node >/dev/null 2>&1 && [ -f "$DIR/scripts/syntax-check.mjs" ]; then
  if node "$DIR/scripts/syntax-check.mjs" >/tmp/syntax-check.log 2>&1; then
    echo "  PASS: $(tail -1 /tmp/syntax-check.log)"
  else
    echo "  FAIL: Syntax errors detected:"
    grep -E "^  " /tmp/syntax-check.log | head -10 | sed 's/^/  /'
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "  SKIP: node or syntax-check.mjs unavailable"
fi

echo ""
if [ $ERRORS -gt 0 ]; then
  echo "FAILED: $ERRORS critical violation(s)"
  exit 1
else
  echo "PASSED"
fi
