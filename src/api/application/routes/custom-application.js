module.exports = {
  routes: [
    {
      method: "GET",
      path: "/application/me",
      handler: "application.findMe",
      policies: [],
    },
  ],
};
