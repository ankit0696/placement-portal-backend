"use strict";

/**
 *  application controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::application.application",
  ({ strapi }) => ({
    async findMe(ctx) {
      const user = ctx.state.user;
      console.log(user);
      if (!user) {
        return ctx.badRequest(null, [{ messages: [{ id: "No user found" }] }]);
      }
      const data = await strapi.db
        .query("api::application.application")
        .findMany({
          populate: {
            student: true,
            job: true,
          },
          where: {
            student: {
              roll: user.username,
            },
          },
        });
      if (!data) {
        return ctx.badRequest(null, [
          { messages: [{ id: "No application found" }] },
        ]);
      }

      ctx.body = data;
    },
  })
);
