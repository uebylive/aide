"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.shake = exports.toStringShakeLevel = exports.ShakeLevel = void 0;
const fs = require("fs");
const path = require("path");
const TYPESCRIPT_LIB_FOLDER = path.dirname(require.resolve('typescript/lib/lib.d.ts'));
var ShakeLevel;
(function (ShakeLevel) {
    ShakeLevel[ShakeLevel["Files"] = 0] = "Files";
    ShakeLevel[ShakeLevel["InnerFile"] = 1] = "InnerFile";
    ShakeLevel[ShakeLevel["ClassMembers"] = 2] = "ClassMembers";
})(ShakeLevel = exports.ShakeLevel || (exports.ShakeLevel = {}));
function toStringShakeLevel(shakeLevel) {
    switch (shakeLevel) {
        case 0 /* Files */:
            return 'Files (0)';
        case 1 /* InnerFile */:
            return 'InnerFile (1)';
        case 2 /* ClassMembers */:
            return 'ClassMembers (2)';
    }
}
exports.toStringShakeLevel = toStringShakeLevel;
function printDiagnostics(options, diagnostics) {
    for (const diag of diagnostics) {
        let result = '';
        if (diag.file) {
            result += `${path.join(options.sourcesRoot, diag.file.fileName)}`;
        }
        if (diag.file && diag.start) {
            const location = diag.file.getLineAndCharacterOfPosition(diag.start);
            result += `:${location.line + 1}:${location.character}`;
        }
        result += ` - ` + JSON.stringify(diag.messageText);
        console.log(result);
    }
}
function shake(options) {
    const ts = require('typescript');
    const languageService = createTypeScriptLanguageService(ts, options);
    const program = languageService.getProgram();
    const globalDiagnostics = program.getGlobalDiagnostics();
    if (globalDiagnostics.length > 0) {
        printDiagnostics(options, globalDiagnostics);
        throw new Error(`Compilation Errors encountered.`);
    }
    const syntacticDiagnostics = program.getSyntacticDiagnostics();
    if (syntacticDiagnostics.length > 0) {
        printDiagnostics(options, syntacticDiagnostics);
        throw new Error(`Compilation Errors encountered.`);
    }
    const semanticDiagnostics = program.getSemanticDiagnostics();
    if (semanticDiagnostics.length > 0) {
        printDiagnostics(options, semanticDiagnostics);
        throw new Error(`Compilation Errors encountered.`);
    }
    markNodes(ts, languageService, options);
    return generateResult(ts, languageService, options.shakeLevel);
}
exports.shake = shake;
//#region Discovery, LanguageService & Setup
function createTypeScriptLanguageService(ts, options) {
    // Discover referenced files
    const FILES = discoverAndReadFiles(ts, options);
    // Add fake usage files
    options.inlineEntryPoints.forEach((inlineEntryPoint, index) => {
        FILES[`inlineEntryPoint.${index}.ts`] = inlineEntryPoint;
    });
    // Add additional typings
    options.typings.forEach((typing) => {
        const filePath = path.join(options.sourcesRoot, typing);
        FILES[typing] = fs.readFileSync(filePath).toString();
    });
    // Resolve libs
    const RESOLVED_LIBS = processLibFiles(ts, options);
    const compilerOptions = ts.convertCompilerOptionsFromJson(options.compilerOptions, options.sourcesRoot).options;
    const host = new TypeScriptLanguageServiceHost(ts, RESOLVED_LIBS, FILES, compilerOptions);
    return ts.createLanguageService(host);
}
/**
 * Read imports and follow them until all files have been handled
 */
function discoverAndReadFiles(ts, options) {
    const FILES = {};
    const in_queue = Object.create(null);
    const queue = [];
    const enqueue = (moduleId) => {
        // To make the treeshaker work on windows...
        moduleId = moduleId.replace(/\\/g, '/');
        if (in_queue[moduleId]) {
            return;
        }
        in_queue[moduleId] = true;
        queue.push(moduleId);
    };
    options.entryPoints.forEach((entryPoint) => enqueue(entryPoint));
    while (queue.length > 0) {
        const moduleId = queue.shift();
        const dts_filename = path.join(options.sourcesRoot, moduleId + '.d.ts');
        if (fs.existsSync(dts_filename)) {
            const dts_filecontents = fs.readFileSync(dts_filename).toString();
            FILES[`${moduleId}.d.ts`] = dts_filecontents;
            continue;
        }
        const js_filename = path.join(options.sourcesRoot, moduleId + '.js');
        if (fs.existsSync(js_filename)) {
            // This is an import for a .js file, so ignore it...
            continue;
        }
        let ts_filename;
        if (options.redirects[moduleId]) {
            ts_filename = path.join(options.sourcesRoot, options.redirects[moduleId] + '.ts');
        }
        else {
            ts_filename = path.join(options.sourcesRoot, moduleId + '.ts');
        }
        const ts_filecontents = fs.readFileSync(ts_filename).toString();
        const info = ts.preProcessFile(ts_filecontents);
        for (let i = info.importedFiles.length - 1; i >= 0; i--) {
            const importedFileName = info.importedFiles[i].fileName;
            if (options.importIgnorePattern.test(importedFileName)) {
                // Ignore vs/css! imports
                continue;
            }
            let importedModuleId = importedFileName;
            if (/(^\.\/)|(^\.\.\/)/.test(importedModuleId)) {
                importedModuleId = path.join(path.dirname(moduleId), importedModuleId);
            }
            enqueue(importedModuleId);
        }
        FILES[`${moduleId}.ts`] = ts_filecontents;
    }
    return FILES;
}
/**
 * Read lib files and follow lib references
 */
function processLibFiles(ts, options) {
    const stack = [...options.compilerOptions.lib];
    const result = {};
    while (stack.length > 0) {
        const filename = `lib.${stack.shift().toLowerCase()}.d.ts`;
        const key = `defaultLib:${filename}`;
        if (!result[key]) {
            // add this file
            const filepath = path.join(TYPESCRIPT_LIB_FOLDER, filename);
            const sourceText = fs.readFileSync(filepath).toString();
            result[key] = sourceText;
            // precess dependencies and "recurse"
            const info = ts.preProcessFile(sourceText);
            for (const ref of info.libReferenceDirectives) {
                stack.push(ref.fileName);
            }
        }
    }
    return result;
}
/**
 * A TypeScript language service host
 */
class TypeScriptLanguageServiceHost {
    _ts;
    _libs;
    _files;
    _compilerOptions;
    constructor(ts, libs, files, compilerOptions) {
        this._ts = ts;
        this._libs = libs;
        this._files = files;
        this._compilerOptions = compilerOptions;
    }
    // --- language service host ---------------
    getCompilationSettings() {
        return this._compilerOptions;
    }
    getScriptFileNames() {
        return ([]
            .concat(Object.keys(this._libs))
            .concat(Object.keys(this._files)));
    }
    getScriptVersion(_fileName) {
        return '1';
    }
    getProjectVersion() {
        return '1';
    }
    getScriptSnapshot(fileName) {
        if (this._files.hasOwnProperty(fileName)) {
            return this._ts.ScriptSnapshot.fromString(this._files[fileName]);
        }
        else if (this._libs.hasOwnProperty(fileName)) {
            return this._ts.ScriptSnapshot.fromString(this._libs[fileName]);
        }
        else {
            return this._ts.ScriptSnapshot.fromString('');
        }
    }
    getScriptKind(_fileName) {
        return this._ts.ScriptKind.TS;
    }
    getCurrentDirectory() {
        return '';
    }
    getDefaultLibFileName(_options) {
        return 'defaultLib:lib.d.ts';
    }
    isDefaultLibFileName(fileName) {
        return fileName === this.getDefaultLibFileName(this._compilerOptions);
    }
    readFile(path, _encoding) {
        return this._files[path] || this._libs[path];
    }
    fileExists(path) {
        return path in this._files || path in this._libs;
    }
}
//#endregion
//#region Tree Shaking
var NodeColor;
(function (NodeColor) {
    NodeColor[NodeColor["White"] = 0] = "White";
    NodeColor[NodeColor["Gray"] = 1] = "Gray";
    NodeColor[NodeColor["Black"] = 2] = "Black";
})(NodeColor || (NodeColor = {}));
function getColor(node) {
    return node.$$$color || 0 /* White */;
}
function setColor(node, color) {
    node.$$$color = color;
}
function markNeededSourceFile(node) {
    node.$$$neededSourceFile = true;
}
function isNeededSourceFile(node) {
    return Boolean(node.$$$neededSourceFile);
}
function nodeOrParentIsBlack(node) {
    while (node) {
        const color = getColor(node);
        if (color === 2 /* Black */) {
            return true;
        }
        node = node.parent;
    }
    return false;
}
function nodeOrChildIsBlack(node) {
    if (getColor(node) === 2 /* Black */) {
        return true;
    }
    for (const child of node.getChildren()) {
        if (nodeOrChildIsBlack(child)) {
            return true;
        }
    }
    return false;
}
function isSymbolWithDeclarations(symbol) {
    return !!(symbol && symbol.declarations);
}
function isVariableStatementWithSideEffects(ts, node) {
    if (!ts.isVariableStatement(node)) {
        return false;
    }
    let hasSideEffects = false;
    const visitNode = (node) => {
        if (hasSideEffects) {
            // no need to go on
            return;
        }
        if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
            // TODO: assuming `createDecorator` and `refineServiceDecorator` calls are side-effect free
            const isSideEffectFree = /(createDecorator|refineServiceDecorator)/.test(node.expression.getText());
            if (!isSideEffectFree) {
                hasSideEffects = true;
            }
        }
        node.forEachChild(visitNode);
    };
    node.forEachChild(visitNode);
    return hasSideEffects;
}
function isStaticMemberWithSideEffects(ts, node) {
    if (!ts.isPropertyDeclaration(node)) {
        return false;
    }
    if (!node.modifiers) {
        return false;
    }
    if (!node.modifiers.some(mod => mod.kind === ts.SyntaxKind.StaticKeyword)) {
        return false;
    }
    let hasSideEffects = false;
    const visitNode = (node) => {
        if (hasSideEffects) {
            // no need to go on
            return;
        }
        if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
            hasSideEffects = true;
        }
        node.forEachChild(visitNode);
    };
    node.forEachChild(visitNode);
    return hasSideEffects;
}
function markNodes(ts, languageService, options) {
    const program = languageService.getProgram();
    if (!program) {
        throw new Error('Could not get program from language service');
    }
    if (options.shakeLevel === 0 /* Files */) {
        // Mark all source files Black
        program.getSourceFiles().forEach((sourceFile) => {
            setColor(sourceFile, 2 /* Black */);
        });
        return;
    }
    const black_queue = [];
    const gray_queue = [];
    const export_import_queue = [];
    const sourceFilesLoaded = {};
    function enqueueTopLevelModuleStatements(sourceFile) {
        sourceFile.forEachChild((node) => {
            if (ts.isImportDeclaration(node)) {
                if (!node.importClause && ts.isStringLiteral(node.moduleSpecifier)) {
                    setColor(node, 2 /* Black */);
                    enqueueImport(node, node.moduleSpecifier.text);
                }
                return;
            }
            if (ts.isExportDeclaration(node)) {
                if (!node.exportClause && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
                    // export * from "foo";
                    setColor(node, 2 /* Black */);
                    enqueueImport(node, node.moduleSpecifier.text);
                }
                if (node.exportClause && ts.isNamedExports(node.exportClause)) {
                    for (const exportSpecifier of node.exportClause.elements) {
                        export_import_queue.push(exportSpecifier);
                    }
                }
                return;
            }
            if (isVariableStatementWithSideEffects(ts, node)) {
                enqueue_black(node);
            }
            if (ts.isExpressionStatement(node)
                || ts.isIfStatement(node)
                || ts.isIterationStatement(node, true)
                || ts.isExportAssignment(node)) {
                enqueue_black(node);
            }
            if (ts.isImportEqualsDeclaration(node)) {
                if (/export/.test(node.getFullText(sourceFile))) {
                    // e.g. "export import Severity = BaseSeverity;"
                    enqueue_black(node);
                }
            }
        });
    }
    /**
     * Return the parent of `node` which is an ImportDeclaration
     */
    function findParentImportDeclaration(node) {
        let _node = node;
        do {
            if (ts.isImportDeclaration(_node)) {
                return _node;
            }
            _node = _node.parent;
        } while (_node);
        return null;
    }
    function enqueue_gray(node) {
        if (nodeOrParentIsBlack(node) || getColor(node) === 1 /* Gray */) {
            return;
        }
        setColor(node, 1 /* Gray */);
        gray_queue.push(node);
    }
    function enqueue_black(node) {
        const previousColor = getColor(node);
        if (previousColor === 2 /* Black */) {
            return;
        }
        if (previousColor === 1 /* Gray */) {
            // remove from gray queue
            gray_queue.splice(gray_queue.indexOf(node), 1);
            setColor(node, 0 /* White */);
            // add to black queue
            enqueue_black(node);
            // move from one queue to the other
            // black_queue.push(node);
            // setColor(node, NodeColor.Black);
            return;
        }
        if (nodeOrParentIsBlack(node)) {
            return;
        }
        const fileName = node.getSourceFile().fileName;
        if (/^defaultLib:/.test(fileName) || /\.d\.ts$/.test(fileName)) {
            setColor(node, 2 /* Black */);
            return;
        }
        const sourceFile = node.getSourceFile();
        if (!sourceFilesLoaded[sourceFile.fileName]) {
            sourceFilesLoaded[sourceFile.fileName] = true;
            enqueueTopLevelModuleStatements(sourceFile);
        }
        if (ts.isSourceFile(node)) {
            return;
        }
        setColor(node, 2 /* Black */);
        black_queue.push(node);
        if (options.shakeLevel === 2 /* ClassMembers */ && (ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node))) {
            const references = languageService.getReferencesAtPosition(node.getSourceFile().fileName, node.name.pos + node.name.getLeadingTriviaWidth());
            if (references) {
                for (let i = 0, len = references.length; i < len; i++) {
                    const reference = references[i];
                    const referenceSourceFile = program.getSourceFile(reference.fileName);
                    if (!referenceSourceFile) {
                        continue;
                    }
                    const referenceNode = getTokenAtPosition(ts, referenceSourceFile, reference.textSpan.start, false, false);
                    if (ts.isMethodDeclaration(referenceNode.parent)
                        || ts.isPropertyDeclaration(referenceNode.parent)
                        || ts.isGetAccessor(referenceNode.parent)
                        || ts.isSetAccessor(referenceNode.parent)) {
                        enqueue_gray(referenceNode.parent);
                    }
                }
            }
        }
    }
    function enqueueFile(filename) {
        const sourceFile = program.getSourceFile(filename);
        if (!sourceFile) {
            console.warn(`Cannot find source file ${filename}`);
            return;
        }
        // This source file should survive even if it is empty
        markNeededSourceFile(sourceFile);
        enqueue_black(sourceFile);
    }
    function enqueueImport(node, importText) {
        if (options.importIgnorePattern.test(importText)) {
            // this import should be ignored
            return;
        }
        const nodeSourceFile = node.getSourceFile();
        let fullPath;
        if (/(^\.\/)|(^\.\.\/)/.test(importText)) {
            fullPath = path.join(path.dirname(nodeSourceFile.fileName), importText) + '.ts';
        }
        else {
            fullPath = importText + '.ts';
        }
        enqueueFile(fullPath);
    }
    options.entryPoints.forEach(moduleId => enqueueFile(moduleId + '.ts'));
    // Add fake usage files
    options.inlineEntryPoints.forEach((_, index) => enqueueFile(`inlineEntryPoint.${index}.ts`));
    let step = 0;
    const checker = program.getTypeChecker();
    while (black_queue.length > 0 || gray_queue.length > 0) {
        ++step;
        let node;
        if (step % 100 === 0) {
            console.log(`Treeshaking - ${Math.floor(100 * step / (step + black_queue.length + gray_queue.length))}% - ${step}/${step + black_queue.length + gray_queue.length} (${black_queue.length}, ${gray_queue.length})`);
        }
        if (black_queue.length === 0) {
            for (let i = 0; i < gray_queue.length; i++) {
                const node = gray_queue[i];
                const nodeParent = node.parent;
                if ((ts.isClassDeclaration(nodeParent) || ts.isInterfaceDeclaration(nodeParent)) && nodeOrChildIsBlack(nodeParent)) {
                    gray_queue.splice(i, 1);
                    black_queue.push(node);
                    setColor(node, 2 /* Black */);
                    i--;
                }
            }
        }
        if (black_queue.length > 0) {
            node = black_queue.shift();
        }
        else {
            // only gray nodes remaining...
            break;
        }
        const nodeSourceFile = node.getSourceFile();
        const loop = (node) => {
            const symbols = getRealNodeSymbol(ts, checker, node);
            for (const { symbol, symbolImportNode } of symbols) {
                if (symbolImportNode) {
                    setColor(symbolImportNode, 2 /* Black */);
                    const importDeclarationNode = findParentImportDeclaration(symbolImportNode);
                    if (importDeclarationNode && ts.isStringLiteral(importDeclarationNode.moduleSpecifier)) {
                        enqueueImport(importDeclarationNode, importDeclarationNode.moduleSpecifier.text);
                    }
                }
                if (isSymbolWithDeclarations(symbol) && !nodeIsInItsOwnDeclaration(nodeSourceFile, node, symbol)) {
                    for (let i = 0, len = symbol.declarations.length; i < len; i++) {
                        const declaration = symbol.declarations[i];
                        if (ts.isSourceFile(declaration)) {
                            // Do not enqueue full source files
                            // (they can be the declaration of a module import)
                            continue;
                        }
                        if (options.shakeLevel === 2 /* ClassMembers */ && (ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration)) && !isLocalCodeExtendingOrInheritingFromDefaultLibSymbol(ts, program, checker, declaration)) {
                            enqueue_black(declaration.name);
                            for (let j = 0; j < declaration.members.length; j++) {
                                const member = declaration.members[j];
                                const memberName = member.name ? member.name.getText() : null;
                                if (ts.isConstructorDeclaration(member)
                                    || ts.isConstructSignatureDeclaration(member)
                                    || ts.isIndexSignatureDeclaration(member)
                                    || ts.isCallSignatureDeclaration(member)
                                    || memberName === '[Symbol.iterator]'
                                    || memberName === '[Symbol.toStringTag]'
                                    || memberName === 'toJSON'
                                    || memberName === 'toString'
                                    || memberName === 'dispose' // TODO: keeping all `dispose` methods
                                    || /^_(.*)Brand$/.test(memberName || '') // TODO: keeping all members ending with `Brand`...
                                ) {
                                    enqueue_black(member);
                                }
                                if (isStaticMemberWithSideEffects(ts, member)) {
                                    enqueue_black(member);
                                }
                            }
                            // queue the heritage clauses
                            if (declaration.heritageClauses) {
                                for (const heritageClause of declaration.heritageClauses) {
                                    enqueue_black(heritageClause);
                                }
                            }
                        }
                        else {
                            enqueue_black(declaration);
                        }
                    }
                }
            }
            node.forEachChild(loop);
        };
        node.forEachChild(loop);
    }
    while (export_import_queue.length > 0) {
        const node = export_import_queue.shift();
        if (nodeOrParentIsBlack(node)) {
            continue;
        }
        const symbol = node.symbol;
        if (!symbol) {
            continue;
        }
        const aliased = checker.getAliasedSymbol(symbol);
        if (aliased.declarations && aliased.declarations.length > 0) {
            if (nodeOrParentIsBlack(aliased.declarations[0]) || nodeOrChildIsBlack(aliased.declarations[0])) {
                setColor(node, 2 /* Black */);
            }
        }
    }
}
function nodeIsInItsOwnDeclaration(nodeSourceFile, node, symbol) {
    for (let i = 0, len = symbol.declarations.length; i < len; i++) {
        const declaration = symbol.declarations[i];
        const declarationSourceFile = declaration.getSourceFile();
        if (nodeSourceFile === declarationSourceFile) {
            if (declaration.pos <= node.pos && node.end <= declaration.end) {
                return true;
            }
        }
    }
    return false;
}
function generateResult(ts, languageService, shakeLevel) {
    const program = languageService.getProgram();
    if (!program) {
        throw new Error('Could not get program from language service');
    }
    const result = {};
    const writeFile = (filePath, contents) => {
        result[filePath] = contents;
    };
    program.getSourceFiles().forEach((sourceFile) => {
        const fileName = sourceFile.fileName;
        if (/^defaultLib:/.test(fileName)) {
            return;
        }
        const destination = fileName;
        if (/\.d\.ts$/.test(fileName)) {
            if (nodeOrChildIsBlack(sourceFile)) {
                writeFile(destination, sourceFile.text);
            }
            return;
        }
        const text = sourceFile.text;
        let result = '';
        function keep(node) {
            result += text.substring(node.pos, node.end);
        }
        function write(data) {
            result += data;
        }
        function writeMarkedNodes(node) {
            if (getColor(node) === 2 /* Black */) {
                return keep(node);
            }
            // Always keep certain top-level statements
            if (ts.isSourceFile(node.parent)) {
                if (ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression) && node.expression.text === 'use strict') {
                    return keep(node);
                }
                if (ts.isVariableStatement(node) && nodeOrChildIsBlack(node)) {
                    return keep(node);
                }
            }
            // Keep the entire import in import * as X cases
            if (ts.isImportDeclaration(node)) {
                if (node.importClause && node.importClause.namedBindings) {
                    if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                        if (getColor(node.importClause.namedBindings) === 2 /* Black */) {
                            return keep(node);
                        }
                    }
                    else {
                        const survivingImports = [];
                        for (const importNode of node.importClause.namedBindings.elements) {
                            if (getColor(importNode) === 2 /* Black */) {
                                survivingImports.push(importNode.getFullText(sourceFile));
                            }
                        }
                        const leadingTriviaWidth = node.getLeadingTriviaWidth();
                        const leadingTrivia = sourceFile.text.substr(node.pos, leadingTriviaWidth);
                        if (survivingImports.length > 0) {
                            if (node.importClause && node.importClause.name && getColor(node.importClause) === 2 /* Black */) {
                                return write(`${leadingTrivia}import ${node.importClause.name.text}, {${survivingImports.join(',')} } from${node.moduleSpecifier.getFullText(sourceFile)};`);
                            }
                            return write(`${leadingTrivia}import {${survivingImports.join(',')} } from${node.moduleSpecifier.getFullText(sourceFile)};`);
                        }
                        else {
                            if (node.importClause && node.importClause.name && getColor(node.importClause) === 2 /* Black */) {
                                return write(`${leadingTrivia}import ${node.importClause.name.text} from${node.moduleSpecifier.getFullText(sourceFile)};`);
                            }
                        }
                    }
                }
                else {
                    if (node.importClause && getColor(node.importClause) === 2 /* Black */) {
                        return keep(node);
                    }
                }
            }
            if (ts.isExportDeclaration(node)) {
                if (node.exportClause && node.moduleSpecifier && ts.isNamedExports(node.exportClause)) {
                    const survivingExports = [];
                    for (const exportSpecifier of node.exportClause.elements) {
                        if (getColor(exportSpecifier) === 2 /* Black */) {
                            survivingExports.push(exportSpecifier.getFullText(sourceFile));
                        }
                    }
                    const leadingTriviaWidth = node.getLeadingTriviaWidth();
                    const leadingTrivia = sourceFile.text.substr(node.pos, leadingTriviaWidth);
                    if (survivingExports.length > 0) {
                        return write(`${leadingTrivia}export {${survivingExports.join(',')} } from${node.moduleSpecifier.getFullText(sourceFile)};`);
                    }
                }
            }
            if (shakeLevel === 2 /* ClassMembers */ && (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) && nodeOrChildIsBlack(node)) {
                let toWrite = node.getFullText();
                for (let i = node.members.length - 1; i >= 0; i--) {
                    const member = node.members[i];
                    if (getColor(member) === 2 /* Black */ || !member.name) {
                        // keep method
                        continue;
                    }
                    const pos = member.pos - node.pos;
                    const end = member.end - node.pos;
                    toWrite = toWrite.substring(0, pos) + toWrite.substring(end);
                }
                return write(toWrite);
            }
            if (ts.isFunctionDeclaration(node)) {
                // Do not go inside functions if they haven't been marked
                return;
            }
            node.forEachChild(writeMarkedNodes);
        }
        if (getColor(sourceFile) !== 2 /* Black */) {
            if (!nodeOrChildIsBlack(sourceFile)) {
                // none of the elements are reachable
                if (isNeededSourceFile(sourceFile)) {
                    // this source file must be written, even if nothing is used from it
                    // because there is an import somewhere for it.
                    // However, TS complains with empty files with the error "x" is not a module,
                    // so we will export a dummy variable
                    result = 'export const __dummy = 0;';
                }
                else {
                    // don't write this file at all!
                    return;
                }
            }
            else {
                sourceFile.forEachChild(writeMarkedNodes);
                result += sourceFile.endOfFileToken.getFullText(sourceFile);
            }
        }
        else {
            result = text;
        }
        writeFile(destination, result);
    });
    return result;
}
//#endregion
//#region Utils
function isLocalCodeExtendingOrInheritingFromDefaultLibSymbol(ts, program, checker, declaration) {
    if (!program.isSourceFileDefaultLibrary(declaration.getSourceFile()) && declaration.heritageClauses) {
        for (const heritageClause of declaration.heritageClauses) {
            for (const type of heritageClause.types) {
                const symbol = findSymbolFromHeritageType(ts, checker, type);
                if (symbol) {
                    const decl = symbol.valueDeclaration || (symbol.declarations && symbol.declarations[0]);
                    if (decl && program.isSourceFileDefaultLibrary(decl.getSourceFile())) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}
function findSymbolFromHeritageType(ts, checker, type) {
    if (ts.isExpressionWithTypeArguments(type)) {
        return findSymbolFromHeritageType(ts, checker, type.expression);
    }
    if (ts.isIdentifier(type)) {
        const tmp = getRealNodeSymbol(ts, checker, type);
        return (tmp.length > 0 ? tmp[0].symbol : null);
    }
    if (ts.isPropertyAccessExpression(type)) {
        return findSymbolFromHeritageType(ts, checker, type.name);
    }
    return null;
}
class SymbolImportTuple {
    symbol;
    symbolImportNode;
    constructor(symbol, symbolImportNode) {
        this.symbol = symbol;
        this.symbolImportNode = symbolImportNode;
    }
}
/**
 * Returns the node's symbol and the `import` node (if the symbol resolved from a different module)
 */
function getRealNodeSymbol(ts, checker, node) {
    const getPropertySymbolsFromContextualType = ts.getPropertySymbolsFromContextualType;
    const getContainingObjectLiteralElement = ts.getContainingObjectLiteralElement;
    const getNameFromPropertyName = ts.getNameFromPropertyName;
    // Go to the original declaration for cases:
    //
    //   (1) when the aliased symbol was declared in the location(parent).
    //   (2) when the aliased symbol is originating from an import.
    //
    function shouldSkipAlias(node, declaration) {
        if (!ts.isShorthandPropertyAssignment(node) && node.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        if (node.parent === declaration) {
            return true;
        }
        switch (declaration.kind) {
            case ts.SyntaxKind.ImportClause:
            case ts.SyntaxKind.ImportEqualsDeclaration:
                return true;
            case ts.SyntaxKind.ImportSpecifier:
                return declaration.parent.kind === ts.SyntaxKind.NamedImports;
            default:
                return false;
        }
    }
    if (!ts.isShorthandPropertyAssignment(node)) {
        if (node.getChildCount() !== 0) {
            return [];
        }
    }
    const { parent } = node;
    let symbol = (ts.isShorthandPropertyAssignment(node)
        ? checker.getShorthandAssignmentValueSymbol(node)
        : checker.getSymbolAtLocation(node));
    let importNode = null;
    // If this is an alias, and the request came at the declaration location
    // get the aliased symbol instead. This allows for goto def on an import e.g.
    //   import {A, B} from "mod";
    // to jump to the implementation directly.
    if (symbol && symbol.flags & ts.SymbolFlags.Alias && symbol.declarations && shouldSkipAlias(node, symbol.declarations[0])) {
        const aliased = checker.getAliasedSymbol(symbol);
        if (aliased.declarations) {
            // We should mark the import as visited
            importNode = symbol.declarations[0];
            symbol = aliased;
        }
    }
    if (symbol) {
        // Because name in short-hand property assignment has two different meanings: property name and property value,
        // using go-to-definition at such position should go to the variable declaration of the property value rather than
        // go to the declaration of the property name (in this case stay at the same position). However, if go-to-definition
        // is performed at the location of property access, we would like to go to definition of the property in the short-hand
        // assignment. This case and others are handled by the following code.
        if (node.parent.kind === ts.SyntaxKind.ShorthandPropertyAssignment) {
            symbol = checker.getShorthandAssignmentValueSymbol(symbol.valueDeclaration);
        }
        // If the node is the name of a BindingElement within an ObjectBindingPattern instead of just returning the
        // declaration the symbol (which is itself), we should try to get to the original type of the ObjectBindingPattern
        // and return the property declaration for the referenced property.
        // For example:
        //      import('./foo').then(({ b/*goto*/ar }) => undefined); => should get use to the declaration in file "./foo"
        //
        //      function bar<T>(onfulfilled: (value: T) => void) { //....}
        //      interface Test {
        //          pr/*destination*/op1: number
        //      }
        //      bar<Test>(({pr/*goto*/op1})=>{});
        if (ts.isPropertyName(node) && ts.isBindingElement(parent) && ts.isObjectBindingPattern(parent.parent) &&
            (node === (parent.propertyName || parent.name))) {
            const name = getNameFromPropertyName(node);
            const type = checker.getTypeAtLocation(parent.parent);
            if (name && type) {
                if (type.isUnion()) {
                    return generateMultipleSymbols(type, name, importNode);
                }
                else {
                    const prop = type.getProperty(name);
                    if (prop) {
                        symbol = prop;
                    }
                }
            }
        }
        // If the current location we want to find its definition is in an object literal, try to get the contextual type for the
        // object literal, lookup the property symbol in the contextual type, and use this for goto-definition.
        // For example
        //      interface Props{
        //          /*first*/prop1: number
        //          prop2: boolean
        //      }
        //      function Foo(arg: Props) {}
        //      Foo( { pr/*1*/op1: 10, prop2: false })
        const element = getContainingObjectLiteralElement(node);
        if (element) {
            const contextualType = element && checker.getContextualType(element.parent);
            if (contextualType) {
                const propertySymbols = getPropertySymbolsFromContextualType(element, checker, contextualType, /*unionSymbolOk*/ false);
                if (propertySymbols) {
                    symbol = propertySymbols[0];
                }
            }
        }
    }
    if (symbol && symbol.declarations) {
        return [new SymbolImportTuple(symbol, importNode)];
    }
    return [];
    function generateMultipleSymbols(type, name, importNode) {
        const result = [];
        for (const t of type.types) {
            const prop = t.getProperty(name);
            if (prop && prop.declarations) {
                result.push(new SymbolImportTuple(prop, importNode));
            }
        }
        return result;
    }
}
/** Get the token whose text contains the position */
function getTokenAtPosition(ts, sourceFile, position, allowPositionInLeadingTrivia, includeEndPosition) {
    let current = sourceFile;
    outer: while (true) {
        // find the child that contains 'position'
        for (const child of current.getChildren()) {
            const start = allowPositionInLeadingTrivia ? child.getFullStart() : child.getStart(sourceFile, /*includeJsDoc*/ true);
            if (start > position) {
                // If this child begins after position, then all subsequent children will as well.
                break;
            }
            const end = child.getEnd();
            if (position < end || (position === end && (child.kind === ts.SyntaxKind.EndOfFileToken || includeEndPosition))) {
                current = child;
                continue outer;
            }
        }
        return current;
    }
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJlZXNoYWtpbmcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ0cmVlc2hha2luZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBRzdCLE1BQU0scUJBQXFCLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQztBQUV2RixJQUFrQixVQUlqQjtBQUpELFdBQWtCLFVBQVU7SUFDM0IsNkNBQVMsQ0FBQTtJQUNULHFEQUFhLENBQUE7SUFDYiwyREFBZ0IsQ0FBQTtBQUNqQixDQUFDLEVBSmlCLFVBQVUsR0FBVixrQkFBVSxLQUFWLGtCQUFVLFFBSTNCO0FBRUQsU0FBZ0Isa0JBQWtCLENBQUMsVUFBc0I7SUFDeEQsUUFBUSxVQUFVLEVBQUU7UUFDbkI7WUFDQyxPQUFPLFdBQVcsQ0FBQztRQUNwQjtZQUNDLE9BQU8sZUFBZSxDQUFDO1FBQ3hCO1lBQ0MsT0FBTyxrQkFBa0IsQ0FBQztLQUMzQjtBQUNGLENBQUM7QUFURCxnREFTQztBQXdDRCxTQUFTLGdCQUFnQixDQUFDLE9BQTRCLEVBQUUsV0FBeUM7SUFDaEcsS0FBSyxNQUFNLElBQUksSUFBSSxXQUFXLEVBQUU7UUFDL0IsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBQ2hCLElBQUksSUFBSSxDQUFDLElBQUksRUFBRTtZQUNkLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7U0FDbEU7UUFDRCxJQUFJLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtZQUM1QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNy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