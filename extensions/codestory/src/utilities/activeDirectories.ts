// We want to get the active directories which we should be looking at

import * as vscode from "vscode";

export const readActiveDirectoriesConfiguration = (workingDirectory: string): string[] => {
	let aideConfiguration = vscode.workspace.getConfiguration("aide");
	let directoryPaths = aideConfiguration.get("activeDirectories");
	if (directoryPaths === undefined) {
		return [workingDirectory];
	}
	if (directoryPaths === "") {
		return [workingDirectory];
	}
	if (typeof directoryPaths === "string") {
		return directoryPaths.split(",").map((directoryPath: string) => {
			return directoryPath.trim();
		});
	}
	return [workingDirectory];
};
