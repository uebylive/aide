/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AideCommandPaletteWidget } from 'vs/workbench/contrib/aideCommandPalette/browser/aideCommandPaletteWidget';
import { IAideCommandPaletteData, IAideCommandPaletteResolver, IAideCommandPaletteService } from 'vs/workbench/contrib/aideCommandPalette/common/aideCommandPaletteService';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { AideCommandPaletteModel, AideCommandPaletteRequestModel } from 'vs/workbench/contrib/aideCommandPalette/common/aideCommandPaletteModel';
import { CancellationTokenSource } from 'vs/base/common/cancellation';


export const VIEW_ID = 'workbench.view.aideCommandPalette';

export class AideCommandPaletteService extends Disposable implements IAideCommandPaletteService {
	private _container: HTMLElement | undefined;
	private _model: AideCommandPaletteModel | undefined;
	private commandPaletteProvider: IAideCommandPaletteResolver | undefined;
	private _widget: AideCommandPaletteWidget | undefined;


	constructor(
		@IWorkbenchLayoutService private readonly workbenchLayoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	open(): void {
		if (!this._container) {
			this._container = document.createElement('div');
			this._container.classList.add('command-palette-container');
			this.workbenchLayoutService.activeContainer.appendChild(this._container);
			this._widget = this.instantiationService.createInstance(AideCommandPaletteWidget, this._container);
			this._widget.render();
			this._widget.focus();
			this._widget.onDidBlur(() => this.close());
		}
	}

	close = (): void => {
		if (this._container) {
			this._container.remove();
			this._container = undefined;
		}
	};

	registerCommandPaletteProvider(data: IAideCommandPaletteData, resolver: IAideCommandPaletteResolver): IDisposable {
		if (this.commandPaletteProvider) {
			throw new Error(`A probe provider with the id '${data.id}' is already registered.`);
		}

		this.commandPaletteProvider = resolver;

		return toDisposable(() => {
			this.commandPaletteProvider = undefined;
		});
	}

	getSession(): AideCommandPaletteModel | undefined {
		return this._model;
	}

	startSession(): AideCommandPaletteModel {
		if (this._model) {
			this._model.dispose();
		}

		this._model = this.instantiationService.createInstance(AideCommandPaletteModel);
		return this._model;
	}

	sendRequest(commandPaletteModel: AideCommandPaletteModel, request: string): void {

		const resolver = this.commandPaletteProvider;
		if (!resolver) {
			throw new Error('No command palette provider is registered.');
		}

		const source = new CancellationTokenSource();
		const token = source.token;

		const listener = token.onCancellationRequested(() => {
			commandPaletteModel.cancelRequest();
		});

		commandPaletteModel.request = new AideCommandPaletteRequestModel(commandPaletteModel.sessionId, request);

		try {
			resolver.initiate(commandPaletteModel.request, token);
		} finally {
			listener.dispose();
		}
	}


	clearSession(): void {
		this._model?.dispose();
		this._model = undefined;
	}
}
