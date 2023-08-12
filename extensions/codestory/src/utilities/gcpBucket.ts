// We are going to download the anton binary here from the GCP bucket
import { Storage } from "@google-cloud/storage";

// https://storage.googleapis.com/aide-binary/run

export const downloadFromGCPBucket = async (bucketName: string, srcFilename: string, destFilename: string) => {
	const storage = new Storage();

	const options = {
		// Specify the source file
		source: srcFilename,

		// Specify the destination file
		destination: destFilename,
	};

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
