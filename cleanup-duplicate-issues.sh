#!/usr/bin/env zsh
# cleanup-duplicate-issues.sh — Close duplicate issues from earlier test runs

set -eo pipefail

REPO="DanielShterenberg/playbook"

echo "============================================="
echo "Closing duplicate issues #2-#43"
echo "Keeping the final set #44-#85"
echo "============================================="
echo ""

# Close issues #2-#43 (duplicates from earlier runs)
for issue_num in {2..43}; do
  echo "Closing issue #$issue_num..."
  gh issue close "$issue_num" \
    --repo "$REPO" \
    --comment "Closing duplicate issue. This was created during script testing. The correct issue set is #44-#85." \
    2>&1 | grep -v "^$" || true
done

echo ""
echo "============================================="
echo "Done! Closed issues #2-#43"
echo "Active issues: #44-#85"
echo "============================================="
