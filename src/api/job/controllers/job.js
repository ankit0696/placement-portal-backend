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
   * @note To update JAF, use the /api/job/upload-jaf
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

    // Ensure job.eligible_courses is existing
    data.eligible_courses = data.eligible_courses || "";

    // Ensure job.eligible_courses is a comma-separated string of numbers (representing course ids)
    data.eligible_courses.split(",").forEach(course => {
      if (course == null || isNaN(course)) {
        return ctx.badRequest(null, [{ messages: [{ id: "job.eligible_courses is not an array of numbers/Failed to parse" }] }]);
      }
    });

    // NOTE: this may not be required, since we already modified ctx.request.body.data above
    ctx.request.body = { data };

    return await this.create(ctx);
  },

  /**
   * @description Update/Upload JAF for a particular job
   *
   * @route PUT /api/job/upload-jaf?jobId=2
   *
   * @request_body: should be a FormData, with only one key: "jaf", eg. ctx.request.body = { jaf: File }
   *
   * @auth Requires coordinator, or admin role to access
   **/
  async upload_jaf(ctx) {
    const query = ctx.request.query;

    if (!query || !(query.jobId)) {
      return ctx.badRequest(null, [{ messages: [{ id: "Required jobId in query" }] }]);
    }

    const { jaf } = ctx.request.files;

    if (!jaf) {
      return ctx.badRequest(null, [{ messages: [{ id: "Required \"jaf\" in body" }] }]);
    }

    const job = await strapi.db.query("api::job.job").findOne({
      where: {
        id: query.jobId,
      },
      populate: ["jaf"]
    });
     
    if (!job) {
      return ctx.badRequest(null, [{ messages: [{ id: "No such job Id found" }] }]);
    }

    // TODO: if (jaf != null), should coordinator be allowed to change it ?

    // Step 1: Delete old "jaf". ie. by setting jaf: null
    const edited_job = await strapi.db.query("api::job.job").update({
      where: { id: id },
      data: {
        jaf: null
      }
    });

    // Step 2: Continue with updating "jaf", by setting ctx parameters according to input this.update takes ?
    ctx.params["id"] = jobId;
    ctx.request.body = { data: "{}" };
    ctx.request.files = { "files.jaf": jaf };
    return this.update(ctx);
  }
}));

// ex: shiftwidth=2 expandtab:
