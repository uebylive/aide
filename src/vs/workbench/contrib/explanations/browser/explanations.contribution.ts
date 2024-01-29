/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EXPLANATIONS_EDITOR_CONTRIBUTION_ID } from 'vs/workbench/contrib/explanations/common/explanations';
import { ExplanationsEditorContribution } from 'vs/workbench/contrib/explanations/browser/explanationsEditorContribution';

registerEditorContribution(EXPLANATIONS_EDITOR_CONTRIBUTION_ID, ExplanationsEditorContribution, EditorContributionInstantiation.AfterFirstRender);
