export const generateContextForEmbedding = (
	codeSnippet: string,
	filePath: string,
	scopePart: string | null
): string => {
	return `
        Code snippet:
        ${codeSnippet}

        File path it belongs to:
        ${filePath}

        Scope part:
        ${scopePart}
    `;
};
