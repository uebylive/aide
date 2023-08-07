export type HealthStatus = "OK" | "UNAVAILABLE";
export type HealthState = {
	status: HealthStatus;
};


export type SearchState = {
	prompt: string;
};


export type OpenFileState = {
	filePath: string;
	lineStart: number;
};

export type CheckpointState = {
	timestamp: Date;
};

export type DocumentsState = Record<string, string>;

export type ChangesState = {
	changes: string;
};

export type GitCommitRequest = {
	files: string[];
	message: string;
};

export type PromptState = {
	prompt: string;
};
