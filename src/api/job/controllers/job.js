'use strict';

/**
 *  job controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController("api::job.job", ({ strapi }) => ({

  /**
   * @description Add a job
   *
   * @route: POST /api/job/register
   *
   * @auth Authentication is needed for this. Only user with access >='coordinator' role should be granted permission
   *
   * @request
   * Requires request body is same as if passed to POST request to usual create entry through strapi REST api
   * ie. ctx.request.body should be like: { data: { 'company':1, 'job_title': 'Embedded Engineer', ... } }
   *
   * Using this route ensures some pre-save checks
   * - the company has been approved
   * - approval_status MUST be set to "pending" initially
   */
  async register(ctx) {
    const { data } = ctx.request.body;

    if (!data) {
      return ctx.badRequest(null, [{ messages: [{ id: "Invalid parameters/Failed to parse" }] }]);
    }

    // Check if company has been approved
    const company = await strapi.db.query("api::company.company").findOne({ id: data.company });
    if (!company) {
      return ctx.badRequest(null, [{ messages: [{ id: "Company not found" }] }]);
    } else if (company.status !== "approved") {
      return ctx.badRequest(null, [{ messages: [{ id: "Company not approved" }] }]);
    }

    // Ensure, sender did not sender with "approval_status: approved"
    data["approval_status"] = "pending";

    // NOTE: this may not be required, since we already modified ctx.request.body.data above
    ctx.request.body = { data };

    return await this.create(ctx);
  },
}));

// ex: shiftwidth=2 expandtab:
