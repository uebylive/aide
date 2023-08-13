// We are going to download the anton binary here from the GCP bucket
import { Storage } from "@google-cloud/storage";
import * as path from "path";
import * as fs from "fs";

// https://storage.googleapis.com/aide-binary/run

async function ensureDirectoryExists(filePath: string): Promise<void> {
	const parentDir = path.dirname(filePath);

	if (fs.existsSync(parentDir)) {
		// The parent directory already exists, so we don't need to create it
		return;
	}

	// Recursively create the parent directory
	await ensureDirectoryExists(parentDir);

	// Create the directory
	fs.mkdirSync(parentDir);
}

export const downloadFromGCPBucket = async (bucketName: string, srcFilename: string, destFilename: string) => {
	const storage = new Storage();

	const options = {
		// Specify the source file
		source: srcFilename,

		// Specify the destination file
		destination: destFilename,
	};

	await ensureDirectoryExists(destFilename);

	// Download the file
	await storage.bucket(bucketName).file(srcFilename).download(options);
};

// const bucketName = "your-bucket-name";
// const srcFilename = "path/in/bucket/filename.ext";
// const destFilename = "local/path/filename.ext";


// void (async () => {
// 	const bucketName = "aide-binary";
// 	const srcFilename = "run";
// 	await downloadFile(
// 		bucketName,
// 		srcFilename,
// 		"/Users/skcd/Desktop/run",
// 	);
// })();
