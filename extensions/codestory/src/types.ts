type HealthStatus = "OK" | "UNAVAILABLE";
type HealthState = {
    status: HealthStatus;
};


type SearchState = {
    prompt: string;
};


type OpenFileState = {
    filePath: string;
    lineStart: number;
};

type CheckpointState = {
    timestamp: Date;
};

type DocumentsState = Record<string, string>;

type ChangesState = {
    changes: string;
};

type GitCommitRequest = {
    files: string[];
    message: string;
};

type PromptState = {
    prompt: string;
};