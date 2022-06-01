'use strict';

/**
 *  request controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::request.request');
