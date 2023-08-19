/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


const lStripMax = (
	str: string,
	chars: string[],
	maxCount: number,
): string => {
	let count = 0;
	for (let index = 0; index < str.length; index++) {
		const char = str[index];
		if (chars.includes(char) && count < maxCount) {
			count++;
		} else {
			break;
		}
	}
	return str.slice(count);
}


const getSnippetWithPadding = (
	originalLines: string[],
	index: number,
	searchLines: string[],
): {
	snippet: string[];
	spaces: string;
	strip: boolean;
} => {
	const snippet = originalLines.slice(index, index + searchLines.length);
	let spaces = '';
	let strip = false;
	if (searchLines[0].length - searchLines[0].trimLeft().length === 0) {
		const spacesNeeded = originalLines[index].length - originalLines[index].trimLeft().length;
		for (let index = 0; index < spacesNeeded; index++) {
			spaces += ' ';
		}
		strip = false;
	} else {
		let minimumWhitespace = 0;
		for (let index = 0; index < searchLines.length; index++) {
			const line = searchLines[index];
			const whitespace = line.length - line.trimLeft().length;
			if (index === 0) {
				minimumWhitespace = whitespace;
			} else {
				minimumWhitespace = Math.min(minimumWhitespace, whitespace);
			}
		}
		strip = true;
	}
	return {
		snippet: snippet,
		spaces,
		strip,
	};
};


const matchString = (
	originalFileLines: string[],
	oldChunkLines: string[],
	startIndex: number | null,
	exactMatch: boolean,
): {
	index: number,
	maxSimilarity: number,
	currentHits: number,
} => {
	let maxSimilarity = 0;
	let index = -1;
	let currentHits = 0;
	// sliding window comparison from original to search
	// TODO(codestory): 2 pointer approach and use rapidfuzz to compute string
	// similarity
	for (let i = startIndex ?? 0; i < originalFileLines.length; i++) {
		let matchCount = 0;
		for (let j = 0; j < oldChunkLines.length; j++) {
			if (i + j >= originalFileLines.length) {
				continue;
			}
			let isMatch = false;
			if (exactMatch) {
				if (oldChunkLines[j] === originalFileLines[i + j]) {
					isMatch = true;
				}
			} else {
				isMatch = oldChunkLines[j].trim() === originalFileLines[i + j].trim();
			}
			if (isMatch) {
				matchCount++;

				if (startIndex !== null && oldChunkLines[j] === originalFileLines[i + j]) {
					matchCount = matchCount + 0.001;
				}
			}
		}

		if (matchCount > maxSimilarity) {
			maxSimilarity = matchCount;
			index = i;
			currentHits = 1;
		} else if (matchCount === maxSimilarity) {
			currentHits++;
		}
	}
	return {
		index,
		maxSimilarity,
		currentHits,
	};
};


const slidingWindowReplacement = (
	oldFileLines: string[],
	oldChunkLines: string[],
	newChunkLines: string[],
	searchContextBefore: string[] | null,
	exactMatch: boolean = false,
): {
	original: string[];
	indexToStart: number;
} => {
	// The model might be writing "..." in its response to suggest that we
	// don't have to make changes, so we need to check for that
	let canDoDotCheck = false;
	oldFileLines.forEach((chunk) => {
		const trimmedChunk = chunk.trim();
		if (trimmedChunk.includes('...')) {
			canDoDotCheck = true;
		}
	});

	// So we have ... in the output, lets fix that
	if (canDoDotCheck) {
		// Find the index for ... in the oldChunkLines
		let firstLineIndexOldChunk = -1;
		for (let index = 0; index < oldFileLines.length; index++) {
			const line = oldFileLines[index];
			if (line.trim().includes('...')) {
				firstLineIndexOldChunk = index;
				break;
			}
		}

		// Find the index for ... in the newChunkLines
		let firstLineIndexNewChunk = -1;
		for (let index = 0; index < newChunkLines.length; index++) {
			const line = newChunkLines[index];
			if (line.trim().includes('...')) {
				firstLineIndexNewChunk = index;
				break;
			}
		}

		// now we might have multiple cases here, lets handle them one by one
		if (firstLineIndexOldChunk === 0 && firstLineIndexNewChunk === 0) {
			oldChunkLines = oldChunkLines.slice(1);
			newChunkLines = newChunkLines.slice(1);
		} else if (firstLineIndexOldChunk === oldFileLines.length - 1 && firstLineIndexNewChunk === newChunkLines.length - 1) {
			oldChunkLines = oldChunkLines.slice(0, oldChunkLines.length - 1);
			newChunkLines = newChunkLines.slice(0, newChunkLines.length - 1);
		} else if (firstLineIndexOldChunk !== -1 && firstLineIndexNewChunk !== -1) {
			const searchContextBefore = oldChunkLines.slice(0, firstLineIndexOldChunk);
			const fixedLinesFromBefore = slidingWindowReplacement(
				oldFileLines,
				oldChunkLines.slice(firstLineIndexOldChunk + 1, oldChunkLines.length),
				newChunkLines.slice(firstLineIndexNewChunk + 1, newChunkLines.length),
				searchContextBefore,
			);
			oldFileLines = fixedLinesFromBefore.original;
			oldChunkLines = oldChunkLines.slice(0, firstLineIndexOldChunk);
			newChunkLines = newChunkLines.slice(0, firstLineIndexNewChunk);
		}
	}

	const matchingIndex = matchString(
		oldFileLines,
		oldChunkLines,
		null,
		exactMatch,
	);

	if (matchingIndex.maxSimilarity === 0) {
		return {
			original: oldFileLines,
			indexToStart: -1,
		};
	}

	if (matchingIndex.currentHits > 1) {
		// We have multiple hits which match, so we need to greedily match with
		// the one which is on top of the file
		let success = false;
		if (searchContextBefore) {
			const matchingIndex = matchString(
				oldFileLines,
				searchContextBefore,
				null,
				exactMatch,
			);
			const value = getSnippetWithPadding(
				oldFileLines,
				matchingIndex.index,
				searchContextBefore,
			);
			if (matchingIndex.currentHits === 1) {
				const matchingIndexWithSpaces = matchString(
					oldFileLines,
					oldChunkLines.map((line) => value.spaces + line),
					matchingIndex.index + 1,
					true,
				);
				matchingIndex.currentHits = 1;
				success = true;
			}
		}

		if (!success) {
			if (!exactMatch) {
				return slidingWindowReplacement(
					oldFileLines,
					oldChunkLines,
					newChunkLines,
					null,
					true,
				);
			}
			return {
				original: oldFileLines,
				indexToStart: -1,
			};
		}
	}

	if (matchingIndex.index === -1) {
		return {
			original: oldFileLines,
			indexToStart: -1,
		};
	}

	// Now we will try to get the snippet with padding
	const snippetPadding = getSnippetWithPadding(
		oldFileLines,
		matchingIndex.index,
		oldChunkLines,
	);
	let finalModifiedLines: string[] = [];
	if (snippetPadding.strip) {
		// Get the spaces on the first line
		let spacesNeeded = 0;
		for (let index = 0; index < oldFileLines.length; index++) {
			spacesNeeded = Math.min(spacesNeeded, oldFileLines[index].length - oldFileLines[index].trimLeft().length);
		}
		// Now we get the modified lines
		const spaces = oldFileLines[matchingIndex.index].length - oldFileLines[matchingIndex.index].trimLeft().length;
		finalModifiedLines = newChunkLines.map((line) => {
			return spaces + lStripMax(line, [' '], spaces);
		});
	} else {
		finalModifiedLines = newChunkLines.map((line) => {
			return snippetPadding.spaces + line;
		});
	}

	// Now we get the final original lines with our modification
	const originalLinesWithModification = [
		...oldFileLines.slice(0, matchingIndex.index),
		...finalModifiedLines,
		...oldFileLines.slice(matchingIndex.index + oldChunkLines.length),
	];
	return {
		original: originalLinesWithModification,
		indexToStart: matchingIndex.index + finalModifiedLines.length,
	};
};

export const generateNewFileFromPatch = (
	modifyFileResponse: string,
	oldFileContents: string,
	chunkOffset: number = 0,
): string | null => {
	let oldFileLines = oldFileContents.split('\n');

	const matches = modifyFileResponse.match(/<<<<.*?\n([\s\S]*?)\n====[^\n=]*\n([\s\S]*?)\n?>>>>/gs);
	interface OldAndNewChunk {
		oldChunk: string;
		newChunk: string;
	}
	const oldAndNewChunks: OldAndNewChunk[] = [];
	if (matches) {
		for (const match of matches) {
			const parts = match.split(/====[^\n=]*\n/);
			const leftContent = parts[0].replace(/<<<<.*?\n/, '');
			const rightContent = parts[1].replace(/>>>>\n?/, '');
			oldAndNewChunks.push({
				oldChunk: leftContent,
				newChunk: rightContent,
			});
		}
	}

	if (oldFileContents.trim() === '') {
		// If file is empty then return the first match
		if (oldAndNewChunks.length > 0) {
			return oldAndNewChunks[0].newChunk;
		} else {
			return null;
		}
	}

	for (let index = 0; index < oldAndNewChunks.length; index++) {
		let oldChunk = oldAndNewChunks[index].oldChunk;
		let newChunk = oldAndNewChunks[index].newChunk;
		// We strip the <old_file>{code}</old_file> if its showing up in the response
		if (oldChunk.trimLeft().startsWith('<old_file>') && newChunk.trimLeft().startsWith('<old_file>')) {
			oldChunk = oldChunk.replace(/<old_file>/, '');
			newChunk = newChunk.replace(/<old_file>/, '');
		}
		if (oldChunk.trimEnd().endsWith('</old_file>') && newChunk.trimEnd().endsWith('</old_file>')) {
			oldChunk = oldChunk.replace(/<\/old_file>/, '');
			newChunk = newChunk.replace(/<\/old_file>/, '');
		}
		const oldFileLinesModified = slidingWindowReplacement(
			oldFileLines,
			oldChunk.split('\n'),
			newChunk.split('\n'),
			null,
			false,
		);
		oldFileLines = oldFileLinesModified.original;
	}

	return oldFileLines.join('\n');
};


// void (async () => {
// 	const originalFile = `
// import logging
// import os

// from pathlib import Path

// import openai
// import typer

// from dotenv import load_dotenv

// from gpt_engineer.ai import AI
// from gpt_engineer.collect import collect_learnings
// from gpt_engineer.db import DB, DBs, archive
// from gpt_engineer.learning import collect_consent
// from gpt_engineer.steps import STEPS, Config as StepsConfig

// app = typer.Typer()  # creates a CLI app


// def load_env_if_needed():
// 	if os.getenv("OPENAI_API_KEY") is None:
// 		load_dotenv()
// 	openai.api_key = os.getenv("OPENAI_API_KEY")


// @app.command()
// def main(
// 	project_path: str = typer.Argument("projects/example", help="path"),
// 	model: str = typer.Argument("gpt-4", help="model id string"),
// 	temperature: float = 0.1,
// 	steps_config: StepsConfig = typer.Option(
// 		StepsConfig.DEFAULT, "--steps", "-s", help="decide which steps to run"
// 	),
// 	improve_option: bool = typer.Option(
// 		False,
// 		"--improve",
// 		"-i",
// 		help="Improve code from existing project.",
// 	),
// 	verbose: bool = typer.Option(False, "--verbose", "-v"),
// ):
// 	logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO)

// 	# For the improve option take current project as path and add .gpteng folder
// 	# By now, ignoring the 'project_path' argument
// 	if improve_option:
// 		# The default option for the --improve is the IMPROVE_CODE, not DEFAULT
// 		if steps_config == StepsConfig.DEFAULT:
// 			steps_config = StepsConfig.IMPROVE_CODE

// 	load_env_if_needed()

// 	ai = AI(
// 		model_name=model,
// 		temperature=temperature,
// 	)

// 	input_path = Path(project_path).absolute()
// 	memory_path = input_path / "memory"
// 	workspace_path = input_path / "workspace"
// 	archive_path = input_path / "archive"

// 	dbs = DBs(
// 		memory=DB(memory_path),
// 		logs=DB(memory_path / "logs"),
// 		input=DB(input_path),
// 		workspace=DB(workspace_path),
// 		preprompts=DB(
// 			Path(__file__).parent / "preprompts"
// 		),  # Loads preprompts from the preprompts directory
// 		archive=DB(archive_path),
// 	)

// 	if steps_config not in [
// 		StepsConfig.EXECUTE_ONLY,
// 		StepsConfig.USE_FEEDBACK,
// 		StepsConfig.EVALUATE,
// 	]:
// 		archive(dbs)

// 	steps = STEPS[steps_config]
// 	for step in steps:
// 		messages = step(ai, dbs)
// 		dbs.logs[step.__name__] = AI.serialize_messages(messages)

// 	if collect_consent():
// 		collect_learnings(model, temperature, steps, dbs)

// 	dbs.logs["token_usage"] = ai.format_token_usage_log()


// import subprocess
// import venv

// def handle_python_dependencies():
// 	venv.create('venv', with_pip=True)
// 	subprocess.run(['venv/bin/pip', 'install', '-r', 'requirements.txt'])
// 	subprocess.run(['venv/bin/pip', 'freeze', '>', 'requirements.txt'])

// def handle_node_dependencies():
// 	if not os.path.exists('package.json'):
// 		subprocess.run(['npm', 'init', '-y'])
// 	with open('package.json', 'r') as f:
// 		package_json = json.load(f)
// 	for dependency in package_json['dependencies']:
// 		subprocess.run(['npm', 'install', dependency])

// if __name__ == "__main__":
// 	handle_python_dependencies()
// 	handle_node_dependencies()
// 	app()
// 	`;
// 	const modifyFileResponse = `
// \`\`\`
// <<<< ORIGINAL
// def handle_node_dependencies():
//     if not os.path.exists('package.json'):
//         subprocess.run(['npm', 'init', '-y'])
//     with open('package.json', 'r') as f:
//         package_json = json.load(f)
//     for dependency in package_json['dependencies']:
//         subprocess.run(['npm', 'install', dependency])
// ====
// def handle_node_dependencies():
//     if not os.path.exists('package.json'):
//         subprocess.run(['npm', 'init', '-y'])
//     subprocess.run(['npm', 'install'])
// >>>> UPDATED
// \`\`\`
// 	`;

// 	const newFile = generateNewFileFromPatch(modifyFileResponse, originalFile);
// 	console.log(newFile);
// })();
