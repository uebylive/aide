/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import { computePosition, autoUpdate, flip, shift, ComputePositionConfig, offset } from '@floating-ui/dom';
// import { IDisposable } from 'vs/base/common/lifecycle';

// export class AnchorFloat implements IDisposable {

// 	_cleanup: () => void;

// 	constructor(private reference: HTMLElement, private target: HTMLElement, private options?: Partial<ComputePositionConfig>) {
// 		console.log(this.computePosition());
// 		this._cleanup = autoUpdate(reference, target, this.computePosition);
// 	}

// 	private computePosition() {
// 		console.log('hi');
// 		return computePosition(this.reference, this.target, { placement: 'left', middleware: [offset(6), flip(), shift({ padding: 5 })], ...this.options });
// 	}

// 	dispose() {
// 		this._cleanup();
// 	}
// }
