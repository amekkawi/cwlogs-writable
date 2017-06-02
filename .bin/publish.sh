#!/bin/bash

NODEVER="$(node -v)"
echo "$NODEVER" | grep -Eqv '^v[4-9]\.' && echo "Incorrect node version (${NODEVER}). Must be v4 or later." 1>&2 && exit 1

cd "$(dirname "$0")/.."
[ $? -ne 0 ] && echo "Failed to CD to project dir" 1>&2 && exit 1

if [ -z "$SLEEP_SECONDS" ]; then
    SLEEP_SECONDS=5
fi

SCRIPTDIR="$(pwd)"

[ ! -f "package.json" ] && echo "Did not seem to CD to project dir: $(pwd)" 1>&2 && exit 1
! grep -qE '^  "name": "cwlogs-writable",' "package.json" && echo "Did not seem to CD to project dir as package.json does not have correct name: $(pwd)" 1>&2 && exit 1

git diff-index --quiet HEAD
[ $? -ne 0 ] && echo "Failed: There are uncommitted changes in the working tree and/or index" 1>&2 && exit 1

test -z "$(git ls-files --exclude-standard --others)"
[ $? -ne 0 ] && echo "Failed: One or more untracked files are present" 1>&2 && exit 1

if [ -d "${SCRIPTDIR}/coverage" ]; then
	rm -rf "${SCRIPTDIR}/coverage"
	[ $? -ne 0 ] && echo "Failed to remove coverage" 1>&2 && exit 1
fi

echo
echo "NPM remove and install..."
echo "========================"

if [ -d "${SCRIPTDIR}/node_modules" ]; then
	rm -rf "${SCRIPTDIR}/node_modules"
	[ $? -ne 0 ] && echo "Failed to remove node_modules" 1>&2 && exit 1
fi

npm install
[ $? -ne 0 ] && echo "Failed to npm install" 1>&2 && exit 1

echo
echo "Running lint..."
echo "========================"
npm run lint
[ $? -ne 0 ] && echo "Failed to run lint" 1>&2 && exit 1

echo
echo
echo "Running tests..."
echo "========================"
npm test
[ $? -ne 0 ] && echo "Failed to run tests" 1>&2 && exit 1

echo
echo "Running docs..."
echo "========================"
npm run docs
[ $? -ne 0 ] && echo "Failed to run docs" 1>&2 && exit 1

# Allow docs to finish writing -- Need to look into why this is needed
echo "Sleeping ${SLEEP_SECONDS} seconds..."
sleep "$SLEEP_SECONDS"

git diff-index --quiet HEAD
if [ $? -ne 0 ]; then
    echo "Failed: Generated docs resulted in uncommitted changes in the working tree and/or index" 1>&2
    git diff-index HEAD 1>&2
    exit 1
fi

test -z "$(git ls-files --exclude-standard --others)"
if [ $? -ne 0 ]; then
    echo "Failed: Generated docs resulted in one or more untracked files are present" 1>&2
    git ls-files --exclude-standard --others 1>&2
    exit 1
fi

echo
echo "Packing..."
echo "========================"
packfile="$(npm pack . | tail -n 1)"
[ $? -ne 0 ] && echo "Failed to NPM pack" 1>&2 && exit 1
[ -z "$packfile" ] && echo "Failed to get file path from NPM pack" 1>&2 && exit 1
[ ! -f "$packfile" ] && echo "Failed to get pack file name from NPM pack" 1>&2 && exit 1

echo
echo "Contents:"
echo "========================"
tar tzf "$packfile"

echo
echo "Publish using:"
echo npm publish "$SCRIPTDIR/$packfile"
