module.exports = {
  routes: [
    {
      method: "GET",
      path: "/student/me",
      handler: "student.findMe",
      policies: [],
    },
    {
      method: "GET",
      path: "/student/eligiblejobs",
      handler: "student.getEligibleJobs",
      policies: [],
    }
  ],
};
