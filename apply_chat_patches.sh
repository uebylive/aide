#!/bin/bash

# The upstream remote name
UPSTREAM_REMOTE=upstream

# The main branch name
MAIN_BRANCH=main

# The last sync commit hash
LAST_SYNC_COMMIT_HASH="9e0bd20b88f922b999163e03f56bd4d63f62d770"

# The directories for chat and csChat
CHAT_DIR=src/vs/workbench/contrib/chat
CSCHAT_DIR=src/vs/workbench/contrib/csChat

# The name of the patch file
PATCH_FILE="chat_to_csChat_$(date +%Y%m%d).patch"

# Generate the patch for the chat directory since the last sync
git diff $LAST_SYNC_COMMIT_HASH $UPSTREAM_REMOTE/$MAIN_BRANCH -- $CHAT_DIR > $PATCH_FILE

# Check if the patch file is created and is not empty
if [ ! -s $PATCH_FILE ]; then
	echo "No changes found in the $CHAT_DIR directory."
	exit 0
fi

# Function to calculate new paths based on specific rules
get_new_cs_path() {
	local old_path="$1"
	local dirname=$(dirname "$old_path")
	local basename=$(basename "$old_path")

	# Apply generic renaming rule unless the file doesn't contain 'chat'
	if [[ $basename == *"chat"* && $basename != "codeBlockPart.ts" ]]; then
		# For files containing 'voiceChat', replace 'voiceChat' with 'csVoiceChat'
		if [[ $basename == *"voiceChat"* ]]; then
			basename="${basename//voiceChat/csVoiceChat}"
		# Otherwise, prefix 'cs' before 'Chat' in the filename
		else
			basename="${basename//chat/csChat}"
		fi
	fi

	# Correct the dirname replacement to handle slashes properly
	dirname=$(echo $dirname | sed 's|/chat/|/csChat/|g')

	# Combine the directory name with the new basename
	echo "$dirname/$basename"
}

# Function to apply patch with the necessary adjustments
apply_patch_with_renames() {
	# Create a new patch file for adjusted paths
	local adjusted_patch_file="adjusted_$PATCH_FILE"
	> "$adjusted_patch_file" # Clear the adjusted patch file content

	# Read through the original patch file line by line
	while IFS= read -r line
	do
		# Check if the line starts with "--- a/" or "+++ b/"
		if [[ $line == "--- a/"* || $line == "+++ b/"* ]]; then
			# Extract the file path without the prefix
			local path_with_prefix=${line:6}
			# Calculate the new path
			local new_path=$(get_new_cs_path "$path_with_prefix")
			# Replace the line with the new path
			line="${line:0:6}$new_path"
		fi

		# Write the modified line to the new patch file
		echo "$line" >> "$adjusted_patch_file"
	done < "$PATCH_FILE"

	# Apply the new patch file with the adjusted paths
	git apply --verbose --reject "$adjusted_patch_file"
}

apply_patch_with_renames
