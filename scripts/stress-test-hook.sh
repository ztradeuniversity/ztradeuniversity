#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ZTU pre-push hook STRESS TEST — proves 0 false positives + 100% regression catch.
# Builds a throwaway repo, seeds it like production, then runs the REAL hook against
# hundreds of generated commits across 4 categories and tallies the decisions.
#
#   Categories (N each, default 100):
#     normal   — change an unrelated file (README)            → must PASS
#     ui       — change CSS/comment in a protected file        → must PASS
#     runtime  — edit a protected file, KEEP the signature      → must PASS
#     revert   — remove a protected signature (stale-copy)      → must BLOCK
#
# Usage: bash scripts/stress-test-hook.sh [N]
# ─────────────────────────────────────────────────────────────────────────────
set -u
N="${1:-100}"
HOOK="$(git rev-parse --show-toplevel)/.githooks/pre-push"
[ -f "$HOOK" ] || { echo "hook not found at $HOOK"; exit 2; }

T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
cd "$T"; git init -q; git config user.email t@t; git config user.name t

# Seed the 4 protected files with their production functional signatures.
mkdir -p admin functions/utils
printf 'function hydrate(){ setConn(connected); }\n<style>/*x*/</style>\n' > admin/governance-admin.html
printf 'import {getNode} from "x"; getNode(env,id);\n'                     > functions/utils/kb-populate.js
printf 'async function w(){}; await Promise.all([w()]);\n'                 > admin/kb-admin.js
printf 'export async function getRawEdgesBySrc(env,s){}\n'                 > functions/utils/kb-store.js
printf '# readme\n' > README.md
git add -A; git commit -qm prod
git update-ref refs/remotes/origin/main HEAD          # base = production
PROD=$(git rev-parse HEAD)

run_hook(){ sh "$HOOK" < /dev/null > /dev/null 2>&1; echo $?; }   # 0=pass 1=block

pass_ok=0; pass_bad=0; blk_ok=0; blk_bad=0
tick(){ printf '.'; }

echo "Running $((N*4)) cases (N=$N per category)…"
# 1) NORMAL — unrelated file → PASS
for i in $(seq 1 $N); do
  git reset -q --hard "$PROD"; echo "line $i $RANDOM" >> README.md; git commit -qam "normal $i"
  [ "$(run_hook)" = 0 ] && pass_ok=$((pass_ok+1)) || pass_bad=$((pass_bad+1)); tick
done
# 2) UI — CSS/comment on a protected file, signature kept → PASS
for i in $(seq 1 $N); do
  git reset -q --hard "$PROD"; echo "/* ui tweak $i $RANDOM */" >> admin/governance-admin.html; git commit -qam "ui $i"
  [ "$(run_hook)" = 0 ] && pass_ok=$((pass_ok+1)) || pass_bad=$((pass_bad+1)); tick
done
# 3) RUNTIME — edit a protected file but KEEP signature → PASS
for i in $(seq 1 $N); do
  git reset -q --hard "$PROD"
  printf 'async function w(){/* v%s */}; await Promise.all([w()]);\n' "$i" > admin/kb-admin.js
  git commit -qam "runtime $i"
  [ "$(run_hook)" = 0 ] && pass_ok=$((pass_ok+1)) || pass_bad=$((pass_bad+1)); tick
done
# 4) REVERT — remove a signature (stale-copy overwrite) → BLOCK
sigs=("admin/governance-admin.html|setConn(connected)|function hydrate(){}" \
      "functions/utils/kb-populate.js|getNode(|noop();" \
      "admin/kb-admin.js|Promise.all(|serial();" \
      "functions/utils/kb-store.js|getRawEdgesBySrc|function other(){}" )
for i in $(seq 1 $N); do
  git reset -q --hard "$PROD"
  IFS='|' read -r f _ repl <<< "${sigs[$((i % 4))]}"
  printf '%s\n' "$repl" > "$f"          # overwrite with a version LACKING the signature
  git commit -qam "revert $i"
  [ "$(run_hook)" = 1 ] && blk_ok=$((blk_ok+1)) || blk_bad=$((blk_bad+1)); tick
done
echo ""

echo "════════ RESULTS ════════"
echo "Legit (normal+ui+runtime) = $((N*3))"
echo "  passed (correct)   : $pass_ok"
echo "  FALSE POSITIVES    : $pass_bad   (must be 0)"
echo "Regressions (revert)  = $N"
echo "  blocked (correct)  : $blk_ok"
echo "  MISSED regressions : $blk_bad   (must be 0)"
echo "───────────────────────"
if [ "$pass_bad" = 0 ] && [ "$blk_bad" = 0 ]; then
  echo "PASS ✅  0 false positives, 100% of regressions blocked."
  exit 0
else
  echo "FAIL ❌"
  exit 1
fi
