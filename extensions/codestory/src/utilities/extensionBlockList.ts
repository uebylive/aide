/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export const EXCLUDED_EXTENSIONS = [
	'.asar',
	'.tar',
	'.zip',
	'.gz',
	'.tgz',
	'.7z',
	'.dmg',
	'.png',
	'.jpg',
	'.svg',
];


export const isExcludedExtension = (extension: string): boolean => {
	if (EXCLUDED_EXTENSIONS.includes(extension)) {
		return true;
	}
	return false;
};
