import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({
    apiKey: "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",
});
const openai = new OpenAIApi(configuration);

export const generateEmbedding = async (prompt: string): Promise<number[]> => {
    const response = await openai.createEmbedding({
        model: "text-embedding-ada-002",
        input: prompt,
    });
    const [{ embedding }] = response.data.data;
    return embedding;
};