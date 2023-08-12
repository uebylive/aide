// import { workspace } from 'vscode';
// import { LanguageClient } from 'vscode-languageclient/node';


// let serverOptions = {
// 	command: '/Users/skcd/go/bin/gopls',  // Path to `gopls` executable. Adjust if necessary.
// 	args: ['serve'],  // Any additional args if required
// };

// let client = new LanguageClient(
// 	'goLanguageServer',
// 	'Go Language Server',
// 	serverOptions,
// 	{}
// );
// client.start();
// client.sendRequest("initialize", {});
import { LanguageClient, TransportKind, DocumentSymbolRequest } from "vscode-languageclient/node";
import { TextDocumentIdentifier } from "vscode-languageserver-protocol";
import fs = require("fs");
import { workspace } from 'vscode';


export const debugging = async () => {

	let serverOptions = {
		run: {
			command: "/Users/skcd/go/bin/gopls",
			args: ["serve"],
		},
		debug: {
			command: "/Users/skcd/go/bin/gopls",
		},
	};

	let clientOptions = {
		documentSelector: [{ scheme: "file", language: "go" }],
		synchronize: {
			fileEvents: workspace.createFileSystemWatcher("**/*.go"),
		},
		initializationOptions: {
			processId: process.pid,
			rootPath: "/Users/skcd/Downloads/mugavari-main",
			capabilities: {}, // Put your client's capabilities here if needed
			trace: "off",
		},
	};

	let client = new LanguageClient(
		"goLanguageServer",
		"Go Language Server",
		serverOptions,
		clientOptions,
	);

	await client.start();

	// client.onReady().then(() => {
	// Send initialization request
	// const reply = await client
	// 	.sendRequest("initialize", {
	// 		processId: process.pid,
	// 		rootPath: "/Users/skcd/Downloads/mugavari-main",
	// 		capabilities: {}, // Put your client's capabilities here if needed
	// 		trace: "off",
	// 	});
	// 	.then(() => {
	const docURI = "file:///Users/skcd/Downloads/mugavari-main/internal/app/reaper/reaper.go";

	// "Open" the document
	const fileContent = fs.readFileSync(docURI.slice(7), "utf8");
	client.sendNotification("textDocument/didOpen", {
		textDocument: {
			uri: docURI,
			languageId: "go",
			version: 1,
			text: fileContent,
		},
	});

	// Request document symbols
	const docIdentifier = { uri: docURI };
	client
		.sendRequest(DocumentSymbolRequest.type, { textDocument: docIdentifier })
		.then((symbols) => {
			console.log(symbols);
			client.stop(); // Shutdown the client after getting symbols
		});
	// });
};
// });
