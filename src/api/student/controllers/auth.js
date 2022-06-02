'use strict';

module.exports = {
  /* Requires request body to be exactly same as if passed to POST request to usual create entry through strapi REST api
   * ie. ctx.request.body should be like: { data:{"name":"Koi","roll": "1905050"} }
   *
   * Using this instead of POST to create, ensures some pre-save checks, such as approved MUST not be able to set by student
  */
  async register(ctx) {
    const { data } = ctx.request.body;
    if (!data) {
      return ctx.badRequest(null, [{ messages: [{ id: "Invalid parameteres" }] }]);
    }

    // Ensure, sender did not sender with "approved: true", since the field is eitherway visible to the student
    data["approved"] = "created";

    // Pass result as it is, shouldn't contain anything sensitive
    ctx.body = await strapi.db.query("api::student.student").create({ data });
  },
};
