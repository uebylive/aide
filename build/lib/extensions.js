"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildExtensionMedia = exports.webpackExtensions = exports.translatePackageJSON = exports.scanBuiltinExtensions = exports.packageMarketplaceExtensionsStream = exports.packageLocalExtensionsStream = exports.fromGithub = exports.fromMarketplace = void 0;
const es = require("event-stream");
const fs = require("fs");
const cp = require("child_process");
const glob = require("glob");
const gulp = require("gulp");
const path = require("path");
const File = require("vinyl");
const stats_1 = require("./stats");
const util2 = require("./util");
const vzip = require('gulp-vinyl-zip');
const filter = require("gulp-filter");
const rename = require("gulp-rename");
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
const buffer = require('gulp-buffer');
const jsoncParser = require("jsonc-parser");
const pLimit = require('p-limit');
// const os = require('os');
const dependencies_1 = require("./dependencies");
const builtInExtensions_1 = require("./builtInExtensions");
const getVersion_1 = require("./getVersion");
const fetch_1 = require("./fetch");
const root = path.dirname(path.dirname(__dirname));
const commit = (0, getVersion_1.getVersion)(root);
const sourceMappingURLBase = `https://ticino.blob.core.windows.net/sourcemaps/${commit}`;
// Determine the maximum number of file descriptors the system allows
// const maxFileDescriptors = os.platform() === 'win32' ? 2048 : os.sysconf('SC_OPEN_MAX');
// Calculate the limit based on available file descriptors
const limitValue = Math.min(100, 100); // You can adjust this as needed
// Create the dynamic limit function
const limit = pLimit(limitValue);
function minifyExtensionResources(input) {
    const jsonFilter = filter(['**/*.json', '**/*.code-snippets'], { restore: true });
    return input
        .pipe(jsonFilter)
        .pipe(buffer())
        .pipe(es.map((f, callback) => {
        const errors = [];
        const value = jsoncParser.parse(f.contents.toString('utf8'), errors, { allowTrailingComma: true });
        if (errors.length === 0) {
            // file parsed OK => just stringify to drop whitespace and comments
            f.contents = Buffer.from(JSON.stringify(value));
        }
        callback(undefined, f);
    }))
        .pipe(jsonFilter.restore);
}
function updateExtensionPackageJSON(input, update) {
    const packageJsonFilter = filter('extensions/*/package.json', { restore: true });
    return input
        .pipe(packageJsonFilter)
        .pipe(buffer())
        .pipe(es.mapSync((f) => {
        const data = JSON.parse(f.contents.toString('utf8'));
        f.contents = Buffer.from(JSON.stringify(update(data)));
        return f;
    }))
        .pipe(packageJsonFilter.restore);
}
function fromLocal(extensionPath, forWeb, disableMangle) {
    const webpackConfigFileName = forWeb ? 'extension-browser.webpack.config.js' : 'extension.webpack.config.js';
    const isWebPacked = fs.existsSync(path.join(extensionPath, webpackConfigFileName));
    let input = isWebPacked
        ? fromLocalWebpack(extensionPath, webpackConfigFileName, disableMangle)
        : fromLocalNormal(extensionPath);
    if (isWebPacked) {
        input = updateExtensionPackageJSON(input, (data) => {
            delete data.scripts;
            delete data.dependencies;
            delete data.devDependencies;
            if (data.main) {
                data.main = data.main.replace('/out/', '/dist/');
            }
            return data;
        });
    }
    return input;
}
function fromLocalWebpack(extensionPath, webpackConfigFileName, disableMangle) {
    const vsce = require('@vscode/vsce');
    const webpack = require('webpack');
    const webpackGulp = require('webpack-stream');
    const result = es.through();
    const packagedDependencies = [];
    const packageJsonConfig = require(path.join(extensionPath, 'package.json'));
    if (packageJsonConfig.dependencies) {
        const webpackRootConfig = require(path.join(extensionPath, webpackConfigFileName));
        for (const key in webpackRootConfig.externals) {
            if (key in packageJsonConfig.dependencies) {
                packagedDependencies.push(key);
            }
        }
    }
    vsce.listFiles({ cwd: extensionPath, packageManager: vsce.PackageManager.Yarn, packagedDependencies }).then(fileNames => {
        const files = fileNames
            .map(fileName => path.join(extensionPath, fileName))
            .map(filePath => new File({
            path: filePath,
            stat: fs.statSync(filePath),
            base: extensionPath,
            contents: fs.createReadStream(filePath)
        }));
        // check for a webpack configuration files, then invoke webpack
        // and merge its output with the files stream.
        const webpackConfigLocations = glob.sync(path.join(extensionPath, '**', webpackConfigFileName), { ignore: ['**/node_modules'] });
        const webpackStreams = webpackConfigLocations.flatMap(webpackConfigPath => {
            const webpackDone = (err, stats) => {
                fancyLog(`Bundled extension: ${ansiColors.yellow(path.join(path.basename(extensionPath), path.relative(extensionPath, webpackConfigPath)))}...`);
                if (err) {
                    result.emit('error', err);
                }
                const { compilation } = stats;
                if (compilation.errors.length > 0) {
                    result.emit('error', compilation.errors.join('\n'));
                }
                if (compilation.warnings.length > 0) {
                    result.emit('error', compilation.warnings.join('\n'));
                }
            };
            const exportedConfig = require(webpackConfigPath);
            return (Array.isArray(exportedConfig) ? exportedConfig : [exportedConfig]).map(config => {
                const webpackConfig = {
                    ...config,
                    ...{ mode: 'production' }
                };
                if (disableMangle) {
                    if (Array.isArray(config.module.rules)) {
                        for (const rule of config.module.rules) {
                            if (Array.isArray(rule.use)) {
                                for (const use of rule.use) {
                                    if (String(use.loader).endsWith('mangle-loader.js')) {
                                        use.options.disabled = true;
                                    }
                                }
                            }
                        }
                    }
                }
                const relativeOutputPath = path.relative(extensionPath, webpackConfig.output.path);
                return webpackGulp(webpackConfig, webpack, webpackDone)
                    .pipe(es.through(function (data) {
                    data.stat = data.stat || {};
                    data.base = extensionPath;
                    this.emit('data', data);
                }))
                    .pipe(es.through(function (data) {
                    // source map handling:
                    // * rewrite sourceMappingURL
                    // * save to disk so that upload-task picks this up
                    const contents = data.contents.toString('utf8');
                    data.contents = Buffer.from(contents.replace(/\n\/\/# sourceMappingURL=(.*)$/gm, function (_m, g1) {
                        return `\n//# sourceMappingURL=${sourceMappingURLBase}/extensions/${path.basename(extensionPath)}/${relativeOutputPath}/${g1}`;
                    }), 'utf8');
                    this.emit('data', data);
                }));
            });
        });
        es.merge(...webpackStreams, es.readArray(files))
            // .pipe(es.through(function (data) {
            // 	// debug
            // 	console.log('out', data.path, data.contents.length);
            // 	this.emit('data', data);
            // }))
            .pipe(result);
    }).catch(err => {
        console.error(extensionPath);
        console.error(packagedDependencies);
        result.emit('error', err);
    });
    return result.pipe((0, stats_1.createStatsStream)(path.basename(extensionPath)));
}
function fromLocalNormal(extensionPath) {
    const vsce = require('@vscode/vsce');
    const result = es.through();
    vsce.listFiles({ cwd: extensionPath, packageManager: vsce.PackageManager.Yarn })
        .then(fileNames => {
        const files = fileNames
            .map(fileName => path.join(extensionPath, fileName))
            .map(filePath => new File({
            path: filePath,
            stat: fs.statSync(filePath),
            base: extensionPath,
            contents: fs.createReadStream(filePath)
        }));
        es.readArray(files).pipe(result);
    })
        .catch(err => result.emit('error', err));
    return result.pipe((0, stats_1.createStatsStream)(path.basename(extensionPath)));
}
const userAgent = 'VSCode Build';
const baseHeaders = {
    'X-Market-Client-Id': 'VSCode Build',
    'User-Agent': userAgent,
    'X-Market-User-Id': '291C1CD0-051A-4123-9B4B-30D60EF52EE2',
};
function fromMarketplace(serviceUrl, { name: extensionName, version, sha256, metadata }) {
    const json = require('gulp-json-editor');
    const [publisher, name] = extensionName.split('.');
    const url = `${serviceUrl}/publishers/${publisher}/vsextensions/${name}/${version}/vspackage`;
    fancyLog('Downloading extension:', ansiColors.yellow(`${extensionName}@${version}`), '...');
    const packageJsonFilter = filter('package.json', { restore: true });
    return (0, fetch_1.fetchUrls)('', {
        base: url,
        nodeFetchOptions: {
            headers: baseHeaders
        },
        checksumSha256: sha256
    })
        .pipe(vzip.src())
        .pipe(filter('extension/**'))
        .pipe(rename(p => p.dirname = p.dirname.replace(/^extension\/?/, '')))
        .pipe(packageJsonFilter)
        .pipe(buffer())
        .pipe(json({ __metadata: metadata }))
        .pipe(packageJsonFilter.restore);
}
exports.fromMarketplace = fromMarketplace;
function fromGithub({ name, version, repo, sha256, metadata }) {
    const json = require('gulp-json-editor');
    fancyLog('Downloading extension from GH:', ansiColors.yellow(`${name}@${version}`), '...');
    const packageJsonFilter = filter('package.json', { restore: true });
    return (0, fetch_1.fetchGithub)(new URL(repo).pathname, {
        version,
        name: name => name.endsWith('.vsix'),
        checksumSha256: sha256
    })
        .pipe(buffer())
        .pipe(vzip.src())
        .pipe(filter('extension/**'))
        .pipe(rename(p => p.dirname = p.dirname.replace(/^extension\/?/, '')))
        .pipe(packageJsonFilter)
        .pipe(buffer())
        .pipe(json({ __metadata: metadata }))
        .pipe(packageJsonFilter.restore);
}
exports.fromGithub = fromGithub;
const excludedExtensions = [
    'vscode-api-tests',
    'vscode-colorize-tests',
    'vscode-test-resolver',
    'ms-vscode.node-debug',
    'ms-vscode.node-debug2',
    'codestoryai'
];
const marketplaceWebExtensionsExclude = new Set([
    'ms-vscode.node-debug',
    'ms-vscode.node-debug2',
    'ms-vscode.js-debug-companion',
    'ms-vscode.js-debug',
    'ms-vscode.vscode-js-profile-table'
]);
const productJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../product.json'), 'utf8'));
const builtInExtensions = productJson.builtInExtensions || [];
const webBuiltInExtensions = productJson.webBuiltInExtensions || [];
/**
 * Loosely based on `getExtensionKind` from `src/vs/workbench/services/extensions/common/extensionManifestPropertiesService.ts`
 */
function isWebExtension(manifest) {
    if (Boolean(manifest.browser)) {
        return true;
    }
    if (Boolean(manifest.main)) {
        return false;
    }
    // neither browser nor main
    if (typeof manifest.extensionKind !== 'undefined') {
        const extensionKind = Array.isArray(manifest.extensionKind) ? manifest.extensionKind : [manifest.extensionKind];
        if (extensionKind.indexOf('web') >= 0) {
            return true;
        }
    }
    if (typeof manifest.contributes !== 'undefined') {
        for (const id of ['debuggers', 'terminal', 'typescriptServerPlugins']) {
            if (manifest.contributes.hasOwnProperty(id)) {
                return false;
            }
        }
    }
    return true;
}
function packageLocalExtensionsStream(forWeb, disableMangle) {
    const localExtensionsDescriptions = (glob.sync('extensions/*/package.json', { ignore: 'extensions/codestory/*/package.json' })
        .map(manifestPath => {
        const absoluteManifestPath = path.join(root, manifestPath);
        const extensionPath = path.dirname(path.join(root, manifestPath));
        const extensionName = path.basename(extensionPath);
        fancyLog(`Manifest Path: ${ansiColors.yellow(absoluteManifestPath)}...`);
        return { name: extensionName, path: extensionPath, manifestPath: absoluteManifestPath };
    })
        .filter(({ name }) => {
        fancyLog(`Extension name which will be packaged: ${name}...`);
        return excludedExtensions.indexOf(name) === -1;
    })
        .filter(({ name }) => builtInExtensions.every(b => b.name !== name))
        .filter(({ manifestPath }) => (forWeb ? isWebExtension(require(manifestPath)) : true)));
    const localExtensionsStream = minifyExtensionResources(es.merge(...localExtensionsDescriptions.map(extension => {
        return limit(() => fromLocal(extension.path, forWeb, disableMangle)
            .pipe(rename(p => p.dirname = `extensions/${extension.name}/${p.dirname}`)));
    })));
    let result;
    if (forWeb) {
        result = localExtensionsStream;
    }
    else {
        // also include shared production node modules
        const productionDependencies = (0, dependencies_1.getProductionDependencies)('extensions/');
        const dependenciesSrc = productionDependencies.map(d => path.relative(root, d.path)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`]).flat();
        result = es.merge(localExtensionsStream, gulp.src(dependenciesSrc, { base: '.' })
            .pipe(util2.cleanNodeModules(path.join(root, 'build', '.moduleignore')))
            .pipe(util2.cleanNodeModules(path.join(root, 'build', `.moduleignore.${process.platform}`))));
    }
    return (result
        .pipe(util2.setExecutableBit(['**/*.sh'])));
}
exports.packageLocalExtensionsStream = packageLocalExtensionsStream;
function packageMarketplaceExtensionsStream(forWeb) {
    const marketplaceExtensionsDescriptions = [
        ...builtInExtensions.filter(({ name }) => (forWeb ? !marketplaceWebExtensionsExclude.has(name) : true)),
        ...(forWeb ? webBuiltInExtensions : [])
    ];
    const marketplaceExtensionsStream = minifyExtensionResources(es.merge(...marketplaceExtensionsDescriptions
        .map(extension => {
        const src = (0, builtInExtensions_1.getExtensionStream)(extension).pipe(rename(p => p.dirname = `extensions/${p.dirname}`));
        return updateExtensionPackageJSON(src, (data) => {
            delete data.scripts;
            delete data.dependencies;
            delete data.devDependencies;
            return data;
        });
    })));
    return (marketplaceExtensionsStream
        .pipe(util2.setExecutableBit(['**/*.sh'])));
}
exports.packageMarketplaceExtensionsStream = packageMarketplaceExtensionsStream;
function scanBuiltinExtensions(extensionsRoot, exclude = []) {
    const scannedExtensions = [];
    try {
        const extensionsFolders = fs.readdirSync(extensionsRoot);
        for (const extensionFolder of extensionsFolders) {
            if (exclude.indexOf(extensionFolder) >= 0) {
                continue;
            }
            const packageJSONPath = path.join(extensionsRoot, extensionFolder, 'package.json');
            if (!fs.existsSync(packageJSONPath)) {
                continue;
            }
            const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath).toString('utf8'));
            if (!isWebExtension(packageJSON)) {
                continue;
            }
            const children = fs.readdirSync(path.join(extensionsRoot, extensionFolder));
            const packageNLSPath = children.filter(child => child === 'package.nls.json')[0];
            const packageNLS = packageNLSPath ? JSON.parse(fs.readFileSync(path.join(extensionsRoot, extensionFolder, packageNLSPath)).toString()) : undefined;
            const readme = children.filter(child => /^readme(\.txt|\.md|)$/i.test(child))[0];
            const changelog = children.filter(child => /^changelog(\.txt|\.md|)$/i.test(child))[0];
            scannedExtensions.push({
                extensionPath: extensionFolder,
                packageJSON,
                packageNLS,
                readmePath: readme ? path.join(extensionFolder, readme) : undefined,
                changelogPath: changelog ? path.join(extensionFolder, changelog) : undefined,
            });
        }
        return scannedExtensions;
    }
    catch (ex) {
        return scannedExtensions;
    }
}
exports.scanBuiltinExtensions = scanBuiltinExtensions;
function translatePackageJSON(packageJSON, packageNLSPath) {
    const CharCode_PC = '%'.charCodeAt(0);
    const packageNls = JSON.parse(fs.readFileSync(packageNLSPath).toString());
    const translate = (obj) => {
        for (const key in obj) {
            const val = obj[key];
            if (Array.isArray(val)) {
                val.forEach(translate);
            }
            else if (val && typeof val === 'object') {
                translate(val);
            }
            else if (typeof val === 'string' && val.charCodeAt(0) === CharCode_PC && val.charCodeAt(val.length - 1) === CharCode_PC) {
                const translated = packageNls[val.substr(1, val.length - 2)];
                if (translated) {
                    obj[key] = typeof translated === 'string' ? translated : (typeof translated.message === 'string' ? translated.message : val);
                }
            }
        }
    };
    translate(packageJSON);
    return packageJSON;
}
exports.translatePackageJSON = translatePackageJSON;
const extensionsPath = path.join(root, 'extensions');
// Additional projects to run esbuild on. These typically build code for webviews
const esbuildMediaScripts = [
    'markdown-language-features/esbuild-notebook.js',
    'markdown-language-features/esbuild-preview.js',
    'markdown-math/esbuild.js',
    'notebook-renderers/esbuild.js',
    'ipynb/esbuild.js',
    'simple-browser/esbuild-preview.js',
];
async function webpackExtensions(taskName, isWatch, webpackConfigLocations) {
    const webpack = require('webpack');
    const webpackConfigs = [];
    for (const { configPath, outputRoot } of webpackConfigLocations) {
        const configOrFnOrArray = require(configPath);
        function addConfig(configOrFnOrArray) {
            for (const configOrFn of Array.isArray(configOrFnOrArray) ? configOrFnOrArray : [configOrFnOrArray]) {
                const config = typeof configOrFn === 'function' ? configOrFn({}, {}) : configOrFn;
                if (outputRoot) {
                    config.output.path = path.join(outputRoot, path.relative(path.dirname(configPath), config.output.path));
                }
                webpackConfigs.push(config);
            }
        }
        addConfig(configOrFnOrArray);
    }
    function reporter(fullStats) {
        if (Array.isArray(fullStats.children)) {
            for (const stats of fullStats.children) {
                const outputPath = stats.outputPath;
                if (outputPath) {
                    const relativePath = path.relative(extensionsPath, outputPath).replace(/\\/g, '/');
                    const match = relativePath.match(/[^\/]+(\/server|\/client)?/);
                    fancyLog(`Finished ${ansiColors.green(taskName)} ${ansiColors.cyan(match[0])} with ${stats.errors.length} errors.`);
                }
                if (Array.isArray(stats.errors)) {
                    stats.errors.forEach((error) => {
                        fancyLog.error(error);
                    });
                }
                if (Array.isArray(stats.warnings)) {
                    stats.warnings.forEach((warning) => {
                        fancyLog.warn(warning);
                    });
                }
            }
        }
    }
    return new Promise((resolve, reject) => {
        if (isWatch) {
            webpack(webpackConfigs).watch({}, (err, stats) => {
                if (err) {
                    reject();
                }
                else {
                    reporter(stats?.toJson());
                }
            });
        }
        else {
            webpack(webpackConfigs).run((err, stats) => {
                if (err) {
                    fancyLog.error(err);
                    reject();
                }
                else {
                    reporter(stats?.toJson());
                    resolve();
                }
            });
        }
    });
}
exports.webpackExtensions = webpackExtensions;
async function esbuildExtensions(taskName, isWatch, scripts) {
    function reporter(stdError, script) {
        const matches = (stdError || '').match(/\> (.+): error: (.+)?/g);
        fancyLog(`Finished ${ansiColors.green(taskName)} ${script} with ${matches ? matches.length : 0} errors.`);
        for (const match of matches || []) {
            fancyLog.error(match);
        }
    }
    const tasks = scripts.map(({ script, outputRoot }) => {
        return new Promise((resolve, reject) => {
            const args = [script];
            if (isWatch) {
                args.push('--watch');
            }
            if (outputRoot) {
                args.push('--outputRoot', outputRoot);
            }
            const proc = cp.execFile(process.argv[0], args, {}, (error, _stdout, stderr) => {
                if (error) {
                    return reject(error);
                }
                reporter(stderr, script);
                if (stderr) {
                    return reject();
                }
                return resolve();
            });
            proc.stdout.on('data', (data) => {
                fancyLog(`${ansiColors.green(taskName)}: ${data.toString('utf8')}`);
            });
        });
    });
    return Promise.all(tasks);
}
async function buildExtensionMedia(isWatch, outputRoot) {
    return esbuildExtensions('esbuilding extension media', isWatch, esbuildMediaScripts.map(p => ({
        script: path.join(extensionsPath, p),
        outputRoot: outputRoot ? path.join(root, outputRoot, path.dirname(p)) : undefined
    })));
}
exports.buildExtensionMedia = buildExtensionMedia;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImV4dGVuc2lvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsbUNBQW1DO0FBQ25DLHlCQUF5QjtBQUN6QixvQ0FBb0M7QUFDcEMsNkJBQTZCO0FBQzdCLDZCQUE2QjtBQUM3Qiw2QkFBNkI7QUFFN0IsOEJBQThCO0FBQzlCLG1DQUE0QztBQUM1QyxnQ0FBZ0M7QUFDaEMsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLGdCQUFnQixDQUFDLENBQUM7QUFDdkMsc0NBQXVDO0FBQ3ZDLHNDQUF1QztBQUN2QyxzQ0FBc0M7QUFDdEMsMENBQTBDO0FBQzFDLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUN0Qyw0Q0FBNEM7QUFFNUMsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ2xDLDRCQUE0QjtBQUM1QixpREFBMkQ7QUFDM0QsMkRBQStFO0FBQy9FLDZDQUEwQztBQUMxQyxtQ0FBaUQ7QUFFakQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDbkQsTUFBTSxNQUFNLEdBQUcsSUFBQSx1QkFBVSxFQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2hDLE1BQU0sb0JBQW9CLEdBQUcsbURBQW1ELE1BQU0sRUFBRSxDQUFDO0FBRXpGLHFFQUFxRTtBQUNyRSwyRkFBMkY7QUFFM0YsMERBQTBEO0FBQzFELE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsZ0NBQWdDO0FBRXZFLG9DQUFvQztBQUNwQyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7QUFFakMsU0FBUyx3QkFBd0IsQ0FBQyxLQUFhO0lBQzlDLE1BQU0s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