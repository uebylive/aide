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
];


export const isExcludedExtension = (extension: string): boolean => {
	if (EXCLUDED_EXTENSIONS.includes(extension)) {
		return true;
	}
	return false;
};
