#!/usr/bin/env bash
#
# Extract the RAMS app from the heliaxis monorepo into its own Git repository,
# keeping the history of the rams/ subtree.
#
# Run from the root of a heliaxis checkout, on the branch holding rams/, once
# you have created an EMPTY CallumHDevelops/RAMS repository on GitHub:
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
  echo "Run this from the root of the heliaxis checkout, on the branch holding rams/." >&2
  exit 1
fi

BRANCH="rams-split-$$"

echo "==> Splitting the rams/ subtree (history preserved)"
git subtree split --prefix=rams -b "$BRANCH" >/dev/null

WORKDIR="$(mktemp -d)"
echo "==> Cloning it into $WORKDIR/RAMS"
git clone --quiet --branch "$BRANCH" --single-branch . "$WORKDIR/RAMS"

cd "$WORKDIR/RAMS"
git checkout -q -b main
git branch -q -D "$BRANCH" 2>/dev/null || true
git remote remove origin
git remote add origin "$REMOTE"

cd - >/dev/null
git branch -D "$BRANCH" >/dev/null 2>&1 || true

cat <<EOF

==> Done. A standalone repository is ready at:

      $WORKDIR/RAMS

    Check it over, then publish:

      cd $WORKDIR/RAMS
      git push -u origin main

    Then follow DEPLOY.md to create the Vercel project and attach
    rams.heliaxis.co.uk to its Production environment.

    Once it is pushed, rams/ can be removed from the heliaxis branch:

      git rm -r rams && git commit -m "Move RAMS into its own repository"

EOF
