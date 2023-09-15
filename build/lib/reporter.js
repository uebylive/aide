"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReporter = void 0;
const es = require("event-stream");
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
const fs = require("fs");
const path = require("path");
class ErrorLog {
    id;
    constructor(id) {
        this.id = id;
    }
    allErrors = [];
    startTime = null;
    count = 0;
    onStart() {
        if (this.count++ > 0) {
            return;
        }
        this.startTime = new Date().getTime();
        fancyLog(`AAA Starting ${ansiColors.green('compilation')}${this.id ? ansiColors.blue(` ${this.id}`) : ''}...`);
    }
    onEnd() {
        if (--this.count > 0) {
            return;
        }
        this.log();
    }
    log() {
        const errors = this.allErrors.flat();
        const seen = new Set();
        errors.map(err => {
            if (!seen.has(err)) {
                seen.add(err);
                fancyLog(`${ansiColors.red('Error')}: ${err}`);
            }
        });
        fancyLog(`AAA Finished ${ansiColors.green('compilation')}${this.id ? ansiColors.blue(` ${this.id}`) : ''} with ${errors.length} errors after ${ansiColors.magenta((new Date().getTime() - this.startTime) + ' ms')}`);
        const regex = /^([^(]+)\((\d+),(\d+)\): (.*)$/s;
        const messages = errors
            .map(err => regex.exec(err))
            .filter(match => !!match)
            .map(x => x)
            .map(([, path, line, column, message]) => ({ path, line: parseInt(line), column: parseInt(column), message }));
        try {
            const logFileName = 'log' + (this.id ? `_${this.id}` : '');
            fs.writeFileSync(path.join(buildLogFolder, logFileName), JSON.stringify(messages));
        }
        catch (err) {
            //noop
        }
    }
}
const errorLogsById = new Map();
function getErrorLog(id = '') {
    let errorLog = errorLogsById.get(id);
    if (!errorLog) {
        errorLog = new ErrorLog(id);
        errorLogsById.set(id, errorLog);
    }
    return errorLog;
}
const buildLogFolder = path.join(path.dirname(path.dirname(__dirname)), '.build');
try {
    fs.mkdirSync(buildLogFolder);
}
catch (err) {
    // ignore
}
function createReporter(id) {
    const errorLog = getErrorLog(id);
    const errors = [];
    errorLog.allErrors.push(errors);
    const result = (err) => errors.push(err);
    result.hasErrors = () => errors.length > 0;
    result.end = (emitError) => {
        errors.length = 0;
        errorLog.onStart();
        return es.through(undefined, function () {
            errorLog.onEnd();
            if (emitError && errors.length > 0) {
                if (!errors.__logged__) {
                    errorLog.log();
                }
                errors.__logged__ = true;
                const err = new Error(`Found ${errors.length} errors`);
                err.__reporter__ = true;
                this.emit('error', err);
            }
            else {
                this.emit('end');
            }
        });
    };
    return result;
}
exports.createReporter = createReporter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwb3J0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyZXBvcnRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxtQ0FBbUM7QUFDbkMsc0NBQXNDO0FBQ3RDLDBDQUEwQztBQUMxQyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBRTdCLE1BQU0sUUFBUTtJQUNNO0lBQW5CLFlBQW1CLEVBQVU7UUFBVixPQUFFLEdBQUYsRUFBRSxDQUFRO0lBQzdCLENBQUM7SUFDRCxTQUFTLEdBQWUsRUFBRSxDQUFDO0lBQzNCLFNBQVMsR0FBa0IsSUFBSSxDQUFDO0lBQ2hDLEtBQUssR0FBRyxDQUFDLENBQUM7SUFFVixPQUFPO1FBQ04sSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxFQUFFO1lBQ3JCLE9BQU87U0FDUDtRQUVELElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN0QyxRQUFRLENBQUMsZ0JBQWdCLFVBQVUsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2hILENBQUM7SUFFRCxLQUFLO1FBQ0osSUFBSSxFQUFFLElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxFQUFFO1lBQ3JCLE9BQU87U0FDUDtRQUVELElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNaLENBQUM7SUFFRCxHQUFHO1FBQ0YsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNyQyxNQUFNLElBQUksR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBRS9CLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFD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