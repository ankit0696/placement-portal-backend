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
      populate: true,
      where: {
        roll: user.username,
      },
    });

    ctx.body = data;
  },

  /** Authentication is needed for this 
   *
   ** Requires request body to be exactly same as if passed to POST request to usual create entry through strapi REST api
   * ie. ctx.request.body should be like: { data:{"name":"Koi","roll": "1905050"} }
   *
   * Using this also ensures some pre-save checks, such as approved MUST not be able to set by student
   */
  async submit_for_approval(ctx) {
    const user = ctx.state.user;

    /* This is needed since only a signed in student should be able to send this + We need user.id later */
    if (!user || !(user.username)) {
      return ctx.badRequest(null, [{ messages: [{ id: "Bearer Token not provided or invalid" }] }]);
    }

    const { data } = ctx.request.body;

    if (!data) {
      return ctx.badRequest(null, [{ messages: [{ id: "Invalid parameteres" }] }]);
    }

    if (data["roll"] != user.username) {
      return ctx.badRequest(null, [{ messages: [{ id: "Username does not match with roll number" }] }]);
    }

    // Ensure, sender did not sender with "approved: approved"
    data["approved"] = "pending";

    // Give user id of related entry in Users collection, used for auth
    data["user_relation"] = user.id;

    try {
      const student = await strapi.db.query("api::student.student").create({ data });

      if (!student) {
        return ctx.internalServerError(null, [{ messages: [{ id: "Failed to update student's approval status" }] }]);
      }

      ctx.body = student;

    } catch (err) {
      console.log(err.message);
      ctx.badRequest(null, [{ messages: [{ id: "Failed to create student" }] }]);
    }
  },

  /**
   * Route to modify given keys for the current user
   * 
   * NOTE1: request body is slightly DIFFERENT than if passed to PUT request to strapi's REST apis
   * ie. ctx.request.body should be like: { "name":"Koi","roll": "1905050","resume": File }, ie. NOT like { "data": {"name": "koi"} }
   * This was made to accomodate both types of input, as body and form-data
   *
   * Note2: Requires authentication
   * Note3: Most fields cannot be updated after student clicks "Submit for approval"
   */
  async modify_multiple(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.badRequest(null, [{ messages: [{ id: "Bearer Token not provided or invalid" }] }]);
    }

    // console.log("Starting: ", { body: ctx.request.body, files: ctx.request.files, query: ctx.query });

    const body = ctx.request.body;
    if (!body || typeof (body) !== "object") {
      return ctx.badRequest(null, [{ messages: [{ id: "Invalid parameteres" }] }]);
    }

    const student_data = await strapi.db.query("api::student.student").findOne({
      where: {
        roll: user.username,
      },
      select: ["id", "approved"/*, "activated"*/]
    });
    if (!student_data) {
      // Returning 500, since this should not fail, it's just reading data of an existing user (as they have been provided the JWT)
      return ctx.internalServerError(null, [{ messages: [{ id: "Failed to fetch student data" }] }]);
    }

    const { id, approved } = student_data;

    // Most mandatory components locked after approval of the profile (ie. only allowed to change before approval).
    // CPI can be updated when allowed by admin
    const fields_allowed_before_approval = [
      "name", "roll", "gender", "date_of_birth", "category", "rank", "registered_for", "program",
      "department", "course", "address", "spi", "cpi", "X_marks", "XII_marks",
      "ug_college", "ug_cpi",
    ];

    // should include atleast ALL optional fields
    const fields_allowed_anytime = [
      "resume_link", "other_achievements", "projects", "profile_picture", "current_sem"
    ];

    // fields that cannot be changed, for password, use forget password

    // NOTE: ALL other fields (including invalid/unknown) are removed, and treated as immutable
    // for changing password, use forgot password
    // NOTE2: Other approach can be allowing all except some
    const fields_to_modify = {};
    for (const field in body) {
      // These fields will only be added to `fields_to_modify` if account is not already approved/rejected
      if (fields_allowed_before_approval.includes(field) == true) {
        continue; // skip modifying fiels that are not allowed after "Submit for approval"
      }
      else if (fields_allowed_anytime.includes(field)) {
        fields_to_modify[field] = body[field];
      }
    }

    /** All fields that take media
     * WHY: It is needed since from backend we are taking keys as, eg. "resume", but strapi's
     * update route requires this to be "files.resume", so instead of depending on frontend to
     * do this, I am separating this strapi-dependent logic from frontend, so this array will
     * be used to rename all media fields adding "files." to the beginning
     * 
     * NOTE: This needs to be updated with every media field added to student schema
     */
    const media_fields = ["resume", "profile_pic"];
    const files_to_upload = {};
    for(const field in (ctx.request.files || {})) {
      if(media_fields.includes(field)) {
        files_to_upload[`files.${field}`] = ctx.request.files[field];
      }
    }
    ctx.request.files = files_to_upload;

    // Modifying ctx.params according to input format taken by this.update function
    if (!ctx.params) {
      ctx.params = {};
    }
    ctx.params["id"] = id;

    // NOTE: Not allowing any user given query to pass through
    ctx.request.query = {};

    console.log("Earlier, ctx.query", {q: ctx.query});

    // NOTE: Internally in strapi this 1 signifies replaceFile, it is like this in
    // node_modules/@strapi/plugin-upload/server/controllers/content-api.js
    // await (ctx.query.id ? this.replaceFile : this.uploadFiles)(ctx);
    // ctx.query = {id: 1, ...ctx.query};

    ctx.request.body = {
      // NOTE: Internally, strapi expects body["data"] to be a string like "{'data': {'key1:'3434','key2':6}}"
      data: JSON.stringify(fields_to_modify)
    };

    // console.log("Just before update: ", { body: ctx.request.body, files: ctx.request.files });

    if (fields_to_modify === {}) {
      ctx.response.status = 204;
      return ctx.body = "No field modified";
    } else {
      // Pass to the `update` callback to handle request
      return this.update(ctx);
    }
  },
}));
