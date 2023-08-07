// Here I want to get the remote url of the current repo
// and also the hash we are on

import { spawn } from "child_process";
import { realpathSync } from "fs";
import { resolve } from "path";
// import logger from "../logger";
import { runCommandAsync } from "../utilities/commandRunner";
import logger from "../logger";

export const getGitRepoName = async (workingDirectory: string): Promise<string> => {
    // Log the pwd here

    const currentWorkingDirectory = realpathSync(resolve("."));
    // logger.info("codestory");
    // logger.info(currentWorkingDirectory);
    const { stdout } = await runCommandAsync(workingDirectory, "git", [
        "rev-parse",
        "--show-toplevel",
    ]);
    const tolLevelName = stdout.trim().split("/").pop() || "";
    const data = await runCommandAsync(workingDirectory, "basename", [tolLevelName]);
    return data.stdout.trim();
};

export const getGitRemoteUrl = async (workingDirectory: string): Promise<string> => {
    const { stdout } = await runCommandAsync(workingDirectory, "git", [
        "remote",
        "get-url",
        "origin",
    ]);
    return stdout.trim();
};

export const getGitCurrentHash = async (workingDirectory: string): Promise<string> => {
    const { stdout } = await runCommandAsync(workingDirectory, "git", ["rev-parse", "HEAD"]);
    logger.info("Whats the stdout");
    logger.info(stdout);
    return stdout.trim();
};

// Example usage:
// (async () => {
//     const remoteUrl = await getGitRemoteUrl();
//     console.log(remoteUrl);
//     const repoHash = await getGitCurrentHash();
//     console.log(repoHash);
//     const repoName = await getGitRepoName();
//     console.log(repoName);
// })();
