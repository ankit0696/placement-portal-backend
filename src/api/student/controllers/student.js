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
    const data = await strapi.db.query("api::student.student").findMany({
      where: {
        roll: user.username,
      },
    });
    if (!data) {
      return ctx.badRequest(null, [{ messages: [{ id: "No student found" }] }]);
    }
    ctx.body = data;
  },
}));
