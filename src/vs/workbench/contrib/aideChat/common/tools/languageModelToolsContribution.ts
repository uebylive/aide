/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { DisposableMap } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../../workbench/common/contributions.js';
import { ILanguageModelToolsService } from '../../../../../workbench/contrib/aideChat/common/languageModelToolsService.js';
import * as extensionsRegistry from '../../../../../workbench/services/extensions/common/extensionsRegistry.js';

interface IRawToolContribution {
	name: string;
	displayName?: string;
	description: string;
	parametersSchema?: IJSONSchema;
}

const languageModelToolsExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawToolContribution[]>({
	extensionPoint: 'aiModelTools',
	activationEventsGenerator: (contributions: IRawToolContribution[], result) => {
		for (const contrib of contributions) {
			result.push(`onAIModelTool:${contrib.name}`);
		}
	},
	jsonSchema: {
		description: localize('vscode.extension.contributes.tools', 'Contributes a tool that can be invoked by a language model.'),
		type: 'array',
		items: {
			additionalProperties: false,
			type: 'object',
			defaultSnippets: [{ body: { name: '', description: '' } }],
			required: ['name', 'description'],
			properties: {
				name: {
					description: localize('toolname', "A name for this tool which must be unique across all tools."),
					type: 'string'
				},
				description: {
					description: localize('toolDescription', "A description of this tool that may be passed to a language model."),
					type: 'string'
				},
				displayName: {
					description: localize('toolDisplayName', "A human-readable name for this tool that may be used to describe it in the UI."),
					type: 'string'
				},
				parametersSchema: {
					description: localize('parametersSchema', "A JSON schema for the parameters this tool accepts."),
					type: 'object',
					$ref: 'http://json-schema.org/draft-07/schema#'
				}
			}
		}
	}
});

function toToolKey(extensionIdentifier: ExtensionIdentifier, toolName: string) {
	return `${extensionIdentifier.value}/${toolName}`;
}

export class LanguageModelToolsExtensionPointHandler implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.aideToolsExtensionPointHandler';

	private _registrationDisposables = new DisposableMap<string>();

	constructor(
		@ILanguageModelToolsService languageModelToolsService: ILanguageModelToolsService,
		@ILogService logService: ILogService,
	) {
		languageModelToolsExtensionPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				for (const tool of extension.value) {
					if (!tool.name || !tool.description) {
						logService.warn(`Invalid tool contribution from ${extension.description.identifier.value}: ${JSON.stringify(tool)}`);
						continue;
					}

					const disposable = languageModelToolsService.registerToolData(tool);
					this._registrationDisposables.set(toToolKey(extension.description.identifier, tool.name), disposable);
				}
			}

			for (const extension of delta.removed) {
				for (const tool of extension.value) {
					this._registrationDisposables.deleteAndDispose(toToolKey(extension.description.identifier, tool.name));
				}
			}
		});
	}
}
