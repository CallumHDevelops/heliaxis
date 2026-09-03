#!/usr/bin/env bash
#
# Move this directory out of the heliaxis monorepo and into its own Git
# repository, keeping the history of the rams/ subtree.
#
# Run it from the root of the heliaxis checkout, once you have created an empty
# CallumHDevelops/RAMS repository on GitHub:
#
#     bash rams/scripts/split-into-own-repo.sh git@github.com:CallumHDevelops/RAMS.git
#
set -euo pipefail

REMOTE="${1:-}"
if [ -z "$REMOTE" ]; then
  echo "usage: bash rams/scripts/split-into-own-repo.sh <git-remote-url>" >&2
  exit 1
fi

if [ ! -d rams ] || [ ! -d .git ]; then
  echo "Run this from the root of the heliaxis checkout." >&2
  exit 1
fi

BRANCH="rams-split-$(date +%s)"

echo "==> Splitting the rams/ subtree into $BRANCH (history preserved)"
git subtree split --prefix=rams -b "$BRANCH"

WORKDIR="$(mktemp -d)"
echo "==> Cloning the split branch into $WORKDIR/RAMS"
git clone --branch "$BRANCH" --single-branch . "$WORKDIR/RAMS"

cd "$WORKDIR/RAMS"
git checkout -b main
git branch -D "$BRANCH" 2>/dev/null || true
git remote remove origin
git remote add origin "$REMOTE"

cat <<EOF

==> Done. The standalone repository is at:

      $WORKDIR/RAMS

    Review it, then publish:

      cd $WORKDIR/RAMS
      git push -u origin main

    Afterwards you can remove rams/ from the heliaxis repo:

      git rm -r rams && git commit -m "Move RAMS into its own repository"

EOF
