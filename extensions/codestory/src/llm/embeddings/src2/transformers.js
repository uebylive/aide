// @ts-nocheck

/**
 * @file Entry point for the Transformers.js library. Only the exports from this file
 * are available to the end user, and are grouped as follows:
 *
 * 1. [Pipelines](./pipelines)
 * 2. [Environment variables](./env)
 * 3. [Models](./models)
 * 4. [Tokenizers](./tokenizers)
 * 5. [Processors](./processors)
 *
 * @module transformers
 */

const pipelines = require('./pipelines.js');
const env = require('./env.js');
const models = require('./models.js');
const tokenizers = require('./tokenizers.js');
const processors = require('./processors.js');
const configs = require('./configs.js');

const audio = require('./utils/audio.js');
const image = require('./utils/image.js');
const tensor = require('./utils/tensor.js');
const maths = require('./utils/maths.js');

// Export the modules
module.exports = {
    ...pipelines,
    ...env,
    ...models,
    ...tokenizers,
    ...processors,
    ...configs,
    ...audio,
    ...image,
    ...tensor,
    ...maths,
};
