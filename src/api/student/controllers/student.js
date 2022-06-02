"use strict";

/**
 *  student controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::student.student", ({ strapi }) => ({
  /* This route is accessible to unauthenticated public also */
  async register(ctx) {
    /* Request body is expected to be exactly same as if it was a POST request to create entry through strapi REST api
     * ie. ctx.request.body should be like: { data:{"name":"Koi","roll": "1905050"} }
     */
    const { data } = ctx.request.body;
    if (!data) {
      return ctx.badRequest(null, [{ messages: [{ id: "Invalid parameteres" }] }]);
    }

    // Ensure, sender did not sender with "approved: true", since the field is eitherway visible to the student
    data["approved"] = "created";

    // Pass result as it is, shouldn't contain anything sensitive
    ctx.body = await strapi.db.query("api::student.student").create({data});
  },

  /* Accessible only with proper bearer token 
     Idea is to first, create a request, and then set "approved": "pending",
  */
  async submit_for_approval(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.badRequest(null, [{ messages: [{ id: "No user found" }] }]);
    }

    const data = await strapi.db.query("api::student.student").update({
      where: {
        roll: user.username,
      },
      data: {
        approved: "pending"
      },
      select: ["roll","approved","id"]
    });

    if (!data) {
      return ctx.internalServerError(null, [{ messages: [{ id: "Failed to update student's approval status" }] }]);
    }

    const request = await strapi.db.query("api::request.request").create({
      data: {
        description: "Request for student approval",
        type: "student",
        student: data.id
      }
    });

    if (!request) {
      return ctx.internalServerError(null, [{ messages: [{ id: "Failed to create student approval request" }] }]);
    }

    ctx.body = request;
  },


  async findMe(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.badRequest(null, [{ messages: [{ id: "No user found" }] }]);
    }
    const data = await strapi.db.query("api::student.student").findOne({
      where: {
        roll: user.username,
      },
    });
    if (!data) {
      return ctx.badRequest(null, [{ messages: [{ id: "No student found" }] }]);
    }

    ctx.body = data;
  },

  async getEligibleJobs(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.badRequest(null, [{ messages: [{ id: "Bearer Token not provided or invalid" }] }]);
    }
    const student_self = await strapi.db.query("api::student.student").findOne({
      where: {
        roll: user.username,
      },
      select: ["X_percentage", "XII_percentage"]
    });
    if (!student_self) {
      return ctx.badRequest(null, [{ messages: [{ id: "No student found" }] }]);
    }

    const { X_percentage, XII_percentage } = student_self;

    const eligible_jobs = await strapi.db.query("api::job.job").findMany({
      where: {
        min_X_percentage: {
          $lte: X_percentage
        },
        min_XII_percentage: {
          $lte: XII_percentage
        }
      }
    });

    ctx.body = eligible_jobs;
  }
}));
