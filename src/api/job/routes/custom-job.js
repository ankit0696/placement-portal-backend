module.exports = {
  routes: [
    {
      /*This route should be accessible by coordinator, and use this instead of strapi's default create route*/
      method: "POST",
      path: "/job/register",
      handler: "job.register",
      policies: [],
    },
  ]
}

// ex: shiftwidth=2 expandtab autoindent:
