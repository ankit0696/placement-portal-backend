module.exports = {
  routes: [
    {
      method: "GET",
      path: "/student/me",
      handler: "student.findMe",
      policies: [],
    },
  ],
};
