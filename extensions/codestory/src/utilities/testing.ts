// import Parser = require('tree-sitter');
// import TreeSitterGo from 'tree-sitter-go';

// const parser = new Parser();
// parser.setLanguage(TreeSitterGo);


// export const tryTreeSitter = async (code: string) => {
// 	const output = parser.parse(code);
// 	console.log(output);
// };

const Parser = require('web-tree-sitter');
import * as path from 'path';
// const parser = new Parser;
// parser.load


function traverse(node: any, indent: string = "") {
	// console.log(node);
	console.log(indent + node.type + (node.isNamed() ? "" : " (anonymous)"));

	// Recursively print child nodes
	for (const child of node.children) {
		traverse(child, indent + "  ");
	}
}


void (async () => {
	await Parser.init();
	const parser = new Parser();
	const filePath = path.join(__dirname, 'tree-sitter-go.wasm');
	const goLang = await Parser.Language.load(filePath);
	parser.setLanguage(goLang);
	const code = `
	func (h *HeartBeat) Start(ctx context.Context) {
		if h.TickInterval <= 0 {
			log.Ctx(ctx).Info().Msg("Heartbeat has been disabled")
			return
		}

		ticker := time.NewTicker(time.Duration(h.TickInterval) * time.Second)
		go func() {
			for {
				select {
				case <-ctx.Done():
					log.Ctx(ctx).Info().Msg("Shutting down heartbeat")
					return
				case <-ticker.C:
					log.Ctx(ctx).Info().Msg("Sending heartbeat to NPCI")
					h.sendHeartBeat(ctx)
				}
			}
		}()
	}
	`;
	const output = parser.parse(code);
	traverse(output.rootNode);
	// console.log(output);
	// const parsedOutput = await tryTreeSitter(code);
	// console.log(parsedOutput);
	// const codeSymbols = parseDependenciesForCodeSymbols(
	// 	'/Users/skcd/Downloads/mugavari-main/internal/pkg/health/heartbeat.go',
	// 	'Users/skcd/Downloads/mugavari-main/',
	// );
})();
