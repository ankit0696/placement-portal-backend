"use strict";

/**
 *  student controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::student.student", ({ strapi }) => ({
  /* Accessible only with proper bearer token 
     Idea is to first, create a request, and then set "approved": "pending",
  */

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

  async submit_for_approval(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.badRequest(null, [{ messages: [{ id: "Bearer Token not provided or invalid" }] }]);
    }

    const data = await strapi.db.query("api::student.student").update({
      where: {
        roll: user.username,
      },
      data: {
        approved: "pending"
      },
      select: ["roll", "approved", "id"]
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

  /* Route to modify given keys for the current user */
  async modify_multiple(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.badRequest(null, [{ messages: [{ id: "Bearer Token not provided or invalid" }] }]);
    }

    /* Request body is expected to be exactly same as if it was a POST request to create entry through strapi REST api
     * ie. ctx.request.body should be like: { data:{"cpi": 34} }
     */
    const { data } = ctx.request.body;
    if (!data || typeof (data) !== "object") {
      return ctx.badRequest(null, [{ messages: [{ id: "Invalid parameteres" }] }]);
    }

    const student_data = await strapi.db.query("api::student.student").findOne({
      where: {
        roll: user.username,
      },
      select: ["approved", "activated"]
    });
    if (!student_data) {
      // Returning 500, since this should not fail, it's just reading data of an existing user (as they have been provided the JWT)
      return ctx.internalServerError(null, [{ messages: [{ id: "Failed to fetch student data" }] }]);
    }

    const { approved, acivated } = student_data;

    // Most mandatory components locked after approval of the profile (ie. only allowed to change before approval).
    // CPI can be updated when allowed by admin
    const fields_allowed_before_approval = [
      "name", "roll", "gender", "date_of_birth", "category", "rank", "registered_for", "program",
      "department", "course", "address", "spi", "cpi", "X_percentage", "XII_percentage",
      "ug_college", "ug_cpi",
    ];

    // should include atleast ALL optional fields
    const fields_allowed_anytime = [
      "other_achievements", "projects", "profile_profile", "current_sem", "rank"
    ];

    // fields that cannot be changed, for password, use forget password

    // NOTE: ALL other fields (including invalid/unknown) are removed, and treated as immutable
    // for changing password, use forgot password
    // NOTE2: Other approach can be allowing all except some
    const fields_to_modify = {};
    for (const field in data) {
      // These fields will only be added to `fields_to_modify` if account is not already approved/rejected
      if (
        fields_allowed_before_approval.includes(field) &&
        (approved === "created" || approved === "pending")) {
        fields_to_modify[field] = data[field];
      }
      else if (fields_allowed_anytime.includes(field)) {
        fields_to_modify[field] = data[field];
      }
    }

    const modified_fields = await strapi.db.query("api::student.student").update({
      where: {
        roll: user.username,
      },
      data: fields_to_modify,
      select: ["roll", ...Object.keys(fields_to_modify)]
    });

    // NOTE: Returning error as it is, may include sensitive data, or modified fields
    ctx.body = modified_fields;
  },
}));
