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

    // Can use this if using this.findOne, instead of querying by self, Since the context will be passed to this.findOne, passing populate: * to populate all fields
    // But not doing that since even for this.findOne we require student.id for which at least one query is eitherway required
    // console.log({ query: ctx.request.query });
    // ctx.request.query = { "populate": "*", filter: "id=1" ...ctx.request.query };

    if (!user) {
      return ctx.badRequest(null, [{ messages: [{ id: "Bearer Token not provided or invalid" }] }]);
    }
    // TODO: Possible reduce all populate: "*" with only required fields to be populated :)
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
   * Note: Send data in JSON (not form-data), hence file uploads are NOT allowed on this route, use /student/modify route for that
   * 
   ** Requires request body is same as if passed to POST request to usual create entry through strapi REST api
   * ie. ctx.request.body should be like: { data: {"name": "koi", "roll": "19023"} }
   *
   * This is for frontend to be independent of format that strapi requires
   * 
   * Using this route ensures some pre-save checks, such as approved MUST not be able to set by student
   */
  async submit_for_approval(ctx) {
    const user = ctx.state.user;

    /* This is needed since only a signed in student should be able to send this + We need user.id later */
    if (!user || !(user.username)) {
      return ctx.badRequest(null, [{ messages: [{ id: "Bearer Token not provided or invalid" }] }]);
    }

    {

      /** Check if administrator has blocked new registrations */
      const setting = await strapi.query('api::setting.setting').findOne({
        where: {}
      });
      if ( !setting ) {
        return ctx.internalServerError(null, [{ messages: [{ id: "Failed to get global settings for registrations allowed or not" }] }]);
      }

      if (setting["registrations_allowed"] == false) {
        return ctx.badRequest(null, [{ messages: [{ id: "Registrations are not allowed. Please contact Administrator" }] }])
      }
    }

    const { data } = ctx.request.body;

    if (!data) {
      return ctx.badRequest(null, [{ messages: [{ id: "Invalid parameters/Failed to parse" }] }]);
    }

    if (data["roll"] != user.username) {
      return ctx.badRequest(null, [{ messages: [{ id: "Username does not match with roll number" }] }]);
    }

    /** NOTE: This directly modifies the ctx.request.body["data"], which we want, since ctx is to be passed to this.create */
    // Ensure, sender did not sender with "approved: approved"
    data["approved"] = "pending";

    // Give user id of related entry in Users collection, used for auth
    data["user_relation"] = user.id;

    ctx.request.body = { data };

    // File uploads are not allowed on this route, use /student/modify route for that
    ctx.request.files = {};

    return await this.create(ctx);
  },

  /**
   * Route to modify given keys for the current user
   * 
   * NOTE1: request body is slightly DIFFERENT than if passed to PUT request to strapi's REST apis
   * ie. ctx.request.body should be like: { "name":"Koi","roll": "1905050","resume": File }, ie. NOT like { "data": {"name": "koi"} }
   * This was made to accommodate both types of input, as body and form-data
   *
   * Note2: Requires authentication
   * Note3: Most fields cannot be updated after student clicks "Submit for approval"
   */
  async modify_multiple(ctx) {
    if (!ctx.is('multipart')) {
      return ctx.badRequest(null, [{ messages: [{ id: "This route expects multipart/form-data" }] }]);
    }

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

    /**
     * NOTE TO FUTURE DEVELOPERS:
     * 
     * Currently we filter fields based on below arrays, ie. if ANY key is not in this array, it will simply be ignored, and hence not modifiable
     */
    // Most mandatory components locked after approval of the profile (ie. only allowed to change before approval).
    // CPI can be updated when allowed by admin
    const fields_allowed_before_approval = [
      "name", "roll", "gender", "date_of_birth", "category", "rank", "registered_for", "program",
      "department", "course", "address", "X_marks", "XII_marks",
      "ug_college", "ug_cpi",
    ];

    // should include at least ALL optional fields
    const fields_allowed_anytime = [
      "resume_link", "other_achievements", "projects", "profile_picture", "current_sem"
    ];

    // Fields related to SPI and CPI, only allowed to be changed if Admin globally allows change to these
    const cpi_spi_fields = ["spi1", "spi2", "spi3", "spi4", "spi5", "spi6", "spi7", "spi8", "cpi"];

    // NOTE: ALL other fields (including invalid/unknown) are removed, and treated as immutable
    // for changing password, use forgot password
    // NOTE2: Other approach can be allowing all except some
    const fields_to_modify = {};
    for (const field in body) {
      // These fields will only be added to `fields_to_modify` if account is not already approved/rejected
      if (fields_allowed_before_approval.includes(field) == true) {
        continue; // skip modifying fields that are not allowed after "Submit for approval"
      }
      else if (fields_allowed_anytime.includes(field)) {
        fields_to_modify[field] = body[field];
      }
    }

    /** Check if Administrator has allowed changing SPIs and CPIs */
    const setting = await strapi.query('api::setting.setting').findOne({
      where: {}
    });
    if ( !setting ) {
      console.log("[student: modify] Failed to get global settings for CPI change allowed or not");
      console.log("[student: modify]     Not responding with failure, since it by default won't be modifiable");
      // return ctx.internalServerError(null, [{ messages: [{ id: "Failed to get global settings" }] }]);
    }

    // If allowed, allow fields given in `cpi_spi_fields` array to be modified
    if (setting["cpi_change_allowed"] == true) {
      for(const field in body) {
        if( cpi_spi_fields.includes(field) ) {
          fields_to_modify[field] = body[field];
        }
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
    for (const field in (ctx.request.files || {})) {
      if (media_fields.includes(field)) {
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

    // console.log("Earlier, ctx.query", { q: ctx.query });

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

// ex: shiftwidth=2 expandtab:
