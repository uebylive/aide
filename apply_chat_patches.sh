#!/bin/bash

# The upstream branch you want to sync with
UPSTREAM_BRANCH='upstream/main'

# Directories
CHAT_DIR='src/vs/workbench/contrib/chat'
CSCHAT_DIR='src/vs/workbench/contrib/csChat'

# Fetch the latest changes from the upstream repository
git fetch upstream

# Attempt to find the last common commit for the chat directory
# Note: This attempts to find the latest commit from the UPSTREAM_BRANCH that changed the CHAT_DIR and is present in the current branch
LAST_SYNC_COMMIT=$(git log --pretty=format:'%H' -1 --grep=$(git log --pretty=format:'%s' $UPSTREAM_BRANCH -- $CHAT_DIR) -- $CHAT_DIR)

if [ -z "$LAST_SYNC_COMMIT" ]; then
	echo "Could not determine the LAST_SYNC_COMMIT automatically."
	exit 1
fi

echo "Last sync commit found: $LAST_SYNC_COMMIT"

# Name of the patch file
PATCH_FILE="chat_to_csChat_$(date +%Y%m%d).patch"

# Create the patch for the chat directory
git diff $LAST_SYNC_COMMIT $UPSTREAM_BRANCH -- $CHAT_DIR > $PATCH_FILE

# Check if the patch file is created and is not empty
if [ ! -s $PATCH_FILE ]; then
	echo "No changes found in the $CHAT_DIR directory since the last sync."
	exit 0
fi

echo "Applying patch to $CSCHAT_DIR..."

# Apply the patch to the csChat directory
git apply --directory=$CSCHAT_DIR --reject $PATCH_FILE

# Find any .rej files that indicate conflicts
REJ_FILES=$(find $CSCHAT_DIR -name '*.rej')

if [ ! -z "$REJ_FILES" ]; then
	echo "There were conflicts during the patch application:"
	echo "$REJ_FILES"
	echo "Please resolve these manually, then test and commit the changes."
else
	echo "Patch applied successfully. Please test before committing."
fi
