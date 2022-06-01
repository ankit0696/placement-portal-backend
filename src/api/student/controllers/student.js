"use strict";

/**
 *  student controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::student.student", ({ strapi }) => ({
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
      return ctx.badRequest(null, [{ messages: [{ id: "Token not given or invalid" }] }]);
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
