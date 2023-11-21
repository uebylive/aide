#!/bin/bash

# This is a script for applying the latest changes from CHAT_DIR in the upstream vscode repo to the CSCHAT_DIR in our repo
# This needs to be updated to handle all the following paths:
# extensions/codestory/types/*.d.ts
# src/vscode-dts/vscode.proposed.*.d.ts
# src/vs/workbench/api/browser/mainThread*Chat.ts
# src/vs/workbench/api/browser/mainThreadInline*Chat.ts
# src/vs/workbench/api/common/extHost.api.impl.ts
# src/vs/workbench/api/common/extHost.protocol.ts
# src/vs/workbench/api/common/extHost*Chat.ts
# src/vs/workbench/api/common/extHostInline*Chat.ts
# src/vs/workbench/api/common/extHostTypeConverters.ts
# src/vs/workbench/api/common/extHostTypes.ts
# src/vs/workbench/contrib/csChat
# src/vs/workbench/contrib/inlineChat

# Method for fixing the files in the csChat folder
fix_files() {
	rm -rf $CSCHAT_DIR
	cp -r $CHAT_DIR $CSCHAT_DIR

	# Rename all files within cschat to replace occurences of 'chat' to 'csChat'. Ensure only filenames are changed, not the paths or content.
	find $CSCHAT_DIR -depth -name "*chat*" -execdir bash -c 'mv -i "$1" "${1//chat/csChat}"' bash {} \;

	# Additionally, also replace files with occurences of 'voiceChat' to 'csVoiceChat'
	find $CSCHAT_DIR -depth -name "*voiceChat*" -execdir bash -c 'mv -i "$1" "${1//voiceChat/csVoiceChat}"' bash {} \;

	# Delete the src/vs/workbench/contrib/csChat/test folder
	rm -rf $CSCHAT_DIR/test
}

# Create a patch between the current version of the chat folder and the upstream version. But do this by
# copying it over to the csChat folder, renaming all files and then generating a patch file.
create_cschat_patch() {
	# Fix the files
	fix_files

	# Commit the changes
	git add $CSCHAT_DIR
	git commit -m "Add current changes" --no-verify
	CURRENT_CHANGES=$(git rev-parse HEAD)

	# Merge the latest changes from upstream
	echo "About to fetch and merge changes from $UPSTREAM_REMOTE/$UPSTREAM_BRANCH. Please ensure everything is ready."
	read -p "Press enter to continue"

	# Start the merge and check for conflicts
	if ! git merge --no-commit $UPSTREAM_REMOTE/$UPSTREAM_BRANCH; then
		echo "Merge conflicts detected. Please resolve them now."
		read -p "Once resolved and all changes are staged, press enter to continue"
	fi

	# Commit merge if no conflicts or after conflicts are resolved
	git commit -m "Merged changes from $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"

	# Fix the files again
	fix_files

	# Commit the changes
	git add $CSCHAT_DIR
	git commit -m "Add upstream changes" --no-verify
	UPSTREAM_CHANGES=$(git rev-parse HEAD)

	# Create a patch file with the diff on only the cschat folder between the 'Add current changes' commit and
	# the 'Add upstream changes' commit. Do remember that we have performed a merge in between these two commits.
	git diff $CURRENT_CHANGES $UPSTREAM_CHANGES -- $CSCHAT_DIR > chat_changes.patch

	# Go back to cs-main and delete the patch branch
	git checkout $OUR_BRANCH
	git branch -D $PATCH_BRANCH
}

apply_cschat_patch() {
	# Check if the patch file exists
	if [ ! -f chat_changes.patch ]; then
		echo "Patch file not found. Exiting."
		exit 1
	fi

	# Create PATCH_BRANCH
	git checkout -b $PATCH_BRANCH

	# Merge the latest changes from upstream
	echo "About to fetch and merge changes from $UPSTREAM_REMOTE/$UPSTREAM_BRANCH. Please ensure everything is ready."
	read -p "Press enter to continue"

	# Start the merge and check for conflicts
	if ! git merge --no-commit $UPSTREAM_REMOTE/$UPSTREAM_BRANCH; then
		echo "Merge conflicts detected. Please resolve them now."
		read -p "Once resolved and all changes are staged, press enter to continue"
	fi

	# Apply the patch with the --reject option
	git apply --reject chat_changes.patch

	# Check if there are any rejected files
	if [ -f chat_changes.patch.rej ]; then
		echo "Rejections detected. Please resolve them now."
		read -p "Once resolved and all changes are staged, press enter to continue"
	fi

	# Commit the changes
	git add $CSCHAT_DIR
	git commit -m "Patch upstream chat changes into csChat"
}

UPSTREAM_REMOTE=upstream
UPSTREAM_BRANCH=main

OUR_REMOTE=origin
OUR_BRANCH=cs-main

# The directories for chat and csChat
CHAT_DIR=src/vs/workbench/contrib/chat
CSCHAT_DIR=src/vs/workbench/contrib/csChat

# Verify this is the OUR_BRANCH branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$OUR_BRANCH" ]; then
	echo "You are not on the $OUR_BRANCH branch. Please checkout the $OUR_BRANCH branch and try again."
	exit 1
fi

# Fetch the latest changes
git fetch $OUR_REMOTE
git fetch $UPSTREAM_REMOTE

# Verify that OUR_BRANCH is in sync with OUR_REMOTE
if ! git diff --quiet $OUR_REMOTE/$OUR_BRANCH; then
	echo "Your $OUR_BRANCH branch is not in sync with $OUR_REMOTE/$OUR_BRANCH. Please push your changes and try again."
	exit 1
fi

# Create a new branch with unix timestamp as suffix
TIMESTAMP=$(date +%s)
PATCH_BRANCH=chat-patch-$TIMESTAMP
git checkout -b $PATCH_BRANCH

# Create a patch file for the current diff
create_cschat_patch

# Apply the patch
apply_cschat_patch
