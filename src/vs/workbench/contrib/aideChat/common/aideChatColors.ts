/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color, RGBA } from 'vs/base/common/color';
import { localize } from 'vs/nls';
import { badgeBackground, badgeForeground, contrastBorder, editorBackground, editorWidgetBackground, foreground, registerColor, transparent } from 'vs/platform/theme/common/colorRegistry';

export const chatRequestBorder = registerColor(
	'aideChat.requestBorder',
	{ dark: new Color(new RGBA(255, 255, 255, 0.10)), light: new Color(new RGBA(0, 0, 0, 0.10)), hcDark: contrastBorder, hcLight: contrastBorder, },
	localize('aideChat.requestBorder', 'The border color of a chat request.')
);

export const chatRequestBackground = registerColor(
	'aideChat.requestBackground',
	{ dark: transparent(editorBackground, 0.62), light: transparent(editorBackground, 0.62), hcDark: editorWidgetBackground, hcLight: null },
	localize('aideChat.requestBackground', 'The background color of a chat request.')
);

export const chatSlashCommandBackground = registerColor(
	'aideChat.slashCommandBackground',
	{ dark: '#34414b8f', light: '#d2ecff99', hcDark: Color.white, hcLight: badgeBackground },
	localize('aideChat.slashCommandBackground', 'The background color of a chat slash command.')
);

export const chatSlashCommandForeground = registerColor(
	'aideChat.slashCommandForeground',
	{ dark: '#40A6FF', light: '#306CA2', hcDark: Color.black, hcLight: badgeForeground },
	localize('aideChat.slashCommandForeground', 'The foreground color of a chat slash command.')
);

export const chatAvatarBackground = registerColor(
	'aideChat.avatarBackground',
	{ dark: '#1f1f1f', light: '#f2f2f2', hcDark: Color.black, hcLight: Color.white, },
	localize('aideChat.avatarBackground', 'The background color of a chat avatar.')
);

export const chatAvatarForeground = registerColor(
	'aideChat.avatarForeground',
	{ dark: foreground, light: foreground, hcDark: foreground, hcLight: foreground, },
	localize('aideChat.avatarForeground', 'The foreground color of a chat avatar.')
);
