#!/bin/bash

# Change to the directory where the .rej files are located
# Update this if your .rej files are in a different directory
cd src/vs/workbench/contrib/csChat/

# Find all .rej files in the current directory and its subdirectories
rej_files=$(find . -name "*.rej")

# If no .rej files found, exit
if [ -z "$rej_files" ]; then
	echo "No .rej files found in the directory."
	exit 1
fi

# Function to open a file in the editor
edit_file() {
	# You can change "vim" to your preferred editor (e.g., "code" for VS Code)
	vim "$1"
}

# Loop through each .rej file and prompt user for action
for rej_file in $rej_files; do
	# Extract the source file name by removing the .rej extension
	src_file="${rej_file%.rej}"

	echo "-----------------------------------------------------------------"
	echo "Found rejected patch: $rej_file"
	echo "Source file: $src_file"
	echo "-----------------------------------------------------------------"

	# Show the contents of the rejected patch
	cat "$rej_file"
	echo "-----------------------------------------------------------------"

	# Prompt the user for action
	while true; do
		echo "What would you like to do with this patch?"
		echo "  [e] Edit the source file"
		echo "  [s] Skip this patch"
		echo "  [q] Quit the script"
		read -p "Select an option [e/s/q]: " option

		case $option in
			e)
				edit_file "$src_file"
				break
				;;
			s)
				# Just continue to the next file
				echo "Skipping $rej_file"
				break
				;;
			q)
				echo "Exiting script."
				exit 1
				;;
			*)
				echo "Invalid option. Please choose again."
				;;
		esac
	done
done

echo "All rejected patches have been handled."

