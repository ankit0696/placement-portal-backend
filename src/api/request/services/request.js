'use strict';

/**
 * request service.
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::request.request');
