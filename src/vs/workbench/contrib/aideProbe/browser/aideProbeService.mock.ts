/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { ITextModel } from 'vs/editor/common/model';
import { IAideProbeProgress, IAideProbeRequestModel, IAideProbeResult, IAideProbeTextEdit, INewIterationAction } from 'vs/workbench/contrib/aideProbe/common/aideProbe';


const possibleEdits = ['cat', 'dog', 'fish', 'bird', 'horse', 'cow', 'sheep', 'goat', 'pig', 'chicken', 'duck', 'turkey', 'rabbit', 'hamster', 'guinea pig', 'ferret', 'chinchilla', 'hedgehog'];

function getRandomInt(min = 1, max = 10) {
	return Math.floor(Math.random() * max) + min;
}

let iteration = 0;

async function generateEdits(textModel: ITextModel): Promise<IAideProbeTextEdit> {

	const amount = getRandomInt(1, 3);

	function generateEdit() {
		const line = getRandomInt(1, textModel.getLineCount());
		const text = possibleEdits[getRandomInt(0, possibleEdits.length)];
		return {
			resource: textModel.uri,
			versionId: undefined,
			textEdit: {
				range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: text.length },
				text: `${text} (it-${iteration})`
			},
		};
	}

	return {
		kind: 'textEdit',
		edits: {
			edits: Array.from({ length: amount }, generateEdit),
		}
	};
}


type GeneratorFn = () => Promise<void> | undefined;
let generatorFn: GeneratorFn | undefined;
function generator(callback?: GeneratorFn) {
	if (callback) {
		generatorFn = callback;
	}
	if (generatorFn) {
		generatorFn();
	}
}

export async function mockInitiateProbe(request: IAideProbeRequestModel, progressCallback: (progress: IAideProbeProgress) => Promise<void>, token: CancellationToken, textModel: ITextModel): Promise<IAideProbeResult> {
	generator(() => generateEdits(textModel).then(progressCallback));
	return new Promise(() => { });
}

export function mockOnUserAction(action: INewIterationAction) {
	iteration++;
	if (!generator) {
		console.error('No generator');
		return;
	}
	generator();
}
